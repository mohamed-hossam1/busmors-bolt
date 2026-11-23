-- Real Roadmap generation from a completed Discovery.
--
-- The Discovery wizard already produces an adaptive set of questions with explicit
-- answered / unknown / skipped / not-applicable states. This migration turns the
-- confirmed answers into a persisted, structured, measurable roadmap using the
-- existing roadmaps / roadmap_versions / roadmap_steps tables (previously only
-- written by origin validation, never by a generator).
--
-- Guarantees:
--   * Exactly one active roadmap per workspace: generating archives the previous
--     active roadmap and its active version, preserving history.
--   * Only approved, current Brain facts are recorded as context_dependencies, and
--     only when a matching brain_versions row exists (the existing owner trigger
--     requires it), so a missing snapshot never aborts a generation.
--   * Owner-scoped, optimistic-concurrency guarded, audit-logged.

CREATE OR REPLACE FUNCTION save_generated_roadmap(
 p_draft_id uuid,
 p_goal text,
 p_expected_draft_version integer,
 p_plan jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 w uuid:=auth.uid();
 d discovery_drafts;
 v_roadmap roadmaps;
 v_version roadmap_versions;
 v_step roadmap_steps;
 item jsonb;
 ref jsonb;
 v_position integer:=0;
 v_steps_count integer:=0;
 v_context_refs jsonb:='[]'::jsonb;
 v_summary jsonb;
 v_node_version integer;
BEGIN
 IF w IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 IF p_plan IS NULL OR jsonb_typeof(p_plan) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_PLAN'; END IF;
 IF jsonb_typeof(p_plan->'steps') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_plan->'steps') NOT BETWEEN 1 AND 12 THEN
  RAISE EXCEPTION 'INVALID_PLAN';
 END IF;

 SELECT * INTO d FROM discovery_drafts WHERE id=p_draft_id AND workspace_id=w FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 IF d.version IS DISTINCT FROM p_expected_draft_version THEN RAISE EXCEPTION 'STALE_VERSION'; END IF;

 -- Collect approved, current Brain facts the plan was built from. A fact is only
 -- recorded when its exact version exists in brain_versions, otherwise the owner
 -- trigger on context_dependencies would reject the whole generation.
 IF jsonb_typeof(p_plan->'contextRefs')='array' THEN
  FOR ref IN SELECT value FROM jsonb_array_elements(p_plan->'contextRefs') LOOP
   CONTINUE WHEN jsonb_typeof(ref) IS DISTINCT FROM 'object' OR NOT (ref ? 'nodeId');
   SELECT b.version INTO v_node_version
     FROM brain_nodes b
     JOIN brain_versions bv ON bv.node_id=b.id AND bv.workspace_id=b.workspace_id AND bv.version=b.version
    WHERE b.id=(ref->>'nodeId')::uuid AND b.workspace_id=w
      AND b.status='approved' AND b.approval_state='approved' AND b.is_current
    LIMIT 1;
   IF v_node_version IS NOT NULL AND NOT EXISTS(
     SELECT 1 FROM jsonb_array_elements(v_context_refs) e WHERE e->>'nodeId'=ref->>'nodeId'
   ) THEN
    v_context_refs:=v_context_refs||jsonb_build_array(jsonb_build_object('nodeId',ref->>'nodeId','version',v_node_version));
   END IF;
   v_node_version:=NULL;
  END LOOP;
 END IF;

 -- One active roadmap per workspace.
 UPDATE roadmaps SET status='archived',updated_at=now() WHERE workspace_id=w AND status='active';
 UPDATE roadmap_versions SET status='archived' WHERE workspace_id=w AND status='active';

 INSERT INTO roadmaps(workspace_id,goal,version,status,draft_id)
  VALUES(w,p_goal,1,'active',d.id) RETURNING * INTO v_roadmap;

 v_summary:=jsonb_build_object(
  'title',coalesce(p_plan->>'title',''),
  'summary',coalesce(p_plan->>'summary',''),
  'uncertainty',coalesce(p_plan->>'uncertainty',''),
  'diagnosis',coalesce(p_plan->'diagnosis','{}'::jsonb),
  'objective',coalesce(p_plan->'objective','{}'::jsonb),
  'metrics',coalesce(p_plan->'metrics','[]'::jsonb),
  'priorities',coalesce(p_plan->'priorities','[]'::jsonb),
  'milestones',coalesce(p_plan->'milestones','[]'::jsonb),
  'risks',coalesce(p_plan->'risks','[]'::jsonb),
  'review',coalesce(p_plan->'review','{}'::jsonb),
  'goalLabel',coalesce(p_plan->>'goalLabel','')
 );

 INSERT INTO roadmap_versions(workspace_id,roadmap_id,version,base_version,status,summary,diff,context_refs)
  VALUES(w,v_roadmap.id,1,NULL,'active',v_summary,'{}'::jsonb,v_context_refs)
  RETURNING * INTO v_version;

 UPDATE roadmaps SET active_version_id=v_version.id,updated_at=now()
  WHERE id=v_roadmap.id RETURNING * INTO v_roadmap;

 FOR item IN SELECT value FROM jsonb_array_elements(p_plan->'steps') LOOP
  CONTINUE WHEN jsonb_typeof(item) IS DISTINCT FROM 'object';
  v_position:=v_position+1;
  INSERT INTO roadmap_steps(
   workspace_id,roadmap_id,plan_version_id,step_key,position,title,objective,rationale,
   evidence,uncertainty,responsibility,execution_mode,inputs,dependencies,expected_output,
   checklist,effort,external_approval,status
  ) VALUES (
   w,v_roadmap.id,v_version.id,
   coalesce(nullif(item->>'key',''),'step_'||v_position),
   v_position,
   coalesce(nullif(item->>'title',''),'Untitled step'),
   coalesce(item->>'objective',''),
   coalesce(item->>'rationale',''),
   coalesce(item->'evidence','[]'::jsonb),
   coalesce(item->>'uncertainty',''),
   CASE WHEN item->>'responsibility'='system' THEN 'system' ELSE 'owner' END,
   CASE WHEN item->>'executionMode'='director' THEN 'director' ELSE 'owner' END,
   coalesce(item->'inputs','[]'::jsonb),
   coalesce(item->'dependencies','[]'::jsonb),
   coalesce(item->>'expectedOutput',''),
   coalesce(item->'checklist','[]'::jsonb),
   coalesce(nullif(item->>'effort',''),'Not estimated'),
   nullif(item->>'externalApproval',''),
   'ready'
  ) RETURNING * INTO v_step;
  v_steps_count:=v_steps_count+1;
 END LOOP;

 -- Record dependencies on the approved Brain facts the roadmap was built from.
 FOR ref IN SELECT value FROM jsonb_array_elements(v_context_refs) LOOP
  INSERT INTO context_dependencies(workspace_id,node_id,node_version,consumer_type,consumer_id,consumer_version)
   VALUES(w,(ref->>'nodeId')::uuid,coalesce((ref->>'version')::integer,1),'roadmap',v_roadmap.id,1);
 END LOOP;

 UPDATE discovery_drafts SET status='planned',version=version+1,updated_at=now()
  WHERE id=d.id RETURNING * INTO d;

 INSERT INTO audit_log(workspace_id,actor_id,action,entity_type,entity_id,details)
  VALUES(w,w,'roadmap.generated','roadmap',v_roadmap.id,
   jsonb_build_object('versionId',v_version.id,'steps',v_steps_count,'draftVersion',d.version));

 RETURN jsonb_build_object('roadmapId',v_roadmap.id,'versionId',v_version.id,'version',1,'steps',v_steps_count);
