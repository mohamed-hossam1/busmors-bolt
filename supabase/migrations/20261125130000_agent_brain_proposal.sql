-- Agent-initiated Business Brain proposals (Phase 2).
--
-- The Orchestrator must be able to propose durable Brain additions, edits and
-- deletions, but every mutation requires explicit owner approval. Authenticated
-- clients cannot INSERT into brain_proposals directly (that privilege was
-- revoked in brain_governance); proposals are created by SECURITY DEFINER
-- functions. This adds the missing agent-facing creator.
--
-- Guarantees:
--   * workspace is derived from auth.uid(), never from caller-supplied ids;
--   * the proposal is always created with status 'pending' and NEVER touches
--     brain_nodes (no auto-apply, no auto-approve);
--   * old/new values, source and rationale are stored on the proposal diff so
--     the existing approval card (decide_brain_proposal) can render them;
--   * a stable fingerprint deduplicates identical pending proposals so a retried
--     model/tool call cannot create duplicates.

CREATE OR REPLACE FUNCTION propose_brain_change(
  p_action text,
  p_node_id uuid,
  p_title text,
  p_summary text,
  p_category text,
  p_properties jsonb,
  p_old_values jsonb,
  p_new_values jsonb,
  p_source text,
  p_rationale text,
  p_source_refs jsonb,
  p_fingerprint text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  w uuid := auth.uid();
  n brain_nodes;
  existing brain_proposals;
  pid uuid;
  base_version integer := 0;
  diff jsonb;
BEGIN
  IF w IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF p_action IS NULL OR p_action NOT IN ('add','edit','delete') THEN RAISE EXCEPTION 'INVALID_ACTION'; END IF;
  IF length(btrim(coalesce(p_title,''))) NOT BETWEEN 1 AND 150
     OR length(coalesce(p_summary,''))>6000
     OR p_category IS NULL OR p_category NOT IN ('company_profile','offering','audience','brand_rule','positioning','strategic_goal','channel','competitor','company_fact')
     OR (p_properties IS NOT NULL AND (jsonb_typeof(p_properties)<>'object' OR length(p_properties::text)>20000))
     OR length(coalesce(p_source,''))>2000
     OR length(coalesce(p_rationale,''))>4000
     OR (p_old_values IS NOT NULL AND jsonb_typeof(p_old_values)<>'object')
     OR (p_new_values IS NOT NULL AND jsonb_typeof(p_new_values)<>'object')
     OR (p_source_refs IS NOT NULL AND jsonb_typeof(p_source_refs)<>'array') THEN
    RAISE EXCEPTION 'INVALID_PROPOSAL';
  END IF;

  -- edit/delete must reference an existing node in this workspace.
  IF p_action IN ('edit','delete') THEN
    IF p_node_id IS NULL THEN RAISE EXCEPTION 'NODE_REQUIRED'; END IF;
    SELECT * INTO n FROM brain_nodes WHERE id=p_node_id AND workspace_id=w FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    base_version := n.version;
  END IF;

  -- Deduplicate: an identical pending proposal is reused, never duplicated.
  IF p_fingerprint IS NOT NULL THEN
    SELECT * INTO existing FROM brain_proposals
      WHERE workspace_id=w AND fingerprint=p_fingerprint AND status='pending'
      LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('proposalId',existing.id,'status','pending','duplicate',true,'conflict',false,'baseVersion',existing.base_version);
    END IF;
  END IF;

  diff := jsonb_build_object(
    'action',p_action,
    'title',btrim(p_title),
    'summary',coalesce(p_summary,''),
    'category',p_category,
    'properties',coalesce(p_properties,'{}'::jsonb),
    'old_values',coalesce(p_old_values,'{}'::jsonb),
    'new_values',coalesce(p_new_values,'{}'::jsonb),
    'source',coalesce(p_source,''),
    'rationale',coalesce(p_rationale,''),
    'source_detail',left(coalesce(p_source,''),2000),
    'epistemic_kind','claim'
  );

  INSERT INTO brain_proposals(workspace_id,node_id,base_version,diff,source_refs,fingerprint)
    VALUES(w,p_node_id,base_version,diff,coalesce(p_source_refs,'[]'::jsonb),p_fingerprint)
    RETURNING id INTO pid;

  INSERT INTO audit_log(workspace_id,actor_id,action,entity_type,entity_id,details)
    VALUES(w,w,'proposal_created','brain_proposal',pid,
      jsonb_build_object('action',p_action,'nodeId',p_node_id,'baseVersion',base_version));

  RETURN jsonb_build_object('proposalId',pid,'status','pending','duplicate',false,'conflict',false,'baseVersion',base_version);
END $$;

REVOKE ALL ON FUNCTION propose_brain_change(text,uuid,text,text,text,jsonb,jsonb,jsonb,text,text,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION propose_brain_change(text,uuid,text,text,text,jsonb,jsonb,jsonb,text,text,jsonb,text) TO authenticated;