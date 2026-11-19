-- Task origin is a checked discriminated type, not a free-form navigation hint.
-- Every referenced owner row must belong to the same workspace and conversation
-- before a Task may be enqueued. Rejected origins create no message or Task row.
CREATE OR REPLACE FUNCTION enqueue_task(p_conversation_id uuid,p_request text,p_origin jsonb,p_idempotency_key uuid)
RETURNS tasks LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w uuid:=auth.uid(); t tasks; fingerprint text:=md5(p_request||p_origin::text); kind text; v_conversation uuid;
BEGIN
 IF w IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 IF p_idempotency_key IS NULL OR length(btrim(coalesce(p_request,''))) NOT BETWEEN 1 AND 12000 OR p_origin IS NULL OR jsonb_typeof(p_origin) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_REQUEST'; END IF;
 IF NOT EXISTS(SELECT 1 FROM conversations WHERE workspace_id=w AND id=p_conversation_id) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

 kind:=p_origin->>'kind';
 IF kind IS NULL OR coalesce(p_origin->>'conversationId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'INVALID_ORIGIN'; END IF;
 v_conversation:=(p_origin->>'conversationId')::uuid;
 IF v_conversation IS DISTINCT FROM p_conversation_id THEN RAISE EXCEPTION 'INVALID_ORIGIN'; END IF;

 IF kind='direct' THEN
  NULL;
 ELSIF kind='wizard_question' THEN
  IF coalesce(p_origin->>'draftId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
   OR coalesce(p_origin->>'questionId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
   OR coalesce(p_origin->>'researchLinkId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'INVALID_ORIGIN'; END IF;
  IF NOT EXISTS(SELECT 1 FROM discovery_drafts WHERE id=(p_origin->>'draftId')::uuid AND workspace_id=w)
   OR NOT EXISTS(SELECT 1 FROM discovery_questions WHERE id=(p_origin->>'questionId')::uuid AND workspace_id=w AND draft_id=(p_origin->>'draftId')::uuid)
   OR NOT EXISTS(SELECT 1 FROM question_research_links WHERE id=(p_origin->>'researchLinkId')::uuid AND workspace_id=w AND draft_id=(p_origin->>'draftId')::uuid AND question_id=(p_origin->>'questionId')::uuid AND conversation_id=p_conversation_id)
   THEN RAISE EXCEPTION 'INVALID_ORIGIN'; END IF;
 ELSIF kind='roadmap_step' THEN
  IF coalesce(p_origin->>'planId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
   OR coalesce(p_origin->>'planVersionId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
   OR coalesce(p_origin->>'stepId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'INVALID_ORIGIN'; END IF;
  IF NOT EXISTS(SELECT 1 FROM roadmaps WHERE id=(p_origin->>'planId')::uuid AND workspace_id=w)
   OR NOT EXISTS(SELECT 1 FROM roadmap_versions WHERE id=(p_origin->>'planVersionId')::uuid AND workspace_id=w AND roadmap_id=(p_origin->>'planId')::uuid)
   OR NOT EXISTS(SELECT 1 FROM roadmap_steps WHERE id=(p_origin->>'stepId')::uuid AND workspace_id=w AND roadmap_id=(p_origin->>'planId')::uuid AND plan_version_id=(p_origin->>'planVersionId')::uuid)
   THEN RAISE EXCEPTION 'INVALID_ORIGIN'; END IF;
 ELSE
  RAISE EXCEPTION 'INVALID_ORIGIN';
 END IF;

 PERFORM pg_advisory_xact_lock(hashtextextended('tasks:'||w::text,0));
 SELECT * INTO t FROM tasks WHERE workspace_id=w AND idempotency_key=p_idempotency_key;
 IF FOUND THEN
  IF t.request_hash IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
  RETURN t;
 END IF;
 INSERT INTO tasks(workspace_id,conversation_id,type,status,user_request,origin,idempotency_key,request_hash,checkpoint)
  VALUES(w,p_conversation_id,'simple_answer','queued',btrim(p_request),p_origin,p_idempotency_key,fingerprint,'{"phase":"route"}') RETURNING * INTO t;
 INSERT INTO messages(workspace_id,conversation_id,role,type,content,payload) VALUES(w,p_conversation_id,'user','text',p_request,jsonb_build_object('taskId',t.id));
 UPDATE conversations SET title=left(p_request,60) WHERE id=p_conversation_id AND (SELECT count(*) FROM messages WHERE conversation_id=p_conversation_id AND role='user')=1;
 RETURN t;
END $$;
REVOKE ALL ON FUNCTION enqueue_task(uuid,text,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION enqueue_task(uuid,text,jsonb,uuid) TO authenticated;
