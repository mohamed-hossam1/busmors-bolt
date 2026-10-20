/*
# BusMora core schema

1. New Tables
- `workspaces`: one private workspace per user account (id = auth.users.id).
- `workspace_settings`: onboarding state, company URL, brand colors, language, plan.
- `brain_nodes`: Business Brain concept graph nodes (9 canonical categories), with
  candidate/approved/rejected/retired lifecycle, source provenance, and properties JSON.
- `brain_edges`: semantic relationship edges between nodes (TARGETS, COMPETES_WITH,
  HAS_TONE, SOLVES_PAIN_POINT, RELATED_TO) with status lifecycle.
- `conversations` + `messages`: Marketing Employee chat threads, structured forms,
  deliverable cards, notifications (JSON payloads).
- `tasks`: agent tasks with status, type, plan (JSON), result summary.
- `agent_events`: canvas events per task with monotonic seq for replay.
- `deliverables`: saved outputs (reports, calendars, diagnoses, content).
- `planned_posts`: posts with approval state machine, scheduled time, idempotency key,
  read-back result.
- `platform_connections`: connected social accounts (facebook/instagram/x).
- `audit_log`: append-only record of every knowledge and approval action.

2. Security
- RLS enabled on every table.
- Owner-scoped policies TO authenticated keyed on workspace ownership
  (workspace id = auth.uid()).
- audit_log is append-only: insert + select only.

3. Notes
- No cross-tenant access is possible: every policy joins on auth.uid().
- planned_posts.idempotency_key ensures retries never duplicate a publish.
*/

CREATE TABLE IF NOT EXISTS workspaces (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'My Company',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspace_settings (
  workspace_id uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  company_url text,
  language text NOT NULL DEFAULT 'en' CHECK (language IN ('en','ar')),
  onboarding_state text NOT NULL DEFAULT 'awaiting_url'
    CHECK (onboarding_state IN ('awaiting_url','crawling','review_pending','complete')),
  crawl_status jsonb NOT NULL DEFAULT '{}'::jsonb,
  brand_colors jsonb NOT NULL DEFAULT '{"primary":"#0F766E","accent":"#F59E0B"}'::jsonb,
  plan text NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter','growth','scale')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS brain_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN (
    'company_profile','offering','audience','brand_rule','positioning',
    'strategic_goal','channel','competitor','company_fact')),
  title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'candidate'
    CHECK (status IN ('candidate','approved','rejected','retired')),
  source text NOT NULL DEFAULT 'crawler'
    CHECK (source IN ('crawler','conversation','task','manual')),
  source_detail text,
  confidence numeric(3,2) NOT NULL DEFAULT 0.8,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_brain_nodes_workspace ON brain_nodes(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_brain_nodes_category ON brain_nodes(workspace_id, category);

CREATE TABLE IF NOT EXISTS brain_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_node_id uuid NOT NULL REFERENCES brain_nodes(id) ON DELETE CASCADE,
  target_node_id uuid NOT NULL REFERENCES brain_nodes(id) ON DELETE CASCADE,
  relation_type text NOT NULL CHECK (relation_type IN (
    'TARGETS','COMPETES_WITH','HAS_TONE','SOLVES_PAIN_POINT','RELATED_TO')),
  status text NOT NULL DEFAULT 'candidate'
    CHECK (status IN ('candidate','approved','rejected','retired')),
  weight numeric(3,2) NOT NULL DEFAULT 0.8,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT no_self_edge CHECK (source_node_id <> target_node_id)
);
CREATE INDEX IF NOT EXISTS idx_brain_edges_source ON brain_edges(source_node_id);
CREATE INDEX IF NOT EXISTS idx_brain_edges_target ON brain_edges(target_node_id);

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'New conversation',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_conversations_workspace ON conversations(workspace_id, created_at);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','agent','system')),
  type text NOT NULL DEFAULT 'text' CHECK (type IN (
    'text','form','task_status','deliverable_card','knowledge_notification','error')),
  content text NOT NULL DEFAULT '',
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN (
    'simple_answer','clarification','market_research','competitor_analysis',
    'content_creation','campaign_planning','performance_diagnosis','publishing')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending','running','awaiting_input','completed','failed')),
  user_request text NOT NULL DEFAULT '',
  plan jsonb NOT NULL DEFAULT '[]'::jsonb,
  result_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON tasks(workspace_id, created_at);

CREATE TABLE IF NOT EXISTS agent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  seq bigint NOT NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'agent_started','agent_tool_used','agent_completed','agent_error','flow_connection')),
  agent_id text NOT NULL DEFAULT 'orchestrator',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agent_events_task ON agent_events(task_id, seq);

