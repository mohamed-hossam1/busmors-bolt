-- Phase 5: Continuous Review, Adaptation, Versioning & Learning Log.
--
-- Additive only. Adds three workspace-scoped tables (roadmap_checkins,
-- roadmap_revisions, roadmap_learning_log), extends load_active_roadmap() to also
-- return the immutable version history, recent check-ins, the latest pending
-- revision and the learning log, and adds six SECURITY DEFINER RPCs that drive
-- the review / revision / learning flows.
--
-- Isolation: every RPC derives the workspace from auth.uid() and enforces
-- workspace_id = auth.uid() with FOR UPDATE row locks and optimistic-concurrency
-- checks. No existing table is dropped and no user data is destructively altered.
-- roadmap_versions / roadmap_steps rows are treated as immutable history: a
-- revision approval archives the current active version and inserts a brand new
-- version + steps, never mutating the previous version's rows.

-- 1. roadmap_checkins ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS roadmap_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  roadmap_id uuid NOT NULL,
  plan_version_id uuid NOT NULL,
  completed_summary text NOT NULL DEFAULT '',
  actual_results text NOT NULL DEFAULT '',
  what_didnt_work text NOT NULL DEFAULT '',
  blockers text NOT NULL DEFAULT '',
  business_changes text NOT NULL DEFAULT '',
  director_recommendation text NOT NULL CHECK (director_recommendation IN ('Continue','Adjust','Pause','Change direction')),
  director_assessment text NOT NULL DEFAULT '',
  director_rationale text NOT NULL DEFAULT '',
  next_review_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, id)
);
ALTER TABLE roadmap_checkins ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS roadmap_checkins_workspace_idx ON roadmap_checkins(workspace_id);
CREATE INDEX IF NOT EXISTS roadmap_checkins_roadmap_idx ON roadmap_checkins(roadmap_id, created_at DESC);
CREATE POLICY "owner read" ON roadmap_checkins FOR SELECT TO authenticated USING(workspace_id=auth.uid());
CREATE POLICY "owner write" ON roadmap_checkins FOR ALL TO authenticated USING(workspace_id=auth.uid()) WITH CHECK(workspace_id=auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON roadmap_checkins TO authenticated;
GRANT ALL ON roadmap_checkins TO service_role;

-- 2. roadmap_revisions --------------------------------------------------------
CREATE TABLE IF NOT EXISTS roadmap_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  roadmap_id uuid NOT NULL,
  base_version_id uuid NOT NULL,
  base_version integer NOT NULL,
  owner_request text NOT NULL,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved','rejected')),
  rationale text NOT NULL DEFAULT '',
  diff jsonb NOT NULL DEFAULT '{}'::jsonb,
  proposed_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  proposed_steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  applied_version_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  UNIQUE(workspace_id, id)
);
ALTER TABLE roadmap_revisions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS roadmap_revisions_workspace_idx ON roadmap_revisions(workspace_id);
CREATE INDEX IF NOT EXISTS roadmap_revisions_roadmap_idx ON roadmap_revisions(roadmap_id, created_at DESC);
CREATE POLICY "owner read" ON roadmap_revisions FOR SELECT TO authenticated USING(workspace_id=auth.uid());
CREATE POLICY "owner write" ON roadmap_revisions FOR ALL TO authenticated USING(workspace_id=auth.uid()) WITH CHECK(workspace_id=auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON roadmap_revisions TO authenticated;
GRANT ALL ON roadmap_revisions TO service_role;

-- 3. roadmap_learning_log -----------------------------------------------------
CREATE TABLE IF NOT EXISTS roadmap_learning_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  roadmap_id uuid NOT NULL,
  plan_version_id uuid,
  step_id uuid,
  hypothesis text NOT NULL,
  experiment text NOT NULL,
  expected_outcome text NOT NULL DEFAULT '',
  actual_outcome text NOT NULL DEFAULT '',
  learning text NOT NULL,
  decision text NOT NULL DEFAULT '',
  promoted_proposal_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, id)
);
ALTER TABLE roadmap_learning_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS roadmap_learning_log_workspace_idx ON roadmap_learning_log(workspace_id);
CREATE INDEX IF NOT EXISTS roadmap_learning_log_roadmap_idx ON roadmap_learning_log(roadmap_id, created_at DESC);
CREATE POLICY "owner read" ON roadmap_learning_log FOR SELECT TO authenticated USING(workspace_id=auth.uid());
CREATE POLICY "owner write" ON roadmap_learning_log FOR ALL TO authenticated USING(workspace_id=auth.uid()) WITH CHECK(workspace_id=auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON roadmap_learning_log TO authenticated;
GRANT ALL ON roadmap_learning_log TO service_role;

-- 4. load_active_roadmap(): also return version history, check-ins, pending
--    revision and learning log (all workspace scoped by RLS + explicit filter).
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
      'linkedPosts', '[]'::jsonb,
      'versions', '[]'::jsonb,
      'checkins', '[]'::jsonb,
      'pendingRevision', NULL,
      'learningLog', '[]'::jsonb
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
    ),
    -- Phase 5: immutable version history (all versions, newest first).
    'versions', (
      SELECT coalesce(jsonb_agg(to_jsonb(rv) ORDER BY rv.version DESC), '[]'::jsonb)
        FROM roadmap_versions rv
       WHERE rv.roadmap_id = r.id
    ),
    -- Phase 5: recent check-ins (newest first, capped at 30).
    'checkins', (
      SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.created_at DESC), '[]'::jsonb)
        FROM (
          SELECT c.*
            FROM roadmap_checkins c
           WHERE c.roadmap_id = r.id
           ORDER BY c.created_at DESC
           LIMIT 30
        ) c
    ),
    -- Phase 5: latest still-pending revision (or NULL).
    'pendingRevision', (
      SELECT to_jsonb(rev)
        FROM roadmap_revisions rev
       WHERE rev.roadmap_id = r.id AND rev.status = 'proposed'
       ORDER BY rev.created_at DESC
       LIMIT 1
    ),
    -- Phase 5: learning log (newest first, capped at 50).
    'learningLog', (
      SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.created_at DESC), '[]'::jsonb)
        FROM (
          SELECT l.*
            FROM roadmap_learning_log l
           WHERE l.roadmap_id = r.id
           ORDER BY l.created_at DESC
           LIMIT 50
        ) l
    )
  );