END $$;
REVOKE ALL ON FUNCTION save_generated_roadmap(uuid,text,integer,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION save_generated_roadmap(uuid,text,integer,jsonb) TO authenticated;

-- One bounded read for the roadmap dashboard: the active roadmap, its active
-- version summary and every step (with current status/attestation).
CREATE OR REPLACE FUNCTION load_active_roadmap()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public STABLE AS $$
DECLARE
 w uuid:=auth.uid();
 r roadmaps;
 v roadmap_versions;
 steps jsonb;
BEGIN
 IF w IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 SELECT * INTO r FROM roadmaps WHERE workspace_id=w AND status='active' ORDER BY created_at DESC LIMIT 1;
 IF NOT FOUND THEN RETURN jsonb_build_object('roadmap',NULL); END IF;
 SELECT * INTO v FROM roadmap_versions WHERE id=r.active_version_id AND workspace_id=w;
 IF NOT FOUND THEN
  SELECT * INTO v FROM roadmap_versions WHERE roadmap_id=r.id AND workspace_id=w ORDER BY version DESC LIMIT 1;
 END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.position,s.created_at),'[]'::jsonb) INTO steps
  FROM roadmap_steps s WHERE s.roadmap_id=r.id AND s.plan_version_id=v.id;
 RETURN jsonb_build_object('roadmap',to_jsonb(r),'version',to_jsonb(v),'steps',steps);
END $$;
REVOKE ALL ON FUNCTION load_active_roadmap() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION load_active_roadmap() TO authenticated;

-- Owner-driven step state change. AI/task execution must not be confused with a
-- real-world outcome: only an explicit owner action (or an owner-approved
-- attestation) may mark a step completed / owner_reported / blocked / skipped.
CREATE OR REPLACE FUNCTION set_roadmap_step_status(
 p_step_id uuid,
 p_status text,
 p_attestation jsonb DEFAULT '{}'::jsonb
) RETURNS roadmap_steps
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 w uuid:=auth.uid();
 s roadmap_steps;
BEGIN
 IF w IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 IF p_status IS NULL OR p_status NOT IN ('ready','running','completed','owner_reported','skipped','blocked','inapplicable') THEN
  RAISE EXCEPTION 'INVALID_STATUS';
 END IF;
 IF p_attestation IS NOT NULL AND jsonb_typeof(p_attestation) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'INVALID_ATTESTATION';
 END IF;
 SELECT * INTO s FROM roadmap_steps WHERE id=p_step_id AND workspace_id=w FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 UPDATE roadmap_steps
  SET status=p_status,
      attestation=CASE WHEN p_status IN ('completed','owner_reported') THEN coalesce(p_attestation,'{}'::jsonb) ELSE attestation END
  WHERE id=s.id
  RETURNING * INTO s;
 RETURN s;
END $$;
REVOKE ALL ON FUNCTION set_roadmap_step_status(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION set_roadmap_step_status(uuid,text,jsonb) TO authenticated;