CREATE TABLE IF NOT EXISTS deliverables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
  title text NOT NULL,
  type text NOT NULL DEFAULT 'general' CHECK (type IN (
    'research_report','competitor_analysis','content_posts','content_calendar',
    'performance_diagnosis','general')),
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_deliverables_workspace ON deliverables(workspace_id, created_at);

CREATE TABLE IF NOT EXISTS planned_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  deliverable_id uuid REFERENCES deliverables(id) ON DELETE SET NULL,
  task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
  platform text NOT NULL CHECK (platform IN ('facebook','instagram','x')),
  caption text NOT NULL,
  hashtags text NOT NULL DEFAULT '',
  image_url text,
  status text NOT NULL DEFAULT 'pending_approval' CHECK (status IN (
    'draft','pending_approval','approved','rejected','scheduled',
    'publishing','published','failed')),
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  idempotency_key uuid NOT NULL DEFAULT gen_random_uuid(),
  publish_result jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_planned_posts_workspace ON planned_posts(workspace_id, status);

CREATE TABLE IF NOT EXISTS platform_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('facebook','instagram','x')),
  account_name text NOT NULL DEFAULT '',
  external_account_id text,
  status text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected','expired','disconnected')),
  connected_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, platform)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_workspace ON audit_log(workspace_id, created_at);

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliverables ENABLE ROW LEVEL SECURITY;
ALTER TABLE planned_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select own workspace" ON workspaces;
CREATE POLICY "select own workspace" ON workspaces FOR SELECT
  TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "insert own workspace" ON workspaces;
CREATE POLICY "insert own workspace" ON workspaces FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "select own settings" ON workspace_settings;
CREATE POLICY "select own settings" ON workspace_settings FOR SELECT
  TO authenticated USING (auth.uid() = workspace_id);
DROP POLICY IF EXISTS "insert own settings" ON workspace_settings;
CREATE POLICY "insert own settings" ON workspace_settings FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = workspace_id);
DROP POLICY IF EXISTS "update own settings" ON workspace_settings;
CREATE POLICY "update own settings" ON workspace_settings FOR UPDATE
  TO authenticated USING (auth.uid() = workspace_id) WITH CHECK (auth.uid() = workspace_id);

DROP POLICY IF EXISTS "select own nodes" ON brain_nodes;
CREATE POLICY "select own nodes" ON brain_nodes FOR SELECT
  TO authenticated USING (auth.uid() = workspace_id);
DROP POLICY IF EXISTS "insert own nodes" ON brain_nodes;
CREATE POLICY "insert own nodes" ON brain_nodes FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = workspace_id);
DROP POLICY IF EXISTS "update own nodes" ON brain_nodes;
CREATE POLICY "update own nodes" ON brain_nodes FOR UPDATE
  TO authenticated USING (auth.uid() = workspace_id) WITH CHECK (auth.uid() = workspace_id);
DROP POLICY IF EXISTS "delete own nodes" ON brain_nodes;
CREATE POLICY "delete own nodes" ON brain_nodes FOR DELETE
  TO authenticated USING (auth.uid() = workspace_id);

DROP POLICY IF EXISTS "select own edges" ON brain_edges;
CREATE POLICY "select own edges" ON brain_edges FOR SELECT
  TO authenticated USING (auth.uid() = workspace_id);
DROP POLICY IF EXISTS "insert own edges" ON brain_edges;
CREATE POLICY "insert own edges" ON brain_edges FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = workspace_id);
DROP POLICY IF EXISTS "update own edges" ON brain_edges;
CREATE POLICY "update own edges" ON brain_edges FOR UPDATE
  TO authenticated USING (auth.uid() = workspace_id) WITH CHECK (auth.uid() = workspace_id);
DROP POLICY IF EXISTS "delete own edges" ON brain_edges;
CREATE POLICY "delete own edges" ON brain_edges FOR DELETE
  TO authenticated USING (auth.uid() = workspace_id);

DROP POLICY IF EXISTS "select own conversations" ON conversations;
CREATE POLICY "select own conversations" ON conversations FOR SELECT
  TO authenticated USING (auth.uid() = workspace_id);
DROP POLICY IF EXISTS "insert own conversations" ON conversations;
CREATE POLICY "insert own conversations" ON conversations FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = workspace_id);
DROP POLICY IF EXISTS "delete own conversations" ON conversations;
CREATE POLICY "delete own conversations" ON conversations FOR DELETE
  TO authenticated USING (auth.uid() = workspace_id);

