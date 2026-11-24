-- Employee intelligence cleanup: direct RPC bypass guard.
--
-- Additive and reversible. Historical migrations are unchanged. This migration
-- removes EXECUTE from PUBLIC and from the `authenticated`/`anon` roles for the
-- task-enqueue, resume, answer, result-save, complete, and Roadmap task-start
-- functions. The service role (used by the background dispatcher, the fail-fast
-- task executor, and the reviewed status-remediation script) keeps EXECUTE.
--
-- The application API also rejects submit/resume/answer with HTTP 409 and never
-- enqueues from the Orchestrator. This database guard is defence-in-depth for
-- crafted direct RPC calls.
--
-- The future agent runtime can re-grant EXECUTE to `authenticated` in a later
-- migration when a real execution path exists.

-- The service role (background dispatcher, fail-fast executor, status-remediation
-- script, and the local DB acceptance harness) must run the complete task
-- lifecycle, not only the revoked functions. Grant the remaining lifecycle and
-- workspace-bootstrap helpers to service_role so the privileged backend can
-- admit, checkpoint, recover, heartbeat and stop tasks without the client grants.
DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'bootstrap_workspace',
        'admit_task',
        'checkpoint_task',
        'record_task_step',
        'recover_tasks',
        'heartbeat_task',
        'claim_task',
        'save_task_step',
        'await_task_input',
        'stop_task',
        'decide_question_research',
        'set_roadmap_step_status'
      )
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.signature);
  END LOOP;
END $$;

DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'enqueue_task',
        'resume_task',
        'answer_task_input',
        'save_task_result',
        'complete_task',
        'start_question_research',
        'start_roadmap_step_task'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn.signature);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', fn.signature);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.signature);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';