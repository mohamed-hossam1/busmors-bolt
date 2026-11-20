/*
# Allow Groq as an AI provider

1. Modified functions
- `save_ai_key`: the provider allow-list now includes `groq`, matching the
  provider dropdown in the Settings screen. Previously a Groq API key was
  rejected with "Invalid provider", which surfaced as "Could not save the key".
2. Security
- Unchanged: the function stays SECURITY DEFINER, executable only by the
  `authenticated` role, and still encrypts the key server-side.
*/

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
  IF p_provider NOT IN ('openai','groq','anthropic','google','openrouter','custom') THEN
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

ALTER TABLE ai_keys DROP CONSTRAINT IF EXISTS ai_keys_provider_check;
ALTER TABLE ai_keys ADD CONSTRAINT ai_keys_provider_check
  CHECK (provider IN ('openai','groq','anthropic','google','openrouter','custom'));

