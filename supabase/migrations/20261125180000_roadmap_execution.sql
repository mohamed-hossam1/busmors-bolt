-- Phase 4: Roadmap Execution Dashboard & step actions.
--
-- Additive only. Adds execution-state columns to roadmap_steps, widens the
-- step_actions.action CHECK constraint to cover the new lifecycle actions, fixes
-- load_active_roadmap() to scope steps by plan version (versioning!) and to
-- return recent step_actions plus linked deliverables / planned_posts summaries,
-- and adds the SECURITY DEFINER perform_roadmap_step_action() RPC.
--
-- Isolation: every RPC derives the workspace from auth.uid() and enforces
-- workspace_id = auth.uid() with FOR UPDATE row locks and optimistic-concurrency
-- checks. No existing table is dropped and no user data is destructively altered.

-- 1. Additive execution columns on roadmap_steps ------------------------------
ALTER TABLE roadmap_steps
  ADD COLUMN IF NOT EXISTS execution_state text NOT NULL DEFAULT 'not_started'
    CHECK (execution_state IN ('not_started','in_progress','waiting_for_owner','waiting_for_director','blocked','completed','skipped')),
  ADD COLUMN IF NOT EXISTS linked_deliverable_id uuid,
  ADD COLUMN IF NOT EXISTS linked_post_id uuid,
  ADD COLUMN IF NOT EXISTS result_note text,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- 2. Widen step_actions.action CHECK to cover the full lifecycle --------------
ALTER TABLE step_actions DROP CONSTRAINT IF EXISTS step_actions_action_check;
ALTER TABLE step_actions ADD CONSTRAINT step_actions_action_check
  CHECK (action IN ('run','attest','skip','revisit','cancel','start','complete','block','link_output'));

-- 3. Fix load_active_roadmap(): scope steps by plan version + return links ----
CREATE OR REPLACE FUNCTION load_active_roadmap() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE
  w uuid := auth.uid();
  r roadmaps;
  v roadmap_versions;
  stale jsonb;
BEGIN
  IF w IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO r FROM roadmaps
   WHERE workspace_id = w AND status = 'active'
   ORDER BY updated_at DESC NULLS LAST, created_at DESC
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'roadmap', NULL,
      'activeVersion', NULL,
      'steps', '[]'::jsonb,
      'staleDependencies', '[]'::jsonb,
      'stepActions', '[]'::jsonb,
      'linkedDeliverables', '[]'::jsonb,
      'linkedPosts', '[]'::jsonb
    );
  END IF;

  SELECT * INTO v FROM roadmap_versions
   WHERE roadmap_id = r.id AND status = 'active'
   ORDER BY version DESC LIMIT 1;
  IF NOT FOUND AND r.active_version_id IS NOT NULL THEN
    SELECT * INTO v FROM roadmap_versions WHERE id = r.active_version_id;
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'dependencyId', cd.id,
    'nodeId', cd.node_id,
    'nodeVersion', cd.node_version,
    'currentVersion', b.version,
    'status', b.status,
    'isCurrent', b.is_current,
    'reason', CASE
      WHEN b.version > cd.node_version THEN 'version_changed'
      WHEN b.status <> 'approved' THEN 'not_approved'
      WHEN b.is_current = false THEN 'superseded'
      ELSE 'changed'
    END
  ) ORDER BY cd.created_at), '[]'::jsonb) INTO stale
  FROM context_dependencies cd
  JOIN brain_nodes b
    ON b.workspace_id = cd.workspace_id AND b.id = cd.node_id
  WHERE cd.consumer_type = 'roadmap'
    AND cd.consumer_id = r.id
    AND cd.resolved_at IS NULL
    AND (b.version > cd.node_version OR b.status <> 'approved' OR b.is_current = false);

  RETURN jsonb_build_object(
    'roadmap', to_jsonb(r),
    'activeVersion', CASE WHEN v.id IS NULL THEN NULL ELSE to_jsonb(v) END,
    -- Versioning fix: only the active plan version's steps belong to this view.
    'steps', (
      SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.position), '[]'::jsonb)
        FROM roadmap_steps s
       WHERE v.id IS NOT NULL AND s.plan_version_id = v.id
    ),
    'staleDependencies', stale,
    -- Recent step actions for this plan version (workspace scoped by RLS + filter).
    'stepActions', (
      SELECT coalesce(jsonb_agg(to_jsonb(sa) ORDER BY sa.created_at DESC), '[]'::jsonb)
        FROM (
          SELECT sa.*
            FROM step_actions sa
            JOIN roadmap_steps s ON s.id = sa.step_id
           WHERE sa.workspace_id = w AND s.plan_version_id = v.id
           ORDER BY sa.created_at DESC
           LIMIT 100
        ) sa
    ),
    -- Linked deliverables: explicitly linked OR produced by the Director for a
    -- step in this plan (origin.kind = roadmap_step).
    'linkedDeliverables', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', d.id, 'title', d.title, 'version', d.version, 'type', d.type
      ) ORDER BY d.created_at DESC), '[]'::jsonb)
        FROM deliverables d
       WHERE d.workspace_id = w
         AND (
           d.id IN (
             SELECT linked_deliverable_id FROM roadmap_steps
              WHERE plan_version_id = v.id AND linked_deliverable_id IS NOT NULL
           )
           OR d.origin ->> 'stepId' IN (
             SELECT id::text FROM roadmap_steps WHERE plan_version_id = v.id
           )
         )
    ),
    -- Linked calendar drafts.
    'linkedPosts', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'platform', p.platform, 'status', p.status,
        'approvalState', p.approval_state, 'version', p.version
      ) ORDER BY p.created_at DESC), '[]'::jsonb)
        FROM planned_posts p
       WHERE p.workspace_id = w
         AND (
           p.id IN (
             SELECT linked_post_id FROM roadmap_steps
              WHERE plan_version_id = v.id AND linked_post_id IS NOT NULL
           )
           OR p.origin ->> 'stepId' IN (
             SELECT id::text FROM roadmap_steps WHERE plan_version_id = v.id
           )
         )
    )
  );
