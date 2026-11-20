-- C11 guards: bound task retries, keep publishing out of the generic runner,
-- and return the real message ids alongside saved result references.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;

-- Each admitted run and each resume counts as one attempt. A permanent failure
-- (research_unavailable, no_active_key, ...) can no longer be retried forever.
CREATE OR REPLACE FUNCTION admit_task(p_task_id uuid,p_runner_id uuid) RETURNS tasks LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w uuid:=auth.uid(); t tasks;
BEGIN
 IF w IS NULL OR p_runner_id IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('tasks:'||w::text,0));
 SELECT * INTO t FROM tasks WHERE id=p_task_id AND workspace_id=w FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 IF t.status<>'queued' OR t.cancel_requested THEN RETURN NULL; END IF;
 IF t.type='publishing' THEN RETURN NULL; END IF;
 IF (SELECT count(*) FROM tasks WHERE workspace_id=w AND status='running')>=2 THEN RETURN NULL; END IF;
 UPDATE tasks SET status='running',run_id=gen_random_uuid(),runner_id=p_runner_id,heartbeat_at=now(),attempts=attempts+1,version=version+1,updated_at=now()
  WHERE id=t.id RETURNING * INTO t;
 RETURN t;
END $$;

CREATE OR REPLACE FUNCTION resume_task(p_task_id uuid,p_expected_version integer) RETURNS tasks LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t tasks;
BEGIN
 SELECT * INTO t FROM tasks WHERE id=p_task_id AND workspace_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 IF t.version IS DISTINCT FROM p_expected_version OR t.status NOT IN ('failed','interrupted') OR t.type='publishing' THEN RAISE EXCEPTION 'STALE_VERSION'; END IF;
 IF t.attempts>=5 THEN RAISE EXCEPTION 'MAX_ATTEMPTS'; END IF;
 UPDATE tasks SET status='queued',cancel_requested=false,run_id=NULL,runner_id=NULL,attempts=attempts+1,version=version+1,updated_at=now() WHERE id=t.id RETURNING * INTO t;
 RETURN t;
END $$;

