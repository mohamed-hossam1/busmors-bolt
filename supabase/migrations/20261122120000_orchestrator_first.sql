-- Orchestrator-first message flow.
--
-- Every user message is handled by the Orchestrator before any Task exists.
-- Paths A (direct) and B (Brain) never create a Task, so their canvas events and
-- reply must be persistable at the conversation level. This migration:
--   1. makes agent_events.task_id nullable and adds conversation_id so the Canvas
--      can render task-less orchestration (Orchestrator, Brain tool) as well as
--      task-scoped Director execution in one stream,
--   2. adds orchestrator_runs for idempotency + latency metrics,
--   3. adds owner-scoped RPCs to append messages/events and read them back.
-- The existing task tables, RLS and RPCs are untouched.

-- 1. Conversation-scoped events -------------------------------------------------
ALTER TABLE agent_events ALTER COLUMN task_id DROP NOT NULL;
ALTER TABLE agent_events ADD COLUMN IF NOT EXISTS conversation_id uuid;
ALTER TABLE agent_events
  ADD CONSTRAINT agent_events_conversation_id_owner_fk
  FOREIGN KEY (workspace_id, conversation_id)
  REFERENCES conversations(workspace_id, id) ON DELETE CASCADE
  DEFERRABLE INITIALLY DEFERRED NOT VALID;
CREATE INDEX IF NOT EXISTS idx_agent_events_conversation ON agent_events(conversation_id, seq);
CREATE UNIQUE INDEX IF NOT EXISTS event_conversation_sequence
  ON agent_events(conversation_id, seq) WHERE conversation_id IS NOT NULL;

-- 2. Orchestrator idempotency + metrics ----------------------------------------
CREATE TABLE IF NOT EXISTS orchestrator_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,
  idempotency_key uuid NOT NULL,
  request_hash text NOT NULL,
  outcome text NOT NULL,
  path text,
  task_id uuid,
  message_id uuid,
  reply text NOT NULL DEFAULT '',
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, idempotency_key),
  UNIQUE(workspace_id, id),
  FOREIGN KEY (workspace_id, conversation_id) REFERENCES conversations(workspace_id, id) ON DELETE CASCADE
);
ALTER TABLE orchestrator_runs ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS orchestrator_runs_workspace_idx ON orchestrator_runs(workspace_id, created_at);
DROP POLICY IF EXISTS "owner read" ON orchestrator_runs;
CREATE POLICY "owner read" ON orchestrator_runs FOR SELECT TO authenticated USING(workspace_id=auth.uid());
REVOKE ALL ON orchestrator_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON orchestrator_runs TO authenticated;
GRANT ALL ON orchestrator_runs TO service_role;

-- 3. Owner-scoped RPCs ---------------------------------------------------------

