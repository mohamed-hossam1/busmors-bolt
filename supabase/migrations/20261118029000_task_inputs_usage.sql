CREATE UNIQUE INDEX one_pending_task_input ON task_inputs(task_id) WHERE status='pending';
CREATE FUNCTION await_task_input(p_task_id uuid,p_run_id uuid,p_label text,p_options jsonb)
RETURNS task_inputs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t tasks; i task_inputs;
BEGIN
 SELECT * INTO t FROM tasks WHERE id=p_task_id AND workspace_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 SELECT * INTO i FROM task_inputs WHERE task_id=t.id AND status='pending';
 IF FOUND THEN RETURN i; END IF;
 IF t.status<>'running' OR t.run_id IS DISTINCT FROM p_run_id OR t.cancel_requested THEN RAISE EXCEPTION 'RUN_NOT_ACTIVE'; END IF;
 IF length(coalesce(p_label,'')) NOT BETWEEN 1 AND 500 OR jsonb_typeof(p_options) IS DISTINCT FROM 'array' OR jsonb_array_length(p_options)>8 THEN RAISE EXCEPTION 'INVALID_FORM'; END IF;
 INSERT INTO task_inputs(workspace_id,task_id,schema) VALUES(t.workspace_id,t.id,jsonb_build_object('fields',jsonb_build_array(jsonb_build_object('name','answer','label',p_label,'type','single','options',p_options)))) RETURNING * INTO i;
 INSERT INTO messages(workspace_id,conversation_id,role,type,content,payload) VALUES(t.workspace_id,t.conversation_id,'agent','structured_form',p_label,i.schema||jsonb_build_object('taskId',t.id,'inputId',i.id,'inputVersion',i.version,'submitted',false));
 UPDATE tasks SET status='awaiting_input',version=version+1,updated_at=now() WHERE id=t.id;
 INSERT INTO notifications(workspace_id,type,subject_type,subject_id,title,body,dedupe_key) VALUES(t.workspace_id,'clarification','task',t.id,'Your answer is needed',p_label,'task-input:'||i.id);
 RETURN i;
END $$;
CREATE FUNCTION answer_task_input(p_input_id uuid,p_expected_version integer,p_answer jsonb)
RETURNS tasks LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t tasks; i task_inputs;
BEGIN
 SELECT * INTO i FROM task_inputs WHERE id=p_input_id AND workspace_id=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 SELECT * INTO t FROM tasks WHERE id=i.task_id AND workspace_id=auth.uid() FOR UPDATE;
 SELECT * INTO i FROM task_inputs WHERE id=p_input_id FOR UPDATE;
 IF i.version IS DISTINCT FROM p_expected_version OR i.status<>'pending' OR t.status<>'awaiting_input' THEN RAISE EXCEPTION 'STALE_VERSION'; END IF;
 IF jsonb_typeof(p_answer) IS DISTINCT FROM 'object' OR coalesce(p_answer->>'status','') NOT IN ('answered','unknown','skipped','not_applicable')
  OR (p_answer->>'status'='answered' AND length(btrim(coalesce(p_answer->>'value',''))) NOT BETWEEN 1 AND 3000) THEN RAISE EXCEPTION 'INVALID_ANSWER'; END IF;
 UPDATE task_inputs SET answers=p_answer,status=CASE WHEN p_answer->>'status'='skipped' THEN 'skipped' ELSE 'answered' END,version=version+1,answered_at=now() WHERE id=i.id;
 UPDATE messages SET payload=payload||jsonb_build_object('submitted',true,'answer',p_answer) WHERE workspace_id=t.workspace_id AND payload->>'inputId'=i.id::text;
 INSERT INTO messages(workspace_id,conversation_id,role,type,content,payload) VALUES(t.workspace_id,t.conversation_id,'user','text',coalesce(nullif(p_answer->>'value',''),p_answer->>'status'),jsonb_build_object('taskId',t.id,'inputId',i.id,'answerStatus',p_answer->>'status'));
 UPDATE tasks SET status='queued',run_id=NULL,runner_id=NULL,checkpoint=checkpoint||jsonb_build_object('phase','route','answers',coalesce(checkpoint->'answers','[]')||jsonb_build_array(jsonb_build_object('question',i.schema,'answer',p_answer))),version=version+1,updated_at=now() WHERE id=t.id RETURNING * INTO t;
 RETURN t;
