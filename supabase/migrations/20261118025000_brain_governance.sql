ALTER TABLE brain_proposals ADD COLUMN fingerprint text;
CREATE UNIQUE INDEX brain_proposal_fingerprint ON brain_proposals(workspace_id,fingerprint) WHERE fingerprint IS NOT NULL;
ALTER TABLE brain_edges ADD COLUMN provenance jsonb NOT NULL DEFAULT '{}';

CREATE FUNCTION mark_brain_context_changed(p_node_id uuid,p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w uuid; dep context_dependencies;
BEGIN
 SELECT workspace_id INTO w FROM brain_nodes WHERE id=p_node_id;
 IF w IS NULL THEN RETURN; END IF;
 FOR dep IN SELECT * FROM context_dependencies WHERE workspace_id=w AND node_id=p_node_id AND resolved_at IS NULL FOR UPDATE LOOP
  UPDATE context_dependencies SET stale_reason=p_reason WHERE id=dep.id;
  IF dep.consumer_type='document' THEN
   UPDATE deliverables SET stale_reason=p_reason WHERE id=dep.consumer_id AND workspace_id=w;
  ELSIF dep.consumer_type='post' AND EXISTS(SELECT 1 FROM planned_posts WHERE id=dep.consumer_id AND workspace_id=w AND execution_state NOT IN ('confirmed','owner_reported','cancelled')) THEN
   IF NOT EXISTS(SELECT 1 FROM post_holds WHERE dependency_id=dep.id AND resolved_at IS NULL) THEN
    INSERT INTO post_holds(workspace_id,post_id,reason,dependency_id) VALUES(w,dep.consumer_id,p_reason,dep.id);
   END IF;
   UPDATE planned_posts SET execution_state=CASE WHEN execution_state IN ('submitted','uncertain') THEN 'uncertain' ELSE 'held' END WHERE id=dep.consumer_id AND workspace_id=w;
   INSERT INTO notifications(workspace_id,type,subject_type,subject_id,title,body,dedupe_key)
    VALUES(w,'context_hold','post',dep.consumer_id,'Review changed business context',p_reason,'context:'||dep.id||':'||p_reason) ON CONFLICT DO NOTHING;
  END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION mark_brain_context_changed(uuid,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION update_brain_item(p_node_id uuid,p_expected_version integer,p_title text,p_summary text,p_category text,p_properties jsonb DEFAULT NULL,p_status text DEFAULT 'approved')
RETURNS brain_nodes LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w uuid:=auth.uid(); n brain_nodes; provenance_value jsonb;
BEGIN
 IF w IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 IF length(btrim(coalesce(p_title,''))) NOT BETWEEN 1 AND 150 OR length(coalesce(p_summary,''))>6000
  OR p_category IS NULL OR p_category NOT IN ('company_profile','offering','audience','brand_rule','positioning','strategic_goal','channel','competitor','company_fact')
  OR p_status IS NULL OR p_status NOT IN ('approved','rejected','retired')
  OR (p_properties IS NOT NULL AND (jsonb_typeof(p_properties)<>'object' OR length(p_properties::text)>20000)) THEN RAISE EXCEPTION 'INVALID_KNOWLEDGE'; END IF;
 IF p_category='offering' AND nullif(p_properties->>'amount','') IS NOT NULL AND
  (p_properties->>'amount' !~ '^[0-9]+(\.[0-9]{1,2})?$' OR coalesce(p_properties->>'currency','') !~ '^[A-Z]{3}$') THEN RAISE EXCEPTION 'INVALID_PRICE'; END IF;
 provenance_value:=jsonb_build_object('kind','owner_edited','actorId',w,'at',now());
 IF p_node_id IS NULL THEN
  IF p_expected_version IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'STALE_VERSION'; END IF;
  INSERT INTO brain_nodes(workspace_id,category,title,summary,properties,status,source,confidence,epistemic_kind,approval_state,verification_state,provenance)
   VALUES(w,p_category,btrim(p_title),coalesce(p_summary,''),coalesce(p_properties,'{}'),p_status,'manual',1,'claim',CASE WHEN p_status='approved' THEN 'approved' ELSE 'rejected' END,'owner_reported',provenance_value) RETURNING * INTO n;
 ELSE
  SELECT * INTO n FROM brain_nodes WHERE id=p_node_id AND workspace_id=w FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF n.version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'STALE_VERSION'; END IF;
  IF n.title IS DISTINCT FROM btrim(p_title) OR n.summary IS DISTINCT FROM p_summary OR n.category IS DISTINCT FROM p_category OR n.properties IS DISTINCT FROM coalesce(p_properties,n.properties) OR n.status IS DISTINCT FROM p_status THEN
   PERFORM mark_brain_context_changed(n.id,'Business context changed: '||n.title);
  END IF;
  UPDATE brain_nodes SET title=btrim(p_title),summary=coalesce(p_summary,''),category=p_category,properties=coalesce(p_properties,n.properties)||'{"user_edited":true}'::jsonb,
   status=p_status,approval_state=CASE WHEN p_status='approved' THEN 'approved' ELSE 'rejected' END,verification_state='owner_reported',
   provenance=provenance_value,version=version+1,is_current=(p_status<>'retired'),updated_at=now() WHERE id=n.id RETURNING * INTO n;
 END IF;
 INSERT INTO brain_versions(workspace_id,node_id,version,snapshot,provenance) VALUES(w,n.id,n.version,to_jsonb(n),n.provenance);
 INSERT INTO audit_log(workspace_id,actor_id,action,entity_type,entity_id,details) VALUES(w,w,'knowledge_'||p_status,'brain_node',n.id,jsonb_build_object('version',n.version,'title',n.title));
 RETURN n;
END $$;

CREATE FUNCTION decide_brain_proposal(p_proposal_id uuid,p_expected_version integer,p_decision text,p_edit jsonb DEFAULT NULL)
RETURNS brain_nodes LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w uuid:=auth.uid(); proposal brain_proposals; n brain_nodes; d jsonb;
BEGIN
 IF w IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 IF p_decision IS NULL OR p_decision NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'INVALID_DECISION'; END IF;
 SELECT * INTO proposal FROM brain_proposals WHERE id=p_proposal_id AND workspace_id=w FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 SELECT * INTO n FROM brain_nodes WHERE id=proposal.node_id AND workspace_id=w FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 IF proposal.status<>'pending' OR proposal.base_version IS DISTINCT FROM p_expected_version OR (p_decision='approved' AND n.version IS DISTINCT FROM p_expected_version) THEN RAISE EXCEPTION 'STALE_VERSION'; END IF;
 IF p_decision='approved' THEN
  d:=proposal.diff||coalesce(p_edit,'{}');
  n:=update_brain_item(n.id,n.version,d->>'title',d->>'summary',d->>'category',d->'properties','approved');
  UPDATE brain_nodes SET source=CASE WHEN p_edit IS NULL THEN 'crawler' ELSE 'manual' END,source_detail=d->>'source_detail',
   epistemic_kind=CASE WHEN d->>'epistemic_kind'='inference' THEN 'inference' ELSE 'claim' END,
   verification_state=CASE WHEN p_edit IS NULL THEN 'unverified' ELSE 'owner_reported' END,
   provenance=jsonb_build_object('kind','owner_approved_proposal','proposalId',proposal.id,'sourceRefs',proposal.source_refs,'edited',p_edit IS NOT NULL,'actorId',w)
  WHERE id=n.id RETURNING * INTO n;
  UPDATE brain_versions SET snapshot=to_jsonb(n),provenance=n.provenance WHERE node_id=n.id AND version=n.version;
 ELSE
  -- Rejecting an update preserves the currently approved fact.
  IF n.status='candidate' THEN n:=update_brain_item(n.id,n.version,n.title,n.summary,n.category,n.properties,'rejected'); END IF;
 END IF;
 UPDATE brain_proposals SET status=p_decision,decided_at=now() WHERE id=proposal.id;
 INSERT INTO audit_log(workspace_id,actor_id,action,entity_type,entity_id,details) VALUES(w,w,'proposal_'||p_decision,'brain_proposal',proposal.id,jsonb_build_object('nodeId',n.id,'baseVersion',p_expected_version));
 RETURN n;
END $$;

CREATE FUNCTION save_brain_relationship(p_source uuid,p_target uuid,p_type text,p_source_note text,p_edge_id uuid DEFAULT NULL)
RETURNS brain_edges LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w uuid:=auth.uid(); e brain_edges;
BEGIN
 IF w IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 IF p_source=p_target OR p_type IS NULL OR p_type NOT IN ('TARGETS','COMPETES_WITH','HAS_TONE','SOLVES_PAIN_POINT','RELATED_TO') OR length(coalesce(p_source_note,''))>1000 THEN RAISE EXCEPTION 'INVALID_RELATIONSHIP'; END IF;
 IF (SELECT count(*) FROM brain_nodes WHERE workspace_id=w AND id IN (p_source,p_target) AND status NOT IN ('rejected','retired'))<>2 THEN RAISE EXCEPTION 'INVALID_RELATIONSHIP'; END IF;
 IF p_edge_id IS NULL THEN
  SELECT * INTO e FROM brain_edges WHERE workspace_id=w AND source_node_id=p_source AND target_node_id=p_target AND relation_type=p_type;
  IF FOUND THEN RETURN e; END IF;
  INSERT INTO brain_edges(workspace_id,source_node_id,target_node_id,relation_type,status,weight,provenance) VALUES(w,p_source,p_target,p_type,'approved',1,jsonb_build_object('kind','owner_reported','source',p_source_note,'actorId',w)) RETURNING * INTO e;
 ELSE
  UPDATE brain_edges SET source_node_id=p_source,target_node_id=p_target,relation_type=p_type,status='approved',provenance=jsonb_build_object('kind','owner_reported','source',p_source_note,'actorId',w)
   WHERE id=p_edge_id AND workspace_id=w RETURNING * INTO e;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 END IF;
 INSERT INTO audit_log(workspace_id,actor_id,action,entity_type,entity_id,details) VALUES(w,w,'relationship_saved','brain_edge',e.id,to_jsonb(e));
 RETURN e;
END $$;

CREATE FUNCTION brain_before_delete() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM mark_brain_context_changed(OLD.id,'Business context deleted: '||OLD.title);
 UPDATE post_holds SET dependency_id=NULL WHERE dependency_id IN (SELECT id FROM context_dependencies WHERE node_id=OLD.id AND workspace_id=OLD.workspace_id);
 DELETE FROM context_dependencies WHERE node_id=OLD.id AND workspace_id=OLD.workspace_id;
 DELETE FROM brain_proposals WHERE node_id=OLD.id AND workspace_id=OLD.workspace_id;
 INSERT INTO audit_log(workspace_id,actor_id,action,entity_type,entity_id,details)
  VALUES(OLD.workspace_id,coalesce(auth.uid(),OLD.workspace_id),'knowledge_deleted','brain_node',OLD.id,jsonb_build_object('version',OLD.version));
 RETURN OLD;
END $$;
CREATE TRIGGER brain_delete_impact BEFORE DELETE ON brain_nodes FOR EACH ROW EXECUTE FUNCTION brain_before_delete();

REVOKE INSERT,UPDATE ON brain_nodes FROM authenticated;
REVOKE INSERT,UPDATE,DELETE ON brain_proposals,brain_edges FROM authenticated;
REVOKE ALL ON FUNCTION update_brain_item(uuid,integer,text,text,text,jsonb,text),decide_brain_proposal(uuid,integer,text,jsonb),save_brain_relationship(uuid,uuid,text,text,uuid),brain_before_delete() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION update_brain_item(uuid,integer,text,text,text,jsonb,text),decide_brain_proposal(uuid,integer,text,jsonb),save_brain_relationship(uuid,uuid,text,text,uuid) TO authenticated;
