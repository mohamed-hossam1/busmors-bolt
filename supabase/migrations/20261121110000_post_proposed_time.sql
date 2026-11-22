-- Phase 2: AI-proposed post times. proposed_for is a suggestion only; it is
-- never a schedule. scheduled_for keeps meaning the time of an active publish
-- approval and is set only by schedule_post (Phase 5).
-- save_task_result lineage: 20261119070000 -> 20261121100000 -> this file
-- (Phase 1 body + the proposed time in the posts loop).

ALTER TABLE planned_posts ADD COLUMN proposed_for timestamptz;

CREATE OR REPLACE FUNCTION save_task_result(p_task_id uuid,p_run_id uuid,p_result jsonb,p_partial boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t tasks; existing jsonb; p planned_posts; pv post_versions; item jsonb; ref jsonb; node brain_nodes; post_ids jsonb:='[]'; message_ids jsonb:='[]'; msg_id uuid; output jsonb; doc jsonb; o deliverable_offers; prop timestamptz;
BEGIN
 SELECT * INTO t FROM tasks WHERE id=p_task_id AND workspace_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 SELECT task_results.output INTO existing FROM task_results WHERE task_id=t.id;
 IF FOUND THEN RETURN existing; END IF;
 IF t.status<>'running' OR t.run_id IS DISTINCT FROM p_run_id OR t.cancel_requested THEN RAISE EXCEPTION 'RUN_NOT_ACTIVE'; END IF;
 IF jsonb_typeof(p_result) IS DISTINCT FROM 'object' OR length(p_result::text)>160000 OR length(coalesce(p_result->>'reply','')) NOT BETWEEN 1 AND 12000
  OR jsonb_typeof(p_result->'posts') IS DISTINCT FROM 'array' OR jsonb_array_length(p_result->'posts')>12 THEN RAISE EXCEPTION 'INVALID_RESULT'; END IF;
 IF jsonb_typeof(p_result->'document')='object' THEN
  doc:=p_result->'document';
  IF length(coalesce(doc->>'title','')) NOT BETWEEN 1 AND 200 OR length(coalesce(doc->>'content','')) NOT BETWEEN 1 AND 80000 THEN RAISE EXCEPTION 'INVALID_DOCUMENT'; END IF;
 END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_result->'posts') LOOP
  IF length(coalesce(item->>'caption','')) NOT BETWEEN 1 AND 6000 OR length(coalesce(item->>'hashtags',''))>1000 OR coalesce(item->>'platform','facebook') NOT IN ('facebook','instagram') THEN RAISE EXCEPTION 'INVALID_POST'; END IF;
  prop:=NULL;
  BEGIN prop:=nullif(item->>'proposedAt','')::timestamptz; EXCEPTION WHEN others THEN prop:=NULL; END;
  IF prop IS NOT NULL AND prop<=now() THEN prop:=NULL; END IF;
  INSERT INTO planned_posts(workspace_id,task_id,deliverable_id,platform,caption,hashtags,status,scheduled_for,proposed_for,origin,context_refs,visual_brief)
   VALUES(t.workspace_id,t.id,NULL,coalesce(item->>'platform','facebook'),item->>'caption',coalesce(item->>'hashtags',''),'draft',NULL,prop,t.origin,coalesce(t.checkpoint->'contextRefs','[]'),coalesce(item->>'visualBrief','')) RETURNING * INTO p;
  INSERT INTO post_versions(workspace_id,post_id,revision,text,provenance)
   VALUES(t.workspace_id,p.id,1,p.caption||E'\n'||p.hashtags,jsonb_build_object('caption',p.caption,'hashtags',p.hashtags,'platform',p.platform,'visualBrief',p.visual_brief,'contextRefs',p.context_refs,'origin',p.origin,'proposedAt',prop)) RETURNING * INTO pv;
  UPDATE planned_posts SET current_version_id=pv.id WHERE id=p.id;
  post_ids:=post_ids||jsonb_build_array(p.id);
  INSERT INTO messages(workspace_id,conversation_id,role,type,content,payload) VALUES(t.workspace_id,t.conversation_id,'agent','post_reference','Draft Post ready for review',jsonb_build_object('postId',p.id,'taskId',t.id,'caption',p.caption,'platform',p.platform,'proposedFor',p.proposed_for)) RETURNING id INTO msg_id;
  message_ids:=message_ids||jsonb_build_array(msg_id);
 END LOOP;
 FOR ref IN SELECT value FROM jsonb_array_elements(coalesce(t.checkpoint->'contextRefs','[]')) LOOP
  SELECT * INTO node FROM brain_nodes WHERE id=(ref->>'nodeId')::uuid AND workspace_id=t.workspace_id;
  IF NOT FOUND THEN
   FOR item IN SELECT value FROM jsonb_array_elements(post_ids) LOOP
    INSERT INTO post_holds(workspace_id,post_id,reason) VALUES(t.workspace_id,(item#>>'{}')::uuid,'Business context was deleted during generation.');
    UPDATE planned_posts SET execution_state='held' WHERE id=(item#>>'{}')::uuid;
   END LOOP;
   CONTINUE;
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(post_ids) LOOP
   INSERT INTO context_dependencies(workspace_id,node_id,node_version,consumer_type,consumer_id,consumer_version) VALUES(t.workspace_id,node.id,(ref->>'version')::integer,'post',(item#>>'{}')::uuid,1);
  END LOOP;
  IF node.version<>(ref->>'version')::integer OR node.approval_state<>'approved' OR NOT node.is_current THEN PERFORM mark_brain_context_changed(node.id,'Business context changed during generation: '||node.title); END IF;
 END LOOP;
 INSERT INTO messages(workspace_id,conversation_id,role,type,content,payload) VALUES(t.workspace_id,t.conversation_id,'agent','text_response',p_result->>'reply',jsonb_build_object('taskId',t.id)) RETURNING id INTO msg_id;
 message_ids:=message_ids||jsonb_build_array(msg_id);
 IF doc IS NOT NULL THEN
  INSERT INTO deliverable_offers(workspace_id,task_id,conversation_id,proposed_type,title,content,source_refs,limitations,post_ids)
   VALUES(t.workspace_id,t.id,t.conversation_id,coalesce(doc->>'type','general'),doc->>'title',doc->>'content',
          coalesce(p_result->'sourceRefs','[]'),coalesce(p_result->'limitations','[]'),post_ids)
   RETURNING * INTO o;
  INSERT INTO messages(workspace_id,conversation_id,role,type,content,payload)
   VALUES(t.workspace_id,t.conversation_id,'agent','deliverable_offer',o.title,
          jsonb_build_object('offerId',o.id,'taskId',t.id,'proposedType',o.proposed_type,'title',o.title,
                             'preview',left(o.content,600),'postCount',jsonb_array_length(post_ids),'state','offered'))
   RETURNING id INTO msg_id;
  UPDATE deliverable_offers SET message_id=msg_id WHERE id=o.id;
  message_ids:=message_ids||jsonb_build_array(msg_id);
 END IF;
 output:=jsonb_build_object('taskId',t.id,'documentId',NULL,'offerId',o.id,'postIds',post_ids,'messageIds',message_ids);
 INSERT INTO task_results(task_id,workspace_id,output) VALUES(t.id,t.workspace_id,output);
 UPDATE tasks SET status=CASE WHEN p_partial THEN 'partial' ELSE 'completed' END,result_summary=left(p_result->>'reply',500),checkpoint=checkpoint||jsonb_build_object('phase','done','outputRefs',output),version=version+1,updated_at=now() WHERE id=t.id;
 INSERT INTO notifications(workspace_id,type,subject_type,subject_id,title,body,dedupe_key) VALUES(t.workspace_id,'task_complete','task',t.id,CASE WHEN p_partial THEN 'Partial result ready' ELSE 'Task complete' END,left(p_result->>'reply',500),'task-result:'||t.id);
 RETURN output;
END $$;
