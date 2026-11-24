-- Employee cleanup guard acceptance: the retired task-enqueue, resume, answer,
-- result-save and Roadmap task-start RPCs must be denied to the authenticated
-- role. Service-role execution is exercised by task-execution-db-check.sql.
\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users(id) VALUES('88888888-8888-4888-8888-888888888888');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','88888888-8888-4888-8888-888888888888',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);

DO $$
DECLARE
  c uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
BEGIN
  BEGIN
    PERFORM enqueue_task(c, 'blocked', jsonb_build_object('kind','direct','conversationId',c), gen_random_uuid());
    RAISE EXCEPTION 'enqueue_task was executable by authenticated';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM resume_task('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01', 1);
    RAISE EXCEPTION 'resume_task was executable by authenticated';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM answer_task_input('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02', 1, '{"status":"answered"}'::jsonb);
    RAISE EXCEPTION 'answer_task_input was executable by authenticated';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM save_task_result('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa03', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa04', '{"reply":"forbidden"}'::jsonb);
    RAISE EXCEPTION 'save_task_result was executable by authenticated';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM start_question_research('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa05', 'blocked', 'blocked', gen_random_uuid());
    RAISE EXCEPTION 'start_question_research was executable by authenticated';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM start_roadmap_step_task('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa06', 'blocked', 'blocked', gen_random_uuid());
    RAISE EXCEPTION 'start_roadmap_step_task was executable by authenticated';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  RAISE NOTICE 'PASS: direct task and roadmap RPC bypass is denied to authenticated';
END $$;

ROLLBACK;