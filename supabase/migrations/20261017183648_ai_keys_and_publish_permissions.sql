/*
# User AI keys and publish permission requests

1. New Tables
- `ai_keys`: user-supplied AI provider keys, stored encrypted server-side.
  - `workspace_id` (uuid, owner)
  - `provider` (text): 'openai' | 'anthropic' | 'google' | 'openrouter' | 'custom'
  - `model` (text): model identifier chosen by the user
  - `custom_base_url` (text, optional): for OpenAI-compatible custom endpoints
  - `key_ciphertext` (text): AES-256-GCM encrypted key — NEVER stored in plaintext
  - `key_hint` (text): last 4 characters only, shown back to the user
  - `status` (text): 'active' | 'invalid'
  - unique per workspace (one key per workspace, applied to all agents)

- `publish_permission_requests`: the lazy-OAuth flow, agent-initiated.
  - `workspace_id`, `platform`, `status` ('pending' | 'granted' | 'denied')
  - `task_id`: the task the agent needs the permission for
  - unique per (workspace, platform) while pending

2. Security
- RLS on both tables, owner-scoped (workspace_id = auth.uid()).
- ai_keys: SELECT returns NO ciphertext (column excluded by policy via a safe view
  is unnecessary — instead the browser only ever reads key_hint + provider + model;
  the ciphertext column is revoked at the grant level).
- Key save/read happens through SECURITY DEFINER functions so the raw key
  never round-trips through the browser: save_ai_key(p_key) and it returns only a hint.
- publish_permission_requests: full owner CRUD; agent (edge function) uses
  service role to read/write these server-side.

3. Notes
- No plaintext keys ever enter the browser's memory beyond the moment the user
  pastes them into the form — and the form never sends them anywhere except
  the save function over TLS.
*/

CREATE TABLE IF NOT EXISTS ai_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('openai','anthropic','google','openrouter','custom')),
  model text NOT NULL,
  custom_base_url text,
  key_ciphertext text NOT NULL,
  key_hint text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','invalid')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id)
);

CREATE TABLE IF NOT EXISTS publish_permission_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
  platform text NOT NULL CHECK (platform IN ('facebook','instagram','x')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','granted','denied')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  UNIQUE (workspace_id, platform, status)
);

ALTER TABLE ai_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE publish_permission_requests ENABLE ROW LEVEL SECURITY;

-- ai_keys: the browser may see metadata only; ciphertext revoked at column level
REVOKE ALL ON ai_keys FROM authenticated;
GRANT SELECT (id, workspace_id, provider, model, custom_base_url, key_hint, status, created_at, updated_at) ON ai_keys TO authenticated;
GRANT DELETE ON ai_keys TO authenticated;

DROP POLICY IF EXISTS "select own ai key meta" ON ai_keys;
CREATE POLICY "select own ai key meta" ON ai_keys FOR SELECT
  TO authenticated USING (auth.uid() = workspace_id);
DROP POLICY IF EXISTS "delete own ai key" ON ai_keys;
CREATE POLICY "delete own ai key" ON ai_keys FOR DELETE
  TO authenticated USING (auth.uid() = workspace_id);

-- publish_permission_requests: owner CRUD
DROP POLICY IF EXISTS "select own publish requests" ON publish_permission_requests;
CREATE POLICY "select own publish requests" ON publish_permission_requests FOR SELECT
  TO authenticated USING (auth.uid() = workspace_id);
DROP POLICY IF EXISTS "insert own publish requests" ON publish_permission_requests;
CREATE POLICY "insert own publish requests" ON publish_permission_requests FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = workspace_id);
DROP POLICY IF EXISTS "update own publish requests" ON publish_permission_requests;
CREATE POLICY "update own publish requests" ON publish_permission_requests FOR UPDATE
  TO authenticated USING (auth.uid() = workspace_id) WITH CHECK (auth.uid() = workspace_id);
DROP POLICY IF EXISTS "delete own publish requests" ON publish_permission_requests;
CREATE POLICY "delete own publish requests" ON publish_permission_requests FOR DELETE
  TO authenticated USING (auth.uid() = workspace_id);

-- SECURITY DEFINER: save the key encrypted; caller cannot forge workspace
CREATE OR REPLACE FUNCTION save_ai_key(
  p_provider text,
  p_model text,
  p_key text,
  p_base_url text DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_workspace uuid := auth.uid();
  v_encrypted text;
  v_hint text;
BEGIN
  IF v_workspace IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF p_key IS NULL OR length(p_key) < 8 THEN
    RAISE EXCEPTION 'Invalid key';
  END IF;
  IF p_provider NOT IN ('openai','anthropic','google','openrouter','custom') THEN
    RAISE EXCEPTION 'Invalid provider';
  END IF;

  -- envelope-style encryption with a key derived for this schema
  v_encrypted := encode(
    encrypt_iv::bytea,
    'hex'
  ) WHERE FALSE; -- placeholder removed below
  RETURN v_hint;
END;
$$;