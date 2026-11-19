ALTER TABLE tasks ADD COLUMN runner_id uuid;
UPDATE tasks SET status='interrupted',checkpoint='{"phase":"route"}' WHERE status IN ('running','pending');
ALTER TABLE planned_posts ADD COLUMN visual_brief text NOT NULL DEFAULT '';
CREATE TABLE task_results (
 task_id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 output jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(workspace_id,task_id) REFERENCES tasks(workspace_id,id) ON DELETE CASCADE
);
ALTER TABLE task_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner read" ON task_results FOR SELECT TO authenticated USING(workspace_id=auth.uid());
REVOKE ALL ON task_results FROM PUBLIC,anon,authenticated;
GRANT SELECT ON task_results TO authenticated;
GRANT ALL ON task_results TO service_role;

CREATE FUNCTION enqueue_task(p_conversation_id uuid,p_request text,p_origin jsonb,p_idempotency_key uuid)
RETURNS tasks LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w uuid:=auth.uid(); t tasks; fingerprint text:=md5(p_request||p_origin::text);
BEGIN
 IF w IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 IF p_idempotency_key IS NULL OR length(btrim(coalesce(p_request,''))) NOT BETWEEN 1 AND 12000 OR p_origin IS NULL THEN RAISE EXCEPTION 'INVALID_REQUEST'; END IF;
 IF NOT EXISTS(SELECT 1 FROM conversations WHERE workspace_id=w AND id=p_conversation_id) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('tasks:'||w::text,0));
 SELECT * INTO t FROM tasks WHERE workspace_id=w AND idempotency_key=p_idempotency_key;
 IF FOUND THEN
  IF t.request_hash IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
  RETURN t;
 END IF;
 INSERT INTO tasks(workspace_id,conversation_id,type,status,user_request,origin,idempotency_key,request_hash,checkpoint)
  VALUES(w,p_conversation_id,'simple_answer','queued',btrim(p_request),p_origin,p_idempotency_key,fingerprint,'{"phase":"route"}') RETURNING * INTO t;
 INSERT INTO messages(workspace_id,conversation_id,role,type,content,payload) VALUES(w,p_conversation_id,'user','text',p_request,jsonb_build_object('taskId',t.id));
 UPDATE conversations SET title=left(p_request,60) WHERE id=p_conversation_id AND (SELECT count(*) FROM messages WHERE conversation_id=p_conversation_id AND role='user')=1;
 RETURN t;
END $$;

CREATE FUNCTION recover_tasks(p_runner_id uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE count_changed integer;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 UPDATE tasks SET status='interrupted',version=version+1,updated_at=now()
  WHERE workspace_id=auth.uid() AND status='running' AND (runner_id=p_runner_id OR heartbeat_at IS NULL OR heartbeat_at<now()-interval '120 seconds');
 GET DIAGNOSTICS count_changed=ROW_COUNT;
 UPDATE task_steps SET status='failed',completed_at=now(),output='{"reason":"Browser execution interrupted"}'
  WHERE workspace_id=auth.uid() AND status='running' AND task_id IN(SELECT id FROM tasks WHERE workspace_id=auth.uid() AND status='interrupted');
 RETURN count_changed;
END $$;

CREATE FUNCTION admit_task(p_task_id uuid,p_runner_id uuid) RETURNS tasks LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w uuid:=auth.uid(); t tasks;
BEGIN
 IF w IS NULL OR p_runner_id IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('tasks:'||w::text,0));
 SELECT * INTO t FROM tasks WHERE id=p_task_id AND workspace_id=w FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 IF t.status<>'queued' OR t.cancel_requested THEN RETURN NULL; END IF;
 IF (SELECT count(*) FROM tasks WHERE workspace_id=w AND status='running')>=2 THEN RETURN NULL; END IF;
 UPDATE tasks SET status='running',run_id=gen_random_uuid(),runner_id=p_runner_id,heartbeat_at=now(),version=version+1,updated_at=now()
  WHERE id=t.id RETURNING * INTO t;
 RETURN t;
END $$;

