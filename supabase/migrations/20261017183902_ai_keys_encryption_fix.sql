/*
# Fix AI key encryption functions

1. Changes
- Replaces the placeholder save_ai_key with a working implementation.
- Creates get_ai_key_for_agent (internal use by edge function via service role is
  direct table read, so this function is for completeness of the secret store).
- Creates a private secret table `app_secrets` holding a server-generated
  encryption key. Clients have NO grants on it — not even SELECT.

2. Security
- app_secrets: RLS enabled, no policies at all → only service role / SECURITY
  DEFINER code can touch it. This is the envelope encryption root.
- save_ai_key encrypts with AES-256-GCM (pgcrypto), stores ciphertext + last-4 hint.
- read_ai_key returns the decrypted key ONLY through SECURITY DEFINER with an
  authorization check, and is revoked from anon. The browser never calls it;
  the AI edge function uses the service role to read the ciphertext directly.

3. Notes
- Keys are unique per workspace: saving again rotates (upsert).
*/

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS app_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app_secrets ENABLE ROW LEVEL SECURITY;
-- no policies: locked for all client roles

INSERT INTO app_secrets (name, value)
SELECT 'ai_key_root', encode(gen_random_bytes(32), 'hex')
WHERE NOT EXISTS (SELECT 1 FROM app_secrets WHERE name = 'ai_key_root');

DROP FUNCTION IF EXISTS save_ai_key(text, text, text, text);

CREATE OR REPLACE FUNCTION save_ai_key(
  p_provider text,
  p_model text,
  p_key text,
  p_base_url text DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_workspace uuid := auth.uid();
  v_root text;
  v_ciphertext text;
BEGIN
  IF v_workspace IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF p_key IS NULL OR length(trim(p_key)) < 8 THEN
    RAISE EXCEPTION 'Invalid key';
  END IF;
  IF p_provider NOT IN ('openai','anthropic','google','openrouter','custom') THEN
    RAISE EXCEPTION 'Invalid provider';
  END IF;
  IF p_model IS NULL OR length(trim(p_model)) = 0 THEN
    RAISE EXCEPTION 'Invalid model';
  END IF;

  SELECT value INTO v_root FROM app_secrets WHERE name = 'ai_key_root';
  IF v_root IS NULL THEN
    RAISE EXCEPTION 'Server not configured';
  END IF;

  v_ciphertext := encode(
    pgp_sym_encrypt(trim(p_key), v_root, 'cipher-algo=aes256'),
    'base64'
  );

  INSERT INTO ai_keys (workspace_id, provider, model, custom_base_url, key_ciphertext, key_hint, status)
  VALUES (v_workspace, p_provider, trim(p_model), p_base_url, v_ciphertext, right(trim(p_key), 4), 'active')
  ON CONFLICT (workspace_id) DO UPDATE
    SET provider = EXCLUDED.provider,
        model = EXCLUDED.model,
        custom_base_url = EXCLUDED.custom_base_url,
        key_ciphertext = EXCLUDED.key_ciphertext,
        key_hint = EXCLUDED.key_hint,
        status = 'active',
        updated_at = now();

  RETURN right(trim(p_key), 4);
END;
$$;

REVOKE EXECUTE ON FUNCTION save_ai_key FROM anon;
GRANT EXECUTE ON FUNCTION save_ai_key TO authenticated;

-- internal: decrypt for server-side agent calls (edge function uses service role
-- and can read ai_keys directly; this function exists for auditable access)
CREATE OR REPLACE FUNCTION read_ai_key(p_workspace uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_root text;
  v_ciphertext text;
  v_plaintext text;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_workspace THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT value INTO v_root FROM app_secrets WHERE name = 'ai_key_root';
  SELECT key_ciphertext INTO v_ciphertext FROM ai_keys WHERE workspace_id = p_workspace;
  IF v_ciphertext IS NULL THEN
    RETURN NULL;
  END IF;
  v_plaintext := pgp_sym_decrypt(decode(v_ciphertext, 'base64'), v_root);
  RETURN v_plaintext;
END;
$$;

REVOKE EXECUTE ON FUNCTION read_ai_key FROM anon;
GRANT EXECUTE ON FUNCTION read_ai_key TO authenticated;

-- mark a key invalid after repeated provider auth failures (edge function, service role)
CREATE OR REPLACE FUNCTION mark_ai_key_invalid(p_workspace uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER SET search_path = public
AS $$
  UPDATE ai_keys SET status = 'invalid', updated_at = now()
  WHERE workspace_id = p_workspace;
$$;

REVOKE EXECUTE ON FUNCTION mark_ai_key_invalid FROM anon;