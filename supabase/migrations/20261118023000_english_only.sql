-- Owner scope change, 18 November 2026: English-only product and generation.
-- Normalize preferences without rewriting or deleting any business content.
ALTER TABLE workspace_settings DROP CONSTRAINT IF EXISTS workspace_settings_language_check;
ALTER TABLE workspace_settings DROP CONSTRAINT IF EXISTS workspace_settings_ui_language_check;
ALTER TABLE workspace_settings DROP CONSTRAINT IF EXISTS workspace_settings_conversation_language_check;
ALTER TABLE workspace_settings DROP CONSTRAINT IF EXISTS workspace_settings_content_register_check;
UPDATE workspace_settings SET language='en',ui_language='en',conversation_language='en',content_register='english';
ALTER TABLE workspace_settings
  ADD CONSTRAINT workspace_settings_language_check CHECK(language='en'),
  ADD CONSTRAINT workspace_settings_ui_language_check CHECK(ui_language='en'),
  ADD CONSTRAINT workspace_settings_conversation_language_check CHECK(conversation_language='en'),
  ADD CONSTRAINT workspace_settings_content_register_check CHECK(content_register='english');