CREATE FUNCTION checkpoint_task(p_task_id uuid,p_run_id uuid,p_checkpoint jsonb,p_type text DEFAULT NULL,p_plan jsonb DEFAULT NULL)
RETURNS tasks LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t tasks;
BEGIN
 SELECT * INTO t FROM tasks WHERE id=p_task_id AND workspace_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 IF t.status<>'running' OR t.run_id IS DISTINCT FROM p_run_id OR t.cancel_requested THEN RAISE EXCEPTION 'RUN_NOT_ACTIVE'; END IF;
 IF jsonb_typeof(p_checkpoint) IS DISTINCT FROM 'object' OR length(p_checkpoint::text)>200000 OR (p_plan IS NOT NULL AND jsonb_typeof(p_plan)<>'array') THEN RAISE EXCEPTION 'INVALID_CHECKPOINT'; END IF;
 UPDATE tasks SET checkpoint=p_checkpoint,type=coalesce(p_type,type),plan=coalesce(p_plan,plan),heartbeat_at=now(),version=version+1,updated_at=now() WHERE id=t.id RETURNING * INTO t;
 RETURN t;
END $$;

CREATE FUNCTION heartbeat_task(p_task_id uuid,p_run_id uuid) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 UPDATE tasks SET heartbeat_at=now() WHERE id=p_task_id AND workspace_id=auth.uid() AND status='running' AND run_id=p_run_id AND NOT cancel_requested;
$$;
REVOKE ALL ON FUNCTION heartbeat_task(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION heartbeat_task(uuid,uuid) TO authenticated;

CREATE FUNCTION record_task_step(p_task_id uuid,p_run_id uuid,p_instance_id uuid,p_agent text,p_label text,p_status text,p_output jsonb DEFAULT '{}')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t tasks; step task_steps; seq_number bigint; previous_id uuid;
BEGIN
 SELECT * INTO t FROM tasks WHERE id=p_task_id AND workspace_id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR t.status<>'running' OR t.run_id IS DISTINCT FROM p_run_id OR t.cancel_requested THEN RAISE EXCEPTION 'RUN_NOT_ACTIVE'; END IF;
 IF p_status IS NULL OR p_status NOT IN ('running','completed','failed') OR length(coalesce(p_label,'')) NOT BETWEEN 1 AND 200 OR length(coalesce(p_agent,'')) NOT BETWEEN 1 AND 60 OR length(p_output::text)>80000 THEN RAISE EXCEPTION 'INVALID_STEP'; END IF;
 SELECT * INTO step FROM task_steps WHERE id=p_instance_id;
 IF FOUND THEN
  IF step.workspace_id<>t.workspace_id OR step.task_id<>t.id OR step.run_id<>p_run_id OR step.status<>'running' THEN RAISE EXCEPTION 'INVALID_STEP'; END IF;
  UPDATE task_steps SET status=p_status,output=p_output,completed_at=CASE WHEN p_status<>'running' THEN now() END WHERE id=step.id;
 ELSE
  IF p_status<>'running' THEN RAISE EXCEPTION 'INVALID_STEP'; END IF;
  INSERT INTO task_steps(id,workspace_id,task_id,run_id,position,agent,label,status,started_at)
   VALUES(p_instance_id,t.workspace_id,t.id,p_run_id,(SELECT count(*) FROM task_steps WHERE task_id=t.id),p_agent,p_label,'running',now());
 END IF;
 SELECT coalesce(max(seq),0)+1 INTO seq_number FROM agent_events WHERE task_id=t.id AND run_id=p_run_id;
 INSERT INTO agent_events(workspace_id,task_id,run_id,instance_id,seq,event_type,agent_id,payload)
  VALUES(t.workspace_id,t.id,p_run_id,p_instance_id,seq_number,CASE p_status WHEN 'running' THEN 'agent_started' WHEN 'completed' THEN 'agent_completed' ELSE 'agent_error' END,p_agent,
  jsonb_build_object('task_summary',p_label,'result_summary',p_output->>'summary','error',p_output->>'error'));
 IF p_status='running' THEN
  SELECT id INTO previous_id FROM task_steps WHERE task_id=t.id AND id<>p_instance_id ORDER BY position DESC LIMIT 1;
  IF previous_id IS NOT NULL THEN
   INSERT INTO agent_events(workspace_id,task_id,run_id,instance_id,seq,event_type,agent_id,payload)
    VALUES(t.workspace_id,t.id,p_run_id,p_instance_id,seq_number+1,'flow_connection',p_agent,jsonb_build_object('from',previous_id,'to',p_instance_id));
  END IF;
 END IF;
 UPDATE tasks SET heartbeat_at=now() WHERE id=t.id;
 RETURN p_instance_id;
END $$;

CREATE FUNCTION stop_task(p_task_id uuid,p_run_id uuid,p_status text,p_message text)
RETURNS tasks LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t tasks; step task_steps; seq_number bigint;
BEGIN
 SELECT * INTO t FROM tasks WHERE id=p_task_id AND workspace_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 IF p_status IS NULL OR p_status NOT IN ('failed','interrupted','cancelled') OR length(coalesce(p_message,''))>1000 THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
 IF p_status<>'cancelled' AND (t.run_id IS DISTINCT FROM p_run_id OR t.status<>'running') THEN RAISE EXCEPTION 'RUN_NOT_ACTIVE'; END IF;
 IF t.status IN ('completed','cancelled','partial') THEN RETURN t; END IF;
 FOR step IN SELECT * FROM task_steps WHERE task_id=t.id AND status='running' LOOP
  SELECT coalesce(max(seq),0)+1 INTO seq_number FROM agent_events WHERE task_id=t.id AND run_id=step.run_id;
  INSERT INTO agent_events(workspace_id,task_id,run_id,instance_id,seq,event_type,agent_id,payload)
   VALUES(t.workspace_id,t.id,step.run_id,step.id,seq_number,'agent_error',step.agent,jsonb_build_object('error',p_message,'task_summary',step.label));
 END LOOP;
 UPDATE tasks SET status=p_status,cancel_requested=(p_status='cancelled'),result_summary=p_message,version=version+1,updated_at=now() WHERE id=t.id RETURNING * INTO t;
 UPDATE task_steps SET status=CASE WHEN p_status='cancelled' THEN 'cancelled' ELSE 'failed' END,completed_at=now(),output=jsonb_build_object('error',p_message) WHERE task_id=t.id AND status='running';
 INSERT INTO messages(workspace_id,conversation_id,role,type,content,payload) VALUES(t.workspace_id,t.conversation_id,'system',CASE WHEN p_status='failed' THEN 'error' ELSE 'task_status' END,p_message,jsonb_build_object('taskId',t.id,'status',p_status));
 INSERT INTO notifications(workspace_id,type,subject_type,subject_id,title,body,dedupe_key) VALUES(t.workspace_id,p_status,'task',t.id,'Task '||p_status,p_message,'task:'||t.id||':'||t.version) ON CONFLICT DO NOTHING;
 RETURN t;
END $$;

CREATE FUNCTION resume_task(p_task_id uuid,p_expected_version integer) RETURNS tasks LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t tasks;
BEGIN
 SELECT * INTO t FROM tasks WHERE id=p_task_id AND workspace_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 IF t.version IS DISTINCT FROM p_expected_version OR t.status NOT IN ('failed','interrupted') OR t.type='publishing' THEN RAISE EXCEPTION 'STALE_VERSION'; END IF;
 UPDATE tasks SET status='queued',cancel_requested=false,run_id=NULL,runner_id=NULL,version=version+1,updated_at=now() WHERE id=t.id RETURNING * INTO t;
 RETURN t;
END $$;

CREATE FUNCTION save_task_result(p_task_id uuid,p_run_id uuid,p_result jsonb,p_partial boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t tasks; existing jsonb; d deliverables; p planned_posts; pv post_versions; item jsonb; ref jsonb; node brain_nodes; doc_id uuid; post_ids jsonb:='[]'; output jsonb;
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
  INSERT INTO messages(workspace_id,conversation_id,role,type,content,payload) VALUES(t.workspace_id,t.conversation_id,'agent','deliverable_card',d.title,jsonb_build_object('deliverable_id',d.id,'title',d.title,'type',d.type,'content',d.content,'taskId',t.id));
 END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_result->'posts') LOOP
  IF length(coalesce(item->>'caption','')) NOT BETWEEN 1 AND 6000 OR length(coalesce(item->>'hashtags',''))>1000 OR coalesce(item->>'platform','facebook') NOT IN ('facebook','instagram') THEN RAISE EXCEPTION 'INVALID_POST'; END IF;
  INSERT INTO planned_posts(workspace_id,task_id,deliverable_id,platform,caption,hashtags,status,scheduled_for,origin,context_refs,visual_brief)
   VALUES(t.workspace_id,t.id,NULL,coalesce(item->>'platform','facebook'),item->>'caption',coalesce(item->>'hashtags',''),'draft',NULL,t.origin,coalesce(t.checkpoint->'contextRefs','[]'),coalesce(item->>'visualBrief','')) RETURNING * INTO p;
  INSERT INTO post_versions(workspace_id,post_id,revision,text,provenance)
   VALUES(t.workspace_id,p.id,1,p.caption||E'\n'||p.hashtags,jsonb_build_object('caption',p.caption,'hashtags',p.hashtags,'platform',p.platform,'visualBrief',p.visual_brief,'contextRefs',p.context_refs,'origin',p.origin)) RETURNING * INTO pv;
  UPDATE planned_posts SET current_version_id=pv.id WHERE id=p.id;
  post_ids:=post_ids||jsonb_build_array(p.id);
  INSERT INTO messages(workspace_id,conversation_id,role,type,content,payload) VALUES(t.workspace_id,t.conversation_id,'agent','post_reference','Draft Post ready for review',jsonb_build_object('postId',p.id,'taskId',t.id,'caption',p.caption,'platform',p.platform));
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
 INSERT INTO messages(workspace_id,conversation_id,role,type,content,payload) VALUES(t.workspace_id,t.conversation_id,'agent','text_response',p_result->>'reply',jsonb_build_object('taskId',t.id));
 output:=jsonb_build_object('taskId',t.id,'documentId',doc_id,'postIds',post_ids);
 INSERT INTO task_results(task_id,workspace_id,output) VALUES(t.id,t.workspace_id,output);
 UPDATE tasks SET status=CASE WHEN p_partial THEN 'partial' ELSE 'completed' END,result_summary=left(p_result->>'reply',500),checkpoint=checkpoint||jsonb_build_object('phase','done','outputRefs',output),version=version+1,updated_at=now() WHERE id=t.id;
 INSERT INTO notifications(workspace_id,type,subject_type,subject_id,title,body,dedupe_key) VALUES(t.workspace_id,'task_complete','task',t.id,CASE WHEN p_partial THEN 'Partial result ready' ELSE 'Task complete' END,left(p_result->>'reply',500),'task-result:'||t.id);
 RETURN output;
END $$;

REVOKE INSERT,UPDATE,DELETE ON tasks,task_steps,agent_events FROM authenticated;
REVOKE ALL ON FUNCTION enqueue_task(uuid,text,jsonb,uuid),recover_tasks(uuid),admit_task(uuid,uuid),checkpoint_task(uuid,uuid,jsonb,text,jsonb),record_task_step(uuid,uuid,uuid,text,text,text,jsonb),stop_task(uuid,uuid,text,text),resume_task(uuid,integer),save_task_result(uuid,uuid,jsonb,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION enqueue_task(uuid,text,jsonb,uuid),recover_tasks(uuid),admit_task(uuid,uuid),checkpoint_task(uuid,uuid,jsonb,text,jsonb),record_task_step(uuid,uuid,uuid,text,text,text,jsonb),stop_task(uuid,uuid,text,text),resume_task(uuid,integer),save_task_result(uuid,uuid,jsonb,boolean) TO authenticated;