-- Append a chat message on behalf of the authenticated owner.
CREATE OR REPLACE FUNCTION append_conversation_message(
  p_conversation_id uuid, p_role text, p_type text, p_content text, p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w uuid:=auth.uid(); v_id uuid;
BEGIN
  IF w IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF NOT EXISTS(SELECT 1 FROM conversations WHERE workspace_id=w AND id=p_conversation_id) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF p_role IS NULL OR p_role NOT IN ('user','agent','system') THEN RAISE EXCEPTION 'INVALID_ROLE'; END IF;
  IF p_type IS NULL OR p_type NOT IN ('text','text_response','form','structured_form','task_status','deliverable_card','knowledge_notification','budget_extension_request','error','post_reference') THEN RAISE EXCEPTION 'INVALID_TYPE'; END IF;
  IF length(coalesce(p_content,'')) > 16000 THEN RAISE EXCEPTION 'INVALID_CONTENT'; END IF;
  INSERT INTO messages(workspace_id, conversation_id, role, type, content, payload)
    VALUES(w, p_conversation_id, p_role, p_type, p_content, coalesce(p_payload,'{}'::jsonb))
    RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- Append one conversation-scoped canvas event (no task). Per-conversation
-- ordering is serialized so seq is monotonic and the replay is stable.
CREATE OR REPLACE FUNCTION record_conversation_event(
  p_conversation_id uuid, p_instance_id uuid, p_event_type text, p_agent_id text, p_agent_role text,
  p_label text, p_status text, p_public_message text, p_parameters jsonb,
  p_failure_reason text, p_started_at timestamptz, p_ended_at timestamptz
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w uuid:=auth.uid(); v_seq bigint; v_id uuid;
BEGIN
  IF w IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF NOT EXISTS(SELECT 1 FROM conversations WHERE workspace_id=w AND id=p_conversation_id) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF p_event_type IS NULL OR p_event_type NOT IN ('agent_started','agent_completed','agent_error','tool_call','skill_read','delegation','flow_connection')
    OR length(coalesce(p_agent_id,'')) NOT BETWEEN 1 AND 60
    OR length(coalesce(p_label,'')) NOT BETWEEN 1 AND 200
    OR p_status IS NULL OR p_status NOT IN ('queued','running','completed','partial','failed')
    OR length(coalesce(p_public_message,''))>1000 OR length(coalesce(p_failure_reason,''))>1000
    OR length(coalesce(p_parameters::text,''))>20000 THEN
    RAISE EXCEPTION 'INVALID_EVENT';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('conv:'||p_conversation_id::text,0));
  SELECT coalesce(max(seq),0)+1 INTO v_seq FROM agent_events WHERE conversation_id=p_conversation_id;
  INSERT INTO agent_events(workspace_id, task_id, conversation_id, instance_id, seq, event_type, agent_id, agent_role,
    public_message, redacted_parameters, failure_reason, started_at, ended_at, payload)
    VALUES(w, NULL, p_conversation_id, coalesce(p_instance_id, gen_random_uuid()), v_seq, p_event_type,
      p_agent_id, coalesce(p_agent_role,'subagent'), coalesce(p_public_message,''), coalesce(p_parameters,'{}'::jsonb),
      p_failure_reason, coalesce(p_started_at, now()), p_ended_at,
      jsonb_build_object('task_summary', p_label, 'label', p_label, 'agent_role', coalesce(p_agent_role,'subagent'),
        'status', p_status, 'public_message', coalesce(p_public_message,'')))
    RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- Read a prior orchestration for idempotent replay.
CREATE OR REPLACE FUNCTION find_orchestrator_run(p_idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w uuid:=auth.uid(); r orchestrator_runs;
BEGIN
  IF w IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  SELECT * INTO r FROM orchestrator_runs WHERE workspace_id=w AND idempotency_key=p_idempotency_key;
  IF r.id IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('outcome',r.outcome,'path',r.path,'taskId',r.task_id,'messageId',r.message_id,
    'reply',r.reply,'metrics',r.metrics);
END $$;

-- Idempotently record one orchestration outcome + latency metrics.
CREATE OR REPLACE FUNCTION record_orchestrator_run(
  p_conversation_id uuid, p_idempotency_key uuid, p_request_hash text, p_outcome text, p_path text,
  p_task_id uuid, p_message_id uuid, p_reply text, p_metrics jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w uuid:=auth.uid(); r orchestrator_runs;
BEGIN
  IF w IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF p_idempotency_key IS NULL OR length(coalesce(p_request_hash,'')) NOT BETWEEN 1 AND 128
    OR p_outcome IS NULL OR length(coalesce(p_reply,''))>16000 THEN RAISE EXCEPTION 'INVALID_RUN'; END IF;
  IF NOT EXISTS(SELECT 1 FROM conversations WHERE workspace_id=w AND id=p_conversation_id) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  SELECT * INTO r FROM orchestrator_runs WHERE workspace_id=w AND idempotency_key=p_idempotency_key;
  IF r.id IS NOT NULL THEN
    IF r.request_hash IS DISTINCT FROM p_request_hash THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
    RETURN jsonb_build_object('outcome',r.outcome,'path',r.path,'taskId',r.task_id,'messageId',r.message_id,
      'reply',r.reply,'metrics',r.metrics);
  END IF;
  INSERT INTO orchestrator_runs(workspace_id, conversation_id, idempotency_key, request_hash, outcome, path, task_id, message_id, reply, metrics)
    VALUES(w, p_conversation_id, p_idempotency_key, p_request_hash, p_outcome, p_path, p_task_id, p_message_id, coalesce(p_reply,''), coalesce(p_metrics,'{}'::jsonb))
    RETURNING * INTO r;
  RETURN jsonb_build_object('outcome',r.outcome,'path',r.path,'taskId',r.task_id,'messageId',r.message_id,
    'reply',r.reply,'metrics',r.metrics);
END $$;

-- Unified conversation event stream: task-less orchestration events plus the
-- events of every task in this conversation, ordered for replay.
CREATE OR REPLACE FUNCTION list_conversation_events(p_conversation_id uuid)
RETURNS SETOF agent_events LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  SELECT e.* FROM agent_events e
  WHERE e.workspace_id = auth.uid() AND (
    e.conversation_id = p_conversation_id
    OR e.task_id IN (SELECT t.id FROM tasks t WHERE t.workspace_id = auth.uid() AND t.conversation_id = p_conversation_id)
  )
  ORDER BY e.created_at ASC, e.seq ASC;
$$;

REVOKE ALL ON FUNCTION append_conversation_message(uuid,text,text,text,jsonb),
  record_conversation_event(uuid,uuid,text,text,text,text,text,text,jsonb,text,timestamptz,timestamptz),
  find_orchestrator_run(uuid), record_orchestrator_run(uuid,uuid,text,text,text,uuid,uuid,text,jsonb),
  list_conversation_events(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION append_conversation_message(uuid,text,text,text,jsonb),
  record_conversation_event(uuid,uuid,text,text,text,text,text,text,jsonb,text,timestamptz,timestamptz),
  find_orchestrator_run(uuid), record_orchestrator_run(uuid,uuid,text,text,text,uuid,uuid,text,jsonb),
  list_conversation_events(uuid) TO authenticated;