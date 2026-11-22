-- Phase 1: substantial chat results are no longer saved to Deliverables
-- automatically. save_task_result records a deliverable_offer and a
-- 'deliverable_offer' chat message; the owner saves it (accept) or dismisses it.

ALTER TABLE messages DROP CONSTRAINT messages_type_check;
ALTER TABLE messages ADD CONSTRAINT messages_type_check CHECK (type IN (
  'text','text_response','form','structured_form','task_status','deliverable_card',
  'knowledge_notification','budget_extension_request','error','post_reference','deliverable_offer'));

CREATE TABLE deliverable_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,
  message_id uuid,
  proposed_type text NOT NULL CHECK (proposed_type IN ('research_report','competitor_analysis','content_posts','content_calendar','performance_diagnosis','general')),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  content text NOT NULL CHECK (length(content) BETWEEN 1 AND 80000),
  source_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  limitations jsonb NOT NULL DEFAULT '[]'::jsonb,
  post_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  state text NOT NULL DEFAULT 'offered' CHECK (state IN ('offered','saved','dismissed')),
  deliverable_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  UNIQUE (task_id, proposed_type),
  UNIQUE (workspace_id, id)
);
ALTER TABLE deliverable_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner read" ON deliverable_offers FOR SELECT TO authenticated USING (workspace_id = auth.uid());
REVOKE ALL ON deliverable_offers FROM PUBLIC, anon, authenticated;
GRANT SELECT ON deliverable_offers TO authenticated;
GRANT ALL ON deliverable_offers TO service_role;

CREATE OR REPLACE FUNCTION save_task_result(p_task_id uuid,p_run_id uuid,p_result jsonb,p_partial boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t tasks; existing jsonb; p planned_posts; pv post_versions; item jsonb; ref jsonb; node brain_nodes; post_ids jsonb:='[]'; message_ids jsonb:='[]'; msg_id uuid; output jsonb; doc jsonb; o deliverable_offers;
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

-- Save an offered result to Deliverables. Idempotent: a second call returns the
-- deliverable the first call created. A dismissed offer can still be saved.
CREATE OR REPLACE FUNCTION accept_deliverable_offer(p_offer_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o deliverable_offers; t tasks; d deliverables; ref jsonb; node brain_nodes;
BEGIN
 SELECT * INTO o FROM deliverable_offers WHERE id=p_offer_id AND workspace_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 IF o.state='saved' THEN RETURN jsonb_build_object('deliverableId',o.deliverable_id,'type',o.proposed_type); END IF;
 SELECT * INTO t FROM tasks WHERE id=o.task_id AND workspace_id=o.workspace_id;
 INSERT INTO deliverables(workspace_id,task_id,title,type,content,origin,context_refs,source_refs,limitations)
  VALUES(o.workspace_id,o.task_id,o.title,o.proposed_type,o.content,t.origin,coalesce(t.checkpoint->'contextRefs','[]'),o.source_refs,o.limitations)
  RETURNING * INTO d;
 INSERT INTO deliverable_versions(workspace_id,deliverable_id,version,title,content,context_refs,source_refs,limitations)
  VALUES(d.workspace_id,d.id,d.version,d.title,d.content,d.context_refs,d.source_refs,d.limitations);
 FOR ref IN SELECT value FROM jsonb_array_elements(coalesce(t.checkpoint->'contextRefs','[]')) LOOP
  SELECT * INTO node FROM brain_nodes WHERE id=(ref->>'nodeId')::uuid AND workspace_id=d.workspace_id;
  IF NOT FOUND THEN
   UPDATE deliverables SET stale_reason='Business context was deleted after this result was generated.' WHERE id=d.id;
   CONTINUE;
  END IF;
  INSERT INTO context_dependencies(workspace_id,node_id,node_version,consumer_type,consumer_id,consumer_version)
   VALUES(d.workspace_id,node.id,(ref->>'version')::integer,'document',d.id,1);
  IF node.version<>(ref->>'version')::integer OR node.approval_state<>'approved' OR NOT node.is_current THEN
   UPDATE deliverables SET stale_reason='Business context changed after this result was generated: '||node.title WHERE id=d.id;
  END IF;
 END LOOP;
 IF jsonb_array_length(o.post_ids)>0 THEN
  UPDATE planned_posts SET deliverable_id=d.id
   WHERE workspace_id=o.workspace_id AND id IN (SELECT (value#>>'{}')::uuid FROM jsonb_array_elements(o.post_ids));
 END IF;
 UPDATE deliverable_offers SET state='saved', deliverable_id=d.id, decided_at=now() WHERE id=o.id;
 UPDATE messages SET payload=payload||jsonb_build_object('state','saved','deliverableId',d.id) WHERE id=o.message_id AND workspace_id=o.workspace_id;
 INSERT INTO audit_log(workspace_id,actor_id,action,entity_type,entity_id) VALUES(o.workspace_id,auth.uid(),'deliverable_saved','deliverable',d.id);
 RETURN jsonb_build_object('deliverableId',d.id,'type',d.type);
END $$;

-- "Not now": only an offered result changes state; saved/dismissed are left alone.
CREATE OR REPLACE FUNCTION dismiss_deliverable_offer(p_offer_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o deliverable_offers;
BEGIN
 SELECT * INTO o FROM deliverable_offers WHERE id=p_offer_id AND workspace_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 IF o.state='offered' THEN
  UPDATE deliverable_offers SET state='dismissed', decided_at=now() WHERE id=o.id;
  UPDATE messages SET payload=payload||jsonb_build_object('state','dismissed') WHERE id=o.message_id AND workspace_id=o.workspace_id;
 END IF;
END $$;

REVOKE ALL ON FUNCTION accept_deliverable_offer(uuid), dismiss_deliverable_offer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION accept_deliverable_offer(uuid), dismiss_deliverable_offer(uuid) TO authenticated;
