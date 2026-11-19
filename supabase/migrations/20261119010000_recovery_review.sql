-- Review fixes are additive so an already-applied competition schema upgrades.
-- Recover through the normal transition, including terminal step events, the
-- conversation notice and the task summary. Polling with NULL only reaps stale
-- leases; the initial tab recovery also releases its lost in-memory promises.
CREATE OR REPLACE FUNCTION recover_tasks(p_runner_id uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t tasks; count_changed integer:=0;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 FOR t IN SELECT * FROM tasks
  WHERE workspace_id=auth.uid() AND status='running'
   AND (runner_id=p_runner_id OR heartbeat_at IS NULL OR heartbeat_at<now()-interval '120 seconds')
  FOR UPDATE SKIP LOCKED
 LOOP
  PERFORM stop_task(t.id,t.run_id,'interrupted','Browser execution interrupted. Resume to continue from saved progress.');
  count_changed:=count_changed+1;
 END LOOP;
 RETURN count_changed;
END $$;

-- Older failed tasks predate checkpoints. Give them a real resume point,
-- without enabling the generic runner to retry publishing.
UPDATE tasks SET checkpoint=checkpoint||'{"phase":"route"}'::jsonb
 WHERE status IN ('queued','failed','interrupted') AND type<>'publishing'
 AND coalesce(checkpoint->>'phase','') NOT IN ('route','generate','persist','done');

-- Never allow NULL to bypass optimistic concurrency on intake commands.
CREATE OR REPLACE FUNCTION save_business_draft(p_form jsonb, p_expected_version integer, p_path text DEFAULT 'manual', p_field_sources jsonb DEFAULT '{}')
RETURNS business_drafts LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w uuid:=auth.uid(); d business_drafts;
BEGIN
 IF w IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 IF jsonb_typeof(p_form) IS DISTINCT FROM 'object' OR length(p_form::text)>60000 OR p_path IS NULL OR p_path NOT IN ('manual','website') OR jsonb_typeof(p_field_sources) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_DRAFT'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('intake:'||w::text,0));
 SELECT * INTO d FROM business_drafts WHERE workspace_id=w FOR UPDATE;
 IF NOT FOUND THEN
  IF p_expected_version IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'STALE_VERSION'; END IF;
  INSERT INTO business_drafts(workspace_id,form,path,field_sources) VALUES(w,p_form,p_path,p_field_sources) RETURNING * INTO d;
 ELSE
  IF d.version IS DISTINCT FROM p_expected_version OR d.status='confirmed' THEN RAISE EXCEPTION 'STALE_VERSION'; END IF;
  UPDATE business_drafts SET form=p_form,path=p_path,field_sources=p_field_sources,version=version+1,updated_at=now() WHERE id=d.id RETURNING * INTO d;
 END IF;
 RETURN d;
END $$;

CREATE OR REPLACE FUNCTION confirm_business_draft(p_draft_id uuid,p_expected_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w uuid:=auth.uid(); d business_drafts; f jsonb; o jsonb; n uuid; offer_count integer;
BEGIN
 IF w IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('intake:'||w::text,0));
 SELECT * INTO d FROM business_drafts WHERE id=p_draft_id AND workspace_id=w FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 IF d.version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'STALE_VERSION'; END IF;
 IF d.status='confirmed' THEN RETURN jsonb_build_object('draftId',d.id,'version',d.version); END IF;
 f:=d.form;
 IF length(btrim(coalesce(f->>'name',''))) NOT BETWEEN 1 AND 150
  OR length(btrim(coalesce(f->>'description',''))) NOT BETWEEN 1 AND 3000
  OR length(btrim(coalesce(f->>'country',''))) NOT BETWEEN 1 AND 100
  OR length(btrim(coalesce(f->>'serviceArea',''))) NOT BETWEEN 1 AND 300
  OR jsonb_typeof(f->'offerings') IS DISTINCT FROM 'array'
  OR (f->'conversionRoute'->>'state') IS NULL
  OR (f->'conversionRoute'->>'state') NOT IN ('ready','not_ready') THEN RAISE EXCEPTION 'INVALID_BUSINESS'; END IF;
 offer_count:=jsonb_array_length(f->'offerings');
 IF offer_count NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'INVALID_OFFERINGS'; END IF;
 IF f->'conversionRoute'->>'state'='ready' AND
  (length(btrim(coalesce(f->'conversionRoute'->>'value','')))=0 OR coalesce(f->'conversionRoute'->>'type','') NOT IN ('website','whatsapp','phone','social','booking','marketplace','other')) THEN RAISE EXCEPTION 'INVALID_CONTACT_ROUTE'; END IF;
 FOR o IN SELECT value FROM jsonb_array_elements(f->'offerings') LOOP
  IF length(btrim(coalesce(o->>'name',''))) NOT BETWEEN 1 AND 150
   OR coalesce(o->>'pricingModel','') NOT IN ('fixed','starting_from','quote_required','unknown')
   OR (nullif(o->>'amount','') IS NOT NULL AND (o->>'amount' !~ '^[0-9]+(\.[0-9]{1,2})?$' OR coalesce(o->>'currency','') !~ '^[A-Z]{3}$')) THEN RAISE EXCEPTION 'INVALID_OFFERING'; END IF;
 END LOOP;
 INSERT INTO brain_nodes(workspace_id,category,title,summary,properties,status,source,confidence,approval_state,verification_state,provenance)
 VALUES(w,'company_profile',f->>'name',f->>'description',f-'offerings','approved','manual',1,'approved','owner_reported',jsonb_build_object('kind','owner_confirmed','draftId',d.id,'draftVersion',d.version,'fieldSources',d.field_sources)) RETURNING id INTO n;
 INSERT INTO brain_versions(workspace_id,node_id,version,snapshot,provenance) SELECT w,id,version,to_jsonb(brain_nodes),provenance FROM brain_nodes WHERE id=n;
 FOR o IN SELECT value FROM jsonb_array_elements(f->'offerings') LOOP
  INSERT INTO brain_nodes(workspace_id,category,title,summary,properties,status,source,confidence,approval_state,verification_state,provenance)
  VALUES(w,'offering',o->>'name',coalesce(o->>'description',''),o,'approved','manual',1,'approved','owner_reported',jsonb_build_object('kind','owner_confirmed','draftId',d.id,'draftVersion',d.version,'fieldSources',d.field_sources)) RETURNING id INTO n;
  INSERT INTO brain_versions(workspace_id,node_id,version,snapshot,provenance) SELECT w,id,version,to_jsonb(brain_nodes),provenance FROM brain_nodes WHERE id=n;
 END LOOP;
 UPDATE business_drafts SET status='confirmed',confirmed_at=now() WHERE id=d.id;
 UPDATE workspace_settings SET onboarding_state='complete',confirmed_intake_version=d.version,country=f->>'country',updated_at=now() WHERE workspace_id=w;
 UPDATE workspaces SET name=f->>'name' WHERE id=w;
 INSERT INTO audit_log(workspace_id,actor_id,action,entity_type,entity_id,details) VALUES(w,w,'business_confirmed','business_draft',d.id,jsonb_build_object('version',d.version));
 RETURN jsonb_build_object('draftId',d.id,'version',d.version);
END $$;