END $$;
REVOKE INSERT,UPDATE,DELETE ON task_inputs FROM authenticated;
REVOKE ALL ON FUNCTION await_task_input(uuid,uuid,text,jsonb),answer_task_input(uuid,integer,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION await_task_input(uuid,uuid,text,jsonb),answer_task_input(uuid,integer,jsonb) TO authenticated;

ALTER TABLE task_usage ADD COLUMN state text NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','succeeded','failed')),
 ADD COLUMN reserved_tokens integer NOT NULL DEFAULT 0,
 ADD COLUMN finished_at timestamptz;

CREATE FUNCTION reserve_task_call(p_task_id uuid,p_run_id uuid,p_call_id uuid,p_operation text,p_token_limit integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t tasks; calls integer; reserved integer;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 SELECT * INTO t FROM tasks WHERE id=p_task_id FOR UPDATE;
 IF NOT FOUND OR t.status<>'running' OR t.run_id IS DISTINCT FROM p_run_id OR t.cancel_requested THEN RAISE EXCEPTION 'RUN_NOT_ACTIVE'; END IF;
 IF p_call_id IS NULL OR p_token_limit NOT BETWEEN 1 AND 50000 THEN RAISE EXCEPTION 'INVALID_CALL'; END IF;
 IF EXISTS(SELECT 1 FROM task_usage WHERE task_id=t.id AND call_id=p_call_id) THEN RAISE EXCEPTION 'CALL_ALREADY_RESERVED'; END IF;
 SELECT count(*),coalesce(sum(CASE WHEN state='succeeded' AND usage ?& ARRAY['inputTokens','outputTokens'] THEN (usage->>'inputTokens')::integer+(usage->>'outputTokens')::integer ELSE reserved_tokens END),0) INTO calls,reserved FROM task_usage WHERE task_id=t.id;
 IF calls >= (t.allowance->>'calls')::integer OR reserved+p_token_limit>(t.allowance->>'tokens')::integer THEN RAISE EXCEPTION 'BUDGET_EXHAUSTED'; END IF;
 INSERT INTO task_usage(workspace_id,task_id,call_id,operation,reserved_tokens) VALUES(t.workspace_id,t.id,p_call_id,p_operation,p_token_limit);
 UPDATE tasks SET consumption=consumption||jsonb_build_object('calls',calls+1,'tokensAccounted',reserved+p_token_limit),heartbeat_at=now() WHERE id=t.id;
END $$;
CREATE FUNCTION finish_task_call(p_task_id uuid,p_call_id uuid,p_success boolean,p_usage jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 UPDATE task_usage SET state=CASE WHEN p_success THEN 'succeeded' ELSE 'failed' END,usage=coalesce(p_usage,'{}'),finished_at=now() WHERE task_id=p_task_id AND call_id=p_call_id AND state='reserved';
 UPDATE tasks SET heartbeat_at=now(),consumption=consumption||jsonb_build_object('calls',(SELECT count(*) FROM task_usage WHERE task_id=p_task_id),'tokensAccounted',(SELECT coalesce(sum(CASE WHEN state='succeeded' AND usage ?& ARRAY['inputTokens','outputTokens'] THEN (usage->>'inputTokens')::integer+(usage->>'outputTokens')::integer ELSE reserved_tokens END),0) FROM task_usage WHERE task_id=p_task_id)) WHERE id=p_task_id;
END $$;
REVOKE ALL ON FUNCTION reserve_task_call(uuid,uuid,uuid,text,integer),finish_task_call(uuid,uuid,boolean,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION reserve_task_call(uuid,uuid,uuid,text,integer),finish_task_call(uuid,uuid,boolean,jsonb) TO service_role;
