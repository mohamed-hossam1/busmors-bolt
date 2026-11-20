-- Allow Groq in ai_keys table provider check constraint
ALTER TABLE ai_keys DROP CONSTRAINT IF EXISTS ai_keys_provider_check;
ALTER TABLE ai_keys ADD CONSTRAINT ai_keys_provider_check
  CHECK (provider IN ('openai','groq','anthropic','google','openrouter','custom'));
