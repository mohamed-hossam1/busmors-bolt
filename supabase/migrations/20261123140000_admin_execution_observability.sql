-- Admin execution observability.
--
-- Capture-once, read-many execution traces for the internal admin dashboard.
-- Customer request paths never await this data: the collector buffers a bounded,
-- allow-listed projection in memory and flushes it off the response path through
-- the service-role-only record_admin_trace RPC. Nothing here changes the customer
-- task/canvas tables; tasks gains a single nullable trace_id plus a uniqueness
-- index so a recoverable task trace is still listable if its admin flush failed.

-- 1. Trace identity on tasks ----------------------------------------------------
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS trace_id uuid;

-- One task per trace (the Orchestrator creates exactly one task per handoff).
CREATE UNIQUE INDEX IF NOT EXISTS tasks_trace_unique ON tasks(trace_id) WHERE trace_id IS NOT NULL;

-- Supporting indexes for the discovery view's LATERAL fallbacks.
CREATE INDEX IF NOT EXISTS task_usage_task_idx ON task_usage(task_id);
CREATE INDEX IF NOT EXISTS agent_events_task_type_idx ON agent_events(task_id, event_type);
CREATE INDEX IF NOT EXISTS task_steps_task_idx ON task_steps(task_id);

-- 2. Trace aggregate row ---------------------------------------------------------
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
  tool_page_count integer NOT NULL DEFAULT 0,
  tool_credit_count integer NOT NULL DEFAULT 0,
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

-- 3. Append-only, uniquely-identified events ------------------------------------
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

-- 4. Discovery view: one row per trace_id ---------------------------------------
-- FULL OUTER JOIN so a task whose admin flush failed is still listed, and a
-- direct/brain trace with no task is still listed. admin_traces is keyed by the
-- same id as trace_id, so the coalesced key is unique and never fans out.
CREATE OR REPLACE VIEW admin_trace_list AS
SELECT
  COALESCE(a.id, t.trace_id)                      AS id,
  COALESCE(a.workspace_id, t.workspace_id)        AS workspace_id,
  COALESCE(a.user_id, t.workspace_id)             AS user_id,
  COALESCE(a.conversation_id, t.conversation_id)  AS conversation_id,
  COALESCE(a.request, t.user_request)             AS request,
  COALESCE(a.route, 'task')                       AS route,
  COALESCE(a.status, t.status)                    AS status,
  COALESCE(a.started_at, t.created_at)            AS started_at,
  COALESCE(a.completed_at, t.updated_at)          AS completed_at,
  COALESCE(a.final_reply, t.result_summary)       AS final_reply,
  (a.id IS NOT NULL)                              AS has_admin_trace,
  (t.id IS NOT NULL)                              AS has_task,
  t.id                                            AS task_id,
  COALESCE(a.llm_input_tokens,  u.in_tok,  0)     AS llm_input_tokens,
  COALESCE(a.llm_output_tokens, u.out_tok, 0)     AS llm_output_tokens,
  COALESCE(a.llm_total_tokens,  u.in_tok + u.out_tok, 0) AS llm_total_tokens,
  COALESCE(a.model_call_count,  u.calls,   0)     AS model_call_count,
  COALESCE(a.tool_call_count,   tc.calls,  0)     AS tool_call_count,
  COALESCE(a.agent_count,       ag.cnt,    0)     AS agent_count
FROM admin_traces a
FULL OUTER JOIN tasks t ON t.trace_id = a.id
LEFT JOIN LATERAL (
  SELECT coalesce(sum((usage->>'inputTokens')::bigint),0)  AS in_tok,
         coalesce(sum((usage->>'outputTokens')::bigint),0) AS out_tok,
         count(*)                                          AS calls
  FROM task_usage
  WHERE task_id = t.id AND state = 'succeeded'
) u ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS calls FROM agent_events
  WHERE task_id = t.id AND event_type = 'tool_call'
) tc ON true
LEFT JOIN LATERAL (
  SELECT count(DISTINCT agent) AS cnt FROM task_steps WHERE task_id = t.id
) ag ON true
WHERE COALESCE(a.id, t.trace_id) IS NOT NULL;

-- 5. enqueue_task gains an optional trace id ------------------------------------
-- The old 4-argument function is replaced by a 5-argument one whose trace id
-- defaults to NULL, so the existing 'submit' path keeps working unchanged while
-- the Orchestrator handoff can persist trace_id in the same awaited insert.
DROP FUNCTION IF EXISTS enqueue_task(uuid,text,jsonb,uuid);

CREATE FUNCTION enqueue_task(p_conversation_id uuid,p_request text,p_origin jsonb,p_idempotency_key uuid,p_trace_id uuid DEFAULT NULL)
RETURNS tasks LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w uuid:=auth.uid(); t tasks; fingerprint text:=md5(p_request||p_origin::text);
BEGIN
 IF w IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 IF p_idempotency_key IS NULL OR length(btrim(coalesce(p_request,''))) NOT BETWEEN 1 AND 12000 OR p_origin IS NULL THEN RAISE EXCEPTION 'INVALID_REQUEST'; END IF;
 IF NOT EXISTS(SELECT 1 FROM conversations WHERE workspace_id=w AND id=p_conversation_id) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('tasks:'||w::text,0));
 SELECT * INTO t FROM tasks WHERE workspace_id=w AND idempotency_key=p_idempotency_key;
 IF FOUND THEN
  IF t.request_hash IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
  IF p_trace_id IS NOT NULL AND t.trace_id IS NULL THEN
   UPDATE tasks SET trace_id=p_trace_id,updated_at=now() WHERE id=t.id RETURNING * INTO t;
  END IF;
  RETURN t;
 END IF;
 INSERT INTO tasks(workspace_id,conversation_id,type,status,user_request,origin,idempotency_key,request_hash,checkpoint,trace_id)
  VALUES(w,p_conversation_id,'simple_answer','queued',btrim(p_request),p_origin,p_idempotency_key,fingerprint,'{"phase":"route"}',p_trace_id) RETURNING * INTO t;
 INSERT INTO messages(workspace_id,conversation_id,role,type,content,payload) VALUES(w,p_conversation_id,'user','text',p_request,jsonb_build_object('taskId',t.id));
 UPDATE conversations SET title=left(p_request,60) WHERE id=p_conversation_id AND (SELECT count(*) FROM messages WHERE conversation_id=p_conversation_id AND role='user')=1;
 RETURN t;
END $$;

REVOKE ALL ON FUNCTION enqueue_task(uuid,text,jsonb,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION enqueue_task(uuid,text,jsonb,uuid,uuid) TO authenticated;

-- 6. Hardened, idempotent flush RPC ---------------------------------------------
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
    coalesce(sum(coalesce((output_preview->>'pageCount')::bigint,0)) FILTER (WHERE event_type='tool'),0) AS pages,
    coalesce(sum(coalesce((output_preview->>'creditCount')::bigint,0)) FILTER (WHERE event_type='tool'),0) AS credits,
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
    tool_page_count   = agg.pages,
    tool_credit_count = agg.credits,
    agent_count       = agg.agents,
    max_attempt       = agg.max_attempt
  WHERE t.id = pid;

  RETURN pid;
END $$;

REVOKE ALL ON FUNCTION record_admin_trace(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_admin_trace(jsonb, jsonb) TO service_role;