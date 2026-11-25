-- Admin execution observability (Phase 1).
--
-- Capture-once, read-many execution traces for the internal admin dashboard.
-- Customer request paths never await this data: the collector buffers a bounded,
-- allow-listed projection in memory and flushes it off the response path through
-- the service-role-only record_admin_trace RPC. This is the single trace store
-- for the employee runtime (agent invocations, skill loads, model calls, tool
-- calls); it does not duplicate or replace any other logger.

-- 1. Trace aggregate row ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_traces (
  id uuid PRIMARY KEY,
  workspace_id uuid,
  user_id uuid,
  conversation_id uuid,
  message_id uuid,
  idempotency_key uuid,
  request text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT '',
  route text,
  final_reply text,
  started_at timestamptz,
  completed_at timestamptz,
  duration_ms bigint,
  llm_input_tokens bigint NOT NULL DEFAULT 0,
  llm_output_tokens bigint NOT NULL DEFAULT 0,
  llm_total_tokens bigint NOT NULL DEFAULT 0,
  tool_call_count integer NOT NULL DEFAULT 0,
  agent_count integer NOT NULL DEFAULT 0,
  model_call_count integer NOT NULL DEFAULT 0,
  max_attempt integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_traces_created_idx ON admin_traces(created_at DESC);
CREATE INDEX IF NOT EXISTS admin_traces_workspace_idx ON admin_traces(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_traces_conversation_idx ON admin_traces(conversation_id);
CREATE UNIQUE INDEX IF NOT EXISTS admin_traces_idempotency_key ON admin_traces(workspace_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

ALTER TABLE admin_traces ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON admin_traces FROM PUBLIC, anon, authenticated;
GRANT ALL ON admin_traces TO service_role;

-- 2. Append-only, uniquely-identified events ------------------------------------
CREATE TABLE IF NOT EXISTS admin_trace_events (
  id uuid PRIMARY KEY,
  trace_id uuid NOT NULL REFERENCES admin_traces(id) ON DELETE CASCADE,
  parent_event_id uuid,
  event_type text NOT NULL,
  seq bigint NOT NULL DEFAULT 0,
  agent_id text,
  agent_role text,
  parent_agent_id text,
  run_id uuid,
  attempt integer,
  instance_id uuid,
  correlation_id uuid,
  tool_name text,
  operation text,
  provider text,
  model text,
  call_id uuid,
  status text,
  started_at timestamptz,
  ended_at timestamptz,
  duration_ms bigint,
  input_payload jsonb,
  output_preview jsonb,
  output_truncated boolean NOT NULL DEFAULT false,
  output_original_bytes integer,
  llm_input_tokens bigint NOT NULL DEFAULT 0,
  llm_output_tokens bigint NOT NULL DEFAULT 0,
  llm_total_tokens bigint NOT NULL DEFAULT 0,
  cached_tokens bigint NOT NULL DEFAULT 0,
  reasoning_tokens bigint NOT NULL DEFAULT 0,
  retry_attempt integer,
  fallback_used boolean NOT NULL DEFAULT false,
  error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_trace_events_trace_seq_idx ON admin_trace_events(trace_id, seq);
CREATE INDEX IF NOT EXISTS admin_trace_events_trace_type_idx ON admin_trace_events(trace_id, event_type);
CREATE INDEX IF NOT EXISTS admin_trace_events_trace_run_idx ON admin_trace_events(trace_id, run_id, attempt);
CREATE INDEX IF NOT EXISTS admin_trace_events_trace_parent_idx ON admin_trace_events(trace_id, parent_event_id);

ALTER TABLE admin_trace_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON admin_trace_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON admin_trace_events TO service_role;

-- 3. Discovery view: one row per trace ------------------------------------------
CREATE OR REPLACE VIEW admin_trace_list AS
SELECT
  a.id                                              AS id,
  a.workspace_id                                    AS workspace_id,
  a.user_id                                         AS user_id,
  a.conversation_id                                 AS conversation_id,
  a.request                                         AS request,
  a.route                                           AS route,
  a.status                                          AS status,
  a.started_at                                      AS started_at,
  a.completed_at                                    AS completed_at,
  a.final_reply                                     AS final_reply,
  true                                              AS has_admin_trace,
  a.llm_input_tokens                                AS llm_input_tokens,
  a.llm_output_tokens                               AS llm_output_tokens,
  a.llm_total_tokens                                AS llm_total_tokens,
  a.model_call_count                                AS model_call_count,
  a.tool_call_count                                 AS tool_call_count,
  a.agent_count                                     AS agent_count
FROM admin_traces a;

-- 4. Hardened, idempotent flush RPC ---------------------------------------------
CREATE OR REPLACE FUNCTION record_admin_trace(p_trace jsonb, p_events jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  pid uuid := (p_trace->>'id')::uuid;
  agg record;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  IF pid IS NULL THEN RAISE EXCEPTION 'INVALID_TRACE'; END IF;
  IF jsonb_typeof(p_events) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'INVALID_EVENTS'; END IF;
  IF jsonb_array_length(p_events) > 5000 THEN RAISE EXCEPTION 'TOO_MANY_EVENTS'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_events) e
    WHERE (e->>'trace_id') IS NULL OR (e->>'trace_id')::uuid IS DISTINCT FROM pid
  ) THEN
    RAISE EXCEPTION 'TRACE_ID_MISMATCH';
  END IF;

  INSERT INTO admin_traces (
    id, workspace_id, user_id, conversation_id, message_id, idempotency_key,
    request, status, route, final_reply, started_at, completed_at, duration_ms, metadata
  ) VALUES (
    pid,
    (p_trace->>'workspace_id')::uuid,
    (p_trace->>'user_id')::uuid,
    (p_trace->>'conversation_id')::uuid,
    (p_trace->>'message_id')::uuid,
    (p_trace->>'idempotency_key')::uuid,
    left(coalesce(p_trace->>'request',''), 12000),
    left(coalesce(p_trace->>'status',''), 64),
    nullif(left(coalesce(p_trace->>'route',''), 64), ''),
    left(coalesce(p_trace->>'final_reply',''), 12000),
    (p_trace->>'started_at')::timestamptz,
    (p_trace->>'completed_at')::timestamptz,
    (p_trace->>'duration_ms')::bigint,
    coalesce(p_trace->'metadata','{}'::jsonb)
  )
  ON CONFLICT (id) DO UPDATE SET
    status = excluded.status,
    route = excluded.route,
    final_reply = excluded.final_reply,
    completed_at = excluded.completed_at,
    duration_ms = excluded.duration_ms,
    metadata = excluded.metadata;

  INSERT INTO admin_trace_events (
    id, trace_id, parent_event_id, event_type, seq, agent_id, agent_role, parent_agent_id,
    run_id, attempt, instance_id, correlation_id, tool_name, operation, provider, model, call_id,
    status, started_at, ended_at, duration_ms, input_payload, output_preview, output_truncated,
    output_original_bytes, llm_input_tokens, llm_output_tokens, llm_total_tokens, cached_tokens,
    reasoning_tokens, retry_attempt, fallback_used, error, metadata
  )
  SELECT
    (e->>'id')::uuid,
    pid,
    (e->>'parent_event_id')::uuid,
    left(coalesce(e->>'event_type','event'), 64),
    coalesce((e->>'seq')::bigint, 0),
    nullif(left(coalesce(e->>'agent_id',''), 120), ''),
    nullif(left(coalesce(e->>'agent_role',''), 60), ''),
    nullif(left(coalesce(e->>'parent_agent_id',''), 120), ''),
    (e->>'run_id')::uuid,
    (e->>'attempt')::integer,
    (e->>'instance_id')::uuid,
    (e->>'correlation_id')::uuid,
    nullif(left(coalesce(e->>'tool_name',''), 120), ''),
    nullif(left(coalesce(e->>'operation',''), 60), ''),
    nullif(left(coalesce(e->>'provider',''), 60), ''),
    nullif(left(coalesce(e->>'model',''), 120), ''),
    (e->>'call_id')::uuid,
    nullif(left(coalesce(e->>'status',''), 40), ''),
    (e->>'started_at')::timestamptz,
    (e->>'ended_at')::timestamptz,
    (e->>'duration_ms')::bigint,
    nullif(e->'input_payload','null'::jsonb),
    nullif(e->'output_preview','null'::jsonb),
    coalesce((e->>'output_truncated')::boolean, false),
    (e->>'output_original_bytes')::integer,
    coalesce((e->>'llm_input_tokens')::bigint, 0),
    coalesce((e->>'llm_output_tokens')::bigint, 0),
    coalesce((e->>'llm_total_tokens')::bigint, 0),
    coalesce((e->>'cached_tokens')::bigint, 0),
    coalesce((e->>'reasoning_tokens')::bigint, 0),
    (e->>'retry_attempt')::integer,
    coalesce((e->>'fallback_used')::boolean, false),
    nullif(left(coalesce(e->>'error',''), 2000), ''),
    coalesce(e->'metadata','{}'::jsonb)
  FROM jsonb_array_elements(p_events) e
  ON CONFLICT (id) DO NOTHING;

  -- Recompute the aggregate cache from the full, uniquely-identified event set
  -- (all attempts). Order-independent and idempotent: nothing is overwritten.
  SELECT
    coalesce(sum(llm_input_tokens)  FILTER (WHERE event_type='model'),0)  AS in_tok,
    coalesce(sum(llm_output_tokens) FILTER (WHERE event_type='model'),0)  AS out_tok,
    count(*) FILTER (WHERE event_type='model')                            AS calls,
    count(*) FILTER (WHERE event_type='tool')                             AS tools,
    count(DISTINCT agent_id) FILTER (WHERE event_type='agent')            AS agents,
    coalesce(max(attempt),0)                                             AS max_attempt
  INTO agg
  FROM admin_trace_events WHERE trace_id = pid;

  UPDATE admin_traces t SET
    llm_input_tokens  = agg.in_tok,
    llm_output_tokens = agg.out_tok,
    llm_total_tokens  = agg.in_tok + agg.out_tok,
    model_call_count  = agg.calls,
    tool_call_count   = agg.tools,
    agent_count       = agg.agents,
    max_attempt       = agg.max_attempt
  WHERE t.id = pid;

  RETURN pid;
END $$;

REVOKE ALL ON FUNCTION record_admin_trace(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_admin_trace(jsonb, jsonb) TO service_role;