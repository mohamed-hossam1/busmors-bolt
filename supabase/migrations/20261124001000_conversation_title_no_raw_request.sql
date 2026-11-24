-- Stop writing the raw first message into the conversation title.
--
-- enqueue_task used to run: UPDATE conversations SET title=left(p_request,60) ...
-- which stored the opening 60 characters of the user's message verbatim. When
-- that message started with a topic plus the assistant's pleasantry, the chat
-- header showed garbage like:
--   "معرفة تفاصيل البزنس أهلاً بيك! علشان اقدر اساعدك بأفضل طريق"
--
-- Titles are now produced by /api/conversations (AI title, cleaned + clamped to
-- a few words), and the chat UI clamps stored values too. This migration drops
-- the raw write so it can no longer overwrite or race the real title. When the
-- title call fails the neutral default ("محادثة جديدة" / "New Chat") stays,
-- which is better than a truncated sentence.
--
-- The function is otherwise identical to the 5-argument version created in
-- 20261123140000_admin_execution_observability.sql.

CREATE OR REPLACE FUNCTION enqueue_task(p_conversation_id uuid,p_request text,p_origin jsonb,p_idempotency_key uuid,p_trace_id uuid DEFAULT NULL)
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
 RETURN t;
END $$;

REVOKE ALL ON FUNCTION enqueue_task(uuid,text,jsonb,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION enqueue_task(uuid,text,jsonb,uuid,uuid) TO authenticated;
