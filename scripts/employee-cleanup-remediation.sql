-- Employee intelligence cleanup: status remediation for the retired execution path.
-- Run only against an isolated/local database, as the service role/postgres.
-- No records are deleted. Historical completed/failed/partial/cancelled tasks are
-- left untouched.
--
-- The remediation RPCs are SECURITY DEFINER and scope by auth.uid(), so the script
-- switches the request claim per affected workspace. It must be run by the service
-- role/postgres, never by an end user.

BEGIN;

DO $$
DECLARE
  w record;
  r record;
BEGIN
  FOR w IN
    SELECT DISTINCT workspace_id
    FROM (
      SELECT workspace_id FROM public.tasks
        WHERE status IN ('queued', 'running', 'awaiting_input')
      UNION
      SELECT workspace_id FROM public.question_research_links
        WHERE status = 'researching'
      UNION
      SELECT s.workspace_id
        FROM public.roadmap_steps s
        JOIN public.tasks t ON t.id = s.task_id
        WHERE s.status = 'running' AND t.status IN ('failed', 'cancelled')
    ) affected
  LOOP
    PERFORM set_config('request.jwt.claim.sub', w.workspace_id::text, true);
    PERFORM set_config('request.jwt.claim.role', 'service_role', true);

    -- 1) Fail non-terminal Employee tasks that can no longer execute.
    FOR r IN
      SELECT id, run_id
      FROM public.tasks
      WHERE workspace_id = w.workspace_id
        AND status IN ('queued', 'running', 'awaiting_input')
    LOOP
      PERFORM public.stop_task(
        r.id,
        r.run_id,
        'failed',
        'Employee intelligence is being rebuilt. This capability is temporarily unavailable.'
      );
    END LOOP;

    -- 2) Fail Research links still waiting on the retired research pipeline. This
    -- restores each Discovery question to its previous status.
    FOR r IN
      SELECT id, version
      FROM public.question_research_links
      WHERE workspace_id = w.workspace_id AND status = 'researching'
    LOOP
      PERFORM public.decide_question_research(
        r.id,
        r.version,
        'fail',
        NULL,
        NULL,
        'Employee intelligence is being rebuilt. Research is temporarily unavailable.'
      );
    END LOOP;

    -- 3) Restore Roadmap steps that are running only because a now-failed Employee
    -- task was supposed to execute them. Unrelated steps are not touched.
    FOR r IN
      SELECT s.id
      FROM public.roadmap_steps s
      JOIN public.tasks t ON t.id = s.task_id
      WHERE s.workspace_id = w.workspace_id
        AND s.status = 'running'
        AND t.status IN ('failed', 'cancelled')
    LOOP
      PERFORM public.set_roadmap_step_status(
        r.id,
        'ready',
        '{"note":"Employee intelligence is being rebuilt. The delegated task could not execute; the step is ready for the owner."}'::jsonb
      );
    END LOOP;
  END LOOP;
END $$;

COMMIT;