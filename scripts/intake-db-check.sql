\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id) VALUES ('33333333-3333-4333-8333-333333333333');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
DO $$
DECLARE d business_drafts; s workspace_settings; f jsonb;
BEGIN
 s:=bootstrap_workspace();
 BEGIN
  PERFORM save_business_draft('{}',NULL);
  RAISE EXCEPTION 'NULL initial draft version accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'STALE_VERSION' THEN RAISE; END IF; END;
 d:=save_business_draft('{}',0);
 BEGIN
  PERFORM save_business_draft('{"name":"Unreviewed overwrite"}',NULL);
  RAISE EXCEPTION 'NULL edit version bypassed conflict check';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'STALE_VERSION' THEN RAISE; END IF; END;
 BEGIN
  PERFORM confirm_business_draft(d.id,d.version);
  RAISE EXCEPTION 'Invalid form confirmed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'INVALID_BUSINESS' THEN RAISE; END IF; END;
 IF EXISTS(SELECT 1 FROM brain_nodes) THEN RAISE EXCEPTION 'Draft leaked into active Brain'; END IF;
 f:='{"name":"Fictional local studio","description":"Repairs and custom ceramics.","country":"Egypt","serviceArea":"Cairo and online","conversionRoute":{"state":"not_ready"},"offerings":[{"name":"Custom service","description":"Made to order","pricingModel":"quote_required","amount":null,"currency":null},{"name":"Cup","pricingModel":"fixed","amount":"0","currency":"EGP"},{"name":"Workshop","pricingModel":"starting_from","amount":null,"currency":null},{"name":"Future service","pricingModel":"unknown","amount":null,"currency":null}]}';
 d:=save_business_draft(f,d.version,'manual');
 f:=jsonb_set(f,'{description}','"Owner corrected description"');
 d:=save_business_draft(f,d.version,'manual');
 BEGIN
  PERFORM confirm_business_draft(d.id,d.version-1);
  RAISE EXCEPTION 'Stale confirmation accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'STALE_VERSION' THEN RAISE; END IF; END;
 IF (SELECT form->>'description' FROM business_drafts WHERE id=d.id)<>'Owner corrected description' THEN RAISE EXCEPTION 'Saved edits lost'; END IF;
 BEGIN
  PERFORM confirm_business_draft(d.id,NULL);
  RAISE EXCEPTION 'NULL confirmation version accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'STALE_VERSION' THEN RAISE; END IF; END;
 PERFORM confirm_business_draft(d.id,d.version);
 PERFORM confirm_business_draft(d.id,d.version);
 IF (SELECT count(*) FROM brain_nodes)<>5 OR (SELECT count(*) FROM brain_versions)<>5 THEN RAISE EXCEPTION 'Confirmation duplicated or lost knowledge'; END IF;
 IF EXISTS(SELECT 1 FROM brain_nodes WHERE approval_state<>'approved' OR verification_state<>'owner_reported') THEN RAISE EXCEPTION 'Incorrect confirmation provenance'; END IF;
 IF NOT EXISTS(SELECT 1 FROM workspace_settings WHERE onboarding_state='complete' AND confirmed_intake_version=d.version) THEN RAISE EXCEPTION 'Setup not completed'; END IF;
 BEGIN
  UPDATE workspace_settings SET onboarding_state='awaiting_url';
  RAISE EXCEPTION 'Direct setup-state mutation allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 SELECT * INTO s FROM workspace_settings;
 s:=save_workspace_preferences('Egypt','USD','America/New_York','Gulf shops',s.updated_at);
 IF s.country<>'Egypt' OR s.currency<>'USD' OR s.timezone<>'America/New_York' OR s.target_market<>'Gulf shops' OR s.language<>'en' THEN RAISE EXCEPTION 'Region preferences coupled'; END IF;
 BEGIN
  PERFORM save_workspace_preferences('UK','GBP','Europe/London','UK',s.updated_at-interval '1 second');
  RAISE EXCEPTION 'Stale settings saved';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'STALE_VERSION' THEN RAISE; END IF; END;
 BEGIN
  PERFORM save_workspace_preferences('UK','GBP','Not/A_Zone','UK',s.updated_at);
  RAISE EXCEPTION 'Invalid timezone saved';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'INVALID_REGION' THEN RAISE; END IF; END;
 IF EXISTS(SELECT 1 FROM audit_log WHERE actor_id IS DISTINCT FROM auth.uid()) THEN RAISE EXCEPTION 'Missing audit actor'; END IF;
 RAISE NOTICE 'PASS: manual intake, all pricing models, unknown amount, no premature facts, stale confirmation, idempotency, owner provenance, protected setup, independent region and stale settings';
END $$;
ROLLBACK;