END $$;

-- 5. save_roadmap_checkin(): persist a review check-in and reschedule review ---
CREATE OR REPLACE FUNCTION save_roadmap_checkin(
  p_roadmap_id uuid,
  p_completed_summary text,
  p_actual_results text,
  p_what_didnt_work text,
  p_blockers text,
  p_business_changes text,
  p_recommendation text,
  p_assessment text,
  p_rationale text,
  p_next_review_days integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  w uuid := auth.uid();
  r roadmaps;
  v roadmap_versions;
  c roadmap_checkins;
  next_review timestamptz;
  days integer;
BEGIN
  IF w IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000';
  END IF;
  IF p_recommendation IS NULL OR p_recommendation NOT IN ('Continue','Adjust','Pause','Change direction') THEN
    RAISE EXCEPTION 'INVALID_RECOMMENDATION' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO r FROM roadmaps
   WHERE id = p_roadmap_id AND workspace_id = w FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROADMAP_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v FROM roadmap_versions
   WHERE roadmap_id = r.id AND status = 'active'
   ORDER BY version DESC LIMIT 1;
  IF NOT FOUND AND r.active_version_id IS NOT NULL THEN
    SELECT * INTO v FROM roadmap_versions WHERE id = r.active_version_id;
  END IF;
  IF v.id IS NULL THEN
    RAISE EXCEPTION 'ACTIVE_VERSION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Reschedule: Pause clears the next review; otherwise now + cadence/override.
  IF p_recommendation = 'Pause' THEN
    next_review := NULL;
  ELSE
    days := greatest(1, coalesce(p_next_review_days, r.review_cadence_days, 7));
    next_review := now() + make_interval(days => days);
  END IF;

  INSERT INTO roadmap_checkins(
    workspace_id, roadmap_id, plan_version_id, completed_summary, actual_results,
    what_didnt_work, blockers, business_changes, director_recommendation,
    director_assessment, director_rationale, next_review_at
  ) VALUES (
    w, r.id, v.id, coalesce(p_completed_summary, ''), coalesce(p_actual_results, ''),
    coalesce(p_what_didnt_work, ''), coalesce(p_blockers, ''), coalesce(p_business_changes, ''),
    p_recommendation, coalesce(p_assessment, ''), coalesce(p_rationale, ''), next_review
  ) RETURNING * INTO c;

  UPDATE roadmaps
     SET next_review_at = next_review, updated_at = now()
   WHERE id = r.id
  RETURNING * INTO r;

  RETURN jsonb_build_object('checkin', to_jsonb(c), 'roadmap', to_jsonb(r));
END $$;

-- 6. save_roadmap_revision_proposal(): persist a proposed revision only --------
--    NEVER applies. Earlier open proposals for the same roadmap are rejected so
--    at most one proposal is pending at a time.
CREATE OR REPLACE FUNCTION save_roadmap_revision_proposal(
  p_roadmap_id uuid,
  p_expected_version integer,
  p_owner_request text,
  p_rationale text,
  p_diff jsonb,
  p_proposed_summary jsonb,
  p_proposed_steps jsonb
) RETURNS roadmap_revisions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  w uuid := auth.uid();
  r roadmaps;
  v roadmap_versions;
  rev roadmap_revisions;
BEGIN
  IF w IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO r FROM roadmaps
   WHERE id = p_roadmap_id AND workspace_id = w FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROADMAP_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF p_expected_version IS NOT NULL AND r.version <> p_expected_version THEN
    RAISE EXCEPTION 'STALE_VERSION' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v FROM roadmap_versions
   WHERE roadmap_id = r.id AND status = 'active'
   ORDER BY version DESC LIMIT 1;
  IF NOT FOUND AND r.active_version_id IS NOT NULL THEN
    SELECT * INTO v FROM roadmap_versions WHERE id = r.active_version_id;
  END IF;
  IF v.id IS NULL THEN
    RAISE EXCEPTION 'ACTIVE_VERSION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Only one open proposal at a time: reject any earlier pending ones.
  UPDATE roadmap_revisions
     SET status = 'rejected', resolved_at = now()
   WHERE roadmap_id = r.id AND status = 'proposed';

  INSERT INTO roadmap_revisions(
    workspace_id, roadmap_id, base_version_id, base_version, owner_request,
    status, rationale, diff, proposed_summary, proposed_steps
  ) VALUES (
    w, r.id, v.id, r.version, coalesce(p_owner_request, ''), 'proposed',
    coalesce(p_rationale, ''), coalesce(p_diff, '{}'::jsonb),
    coalesce(p_proposed_summary, '{}'::jsonb), coalesce(p_proposed_steps, '[]'::jsonb)
  ) RETURNING * INTO rev;

  RETURN rev;
END $$;

-- 7. approve_roadmap_revision(): owner approval applies a revision ------------
--    Archives the current active version, creates a NEW immutable version + steps
--    (preserving completed/skipped carry-over state), and flips the roadmap to it.
CREATE OR REPLACE FUNCTION approve_roadmap_revision(
  p_revision_id uuid,
  p_expected_roadmap_version integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  w uuid := auth.uid();
  rev roadmap_revisions;
  r roadmaps;
  v roadmap_versions;
  new_v roadmap_versions;
  new_version integer;
BEGIN
  IF w IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO rev FROM roadmap_revisions
   WHERE id = p_revision_id AND workspace_id = w FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REVISION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF rev.status <> 'proposed' THEN
    RAISE EXCEPTION 'REVISION_NOT_PENDING' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO r FROM roadmaps
   WHERE id = rev.roadmap_id AND workspace_id = w FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROADMAP_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF p_expected_roadmap_version IS NOT NULL AND r.version <> p_expected_roadmap_version THEN
    RAISE EXCEPTION 'STALE_VERSION' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v FROM roadmap_versions
   WHERE roadmap_id = r.id AND status = 'active'
   ORDER BY version DESC LIMIT 1;
  IF NOT FOUND AND r.active_version_id IS NOT NULL THEN
    SELECT * INTO v FROM roadmap_versions WHERE id = r.active_version_id;
  END IF;

  -- Archive the current active version (history stays immutable).
  UPDATE roadmap_versions
     SET status = 'archived'
   WHERE roadmap_id = r.id AND status = 'active';

  new_version := (SELECT coalesce(max(version), 0) + 1 FROM roadmap_versions WHERE roadmap_id = r.id);

  INSERT INTO roadmap_versions(workspace_id, roadmap_id, version, base_version, status, summary, diff, context_refs)
  VALUES (w, r.id, new_version, rev.base_version, 'active', coalesce(rev.proposed_summary, '{}'::jsonb),
          coalesce(rev.diff, '{}'::jsonb), coalesce(v.context_refs, '[]'::jsonb))
  RETURNING * INTO new_v;

  -- Insert the new version's steps, carrying over completed/skipped state for
  -- stepKeys that were already completed or skipped in the previous version.
  INSERT INTO roadmap_steps(
    workspace_id, roadmap_id, plan_version_id, step_key, position, title, objective, rationale,
    evidence, responsibility, execution_mode, inputs, dependencies, expected_output, checklist, effort,
    status, milestone_key, milestone_title, milestone_position, priority, owner_role, action_kind,
    success_criteria, linked_metric, conversation_id,
    execution_state, linked_deliverable_id, linked_post_id, result_note, completed_at, attestation
  )
  SELECT
    w, r.id, new_v.id,
    coalesce(NULLIF(s ->> 'stepKey', ''), 'step-' || (ord - 1)),
    coalesce((s ->> 'position')::integer, ord - 1),
    coalesce(s ->> 'title', ''),
    coalesce(s ->> 'objective', ''),
    coalesce(s ->> 'rationale', ''),
    coalesce(s -> 'evidence', '[]'::jsonb),
    CASE WHEN coalesce(s ->> 'responsibility', s ->> 'responsibleParty') = 'owner' THEN 'owner' ELSE 'system' END,
    CASE WHEN coalesce(s ->> 'executionMode', s ->> 'responsibleParty') = 'owner' THEN 'owner' ELSE 'director' END,
    coalesce(s -> 'inputs', '[]'::jsonb),
    coalesce(s -> 'dependencies', '[]'::jsonb),
    coalesce(s ->> 'expectedOutput', ''),
    coalesce(s -> 'checklist', '[]'::jsonb),
    coalesce(s ->> 'effort', 'medium'),
    CASE WHEN prev.status IN ('completed','skipped') THEN prev.status ELSE 'ready' END,
    s ->> 'milestoneKey',
    s ->> 'milestoneTitle',
    coalesce((s ->> 'milestonePosition')::integer, 0),
    coalesce(s ->> 'priority', 'medium'),
    coalesce(s ->> 'ownerRole', s ->> 'responsibleParty', 'owner'),
    coalesce(s ->> 'actionKind', 'owner_execution'),
    coalesce(s ->> 'successCriteria', ''),
    s ->> 'linkedMetric',
    CASE WHEN prev.status IN ('completed','skipped') THEN prev.conversation_id ELSE NULLIF(s ->> 'conversationId', '')::uuid END,
    CASE WHEN prev.status IN ('completed','skipped') THEN prev.execution_state ELSE 'not_started' END,
    CASE WHEN prev.status IN ('completed','skipped') THEN prev.linked_deliverable_id END,
    CASE WHEN prev.status IN ('completed','skipped') THEN prev.linked_post_id END,
    CASE WHEN prev.status IN ('completed','skipped') THEN prev.result_note END,
    CASE WHEN prev.status IN ('completed','skipped') THEN prev.completed_at END,
    CASE WHEN prev.status IN ('completed','skipped') THEN prev.attestation END
  FROM jsonb_array_elements(coalesce(rev.proposed_steps, '[]'::jsonb)) WITH ORDINALITY AS t(s, ord)
  LEFT JOIN roadmap_steps prev
    ON prev.plan_version_id = v.id
   AND prev.step_key = coalesce(NULLIF(s ->> 'stepKey', ''), 'step-' || (ord - 1));

  UPDATE roadmaps
     SET version = version + 1, active_version_id = new_v.id, updated_at = now()
   WHERE id = r.id
  RETURNING * INTO r;

  UPDATE roadmap_revisions
     SET status = 'approved', applied_version_id = new_v.id, resolved_at = now()
   WHERE id = rev.id
  RETURNING * INTO rev;

  RETURN load_active_roadmap();
END $$;

-- 8. reject_roadmap_revision(): owner rejection --------------------------------
CREATE OR REPLACE FUNCTION reject_roadmap_revision(
  p_revision_id uuid
) RETURNS roadmap_revisions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  w uuid := auth.uid();
  rev roadmap_revisions;
BEGIN
  IF w IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO rev FROM roadmap_revisions
   WHERE id = p_revision_id AND workspace_id = w FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REVISION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  UPDATE roadmap_revisions
     SET status = 'rejected', resolved_at = now()
   WHERE id = rev.id
  RETURNING * INTO rev;

  RETURN rev;
END $$;

-- 9. create_learning_log_entry(): record a learning -----------------------
CREATE OR REPLACE FUNCTION create_learning_log_entry(
  p_roadmap_id uuid,
  p_step_id uuid,
  p_hypothesis text,
  p_experiment text,
  p_expected_outcome text,
  p_actual_outcome text,
  p_learning text,
  p_decision text
) RETURNS roadmap_learning_log
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  w uuid := auth.uid();
  r roadmaps;
  v roadmap_versions;
  entry roadmap_learning_log;
  step_ok boolean;
BEGIN
  IF w IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000';
  END IF;
  IF length(btrim(coalesce(p_hypothesis, ''))) = 0
     OR length(btrim(coalesce(p_experiment, ''))) = 0
     OR length(btrim(coalesce(p_learning, ''))) = 0 THEN
    RAISE EXCEPTION 'INVALID_LEARNING' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO r FROM roadmaps
   WHERE id = p_roadmap_id AND workspace_id = w FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROADMAP_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v FROM roadmap_versions
   WHERE roadmap_id = r.id AND status = 'active'
   ORDER BY version DESC LIMIT 1;
  IF NOT FOUND AND r.active_version_id IS NOT NULL THEN
    SELECT * INTO v FROM roadmap_versions WHERE id = r.active_version_id;
  END IF;

  -- A supplied step must belong to this roadmap (and workspace).
  step_ok := p_step_id IS NULL OR EXISTS (
    SELECT 1 FROM roadmap_steps s WHERE s.id = p_step_id AND s.roadmap_id = r.id AND s.workspace_id = w
  );
  IF NOT step_ok THEN
    RAISE EXCEPTION 'STEP_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO roadmap_learning_log(
    workspace_id, roadmap_id, plan_version_id, step_id, hypothesis, experiment,
    expected_outcome, actual_outcome, learning, decision
  ) VALUES (
    w, r.id, v.id, p_step_id, btrim(p_hypothesis), btrim(p_experiment),
    coalesce(p_expected_outcome, ''), coalesce(p_actual_outcome, ''),
    btrim(p_learning), coalesce(p_decision, '')
  ) RETURNING * INTO entry;

  RETURN entry;
END $$;

-- 10. mark_learning_promoted(): link a learning to a Brain proposal ----------
CREATE OR REPLACE FUNCTION mark_learning_promoted(
  p_learning_id uuid,
  p_proposal_id uuid
) RETURNS roadmap_learning_log
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  w uuid := auth.uid();
  entry roadmap_learning_log;
BEGIN
  IF w IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000';
  END IF;

  UPDATE roadmap_learning_log
     SET promoted_proposal_id = p_proposal_id
   WHERE id = p_learning_id AND workspace_id = w
  RETURNING * INTO entry;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LEARNING_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  RETURN entry;
END $$;

-- 11. Grants ------------------------------------------------------------------
REVOKE ALL ON FUNCTION load_active_roadmap() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION save_roadmap_checkin(uuid, text, text, text, text, text, text, text, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION save_roadmap_revision_proposal(uuid, integer, text, text, jsonb, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION approve_roadmap_revision(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION reject_roadmap_revision(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION create_learning_log_entry(uuid, uuid, text, text, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION mark_learning_promoted(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION load_active_roadmap() TO authenticated;
GRANT EXECUTE ON FUNCTION save_roadmap_checkin(uuid, text, text, text, text, text, text, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION save_roadmap_revision_proposal(uuid, integer, text, text, jsonb, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION approve_roadmap_revision(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION reject_roadmap_revision(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION create_learning_log_entry(uuid, uuid, text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION mark_learning_promoted(uuid, uuid) TO authenticated;