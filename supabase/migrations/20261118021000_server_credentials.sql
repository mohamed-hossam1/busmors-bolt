-- The browser can submit a BYOK key, but cannot retrieve plaintext credentials.
REVOKE ALL ON FUNCTION read_ai_key(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION read_ai_key(uuid) TO service_role;
REVOKE ALL ON FUNCTION mark_ai_key_invalid(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mark_ai_key_invalid(uuid) TO service_role;
REVOKE ALL ON FUNCTION save_ai_key(text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION save_ai_key(text,text,text,text) TO authenticated;
