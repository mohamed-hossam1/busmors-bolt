-- Canvas hierarchy fix.
--
-- Conversation-scoped events (Orchestrator, Brain tool, Director handoff) are
-- written by record_conversation_event, which historically dropped
-- parent_instance_id. The Agent Canvas rebuilds its delegation tree from
-- parent_instance_id, so the Brain tool and Director nodes floated free of the
-- Orchestrator. Task-scoped events already persist it via record_research_event;
-- this brings the conversation-level writer in line and threads an optional
-- message id (stored in correlation_id) for turn-scoped canvases.
--
-- The old 12-argument signature is dropped first so PostgREST resolves the new
-- 14-argument function unambiguously (the two new args default to NULL, so any
-- existing 12-argument call keeps working).

DROP FUNCTION IF EXISTS record_conversation_event(
  uuid, uuid, text, text, text, text, text, text, jsonb, text, timestamptz, timestamptz
);

CREATE OR REPLACE FUNCTION record_conversation_event(
  p_conversation_id uuid, p_instance_id uuid, p_event_type text, p_agent_id text, p_agent_role text,
  p_label text, p_status text, p_public_message text, p_parameters jsonb,
  p_failure_reason text, p_started_at timestamptz, p_ended_at timestamptz,
  p_parent_instance_id uuid DEFAULT NULL, p_message_id uuid DEFAULT NULL
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
  INSERT INTO agent_events(workspace_id, task_id, conversation_id, instance_id, parent_instance_id,
    correlation_id, seq, event_type, agent_id, agent_role,
    public_message, redacted_parameters, failure_reason, started_at, ended_at, payload)
    VALUES(w, NULL, p_conversation_id, coalesce(p_instance_id, gen_random_uuid()), p_parent_instance_id,
      p_message_id, v_seq, p_event_type,
      p_agent_id, coalesce(p_agent_role,'subagent'), coalesce(p_public_message,''), coalesce(p_parameters,'{}'::jsonb),
      p_failure_reason, coalesce(p_started_at, now()), p_ended_at,
      jsonb_build_object('task_summary', p_label, 'label', p_label, 'agent_role', coalesce(p_agent_role,'subagent'),
        'status', p_status, 'public_message', coalesce(p_public_message,''),
        'parent_instance_id', p_parent_instance_id, 'message_id', p_message_id))
    RETURNING id INTO v_id;
  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION
  record_conversation_event(uuid,uuid,text,text,text,text,text,text,jsonb,text,timestamptz,timestamptz,uuid,uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  record_conversation_event(uuid,uuid,text,text,text,text,text,text,jsonb,text,timestamptz,timestamptz,uuid,uuid)
  TO authenticated;