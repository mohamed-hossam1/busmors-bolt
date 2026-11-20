\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id) VALUES('44444444-4444-4444-8444-444444444444'),('55555555-5555-4555-8555-555555555555');
INSERT INTO workspaces(id) VALUES('55555555-5555-4555-8555-555555555555');
INSERT INTO brain_nodes(id,workspace_id,category,title) VALUES('55555555-5555-4555-8555-111111111111','55555555-5555-4555-8555-555555555555','offering','Other owner');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
DO $$
DECLARE n brain_nodes; other_node brain_nodes; proposal brain_proposals; cand brain_nodes; d uuid; p uuid; pp planned_posts; relation brain_edges; result jsonb;
BEGIN
 PERFORM bootstrap_workspace();
 n:=update_brain_item(NULL,0,'Custom repair','Owner price', 'offering','{"pricingModel":"fixed","amount":"100","currency":"EGP"}');
 other_node:=update_brain_item(NULL,0,'Local households','Owner audience','audience','{}');
 INSERT INTO deliverables(workspace_id,title,type,content) VALUES(auth.uid(),'Dependent document','general','Depends on the old price') RETURNING id INTO d;
  pp := create_post('facebook','Old price','',NULL,'{}',''); p := pp.id;
 INSERT INTO context_dependencies(workspace_id,node_id,node_version,consumer_type,consumer_id,consumer_version) VALUES(auth.uid(),n.id,n.version,'document',d,1),(auth.uid(),n.id,n.version,'post',p,1);
 n:=update_brain_item(n.id,1,'Custom repair','Owner corrected price','offering','{"pricingModel":"fixed","amount":"125","currency":"EGP"}');
 IF (SELECT count(*) FROM brain_versions WHERE node_id=n.id)<>2 THEN RAISE EXCEPTION 'Edit history missing'; END IF;
 IF (SELECT snapshot->'properties'->>'amount' FROM brain_versions WHERE node_id=n.id AND version=1)<>'100' THEN RAISE EXCEPTION 'Old version changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM post_holds WHERE post_id=p AND resolved_at IS NULL) OR NOT EXISTS(SELECT 1 FROM planned_posts WHERE id=p AND execution_state='held') OR NOT EXISTS(SELECT 1 FROM deliverables WHERE id=d AND stale_reason IS NOT NULL) THEN RAISE EXCEPTION 'Impact not propagated'; END IF;
 BEGIN
  PERFORM update_brain_item(n.id,1,'Stale title','Stale','offering','{}');
  RAISE EXCEPTION 'Stale edit accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'STALE_VERSION' THEN RAISE; END IF; END;
 BEGIN
  PERFORM update_brain_item(n.id,n.version,'Invalid price','Invalid','offering','{"amount":"not a number","currency":"EGP"}');
  RAISE EXCEPTION 'Invalid price accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVALID_PRICE' THEN RAISE; END IF; END;
 result:=save_crawl_brain('https://example.com','[{"category":"offering","title":"Custom repair","summary":"Source claims a different price","properties":{"evidence_quote":"Custom repairs start at 150 EGP for a standard repair."},"source_url":"https://example.com/prices","confidence":0.95}]','[]',1,true);
 IF (SELECT summary FROM brain_nodes WHERE id=n.id)<>'Owner corrected price' THEN RAISE EXCEPTION 'Reimport overwrote owner fact'; END IF;
 SELECT * INTO proposal FROM brain_proposals WHERE node_id=n.id;
 IF proposal.status<>'pending' OR proposal.base_version<>n.version THEN RAISE EXCEPTION 'Proposal not pending or not version-bound'; END IF;
 PERFORM save_crawl_brain('https://example.com','[{"category":"offering","title":"Custom repair","summary":"Source claims a different price","properties":{"evidence_quote":"Custom repairs start at 150 EGP for a standard repair."},"source_url":"https://example.com/prices","confidence":0.95}]','[]',1,true);
 IF (SELECT count(*) FROM brain_proposals WHERE node_id=n.id)<>1 THEN RAISE EXCEPTION 'Reimport duplicated proposal'; END IF;
 n:=decide_brain_proposal(proposal.id,n.version,'approved');
 IF n.approval_state<>'approved' OR n.verification_state<>'unverified' THEN RAISE EXCEPTION 'Approval invented verification'; END IF;
 result:=save_crawl_brain('https://example.com','[{"category":"company_fact","title":"New website claim","summary":"A proposed statement","properties":{"evidence_quote":"This statement comes from a public website page."},"source_url":"https://example.com","confidence":0.95}]','[]',1,true);
 IF NOT EXISTS(SELECT 1 FROM brain_nodes WHERE title='New website claim' AND status='approved' AND approval_state='approved') THEN RAISE EXCEPTION 'Website claim was not auto-approved'; END IF;
 IF (SELECT onboarding_state FROM workspace_settings)<>'awaiting_url' THEN RAISE EXCEPTION 'Reimport bypassed business confirmation'; END IF;
  cand:=update_brain_item(NULL,0,'Candidate fact','A candidate claim pending review','company_fact','{"confidence_reason":"Initial extraction"}','candidate');
  IF cand.status<>'candidate' OR cand.approval_state<>'pending' THEN RAISE EXCEPTION 'New candidate not pending'; END IF;
  cand:=update_brain_item(cand.id,cand.version,'Candidate fact edited','Edited while still pending review','company_fact',cand.properties,'candidate');
  IF cand.status<>'candidate' OR cand.approval_state<>'pending' THEN RAISE EXCEPTION 'Candidate edit silently approved'; END IF;
  IF (SELECT count(*) FROM brain_versions WHERE node_id=cand.id)<>2 THEN RAISE EXCEPTION 'Candidate edit history missing'; END IF;
 relation:=save_brain_relationship(n.id,other_node.id,'TARGETS','Owner confirms this audience');
 IF relation.status<>'approved' THEN RAISE EXCEPTION 'Owner relationship not saved'; END IF;
 BEGIN
  PERFORM save_brain_relationship(n.id,'55555555-5555-4555-8555-111111111111','TARGETS','Forged');
  RAISE EXCEPTION 'Other workspace relationship accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVALID_RELATIONSHIP' THEN RAISE; END IF; END;
 DELETE FROM brain_nodes WHERE id=n.id;
 SET CONSTRAINTS ALL IMMEDIATE;
 IF EXISTS(SELECT 1 FROM brain_edges WHERE id=relation.id) OR EXISTS(SELECT 1 FROM brain_versions WHERE node_id=n.id) OR EXISTS(SELECT 1 FROM brain_proposals WHERE node_id=n.id) THEN RAISE EXCEPTION 'Deletion did not clean related records'; END IF;
 IF NOT EXISTS(SELECT 1 FROM post_holds WHERE post_id=p AND resolved_at IS NULL) THEN RAISE EXCEPTION 'Deletion removed publishing hold'; END IF;
 IF EXISTS(SELECT 1 FROM audit_log WHERE actor_id IS DISTINCT FROM auth.uid()) THEN RAISE EXCEPTION 'Missing audit actor'; END IF;
 RAISE NOTICE 'PASS: versioned price correction, stale rejection, dependent document/Post holds, reimport proposals/dedup, independent approval/verification, relationship ownership, deletion cleanup and audit';
END $$;
ROLLBACK;
