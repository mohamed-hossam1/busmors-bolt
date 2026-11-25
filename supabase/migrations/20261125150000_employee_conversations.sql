-- Phase 3.5: Persistent Employee chat history.
--
-- The legacy `conversations` / `messages` tables were dropped in
-- 20261125000000_drop_legacy_employee_agent.sql. This adds a clean, additive,
-- workspace-scoped replacement dedicated to the Employee interface:
--
--   * employee_conversations: one row per chat thread (owner = workspace).
--   * employee_messages: ordered user/assistant messages with a jsonb
--     `metadata` column that carries inline card payloads (brain proposals,
--     clarification cards, deliverable/draft references) and the trace id.
--
-- Authorization mirrors the rest of the schema: a workspace is owned by the
-- authenticated user (auth.uid() = workspace_id), enforced by RLS. The server
-- always builds its Supabase client from the authenticated session, so every
-- read/write below is scoped to the caller's own workspace.

CREATE TABLE IF NOT EXISTS employee_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'محادثة جديدة',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_conversations_workspace
  ON employee_conversations(workspace_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS employee_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES employee_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant')),
  content text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_messages_conversation
  ON employee_messages(conversation_id, created_at);

-- Keep employee_conversations.updated_at fresh whenever a message is added, so
-- the chat-history sidebar can order threads by most recent activity.
CREATE OR REPLACE FUNCTION touch_employee_conversation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE employee_conversations SET updated_at = now() WHERE id = NEW.conversation_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS employee_messages_touch_conversation ON employee_messages;
CREATE TRIGGER employee_messages_touch_conversation
  AFTER INSERT ON employee_messages
  FOR EACH ROW EXECUTE FUNCTION touch_employee_conversation();

-- Row Level Security -------------------------------------------------------
ALTER TABLE employee_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select own employee conversations" ON employee_conversations;
CREATE POLICY "select own employee conversations" ON employee_conversations
  FOR SELECT TO authenticated USING (auth.uid() = workspace_id);

DROP POLICY IF EXISTS "insert own employee conversations" ON employee_conversations;
CREATE POLICY "insert own employee conversations" ON employee_conversations
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = workspace_id);

DROP POLICY IF EXISTS "update own employee conversations" ON employee_conversations;
CREATE POLICY "update own employee conversations" ON employee_conversations
  FOR UPDATE TO authenticated USING (auth.uid() = workspace_id) WITH CHECK (auth.uid() = workspace_id);

DROP POLICY IF EXISTS "delete own employee conversations" ON employee_conversations;
CREATE POLICY "delete own employee conversations" ON employee_conversations
  FOR DELETE TO authenticated USING (auth.uid() = workspace_id);

-- Messages are scoped through their parent conversation (no workspace_id column
-- on the message itself, per the Phase 3.5 schema).
DROP POLICY IF EXISTS "select own employee messages" ON employee_messages;
CREATE POLICY "select own employee messages" ON employee_messages
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM employee_conversations c
      WHERE c.id = employee_messages.conversation_id AND c.workspace_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert own employee messages" ON employee_messages;
CREATE POLICY "insert own employee messages" ON employee_messages
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM employee_conversations c
      WHERE c.id = employee_messages.conversation_id AND c.workspace_id = auth.uid())
  );

DROP POLICY IF EXISTS "update own employee messages" ON employee_messages;
CREATE POLICY "update own employee messages" ON employee_messages
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM employee_conversations c
      WHERE c.id = employee_messages.conversation_id AND c.workspace_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM employee_conversations c
      WHERE c.id = employee_messages.conversation_id AND c.workspace_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete own employee messages" ON employee_messages;
CREATE POLICY "delete own employee messages" ON employee_messages
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM employee_conversations c
      WHERE c.id = employee_messages.conversation_id AND c.workspace_id = auth.uid())
  );