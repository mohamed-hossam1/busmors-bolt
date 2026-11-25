-- Phase 4 acceptance: Meta Ads reporting tables and RPCs. Writes are service-only;
-- authenticated reads only through RLS with connection_ref hidden by a column grant.
-- Only timestamptz values written with now(); no day/month arithmetic (see plan: timezone rule).
-- Self-rolls-back.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id) VALUES('e8888888-8888-4888-8888-888888888888');
INSERT INTO workspaces(id) VALUES('e8888888-8888-4888-8888-888888888888') ON CONFLICT DO NOTHING;

-- The browser cannot call the RPCs or write the tables, and cannot read connection_ref.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','e8888888-8888-4888-8888-888888888888',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
DO $$ BEGIN
 BEGIN PERFORM upsert_meta_ads_connection(auth.uid(),'ca_x'); RAISE EXCEPTION 'Client called upsert_meta_ads_connection';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM select_meta_ads_account(auth.uid(),'act_1','x','EGP','Africa/Cairo'); RAISE EXCEPTION 'Client called select_meta_ads_account';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM save_meta_ads_report(auth.uid(),'last_7d','act_1','{}'::jsonb,NULL,false); RAISE EXCEPTION 'Client called save_meta_ads_report';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM disconnect_meta_ads_connection(auth.uid()); RAISE EXCEPTION 'Client called disconnect_meta_ads_connection';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN INSERT INTO meta_ads_connections(workspace_id) VALUES(auth.uid()); RAISE EXCEPTION 'Client wrote meta_ads_connections';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN INSERT INTO meta_ads_reports(workspace_id,date_preset,ad_account_id,report) VALUES(auth.uid(),'last_7d','act_1','{}'::jsonb); RAISE EXCEPTION 'Client wrote meta_ads_reports';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

-- Column-level grant: connection_ref is hidden, status is readable.
DO $$ BEGIN
 IF has_column_privilege('authenticated','meta_ads_connections','connection_ref','SELECT') THEN
  RAISE EXCEPTION 'authenticated must not be able to read connection_ref';
 END IF;
 IF NOT has_column_privilege('authenticated','meta_ads_connections','status','SELECT') THEN
  RAISE EXCEPTION 'authenticated must be able to read status';
 END IF;
END $$;

RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',true);
DO $$
DECLARE
 w uuid:='e8888888-8888-4888-8888-888888888888';
 c meta_ads_connections;
 t0 timestamptz;
