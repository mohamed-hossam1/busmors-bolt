/*
# Replace demo platform connections with real OAuth

1. Plain-English explanation
   The "Connect" buttons on the settings page used to create fake demo
   connections (account names like "demo-facebook-account") with an
   "Approved" badge, without ever talking to Facebook/Instagram/X. This
   migration prepares the database for REAL connections:

   - Adds `oauth_state` (text): a one-time code used during the OAuth
     handshake so the callback can be verified against this workspace.
     NULL for platforms not yet linked.
   - Adds `external_username` (text): the real handle/page name returned
     by the platform (e.g. "@mybrand"), shown in the UI after connecting.
   - Adds `token_expires_at` (timestamptz): when the platform access token
     expires; the app shows "expired" and asks to reconnect when past.
   - Deletes any existing demo rows (account names starting with "demo-")
     so users start from a clean, truthful state.

2. Modified tables
   - `platform_connections`: new columns `oauth_state`, `external_username`,
     `token_expires_at`; demo rows removed.

3. Security
   - No policy changes: the existing owner-scoped RLS policies
     (select/insert/update/delete by auth.uid() = workspace_id) still apply.
   - OAuth access tokens are NEVER stored in this table — they live in the
     server-side `app_secrets` table (service-role only). The browser can
     only read non-secret metadata.

4. Important notes
   - `status` semantics change: 'connected' now means a real OAuth
     connection completed and the token is valid.
*/

-- remove fake demo rows created by the old stub
DELETE FROM platform_connections WHERE account_name LIKE 'demo-%';

ALTER TABLE platform_connections
  ADD COLUMN IF NOT EXISTS oauth_state text,
  ADD COLUMN IF NOT EXISTS external_username text,
  ADD COLUMN IF NOT EXISTS token_expires_at timestamptz;