CREATE OR REPLACE FUNCTION save_task_result(p_task_id uuid,p_run_id uuid,p_result jsonb,p_partial boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t tasks; existing jsonb; d deliverables; p planned_posts; pv post_versions; item jsonb; ref jsonb; node brain_nodes; doc_id uuid; post_ids jsonb:='[]'; message_ids jsonb:='[]'; msg_id uuid; output jsonb;
BEGIN
 SELECT * INTO t FROM tasks WHERE id=p_task_id AND workspace_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 SELECT task_results.output INTO existing FROM task_results WHERE task_id=t.id;
 IF FOUND THEN RETURN existing; END IF;
 IF t.status<>'running' OR t.run_id IS DISTINCT FROM p_run_id OR t.cancel_requested THEN RAISE EXCEPTION 'RUN_NOT_ACTIVE'; END IF;
 IF jsonb_typeof(p_result) IS DISTINCT FROM 'object' OR length(p_result::text)>160000 OR length(coalesce(p_result->>'reply','')) NOT BETWEEN 1 AND 12000
  OR jsonb_typeof(p_result->'posts') IS DISTINCT FROM 'array' OR jsonb_array_length(p_result->'posts')>12 THEN RAISE EXCEPTION 'INVALID_RESULT'; END IF;
 IF jsonb_typeof(p_result->'document')='object' THEN
  item:=p_result->'document';
  IF length(coalesce(item->>'title','')) NOT BETWEEN 1 AND 200 OR length(coalesce(item->>'content','')) NOT BETWEEN 1 AND 80000 THEN RAISE EXCEPTION 'INVALID_DOCUMENT'; END IF;
  INSERT INTO deliverables(workspace_id,task_id,title,type,content,origin,context_refs,source_refs,limitations)
   VALUES(t.workspace_id,t.id,item->>'title',coalesce(item->>'type','general'),item->>'content',t.origin,coalesce(t.checkpoint->'contextRefs','[]'),coalesce(p_result->'sourceRefs','[]'),coalesce(p_result->'limitations','[]')) RETURNING * INTO d;
  doc_id:=d.id;
  INSERT INTO deliverable_versions(workspace_id,deliverable_id,version,title,content,context_refs,source_refs,limitations)
   VALUES(t.workspace_id,d.id,d.version,d.title,d.content,d.context_refs,d.source_refs,d.limitations);
  INSERT INTO messages(workspace_id,conversation_id,role,type,content,payload) VALUES(t.workspace_id,t.conversation_id,'agent','deliverable_card',d.title,jsonb_build_object('deliverable_id',d.id,'title',d.title,'type',d.type,'content',d.content,'taskId',t.id)) RETURNING id INTO msg_id;
  message_ids:=message_ids||jsonb_build_array(msg_id);
 END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_result->'posts') LOOP
  IF length(coalesce(item->>'caption','')) NOT BETWEEN 1 AND 6000 OR length(coalesce(item->>'hashtags',''))>1000 OR coalesce(item->>'platform','facebook') NOT IN ('facebook','instagram') THEN RAISE EXCEPTION 'INVALID_POST'; END IF;
  INSERT INTO planned_posts(workspace_id,task_id,deliverable_id,platform,caption,hashtags,status,scheduled_for,origin,context_refs,visual_brief)
   VALUES(t.workspace_id,t.id,NULL,coalesce(item->>'platform','facebook'),item->>'caption',coalesce(item->>'hashtags',''),'draft',NULL,t.origin,coalesce(t.checkpoint->'contextRefs','[]'),coalesce(item->>'visualBrief','')) RETURNING * INTO p;
  INSERT INTO post_versions(workspace_id,post_id,revision,text,provenance)
   VALUES(t.workspace_id,p.id,1,p.caption||E'\n'||p.hashtags,jsonb_build_object('caption',p.caption,'hashtags',p.hashtags,'platform',p.platform,'visualBrief',p.visual_brief,'contextRefs',p.context_refs,'origin',p.origin)) RETURNING * INTO pv;
  UPDATE planned_posts SET current_version_id=pv.id WHERE id=p.id;
  post_ids:=post_ids||jsonb_build_array(p.id);
  INSERT INTO messages(workspace_id,conversation_id,role,type,content,payload) VALUES(t.workspace_id,t.conversation_id,'agent','post_reference','Draft Post ready for review',jsonb_build_object('postId',p.id,'taskId',t.id,'caption',p.caption,'platform',p.platform)) RETURNING id INTO msg_id;
  message_ids:=message_ids||jsonb_build_array(msg_id);
 END LOOP;
 FOR ref IN SELECT value FROM jsonb_array_elements(coalesce(t.checkpoint->'contextRefs','[]')) LOOP
  SELECT * INTO node FROM brain_nodes WHERE id=(ref->>'nodeId')::uuid AND workspace_id=t.workspace_id;
  IF NOT FOUND THEN
   IF doc_id IS NOT NULL THEN UPDATE deliverables SET stale_reason='Business context was deleted during generation.' WHERE id=doc_id; END IF;
   FOR item IN SELECT value FROM jsonb_array_elements(post_ids) LOOP
    INSERT INTO post_holds(workspace_id,post_id,reason) VALUES(t.workspace_id,(item#>>'{}')::uuid,'Business context was deleted during generation.');
    UPDATE planned_posts SET execution_state='held' WHERE id=(item#>>'{}')::uuid;
   END LOOP;
   CONTINUE;
  END IF;
  IF doc_id IS NOT NULL THEN INSERT INTO context_dependencies(workspace_id,node_id,node_version,consumer_type,consumer_id,consumer_version) VALUES(t.workspace_id,node.id,(ref->>'version')::integer,'document',doc_id,1); END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(post_ids) LOOP
   INSERT INTO context_dependencies(workspace_id,node_id,node_version,consumer_type,consumer_id,consumer_version) VALUES(t.workspace_id,node.id,(ref->>'version')::integer,'post',(item#>>'{}')::uuid,1);
  END LOOP;
  IF node.version<>(ref->>'version')::integer OR node.approval_state<>'approved' OR NOT node.is_current THEN PERFORM mark_brain_context_changed(node.id,'Business context changed during generation: '||node.title); END IF;
 END LOOP;
 INSERT INTO messages(workspace_id,conversation_id,role,type,content,payload) VALUES(t.workspace_id,t.conversation_id,'agent','text_response',p_result->>'reply',jsonb_build_object('taskId',t.id)) RETURNING id INTO msg_id;
 message_ids:=message_ids||jsonb_build_array(msg_id);
 output:=jsonb_build_object('taskId',t.id,'documentId',doc_id,'postIds',post_ids,'messageIds',message_ids);
 INSERT INTO task_results(task_id,workspace_id,output) VALUES(t.id,t.workspace_id,output);
 UPDATE tasks SET status=CASE WHEN p_partial THEN 'partial' ELSE 'completed' END,result_summary=left(p_result->>'reply',500),checkpoint=checkpoint||jsonb_build_object('phase','done','outputRefs',output),version=version+1,updated_at=now() WHERE id=t.id;
 INSERT INTO notifications(workspace_id,type,subject_type,subject_id,title,body,dedupe_key) VALUES(t.workspace_id,'task_complete','task',t.id,CASE WHEN p_partial THEN 'Partial result ready' ELSE 'Task complete' END,left(p_result->>'reply',500),'task-result:'||t.id);
 RETURN output;
END $$;