\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id) VALUES('66666666-6666-4666-8666-666666666666');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','66666666-6666-4666-8666-666666666666',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
DO $$ BEGIN PERFORM bootstrap_workspace(); END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','66666666-6666-4666-8666-666666666666',true);
SELECT set_config('request.jwt.claim.role','service_role',true);
DO $$
DECLARE c uuid; key uuid:=gen_random_uuid(); runner uuid:=gen_random_uuid(); instance uuid:=gen_random_uuid(); a tasks; b tasks; d tasks; duplicate tasks; i task_inputs; output jsonb; first_output jsonb;
BEGIN
 INSERT INTO conversations(workspace_id,title) VALUES(auth.uid(),'Task acceptance') RETURNING id INTO c;
 a:=enqueue_task(c,'First request',jsonb_build_object('kind','direct','conversationId',c),key);
 duplicate:=enqueue_task(c,'First request',jsonb_build_object('kind','direct','conversationId',c),key);
 IF duplicate.id<>a.id OR (SELECT count(*) FROM messages WHERE conversation_id=c)<>1 THEN RAISE EXCEPTION 'Enqueue duplicated'; END IF;
 b:=enqueue_task(c,'Second request',jsonb_build_object('kind','direct','conversationId',c),gen_random_uuid());
 d:=enqueue_task(c,'Third request',jsonb_build_object('kind','direct','conversationId',c),gen_random_uuid());
 a:=admit_task(a.id,runner);b:=admit_task(b.id,runner);
 duplicate:=admit_task(d.id,runner);
 IF duplicate.id IS NOT NULL OR (SELECT count(*) FROM tasks WHERE status='running')<>2 THEN RAISE EXCEPTION 'Concurrency limit broken'; END IF;
 i:=await_task_input(a.id,a.run_id,'Which audience?','["Local households","Independent shops"]');
 IF NOT EXISTS(SELECT 1 FROM messages WHERE type='structured_form' AND payload->>'inputId'=i.id::text) THEN RAISE EXCEPTION 'Clarification not persisted'; END IF;
 d:=admit_task(d.id,runner);
 IF d.status<>'running' THEN RAISE EXCEPTION 'Input wait did not release slot'; END IF;
 output:='{"reply":"One draft Post is ready.","posts":[{"caption":"Useful owner-reviewed draft","hashtags":"#example","visualBrief":"Owner supplied product photo","platform":"facebook"}]}';
 first_output:=save_task_result(d.id,d.run_id,output);
 IF save_task_result(d.id,d.run_id,output)<>first_output THEN RAISE EXCEPTION 'Result save not idempotent'; END IF;
  IF (SELECT count(*) FROM planned_posts WHERE workspace_id=auth.uid())<>1 OR (SELECT count(*) FROM post_versions pv JOIN planned_posts pp ON pp.id=pv.post_id WHERE pp.workspace_id=auth.uid())<>1 OR EXISTS(SELECT 1 FROM deliverables WHERE workspace_id=auth.uid()) THEN RAISE EXCEPTION 'Post ownership or duplicate output'; END IF;
  IF EXISTS(SELECT 1 FROM planned_posts WHERE workspace_id=auth.uid() AND (scheduled_for IS NOT NULL OR approval_state<>'unapproved' OR execution_state<>'idle')) THEN RAISE EXCEPTION 'Schedule or approval invented'; END IF;
 a:=answer_task_input(i.id,i.version,'{"status":"unknown"}');
 IF a.id<>i.task_id OR a.status<>'queued' OR NOT EXISTS(SELECT 1 FROM task_inputs WHERE id=i.id AND answers->>'status'='unknown') THEN RAISE EXCEPTION 'Clarification did not resume original task'; END IF;
 b:=stop_task(b.id,b.run_id,'cancelled','Owner cancelled');
 BEGIN
  PERFORM save_task_result(b.id,b.run_id,output);
  RAISE EXCEPTION 'Cancelled run committed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'RUN_NOT_ACTIVE' THEN RAISE; END IF; END;
 a:=admit_task(a.id,runner);
 a:=checkpoint_task(a.id,a.run_id,'{"phase":"persist","output":{"reply":"Checkpointed text","posts":[]}}');
 a:=stop_task(a.id,a.run_id,'interrupted','Result persistence unavailable');
 a:=resume_task(a.id,a.version);a:=admit_task(a.id,runner);
 IF a.checkpoint->>'phase'<>'persist' THEN RAISE EXCEPTION 'Resume discarded output'; END IF;
 BEGIN
  PERFORM save_task_result(a.id,a.run_id,'{"reply":"Must roll back","document":{"title":"Not committed","type":"general","content":"Unsaved report"},"posts":[{"caption":""}]}');
  RAISE EXCEPTION 'Invalid result accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVALID_POST' THEN RAISE; END IF; END;
  IF EXISTS(SELECT 1 FROM deliverables WHERE workspace_id=auth.uid()) OR EXISTS(SELECT 1 FROM task_results WHERE task_id=a.id) OR NOT EXISTS(SELECT 1 FROM tasks WHERE id=a.id AND status='running') THEN RAISE EXCEPTION 'Result transaction partially committed'; END IF;
 PERFORM record_task_step(a.id,a.run_id,instance,'orchestrator','Interrupted real step','running');
 IF recover_tasks(NULL)<>0 THEN RAISE EXCEPTION 'Fresh foreign lease was interrupted'; END IF;
 IF recover_tasks(runner)<>1 THEN RAISE EXCEPTION 'Lost tab promise not recovered'; END IF;
 IF NOT EXISTS(SELECT 1 FROM task_steps WHERE id=instance AND status='failed')
  OR NOT EXISTS(SELECT 1 FROM agent_events WHERE instance_id=instance AND event_type='agent_error')
  OR NOT EXISTS(SELECT 1 FROM messages WHERE payload->>'taskId'=a.id::text AND payload->>'status'='interrupted')
  OR NOT EXISTS(SELECT 1 FROM tasks WHERE id=a.id AND result_summary LIKE 'Browser execution interrupted%') THEN RAISE EXCEPTION 'Recovered task still presents running activity'; END IF;
 IF recover_tasks(runner)<>0 OR (SELECT count(*) FROM agent_events WHERE instance_id=instance AND event_type='agent_error')<>1 THEN RAISE EXCEPTION 'Repeated recovery duplicated events'; END IF;
 SELECT * INTO a FROM tasks WHERE id=a.id;
 a:=resume_task(a.id,a.version);a:=admit_task(a.id,runner);
 PERFORM set_config('test.meter_task_id',a.id::text,true);
 PERFORM set_config('test.meter_run_id',a.run_id::text,true);
 RAISE NOTICE 'PASS: idempotent enqueue, two-slot admission, input wait/release/resume, atomic result persistence, standalone unscheduled Posts, cancellation and checkpoint recovery';
