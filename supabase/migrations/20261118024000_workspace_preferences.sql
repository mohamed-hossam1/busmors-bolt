-- Region preferences remain independent of the English-only product language.
CREATE FUNCTION save_workspace_preferences(p_country text,p_currency text,p_timezone text,p_target_market text,p_expected_updated_at timestamptz)
RETURNS workspace_settings LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w uuid:=auth.uid(); s workspace_settings;
BEGIN
 IF w IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 IF p_country IS NULL OR length(btrim(p_country))>100 OR p_target_market IS NULL OR length(btrim(p_target_market))>300
  OR p_currency IS NULL OR p_currency !~ '^([A-Z]{3})?$'
  OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=p_timezone) THEN RAISE EXCEPTION 'INVALID_REGION'; END IF;
 SELECT * INTO s FROM workspace_settings WHERE workspace_id=w FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'WORKSPACE_NOT_READY'; END IF;
 IF s.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'STALE_VERSION'; END IF;
 UPDATE workspace_settings SET country=btrim(p_country),currency=p_currency,timezone=p_timezone,target_market=btrim(p_target_market),updated_at=clock_timestamp()
 WHERE workspace_id=w RETURNING * INTO s;
 INSERT INTO audit_log(workspace_id,actor_id,action,entity_type,entity_id,details)
 VALUES(w,w,'region_preferences_saved','workspace',w,jsonb_build_object('country',s.country,'currency',s.currency,'timezone',s.timezone,'targetMarket',s.target_market));
 RETURN s;
END $$;
REVOKE ALL ON FUNCTION save_workspace_preferences(text,text,text,text,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION save_workspace_preferences(text,text,text,text,timestamptz) TO authenticated;
-- The bootstrap and confirmation commands own onboarding state.
REVOKE INSERT,UPDATE,DELETE ON workspace_settings FROM authenticated;
GRANT UPDATE(company_url,crawl_status,brand_colors) ON workspace_settings TO authenticated;
