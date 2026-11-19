-- C03: setup-state must not be directly writable by the client.
-- The bootstrap/confirmation SECURITY DEFINER commands own onboarding_state,
-- confirmed_intake_version, plan, language and the region fields. Only the
-- self-serve preference columns (company_url, crawl_status, brand_colors) remain
-- directly updatable. This matches the intent stated in 20261118024000 and closes
-- the gap where onboarding_state had leaked into the column-level UPDATE grant.

REVOKE UPDATE(onboarding_state) ON workspace_settings FROM authenticated;
REVOKE UPDATE ON workspace_settings FROM anon;

-- Defensive: ensure the intended self-serve columns remain writable.
GRANT UPDATE(company_url, crawl_status, brand_colors) ON workspace_settings TO authenticated;