-- Phase 3: Real Roadmap Generation.
-- Additive only: new columns, one partial unique index, and three SECURITY DEFINER
-- RPCs. No existing table is dropped and no user data is destructively altered.
-- The legacy roadmap_steps.responsibility ('owner'|'system') and execution_mode
-- ('director'|'owner') constraints are preserved; the richer owner_role /
-- action_kind columns are additive and mapped onto them on insert.

-- At most one active roadmap per workspace. (An equivalent legacy index
-- `one_active_roadmap` already exists; this named index is additive and
-- idempotent so the invariant is explicit and self-documenting.)
CREATE UNIQUE INDEX IF NOT EXISTS roadmaps_one_active_per_workspace_idx
  ON roadmaps(workspace_id) WHERE status = 'active';

ALTER TABLE roadmaps
  ADD COLUMN IF NOT EXISTS next_review_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_cadence_days integer NOT NULL DEFAULT 7;

ALTER TABLE roadmap_steps
  ADD COLUMN IF NOT EXISTS milestone_key text,
  ADD COLUMN IF NOT EXISTS milestone_title text,
  ADD COLUMN IF NOT EXISTS milestone_position integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('high','medium','low')),
  ADD COLUMN IF NOT EXISTS owner_role text NOT NULL DEFAULT 'owner' CHECK (owner_role IN ('owner','director','joint')),
  ADD COLUMN IF NOT EXISTS action_kind text NOT NULL DEFAULT 'owner_execution' CHECK (action_kind IN ('research','analysis','content','owner_execution','joint')),
  ADD COLUMN IF NOT EXISTS success_criteria text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS linked_metric text,
  ADD COLUMN IF NOT EXISTS conversation_id uuid;

-- Create a generated roadmap atomically: archive any current active roadmap,
-- insert the new active roadmap + version + steps, wire context dependencies for
-- Brain nodes that actually exist, and mark the Discovery draft as planned.
CREATE OR REPLACE FUNCTION create_generated_roadmap(
  p_draft_id uuid,
  p_expected_draft_version integer,
  p_goal text,
  p_summary jsonb,
  p_steps jsonb,
  p_context_refs jsonb DEFAULT '[]'::jsonb,
  p_review_cadence_days integer DEFAULT 7,
  p_next_review_at timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  w uuid := auth.uid();
  d discovery_drafts;
  r roadmaps;
  v roadmap_versions;
  cadence integer := greatest(1, coalesce(p_review_cadence_days, 7));
  next_review timestamptz;
  ref jsonb;
  dep_node_id uuid;
  dep_node_version integer;
BEGIN
  IF w IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO d FROM discovery_drafts
   WHERE id = p_draft_id AND workspace_id = w FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DRAFT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF p_expected_draft_version IS NOT NULL AND d.version <> p_expected_draft_version THEN
    RAISE EXCEPTION 'STALE_VERSION' USING ERRCODE = 'P0001';
  END IF;

  -- Archive any existing active roadmap first so the partial unique index holds.
  UPDATE roadmaps
     SET status = 'archived', version = version + 1, updated_at = now()
   WHERE workspace_id = w AND status = 'active';

  next_review := coalesce(p_next_review_at, now() + make_interval(days => cadence));

  INSERT INTO roadmaps(workspace_id, goal, version, status, draft_id, review_cadence_days, next_review_at, updated_at)
  VALUES (w, coalesce(p_goal, d.goal, ''), 1, 'active', p_draft_id, cadence, next_review, now())
  RETURNING * INTO r;

  INSERT INTO roadmap_versions(workspace_id, roadmap_id, version, status, summary, context_refs)
  VALUES (w, r.id, 1, 'active', coalesce(p_summary, '{}'::jsonb), coalesce(p_context_refs, '[]'::jsonb))
  RETURNING * INTO v;

  UPDATE roadmaps
     SET active_version_id = v.id, updated_at = now()
   WHERE id = r.id
  RETURNING * INTO r;

  INSERT INTO roadmap_steps(
    workspace_id, roadmap_id, plan_version_id, step_key, position, title, objective, rationale,
    evidence, responsibility, execution_mode, inputs, dependencies, expected_output, checklist, effort,
    status, milestone_key, milestone_title, milestone_position, priority, owner_role, action_kind,
    success_criteria, linked_metric, conversation_id
  )
  SELECT
    w,
    r.id,
    v.id,
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
    'ready',
    s ->> 'milestoneKey',
    s ->> 'milestoneTitle',
    coalesce((s ->> 'milestonePosition')::integer, 0),
    coalesce(s ->> 'priority', 'medium'),
    coalesce(s ->> 'ownerRole', s ->> 'responsibleParty', 'owner'),
    coalesce(s ->> 'actionKind', 'owner_execution'),
    coalesce(s ->> 'successCriteria', ''),
    s ->> 'linkedMetric',
    NULLIF(s ->> 'conversationId', '')::uuid
  FROM jsonb_array_elements(coalesce(p_steps, '[]'::jsonb)) WITH ORDINALITY AS t(s, ord);

  -- Record a context dependency for each Brain node reference that really exists.
  FOR ref IN SELECT * FROM jsonb_array_elements(coalesce(p_context_refs, '[]'::jsonb)) LOOP
    BEGIN
      dep_node_id := NULLIF(ref ->> 'nodeId', '')::uuid;
      dep_node_version := NULLIF(ref ->> 'nodeVersion', '')::integer;
    EXCEPTION WHEN invalid_text_representation THEN
      dep_node_id := NULL;
      dep_node_version := NULL;
    END;
    IF dep_node_id IS NOT NULL
       AND dep_node_version IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM brain_versions
          WHERE workspace_id = w AND node_id = dep_node_id AND version = dep_node_version
       ) THEN
      INSERT INTO context_dependencies(workspace_id, node_id, node_version, consumer_type, consumer_id, consumer_version)
      VALUES (w, dep_node_id, dep_node_version, 'roadmap', r.id, 1);
    END IF;
  END LOOP;

  UPDATE discovery_drafts
     SET status = 'planned', version = version + 1, updated_at = now()
   WHERE id = p_draft_id
  RETURNING * INTO d;

  RETURN jsonb_build_object(
    'roadmap', to_jsonb(r),
    'activeVersion', to_jsonb(v),
    'steps', (
      SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.position), '[]'::jsonb)
        FROM roadmap_steps s WHERE s.plan_version_id = v.id
    )
  );
