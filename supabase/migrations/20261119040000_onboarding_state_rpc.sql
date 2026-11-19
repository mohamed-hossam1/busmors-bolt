-- C03/C08: onboarding_state is owned by server-side logic, never direct client DML.
-- A SECURITY DEFINER command performs the setup-state transitions so the setup-state
-- stays protected (authenticated has no direct UPDATE on onboarding_state) while the
-- legitimate onboarding flow can still complete.

CREATE OR REPLACE FUNCTION set_onboarding_state(
  p_state text,
  p_company_url text DEFAULT NULL,
  p_crawl_status jsonb DEFAULT NULL
) RETURNS workspace_settings
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w uuid := auth.uid(); v workspace_settings;
BEGIN
  IF w IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF p_state IS NULL OR p_state NOT IN ('awaiting_url','crawling','review_pending','complete') THEN
    RAISE EXCEPTION 'INVALID_ONBOARDING_STATE';
  END IF;
  UPDATE workspace_settings
    SET onboarding_state = p_state,
        company_url = COALESCE(p_company_url, company_url),
        crawl_status = COALESCE(p_crawl_status, crawl_status),
        updated_at = now()
    WHERE workspace_id = w
    RETURNING * INTO v;
  IF v.workspace_id IS NULL THEN
    INSERT INTO workspace_settings(workspace_id) VALUES(w) ON CONFLICT(workspace_id) DO NOTHING;
    UPDATE workspace_settings
      SET onboarding_state = p_state,
          company_url = COALESCE(p_company_url, company_url),
          crawl_status = COALESCE(p_crawl_status, crawl_status),
          updated_at = now()
      WHERE workspace_id = w
      RETURNING * INTO v;
  END IF;
  RETURN v;
END $$;

REVOKE ALL ON FUNCTION set_onboarding_state(text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_onboarding_state(text,text,jsonb) TO authenticated;

-- Company_url and crawl_status remain directly writable (self-serve preferences).
GRANT UPDATE(company_url, crawl_status, brand_colors) ON workspace_settings TO authenticated;