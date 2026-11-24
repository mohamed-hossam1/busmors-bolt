-- Employee cleanup remediation acceptance: queued/running/awaiting_input tasks are
-- failed, researching links are failed (restoring the question), and only steps
-- linked to a failed task are restored. No records are deleted.
\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users(id) VALUES('99999999-9999-4999-8999-999999999999');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','99999999-9999-4999-8999-999999999999',true);
SELECT set_config('request.jwt.claim.role','service_role',true);

DO $$
DECLARE
  w uuid := '99999999-9999-4999-8999-999999999999';
  c uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  q uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  l uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  rm uuid := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  rv uuid := 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  st uuid := '99999999-9999-4999-8999-99999999aaaa';
  queued_id uuid;
  running_id uuid;
  waiting_id uuid;
BEGIN
  PERFORM bootstrap_workspace();
  INSERT INTO conversations(id, workspace_id, title) VALUES (c, w, 'Remediation');
  INSERT INTO tasks(workspace_id, conversation_id, type, status, user_request, origin)
    VALUES (w, c, 'simple_answer', 'queued', 'queued request', jsonb_build_object('kind','direct','conversationId',c))
    RETURNING id INTO queued_id;
  INSERT INTO tasks(workspace_id, conversation_id, type, status, user_request, origin, run_id)
    VALUES (w, c, 'simple_answer', 'running', 'running request', jsonb_build_object('kind','direct','conversationId',c), gen_random_uuid())
    RETURNING id INTO running_id;
  INSERT INTO tasks(workspace_id, conversation_id, type, status, user_request, origin)
    VALUES (w, c, 'simple_answer', 'awaiting_input', 'waiting request', jsonb_build_object('kind','direct','conversationId',c))
    RETURNING id INTO waiting_id;

  INSERT INTO discovery_drafts(id, workspace_id) VALUES ('dddddddd-dddd-4ddd-8ddd-dd000000000d', w);
  INSERT INTO discovery_questions(id, workspace_id, draft_id, question_key, position, schema, status, provenance)
    VALUES (q, w, 'dddddddd-dddd-4ddd-8ddd-dd000000000d', 'goal', 1, '{}', 'researching', '{"previousStatus":"unanswered","researchLinkId":"dddddddd-dddd-4ddd-8ddd-dddddddddddd"}');
  INSERT INTO question_research_links(id, workspace_id, draft_id, question_id, conversation_id, status, version)
    VALUES (l, w, 'dddddddd-dddd-4ddd-8ddd-dd000000000d', q, c, 'researching', 1);
  UPDATE discovery_questions
    SET provenance = jsonb_build_object('previousStatus','unanswered','researchLinkId',l::text)
    WHERE id = q;

  INSERT INTO roadmaps(id, workspace_id, goal) VALUES (rm, w, 'Remediation roadmap');
  INSERT INTO roadmap_versions(id, workspace_id, roadmap_id, version, summary)
    VALUES (rv, w, rm, 1, '{}');
  INSERT INTO roadmap_steps(id, workspace_id, roadmap_id, plan_version_id, step_key, position, title, objective, rationale, responsibility, execution_mode, expected_output, effort, status, task_id)
    VALUES (st, w, rm, rv, 'write', 1, 'Write', 'Objective', 'Rationale', 'owner', 'director', 'Draft', '30 minutes', 'running', running_id);
END $$;

\i scripts/employee-cleanup-remediation.sql

DO $$
DECLARE
  queued_status text;
  running_status text;
  waiting_status text;
  link_status text;
  question_status text;
  step_status text;
  remaining integer;
BEGIN
  SELECT status INTO queued_status FROM tasks WHERE workspace_id='99999999-9999-4999-8999-999999999999' AND user_request='queued request';
  SELECT status INTO running_status FROM tasks WHERE workspace_id='99999999-9999-4999-8999-999999999999' AND user_request='running request';
  SELECT status INTO waiting_status FROM tasks WHERE workspace_id='99999999-9999-4999-8999-999999999999' AND user_request='waiting request';
  SELECT status INTO link_status FROM question_research_links WHERE workspace_id='99999999-9999-4999-8999-999999999999';
  SELECT status INTO question_status FROM discovery_questions WHERE workspace_id='99999999-9999-4999-8999-999999999999';
  SELECT status INTO step_status FROM roadmap_steps WHERE workspace_id='99999999-9999-4999-8999-999999999999';

  IF queued_status <> 'failed' OR running_status <> 'failed' OR waiting_status <> 'failed' THEN
    RAISE EXCEPTION 'Remediation did not fail non-terminal tasks: % / % / %', queued_status, running_status, waiting_status;
  END IF;
  IF link_status <> 'failed' THEN RAISE EXCEPTION 'Remediation did not fail the research link: %', link_status; END IF;
  IF question_status <> 'unanswered' THEN RAISE EXCEPTION 'Remediation did not restore the question: %', question_status; END IF;
  IF step_status <> 'ready' THEN RAISE EXCEPTION 'Remediation did not restore the linked roadmap step: %', step_status; END IF;

  SELECT count(*) INTO remaining FROM tasks
    WHERE workspace_id='99999999-9999-4999-8999-999999999999'
      AND status IN ('queued','running','awaiting_input');
  IF remaining <> 0 THEN RAISE EXCEPTION 'Remediation left % non-terminal tasks', remaining; END IF;

  RAISE NOTICE 'PASS: remediation failed queued/running/waiting tasks, failed the research link, restored the question and the linked roadmap step';
END $$;

ROLLBACK;