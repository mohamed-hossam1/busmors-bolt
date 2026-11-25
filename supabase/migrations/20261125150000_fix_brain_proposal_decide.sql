-- Fix: approving an agent-created Brain proposal must persist cleanly.
--
-- Bug: propose_brain_change() stores an 'add' proposal with a NULL node_id (the
-- node does not exist yet) and an 'edit'/'delete' proposal with the existing
-- node_id. The previous decide_brain_proposal() unconditionally did
--   SELECT * INTO n FROM brain_nodes WHERE id=proposal.node_id ...
--   IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';
-- so EVERY 'add' approval raised NOT_FOUND and the approval card surfaced
-- "This change could not be saved. Your edits are kept here; try again."
--
-- This redefines decide_brain_proposal() to branch on the proposal action:
--   * add    -> INSERT a brand-new approved brain_node from the proposal diff
--               (and record its immutable version), then link the proposal to it;
--   * edit   -> update the existing node from the diff (unchanged behaviour);
--   * delete -> retire the existing node (status='retired', is_current=false).
-- Rejection never mutates an approved fact; a still-candidate node is rejected.
--
-- The diff written by propose_brain_change() already carries every field needed:
--   action, title, summary, category, properties, old_values, new_values,
--   source, rationale, source_detail, epistemic_kind.

CREATE OR REPLACE FUNCTION decide_brain_proposal(p_proposal_id uuid,p_expected_version integer,p_decision text,p_edit jsonb DEFAULT NULL)
RETURNS brain_nodes LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  w uuid:=auth.uid();
  proposal brain_proposals;
  n brain_nodes;
  d jsonb;
  v_action text;
BEGIN
  IF w IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'INVALID_DECISION'; END IF;

  SELECT * INTO proposal FROM brain_proposals WHERE id=p_proposal_id AND workspace_id=w FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF proposal.status<>'pending' OR proposal.base_version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'STALE_VERSION';
  END IF;

  d:=proposal.diff||coalesce(p_edit,'{}');
  v_action:=coalesce(d->>'action','edit');

  -- Rejection: never mutates an approved fact; only a still-candidate node is rejected.
  IF p_decision='rejected' THEN
    IF proposal.node_id IS NOT NULL THEN
      SELECT * INTO n FROM brain_nodes WHERE id=proposal.node_id AND workspace_id=w FOR UPDATE;
      IF FOUND AND n.status='candidate' THEN
        n:=update_brain_item(n.id,n.version,n.title,n.summary,n.category,n.properties,'rejected');
      END IF;
    END IF;
    UPDATE brain_proposals SET status='rejected',decided_at=now() WHERE id=proposal.id;
    INSERT INTO audit_log(workspace_id,actor_id,action,entity_type,entity_id,details)
      VALUES(w,w,'proposal_rejected','brain_proposal',proposal.id,
        jsonb_build_object('nodeId',proposal.node_id,'baseVersion',p_expected_version,'action',v_action));
    RETURN n;
  END IF;

  -- Approval.
  IF v_action='add' THEN
    IF proposal.node_id IS NOT NULL THEN
      -- Defensive: an add that already carries a node id updates that node.
      SELECT * INTO n FROM brain_nodes WHERE id=proposal.node_id AND workspace_id=w FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
      IF n.version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'STALE_VERSION'; END IF;
      n:=update_brain_item(n.id,n.version,d->>'title',d->>'summary',d->>'category',d->'properties','approved');
    ELSE
      INSERT INTO brain_nodes(workspace_id,category,title,summary,properties,status,source,source_detail,confidence,epistemic_kind,approval_state,verification_state,provenance)
        VALUES(w,d->>'category',btrim(d->>'title'),coalesce(d->>'summary',''),coalesce(d->'properties','{}'),'approved',
          CASE WHEN p_edit IS NULL THEN 'crawler' ELSE 'manual' END,d->>'source_detail',1,
          CASE WHEN d->>'epistemic_kind'='inference' THEN 'inference' ELSE 'claim' END,
          'approved',CASE WHEN p_edit IS NULL THEN 'unverified' ELSE 'owner_reported' END,
          jsonb_build_object('kind','owner_approved_proposal','proposalId',proposal.id,'sourceRefs',proposal.source_refs,'edited',p_edit IS NOT NULL,'actorId',w))
        RETURNING * INTO n;
      INSERT INTO brain_versions(workspace_id,node_id,version,snapshot,provenance)
        VALUES(w,n.id,n.version,to_jsonb(n),n.provenance);
    END IF;
    UPDATE brain_proposals SET status='approved',decided_at=now(),node_id=n.id WHERE id=proposal.id;
    INSERT INTO audit_log(workspace_id,actor_id,action,entity_type,entity_id,details)
      VALUES(w,w,'proposal_approved','brain_proposal',proposal.id,
        jsonb_build_object('nodeId',n.id,'baseVersion',p_expected_version,'action','add'));
    RETURN n;

  ELSIF v_action='delete' THEN
    SELECT * INTO n FROM brain_nodes WHERE id=proposal.node_id AND workspace_id=w FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    IF n.version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'STALE_VERSION'; END IF;
    n:=update_brain_item(n.id,n.version,n.title,n.summary,n.category,n.properties,'retired');
    UPDATE brain_proposals SET status='approved',decided_at=now() WHERE id=proposal.id;
    INSERT INTO audit_log(workspace_id,actor_id,action,entity_type,entity_id,details)
      VALUES(w,w,'proposal_approved','brain_proposal',proposal.id,
        jsonb_build_object('nodeId',n.id,'baseVersion',p_expected_version,'action','delete'));
    RETURN n;

  ELSE
    -- edit
    SELECT * INTO n FROM brain_nodes WHERE id=proposal.node_id AND workspace_id=w FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    IF n.version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'STALE_VERSION'; END IF;
    n:=update_brain_item(n.id,n.version,d->>'title',d->>'summary',d->>'category',d->'properties','approved');
    UPDATE brain_nodes SET source=CASE WHEN p_edit IS NULL THEN 'crawler' ELSE 'manual' END,source_detail=d->>'source_detail',
      epistemic_kind=CASE WHEN d->>'epistemic_kind'='inference' THEN 'inference' ELSE 'claim' END,
      verification_state=CASE WHEN p_edit IS NULL THEN 'unverified' ELSE 'owner_reported' END,
      provenance=jsonb_build_object('kind','owner_approved_proposal','proposalId',proposal.id,'sourceRefs',proposal.source_refs,'edited',p_edit IS NOT NULL,'actorId',w)
      WHERE id=n.id RETURNING * INTO n;
    UPDATE brain_versions SET snapshot=to_jsonb(n),provenance=n.provenance WHERE node_id=n.id AND version=n.version;
    UPDATE brain_proposals SET status='approved',decided_at=now() WHERE id=proposal.id;
    INSERT INTO audit_log(workspace_id,actor_id,action,entity_type,entity_id,details)
      VALUES(w,w,'proposal_approved','brain_proposal',proposal.id,
        jsonb_build_object('nodeId',n.id,'baseVersion',p_expected_version,'action','edit'));
    RETURN n;
  END IF;
END $$;

REVOKE ALL ON FUNCTION decide_brain_proposal(uuid,integer,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION decide_brain_proposal(uuid,integer,text,jsonb) TO authenticated;