-- Employee intelligence cleanup: status remediation for the retired execution path.
-- Run only against an isolated/local database, as the service role/postgres.
-- Run inside a transaction (psql --single-transaction) or via the local check.
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

    -- 1) Fail non-terminal Employee tasks that can no longer execute. These may be
    -- queued, running, or awaiting_input, so stop_task (which requires an active
    -- running lease) cannot be used uniformly. A direct, scoped UPDATE marks them
    -- failed with a clear reason, records a system message, and leaves history
    -- intact. No records are deleted.
    FOR r IN
      SELECT id, conversation_id
      FROM public.tasks
      WHERE workspace_id = w.workspace_id
        AND status IN ('queued', 'running', 'awaiting_input')
    LOOP
      UPDATE public.tasks
        SET status = 'failed',
            result_summary = 'Employee intelligence is being rebuilt. This capability is temporarily unavailable.',
            version = version + 1,
            updated_at = now()
        WHERE id = r.id AND status IN ('queued', 'running', 'awaiting_input');
      UPDATE public.task_steps
        SET status = 'failed', completed_at = now(),
            output = jsonb_build_object('error', 'Employee intelligence is being rebuilt. This capability is temporarily unavailable.')
        WHERE task_id = r.id AND status = 'running';
      INSERT INTO public.messages(workspace_id, conversation_id, role, type, content, payload)
        VALUES (w.workspace_id, r.conversation_id, 'system', 'error',
          'Employee intelligence is being rebuilt. This capability is temporarily unavailable.',
          jsonb_build_object('taskId', r.id, 'status', 'failed'))
        ON CONFLICT DO NOTHING;
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