BEGIN
 -- 1. Connect: pending_account, connection_ref stored, no ad account yet.
 PERFORM upsert_meta_ads_connection(w,'ca_1');
 SELECT * INTO c FROM meta_ads_connections WHERE workspace_id=w;
 IF c.status<>'pending_account' OR c.connection_ref<>'ca_1' OR c.ad_account_id IS NOT NULL THEN
  RAISE EXCEPTION 'Case 1 failed: expected pending_account/ca_1/null ad_account_id after upsert';
 END IF;

 -- 2. Select account: connected, currency and timezone stored.
 PERFORM select_meta_ads_account(w,'act_1','Acc','EGP','Africa/Cairo');
 SELECT * INTO c FROM meta_ads_connections WHERE workspace_id=w;
 IF c.status<>'connected' OR c.currency<>'EGP' OR c.timezone_name<>'Africa/Cairo' THEN
  RAISE EXCEPTION 'Case 2 failed: account not stored as connected with currency/timezone';
 END IF;

 -- 3. Invalid ad account, currency, timezone each raise INVALID_AD_ACCOUNT.
 BEGIN PERFORM select_meta_ads_account(w,'bad','x','EGP','Africa/Cairo'); RAISE EXCEPTION 'Case 3a did not raise';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%INVALID_AD_ACCOUNT%' THEN RAISE; END IF; END;
 BEGIN PERFORM select_meta_ads_account(w,'act_1','x','eg','Africa/Cairo'); RAISE EXCEPTION 'Case 3b did not raise';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%INVALID_AD_ACCOUNT%' THEN RAISE; END IF; END;
 BEGIN PERFORM select_meta_ads_account(w,'act_1','x','EGP',''); RAISE EXCEPTION 'Case 3c did not raise';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%INVALID_AD_ACCOUNT%' THEN RAISE; END IF; END;

 -- 4. Auto save: report stored, no error, last_manual_sync_at stays null.
 PERFORM save_meta_ads_report(w,'last_7d','act_1','{"schemaVersion":1,"n":1}'::jsonb,NULL,false);
 IF NOT EXISTS(SELECT 1 FROM meta_ads_reports WHERE workspace_id=w AND date_preset='last_7d' AND report->>'n'='1') THEN
  RAISE EXCEPTION 'Case 4 failed: report row n=1 missing';
 END IF;
 SELECT * INTO c FROM meta_ads_connections WHERE workspace_id=w;
 IF c.last_sync_error IS NOT NULL THEN RAISE EXCEPTION 'Case 4 failed: last_sync_error should be null'; END IF;
 IF c.last_manual_sync_at IS NOT NULL THEN RAISE EXCEPTION 'Case 4 failed: last_manual_sync_at should be null for auto save'; END IF;

 -- 5. Manual save: report updated to n=2, last_manual_sync_at set.
 PERFORM save_meta_ads_report(w,'last_7d','act_1','{"schemaVersion":1,"n":2}'::jsonb,NULL,true);
 IF NOT EXISTS(SELECT 1 FROM meta_ads_reports WHERE workspace_id=w AND date_preset='last_7d' AND report->>'n'='2') THEN
  RAISE EXCEPTION 'Case 5 failed: report not updated to n=2';
 END IF;
 SELECT * INTO c FROM meta_ads_connections WHERE workspace_id=w;
 IF c.last_manual_sync_at IS NULL THEN RAISE EXCEPTION 'Case 5 failed: last_manual_sync_at not set on manual save'; END IF;

 -- 6. Failed manual refresh: report unchanged, error recorded, last_manual_sync_at unchanged.
 t0 := c.last_manual_sync_at;
 PERFORM save_meta_ads_report(w,'last_7d','act_1',NULL,'auth_expired',true);
 IF NOT EXISTS(SELECT 1 FROM meta_ads_reports WHERE workspace_id=w AND date_preset='last_7d' AND report->>'n'='2') THEN
  RAISE EXCEPTION 'Case 6 failed: report changed on failed manual refresh';
 END IF;
 SELECT * INTO c FROM meta_ads_connections WHERE workspace_id=w;
 IF c.last_sync_error IS DISTINCT FROM 'auth_expired' THEN RAISE EXCEPTION 'Case 6 failed: last_sync_error not auth_expired'; END IF;
 IF c.last_manual_sync_at IS DISTINCT FROM t0 THEN RAISE EXCEPTION 'Case 6 failed: last_manual_sync_at moved on failed manual refresh'; END IF;

 -- 7. Stale account guard: save against the wrong account changes nothing.
 PERFORM save_meta_ads_report(w,'last_7d','act_OTHER','{"schemaVersion":1,"n":3}'::jsonb,NULL,false);
 IF NOT EXISTS(SELECT 1 FROM meta_ads_reports WHERE workspace_id=w AND date_preset='last_7d' AND report->>'n'='2') THEN
  RAISE EXCEPTION 'Case 7 failed: stale account changed the report';
 END IF;
 IF EXISTS(SELECT 1 FROM meta_ads_reports WHERE workspace_id=w AND report->>'n'='3') THEN
  RAISE EXCEPTION 'Case 7 failed: stale account inserted a report';
 END IF;
 SELECT * INTO c FROM meta_ads_connections WHERE workspace_id=w;
 IF c.last_sync_error IS DISTINCT FROM 'auth_expired' THEN RAISE EXCEPTION 'Case 7 failed: last_sync_error changed on stale account'; END IF;

 -- 8. Successful save clears last_sync_error and stores n=4.
 PERFORM save_meta_ads_report(w,'last_7d','act_1','{"schemaVersion":1,"n":4}'::jsonb,NULL,false);
 SELECT * INTO c FROM meta_ads_connections WHERE workspace_id=w;
 IF c.last_sync_error IS NOT NULL THEN RAISE EXCEPTION 'Case 8 failed: successful save did not clear last_sync_error'; END IF;
 IF NOT EXISTS(SELECT 1 FROM meta_ads_reports WHERE workspace_id=w AND date_preset='last_7d' AND report->>'n'='4') THEN
  RAISE EXCEPTION 'Case 8 failed: report not updated to n=4';
 END IF;

 -- 9. Account switch deletes every report row.
 PERFORM select_meta_ads_account(w,'act_2','Other','USD','UTC');
 IF EXISTS(SELECT 1 FROM meta_ads_reports WHERE workspace_id=w) THEN
  RAISE EXCEPTION 'Case 9 failed: account switch did not clear reports';
 END IF;

 -- 10. Disconnect resets the connection and leaves no reports; later writes/saves are refused.
 PERFORM disconnect_meta_ads_connection(w);
 SELECT * INTO c FROM meta_ads_connections WHERE workspace_id=w;
 IF c.status<>'disconnected' OR c.ad_account_id IS NOT NULL THEN
  RAISE EXCEPTION 'Case 10 failed: disconnect did not reset the connection';
 END IF;
 IF EXISTS(SELECT 1 FROM meta_ads_reports WHERE workspace_id=w) THEN
  RAISE EXCEPTION 'Case 10 failed: disconnect left report rows';
 END IF;
 PERFORM save_meta_ads_report(w,'last_7d','act_2','{"schemaVersion":1}'::jsonb,NULL,false);
 IF EXISTS(SELECT 1 FROM meta_ads_reports WHERE workspace_id=w) THEN
  RAISE EXCEPTION 'Case 10 failed: save after disconnect inserted a report';
 END IF;
 BEGIN PERFORM select_meta_ads_account(w,'act_2','x','USD','UTC'); RAISE EXCEPTION 'Case 10 did not raise NOT_CONNECTED';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%NOT_CONNECTED%' THEN RAISE; END IF; END;

 -- 11. Reconnect resets to pending_account with the new connection_ref.
 PERFORM upsert_meta_ads_connection(w,'ca_2');
 SELECT * INTO c FROM meta_ads_connections WHERE workspace_id=w;
 IF c.status<>'pending_account' OR c.connection_ref<>'ca_2' THEN
  RAISE EXCEPTION 'Case 11 failed: reconnect did not reset to pending_account/ca_2';
 END IF;
 RAISE NOTICE 'PASS: service-only writes, account validation, save/clear error, failed manual keeps cooldown, stale-account guard, account switch clears reports, disconnect resets';
END $$;

-- Owner reads exactly its own connection row through RLS.
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','e8888888-8888-4888-8888-888888888888',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
DO $$
DECLARE n_rows integer; n_other integer;
BEGIN
 SELECT count(*) INTO n_rows FROM (SELECT status FROM meta_ads_connections) s;
 IF n_rows<>1 THEN RAISE EXCEPTION 'RLS read failed: expected 1 meta_ads_connections row, got %', n_rows; END IF;
 SELECT count(*) INTO n_other FROM (SELECT workspace_id FROM meta_ads_connections WHERE workspace_id<>auth.uid()) o;
 IF n_other<>0 THEN RAISE EXCEPTION 'RLS leak: authenticated can see other workspaces rows'; END IF;
 RAISE NOTICE 'PASS: authenticated reads only its own meta_ads_connections row';
END $$;
ROLLBACK;