END $$;

-- 4. perform_roadmap_step_action(): the single lifecycle mutation RPC ----------
CREATE OR REPLACE FUNCTION perform_roadmap_step_action(
  p_step_id uuid,
  p_action text,
  p_idempotency_key uuid,
  p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  w uuid := auth.uid();
  s roadmap_steps;
  r roadmaps;
  existing step_actions;
  action_record step_actions;
  conv_id uuid;
  link_del uuid;
  link_post uuid;
  result_note text;
  expected_status text;
  expected_version integer;
  origin jsonb;
BEGIN
  IF w IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000';
  END IF;
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  -- Idempotency: a repeated key returns the current step + original action.
  SELECT * INTO existing FROM step_actions
   WHERE workspace_id = w AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    SELECT * INTO s FROM roadmap_steps WHERE id = existing.step_id AND workspace_id = w;
    RETURN jsonb_build_object('step', to_jsonb(s), 'actionRecord', to_jsonb(existing));
  END IF;

  -- Lock the step row (workspace scoped) for the whole mutation.
  SELECT * INTO s FROM roadmap_steps
   WHERE id = p_step_id AND workspace_id = w FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'STEP_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Optimistic concurrency (either or both may be supplied).
  expected_status := NULLIF(p_payload ->> 'expectedStepStatus', '');
  expected_version := NULLIF(p_payload ->> 'expectedRoadmapVersion', '')::integer;
  IF expected_status IS NOT NULL AND s.status <> expected_status THEN
    RAISE EXCEPTION 'STALE_VERSION' USING ERRCODE = 'P0001';
  END IF;
  IF expected_version IS NOT NULL THEN
    SELECT * INTO r FROM roadmaps WHERE id = s.roadmap_id AND workspace_id = w;
    IF r.version <> expected_version THEN
      RAISE EXCEPTION 'STALE_VERSION' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  result_note := NULLIF(p_payload ->> 'resultNote', '');
  origin := jsonb_build_object(
    'kind', 'roadmap_step',
    'roadmapId', s.roadmap_id,
    'planVersionId', s.plan_version_id,
    'stepId', s.id
  );

  IF p_action = 'run' THEN
    INSERT INTO step_actions(workspace_id, step_id, action, idempotency_key, payload)
    VALUES (w, s.id, 'run', p_idempotency_key,
      jsonb_set(coalesce(p_payload, '{}'::jsonb), '{origin}', coalesce(p_payload -> 'origin', origin), true))
    RETURNING * INTO action_record;

    conv_id := NULLIF(p_payload ->> 'conversationId', '')::uuid;
    IF conv_id IS NULL AND s.conversation_id IS NOT NULL THEN
      conv_id := s.conversation_id;
    END IF;
    IF conv_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM employee_conversations c WHERE c.id = conv_id AND c.workspace_id = w
    ) THEN
      RAISE EXCEPTION 'CONVERSATION_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;

    UPDATE roadmap_steps
       SET conversation_id = coalesce(conv_id, conversation_id),
           status = 'running',
           execution_state = 'waiting_for_director'
     WHERE id = s.id
    RETURNING * INTO s;

  ELSIF p_action = 'start' THEN
    INSERT INTO step_actions(workspace_id, step_id, action, idempotency_key, payload)
    VALUES (w, s.id, 'start', p_idempotency_key, p_payload)
    RETURNING * INTO action_record;
    UPDATE roadmap_steps
       SET status = 'running', execution_state = 'in_progress'
     WHERE id = s.id
    RETURNING * INTO s;

  ELSIF p_action IN ('complete', 'attest') THEN
    INSERT INTO step_actions(workspace_id, step_id, action, idempotency_key, payload)
    VALUES (w, s.id, CASE WHEN p_action = 'attest' THEN 'attest' ELSE 'complete' END, p_idempotency_key, p_payload)
    RETURNING * INTO action_record;
    UPDATE roadmap_steps
       SET status = 'completed',
           execution_state = 'completed',
           result_note = result_note,
           attestation = p_payload,
           completed_at = now()
     WHERE id = s.id
    RETURNING * INTO s;

  ELSIF p_action = 'block' THEN
    INSERT INTO step_actions(workspace_id, step_id, action, idempotency_key, payload)
    VALUES (w, s.id, 'block', p_idempotency_key, p_payload)
    RETURNING * INTO action_record;
    UPDATE roadmap_steps
       SET status = 'blocked',
           execution_state = 'blocked',
           result_note = NULLIF(p_payload ->> 'reason', '')
     WHERE id = s.id
    RETURNING * INTO s;

  ELSIF p_action = 'skip' THEN
    INSERT INTO step_actions(workspace_id, step_id, action, idempotency_key, payload)
    VALUES (w, s.id, 'skip', p_idempotency_key, p_payload)
    RETURNING * INTO action_record;
    UPDATE roadmap_steps
       SET status = 'skipped', execution_state = 'skipped'
     WHERE id = s.id
    RETURNING * INTO s;

  ELSIF p_action IN ('waiting_owner', 'link_output') THEN
    link_del := NULLIF(p_payload ->> 'linkedDeliverableId', '')::uuid;
    link_post := NULLIF(p_payload ->> 'linkedPostId', '')::uuid;
    IF link_del IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM deliverables d WHERE d.id = link_del AND d.workspace_id = w
    ) THEN
      RAISE EXCEPTION 'DELIVERABLE_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
    IF link_post IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM planned_posts p WHERE p.id = link_post AND p.workspace_id = w
    ) THEN
      RAISE EXCEPTION 'POST_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
    INSERT INTO step_actions(workspace_id, step_id, action, idempotency_key, payload)
    VALUES (w, s.id, 'link_output', p_idempotency_key, p_payload)
    RETURNING * INTO action_record;
    -- IMPORTANT: linking output moves the step to waiting_for_owner, NEVER
    -- completed. Completion requires an explicit owner 'complete'/'attest'.
    UPDATE roadmap_steps
       SET execution_state = 'waiting_for_owner',
           linked_deliverable_id = coalesce(link_del, linked_deliverable_id),
           linked_post_id = coalesce(link_post, linked_post_id)
     WHERE id = s.id
    RETURNING * INTO s;

  ELSIF p_action IN ('reopen', 'revisit') THEN
    INSERT INTO step_actions(workspace_id, step_id, action, idempotency_key, payload)
    VALUES (w, s.id, 'revisit', p_idempotency_key, p_payload)
    RETURNING * INTO action_record;
    UPDATE roadmap_steps
       SET status = 'ready',
           execution_state = 'not_started',
           completed_at = NULL
     WHERE id = s.id
    RETURNING * INTO s;

  ELSE
    RAISE EXCEPTION 'UNKNOWN_ACTION' USING ERRCODE = 'P0001';
  END IF;

  UPDATE roadmaps SET updated_at = now() WHERE id = s.roadmap_id;

  RETURN jsonb_build_object('step', to_jsonb(s), 'actionRecord', to_jsonb(action_record));
END $$;

-- 5. Grants ------------------------------------------------------------------
REVOKE ALL ON FUNCTION load_active_roadmap() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION perform_roadmap_step_action(uuid, text, uuid, jsonb) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION load_active_roadmap() TO authenticated;
GRANT EXECUTE ON FUNCTION perform_roadmap_step_action(uuid, text, uuid, jsonb) TO authenticated;