END $$;

-- Load the active roadmap (if any) with its active version, steps and any stale
-- Brain dependencies (version bumped, no longer approved, or superseded).
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
      'staleDependencies', '[]'::jsonb
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
    'steps', (
      SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.position), '[]'::jsonb)
        FROM roadmap_steps s WHERE s.roadmap_id = r.id
    ),
    'staleDependencies', stale
  );
END $$;

-- Let the owner edit the AI-proposed primary objective with optimistic
-- concurrency. Clears/sets isProposedTarget by replacing the whole object.
CREATE OR REPLACE FUNCTION update_roadmap_objective(
  p_roadmap_id uuid,
  p_expected_version integer,
  p_primary_objective jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  w uuid := auth.uid();
  r roadmaps;
  v roadmap_versions;
  next_summary jsonb;
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

  next_summary := jsonb_set(coalesce(v.summary, '{}'::jsonb), '{primaryObjective}', coalesce(p_primary_objective, '{}'::jsonb), true);

  UPDATE roadmap_versions SET summary = next_summary WHERE id = v.id RETURNING * INTO v;
  UPDATE roadmaps SET version = version + 1, updated_at = now() WHERE id = r.id RETURNING * INTO r;

  RETURN jsonb_build_object('roadmap', to_jsonb(r), 'activeVersion', to_jsonb(v));
END $$;

REVOKE ALL ON FUNCTION create_generated_roadmap(uuid, integer, text, jsonb, jsonb, jsonb, integer, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION load_active_roadmap() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION update_roadmap_objective(uuid, integer, jsonb) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION create_generated_roadmap(uuid, integer, text, jsonb, jsonb, jsonb, integer, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION load_active_roadmap() TO authenticated;
GRANT EXECUTE ON FUNCTION update_roadmap_objective(uuid, integer, jsonb) TO authenticated;