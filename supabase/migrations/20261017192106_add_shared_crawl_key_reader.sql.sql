-- Shared business AI key used ONLY for onboarding crawls (all workspaces).
-- Stored as plaintext in the locked app_secrets table (RLS on, no policies:
-- only service role / SECURITY DEFINER code can read it). Clients never see it.

CREATE OR REPLACE FUNCTION read_shared_crawl_key()
RETURNS text
LANGUAGE sql
SECURITY DEFINER SET search_path = public
AS $$
  SELECT value FROM app_secrets WHERE name = 'shared_crawl_key';
$$;

REVOKE EXECUTE ON FUNCTION read_shared_crawl_key FROM anon, authenticated;