END $$;
-- C11 guards: publishing is kept out of the generic runner, a capped task can no
-- longer be resumed forever, and a saved result returns the real message ids.
-- These run as service_role so a queued publishing row can be inserted directly.
SET LOCAL ROLE service_role;
INSERT INTO tasks(workspace_id,conversation_id,type,status,user_request)
 VALUES('66666666-6666-4666-8666-666666666666',
  (SELECT id FROM conversations WHERE workspace_id='66666666-6666-4666-8666-666666666666' ORDER BY created_at LIMIT 1),
  'publishing','queued','Publish this now');
DO $$
DECLARE c uuid; runner uuid:=gen_random_uuid(); pub tasks; probe tasks; capped tasks; saved jsonb; i integer;
BEGIN
 SELECT id INTO c FROM conversations WHERE workspace_id='66666666-6666-4666-8666-666666666666' ORDER BY created_at LIMIT 1;
 SELECT * INTO pub FROM tasks WHERE workspace_id='66666666-6666-4666-8666-666666666666' AND type='publishing' AND status='queued';
 IF admit_task(pub.id,runner) IS NOT NULL THEN RAISE EXCEPTION 'Publishing admitted to the generic runner'; END IF;

 probe:=enqueue_task(c,'Attempts probe',jsonb_build_object('kind','direct','conversationId',c),gen_random_uuid());
 probe:=admit_task(probe.id,runner);
 IF probe.attempts<>1 THEN RAISE EXCEPTION 'Run start did not count an attempt'; END IF;
 probe:=stop_task(probe.id,probe.run_id,'failed','Transient failure');
 probe:=resume_task(probe.id,probe.version);
 IF probe.attempts<>2 OR probe.status<>'queued' THEN RAISE EXCEPTION 'Resume did not count an attempt'; END IF;

 capped:=enqueue_task(c,'Capped probe',jsonb_build_object('kind','direct','conversationId',c),gen_random_uuid());
 capped:=admit_task(capped.id,runner);
 capped:=stop_task(capped.id,capped.run_id,'failed','Permanent failure');
 FOR i IN 1..2 LOOP
  capped:=resume_task(capped.id,capped.version);
  capped:=admit_task(capped.id,runner);
  capped:=stop_task(capped.id,capped.run_id,'failed','Permanent failure');
 END LOOP;
 IF capped.attempts<>5 THEN RAISE EXCEPTION 'Attempts did not reach the cap'; END IF;
 BEGIN
  PERFORM resume_task(capped.id,capped.version);
  RAISE EXCEPTION 'Capped task was resumed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'MAX_ATTEMPTS' THEN RAISE; END IF; END;

 probe:=enqueue_task(c,'Message id probe',jsonb_build_object('kind','direct','conversationId',c),gen_random_uuid());
 probe:=admit_task(probe.id,runner);
 saved:=save_task_result(probe.id,probe.run_id,'{"reply":"Done.","document":{"title":"Report","type":"general","content":"Body text"},"posts":[{"caption":"A post","hashtags":"#x","platform":"facebook"}]}');
 IF jsonb_typeof(saved->'messageIds')<>'array' OR jsonb_array_length(saved->'messageIds')<>3 THEN RAISE EXCEPTION 'Result did not return three message ids'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(saved->'messageIds') e WHERE NOT EXISTS(SELECT 1 FROM messages m WHERE m.id=(e#>>'{}')::uuid AND m.conversation_id=c)) THEN RAISE EXCEPTION 'Returned message id missing from the conversation'; END IF;
 RAISE NOTICE 'PASS: publishing excluded from admission, attempts counted on run and resume, MAX_ATTEMPTS cap enforced, save_task_result returns message ids';
END $$;
SET LOCAL ROLE service_role;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',true);
DO $$ DECLARE t uuid:=current_setting('test.meter_task_id')::uuid; r uuid:=current_setting('test.meter_run_id')::uuid; c uuid:=gen_random_uuid(); BEGIN
 PERFORM reserve_task_call(t,r,c,'chat',15000);
 BEGIN
  PERFORM reserve_task_call(t,r,gen_random_uuid(),'chat',2000);
  RAISE EXCEPTION 'Call exceeded allowance';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'BUDGET_EXHAUSTED' THEN RAISE; END IF; END;
 PERFORM finish_task_call(t,c,true,'{"inputTokens":120,"outputTokens":40}');
 PERFORM reserve_task_call(t,r,gen_random_uuid(),'chat',1000);
 IF (SELECT (consumption->>'tokensAccounted')::integer FROM tasks WHERE id=t)<>1160 THEN RAISE EXCEPTION 'Actual usage not accounted'; END IF;
 RAISE NOTICE 'PASS: service-only call reservation, budget rejection and actual provider usage accounting';
END $$;

-- Exact Task origins are checked. A forged cross-workspace or mismatched
-- navigation hint never creates a Task or a chat message.
RESET ROLE;
INSERT INTO auth.users(id) VALUES('77777777-7777-4777-8777-777777777777') ON CONFLICT DO NOTHING;
INSERT INTO workspaces(id) VALUES('77777777-7777-4777-8777-777777777777') ON CONFLICT DO NOTHING;
INSERT INTO conversations(id,workspace_id,title) VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','66666666-6666-4666-8666-666666666666','Origin test'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','77777777-7777-4777-8777-777777777777','Foreign conversation');
INSERT INTO discovery_drafts(id,workspace_id) VALUES
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','66666666-6666-4666-8666-666666666666'),
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','77777777-7777-4777-8777-777777777777');
INSERT INTO discovery_questions(id,workspace_id,draft_id,question_key,position,schema) VALUES
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','66666666-6666-4666-8666-666666666666','cccccccc-cccc-4ccc-8ccc-cccccccccccc','goal',1,'{}'),
 ('ffffffff-ffff-4fff-8fff-ffffffffffff','77777777-7777-4777-8777-777777777777','dddddddd-dddd-4ddd-8ddd-dddddddddddd','goal',1,'{}');
INSERT INTO question_research_links(id,workspace_id,draft_id,question_id,conversation_id) VALUES
 ('11111111-2222-4333-8444-555555555555','66666666-6666-4666-8666-666666666666','cccccccc-cccc-4ccc-8ccc-cccccccccccc','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
INSERT INTO roadmaps(id,workspace_id,goal) VALUES
 ('22222222-3333-4444-8555-666666666666','66666666-6666-4666-8666-666666666666','Launch'),
 ('22222222-3333-4444-8555-777777777777','77777777-7777-4777-8777-777777777777','Foreign launch');
INSERT INTO roadmap_versions(id,workspace_id,roadmap_id,version,summary) VALUES
 ('33333333-4444-4555-8666-777777777777','66666666-6666-4666-8666-666666666666','22222222-3333-4444-8555-666666666666',1,'{}'),
 ('33333333-4444-4555-8666-888888888888','77777777-7777-4777-8777-777777777777','22222222-3333-4444-8555-777777777777',1,'{}');
INSERT INTO roadmap_steps(id,workspace_id,roadmap_id,plan_version_id,step_key,position,title,objective,rationale,responsibility,execution_mode,expected_output,effort) VALUES
 ('44444444-5555-4666-8777-888888888888','66666666-6666-4666-8666-666666666666','22222222-3333-4444-8555-666666666666','33333333-4444-4555-8666-777777777777','write',1,'Write','Introduce the offer','Owner decision','owner','director','Draft copy','30 minutes'),
 ('44444444-5555-4666-8777-999999999999','77777777-7777-4777-8777-777777777777','22222222-3333-4444-8555-777777777777','33333333-4444-4555-8666-888888888888','write',1,'Write','Foreign step','Foreign owner','owner','director','Draft copy','30 minutes');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','66666666-6666-4666-8666-666666666666',true);
SELECT set_config('request.jwt.claim.role','service_role',true);
DO $$
DECLARE c uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; before integer;
BEGIN
 SELECT count(*) INTO before FROM tasks;
 BEGIN PERFORM enqueue_task(c,'Forged direct',jsonb_build_object('kind','direct','conversationId','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),'10000000-0000-4000-8000-000000000001'); RAISE EXCEPTION 'Forged direct origin accepted';
 EXCEPTION WHEN others THEN IF SQLERRM NOT IN ('INVALID_ORIGIN','INVALID_TASK_ORIGIN') THEN RAISE; END IF; END;
 BEGIN PERFORM enqueue_task(c,'Mismatched direct',jsonb_build_object('kind','direct','conversationId','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),'10000000-0000-4000-8000-000000000002'); RAISE EXCEPTION 'Mismatched direct origin accepted';
 EXCEPTION WHEN others THEN IF SQLERRM NOT IN ('INVALID_ORIGIN','INVALID_TASK_ORIGIN') THEN RAISE; END IF; END;
 BEGIN PERFORM enqueue_task(c,'Forged wizard',jsonb_build_object('kind','wizard_question','conversationId',c,'draftId','dddddddd-dddd-4ddd-8ddd-dddddddddddd','questionId','ffffffff-ffff-4fff-8fff-ffffffffffff','researchLinkId','11111111-2222-4333-8444-555555555555'),'10000000-0000-4000-8000-000000000003'); RAISE EXCEPTION 'Forged wizard origin accepted';
 EXCEPTION WHEN others THEN IF SQLERRM NOT IN ('INVALID_ORIGIN','INVALID_TASK_ORIGIN') THEN RAISE; END IF; END;
 BEGIN PERFORM enqueue_task(c,'Forged roadmap',jsonb_build_object('kind','roadmap_step','conversationId',c,'planId','22222222-3333-4444-8555-777777777777','planVersionId','33333333-4444-4555-8666-888888888888','stepId','44444444-5555-4666-8777-999999999999'),'10000000-0000-4000-8000-000000000004'); RAISE EXCEPTION 'Forged roadmap origin accepted';
 EXCEPTION WHEN others THEN IF SQLERRM NOT IN ('INVALID_ORIGIN','INVALID_TASK_ORIGIN') THEN RAISE; END IF; END;
 BEGIN PERFORM enqueue_task(c,'Unknown origin',jsonb_build_object('kind','elsewhere','conversationId',c),'10000000-0000-4000-8000-000000000005'); RAISE EXCEPTION 'Unknown origin accepted';
 EXCEPTION WHEN others THEN IF SQLERRM NOT IN ('INVALID_ORIGIN','INVALID_TASK_ORIGIN') THEN RAISE; END IF; END;
 IF (SELECT count(*) FROM tasks)<>before THEN RAISE EXCEPTION 'Rejected origin created a Task'; END IF;
 PERFORM enqueue_task(c,'Direct request',jsonb_build_object('kind','direct','conversationId',c),'10000000-0000-4000-8000-000000000006');
 PERFORM enqueue_task(c,'Wizard request',jsonb_build_object('kind','wizard_question','conversationId',c,'draftId','cccccccc-cccc-4ccc-8ccc-cccccccccccc','questionId','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','researchLinkId','11111111-2222-4333-8444-555555555555'),'10000000-0000-4000-8000-000000000007');
 PERFORM enqueue_task(c,'Roadmap request',jsonb_build_object('kind','roadmap_step','conversationId',c,'planId','22222222-3333-4444-8555-666666666666','planVersionId','33333333-4444-4555-8666-777777777777','stepId','44444444-5555-4666-8777-888888888888'),'10000000-0000-4000-8000-000000000008');
 RAISE NOTICE 'PASS: exact direct, wizard and roadmap origins accepted; cross-workspace, mismatched and unknown origins rejected without a Task';
END $$;
ROLLBACK;
