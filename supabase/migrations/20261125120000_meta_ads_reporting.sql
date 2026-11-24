-- Meta Ads reporting (read-only). One ad account per workspace via the Composio 'metaads' toolkit.
-- Only timestamptz values written with now(); no day/month arithmetic (see plan: timezone rule).
CREATE TABLE meta_ads_connections (
  workspace_id uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  connection_ref text,
  status text NOT NULL DEFAULT 'pending_account' CHECK (status IN ('pending_account','connected','disconnected')),
  ad_account_id text CHECK (ad_account_id IS NULL OR ad_account_id ~ '^act_[0-9]{1,30}$'),
  ad_account_name text,
  currency text CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  timezone_name text CHECK (timezone_name IS NULL OR length(timezone_name) BETWEEN 1 AND 64),
  last_manual_sync_at timestamptz,
  last_sync_error text,
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE meta_ads_reports (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  date_preset text NOT NULL CHECK (date_preset IN ('last_7d','last_30d')),
  ad_account_id text NOT NULL,
  report jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, date_preset)
);
ALTER TABLE meta_ads_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_ads_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner read" ON meta_ads_connections FOR SELECT TO authenticated USING (workspace_id = auth.uid());
CREATE POLICY "owner read" ON meta_ads_reports FOR SELECT TO authenticated USING (workspace_id = auth.uid());
REVOKE ALL ON meta_ads_connections, meta_ads_reports FROM PUBLIC, anon, authenticated;
-- connection_ref is never readable by the browser: column-level grant that omits it.
GRANT SELECT (workspace_id, status, ad_account_id, ad_account_name, currency, timezone_name, last_manual_sync_at, last_sync_error, connected_at, updated_at) ON meta_ads_connections TO authenticated;
GRANT SELECT ON meta_ads_reports TO authenticated;
GRANT ALL ON meta_ads_connections, meta_ads_reports TO service_role;

-- Connect or switch the Composio account. Any switch clears the chosen ad account,
-- its cached reports and the manual-sync cooldown, and returns to pending_account.
CREATE FUNCTION upsert_meta_ads_connection(p_workspace_id uuid, p_connection_ref text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF p_workspace_id IS NULL OR coalesce(p_connection_ref,'')='' THEN RAISE EXCEPTION 'INVALID_CONNECTION'; END IF;
 INSERT INTO meta_ads_connections(workspace_id,connection_ref,status)
  VALUES(p_workspace_id,p_connection_ref,'pending_account')
 ON CONFLICT (workspace_id) DO UPDATE SET
  connection_ref=EXCLUDED.connection_ref,
  status='pending_account',
  ad_account_id=NULL,
  ad_account_name=NULL,
  currency=NULL,
  timezone_name=NULL,
  last_manual_sync_at=NULL,
  last_sync_error=NULL,
  connected_at=now(),
  updated_at=now();
 DELETE FROM meta_ads_reports WHERE workspace_id=p_workspace_id;
END $$;

-- Choose the ad account to report on. Refuses a disconnected workspace; a different
-- account clears the cached reports so no stale rows survive an account switch.
CREATE FUNCTION select_meta_ads_account(p_workspace_id uuid, p_ad_account_id text, p_name text, p_currency text, p_timezone text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE stored_id text;
BEGIN
 IF coalesce(p_ad_account_id,'') !~ '^act_[0-9]{1,30}$'
    OR coalesce(p_currency,'') !~ '^[A-Z]{3}$'
    OR coalesce(length(p_timezone),0) NOT BETWEEN 1 AND 64 THEN
  RAISE EXCEPTION 'INVALID_AD_ACCOUNT';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM meta_ads_connections WHERE workspace_id=p_workspace_id AND status IN ('pending_account','connected')) THEN
  RAISE EXCEPTION 'NOT_CONNECTED';
 END IF;
 SELECT ad_account_id INTO stored_id FROM meta_ads_connections WHERE workspace_id=p_workspace_id;
 IF stored_id IS DISTINCT FROM p_ad_account_id THEN
  DELETE FROM meta_ads_reports WHERE workspace_id=p_workspace_id;
 END IF;
 UPDATE meta_ads_connections SET
  ad_account_id=p_ad_account_id,
  ad_account_name=coalesce(nullif(p_name,''),p_ad_account_id),
  currency=p_currency,
  timezone_name=p_timezone,
  status='connected',
  last_sync_error=NULL,
  updated_at=now()
 WHERE workspace_id=p_workspace_id;
END $$;

-- Cache one report for a preset. A stale sync (wrong/old account) does nothing. A
-- failed sync (p_report IS NULL) keeps the old report and leaves last_manual_sync_at
-- untouched, so a failed Refresh can be retried immediately without a cooldown.
CREATE FUNCTION save_meta_ads_report(p_workspace_id uuid, p_date_preset text, p_ad_account_id text, p_report jsonb, p_error text, p_manual boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM meta_ads_connections WHERE workspace_id=p_workspace_id AND status='connected' AND ad_account_id=p_ad_account_id) THEN
  RETURN;
 END IF;
 IF p_report IS NOT NULL THEN
  INSERT INTO meta_ads_reports(workspace_id,date_preset,ad_account_id,report,fetched_at)
   VALUES(p_workspace_id,p_date_preset,p_ad_account_id,p_report,now())
  ON CONFLICT (workspace_id, date_preset) DO UPDATE SET
   ad_account_id=EXCLUDED.ad_account_id,
   report=EXCLUDED.report,
   fetched_at=now();
 END IF;
 UPDATE meta_ads_connections SET
  last_sync_error=p_error,
  last_manual_sync_at=CASE WHEN p_manual AND p_report IS NOT NULL THEN now() ELSE last_manual_sync_at END,
  updated_at=now()
 WHERE workspace_id=p_workspace_id;
END $$;

-- Disconnect: reset the connection to disconnected and drop every cached report.
CREATE FUNCTION disconnect_meta_ads_connection(p_workspace_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE meta_ads_connections SET
  status='disconnected',
  ad_account_id=NULL,
  ad_account_name=NULL,
  currency=NULL,
  timezone_name=NULL,
  updated_at=now()
 WHERE workspace_id=p_workspace_id;
 DELETE FROM meta_ads_reports WHERE workspace_id=p_workspace_id;
END $$;

REVOKE ALL ON FUNCTION upsert_meta_ads_connection(uuid,text),
  select_meta_ads_account(uuid,text,text,text,text),
  save_meta_ads_report(uuid,text,text,jsonb,text,boolean),
  disconnect_meta_ads_connection(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION upsert_meta_ads_connection(uuid,text),
  select_meta_ads_account(uuid,text,text,text,text),
  save_meta_ads_report(uuid,text,text,jsonb,text,boolean),
  disconnect_meta_ads_connection(uuid) TO service_role;