DROP POLICY IF EXISTS "select own messages" ON messages;
CREATE POLICY "select own messages" ON messages FOR SELECT
  TO authenticated USING (auth.uid() = workspace_id);
DROP POLICY IF EXISTS "insert own messages" ON messages;
CREATE POLICY "insert own messages" ON messages FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = workspace_id);
DROP POLICY IF EXISTS "update own messages" ON messages;
CREATE POLICY "update own messages" ON messages FOR UPDATE
  TO authenticated USING (auth.uid() = workspace_id) WITH CHECK (auth.uid() = workspace_id);
DROP POLICY IF EXISTS "delete own messages" ON messages;
CREATE POLICY "delete own messages" ON messages FOR DELETE
  TO authenticated USING (auth.uid() = workspace_id);

DROP POLICY IF EXISTS "select own tasks" ON tasks;
CREATE POLICY "select own tasks" ON tasks FOR SELECT
  TO authenticated USING (auth.uid() = workspace_id);
DROP POLICY IF EXISTS "insert own tasks" ON tasks;
CREATE POLICY "insert own tasks" ON tasks FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = workspace_id);
DROP POLICY IF EXISTS "update own tasks" ON tasks;
CREATE POLICY "update own tasks" ON tasks FOR UPDATE
  TO authenticated USING (auth.uid() = workspace_id) WITH CHECK (auth.uid() = workspace_id);

DROP POLICY IF EXISTS "select own agent events" ON agent_events;
CREATE POLICY "select own agent events" ON agent_events FOR SELECT
  TO authenticated USING (auth.uid() = workspace_id);
DROP POLICY IF EXISTS "insert own agent events" ON agent_events;
CREATE POLICY "insert own agent events" ON agent_events FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = workspace_id);

DROP POLICY IF EXISTS "select own deliverables" ON deliverables;
CREATE POLICY "select own deliverables" ON deliverables FOR SELECT
  TO authenticated USING (auth.uid() = workspace_id);
DROP POLICY IF EXISTS "insert own deliverables" ON deliverables;
CREATE POLICY "insert own deliverables" ON deliverables FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = workspace_id);
DROP POLICY IF EXISTS "update own deliverables" ON deliverables;
CREATE POLICY "update own deliverables" ON deliverables FOR UPDATE
  TO authenticated USING (auth.uid() = workspace_id) WITH CHECK (auth.uid() = workspace_id);
DROP POLICY IF EXISTS "delete own deliverables" ON deliverables;
CREATE POLICY "delete own deliverables" ON deliverables FOR DELETE
  TO authenticated USING (auth.uid() = workspace_id);

DROP POLICY IF EXISTS "select own posts" ON planned_posts;
CREATE POLICY "select own posts" ON planned_posts FOR SELECT
  TO authenticated USING (auth.uid() = workspace_id);
DROP POLICY IF EXISTS "insert own posts" ON planned_posts;
CREATE POLICY "insert own posts" ON planned_posts FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = workspace_id);
DROP POLICY IF EXISTS "update own posts" ON planned_posts;
CREATE POLICY "update own posts" ON planned_posts FOR UPDATE
  TO authenticated USING (auth.uid() = workspace_id) WITH CHECK (auth.uid() = workspace_id);
DROP POLICY IF EXISTS "delete own posts" ON planned_posts;
CREATE POLICY "delete own posts" ON planned_posts FOR DELETE
  TO authenticated USING (auth.uid() = workspace_id);

DROP POLICY IF EXISTS "select own connections" ON platform_connections;
CREATE POLICY "select own connections" ON platform_connections FOR SELECT
  TO authenticated USING (auth.uid() = workspace_id);
DROP POLICY IF EXISTS "insert own connections" ON platform_connections;
CREATE POLICY "insert own connections" ON platform_connections FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = workspace_id);
DROP POLICY IF EXISTS "update own connections" ON platform_connections;
CREATE POLICY "update own connections" ON platform_connections FOR UPDATE
  TO authenticated USING (auth.uid() = workspace_id) WITH CHECK (auth.uid() = workspace_id);
DROP POLICY IF EXISTS "delete own connections" ON platform_connections;
CREATE POLICY "delete own connections" ON platform_connections FOR DELETE
  TO authenticated USING (auth.uid() = workspace_id);

DROP POLICY IF EXISTS "select own audit log" ON audit_log;
CREATE POLICY "select own audit log" ON audit_log FOR SELECT
  TO authenticated USING (auth.uid() = workspace_id);
DROP POLICY IF EXISTS "insert own audit log" ON audit_log;
CREATE POLICY "insert own audit log" ON audit_log FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = workspace_id);