-- C16: stable document identity, immutable edit versions, bounded library
-- queries and an exact document origin for "Continue with Director".
-- Existing documents get a version-1 snapshot if they predate versioning.

INSERT INTO deliverable_versions(workspace_id,deliverable_id,version,title,content,provenance,source_refs,context_refs,limitations)
SELECT d.workspace_id,d.id,d.version,d.title,d.content,'{"backfilled":true}'::jsonb,d.source_refs,d.context_refs,d.limitations
FROM deliverables d
WHERE NOT EXISTS(
 SELECT 1 FROM deliverable_versions v
 WHERE v.workspace_id=d.workspace_id AND v.deliverable_id=d.id AND v.version=d.version
);

-- One bounded, cursor-paged query keeps search, type and date filters on the
-- server instead of loading the whole library into the browser.
CREATE OR REPLACE FUNCTION list_deliverables(
 p_search text DEFAULT NULL,
 p_type text DEFAULT NULL,
 p_from timestamptz DEFAULT NULL,
 p_to timestamptz DEFAULT NULL,
 p_before timestamptz DEFAULT NULL,
 p_before_id uuid DEFAULT NULL,
 p_limit integer DEFAULT 20
) RETURNS SETOF deliverables
LANGUAGE sql SECURITY DEFINER SET search_path=public STABLE AS $$
 SELECT d.* FROM deliverables d
 WHERE auth.uid() IS NOT NULL
  AND d.workspace_id=auth.uid()
  AND (p_type IS NULL OR d.type=p_type)
  AND (p_from IS NULL OR d.created_at>=p_from)
  AND (p_to IS NULL OR d.created_at<p_to)
  AND (nullif(btrim(coalesce(p_search,'')),'') IS NULL
       OR d.title ILIKE '%'||btrim(p_search)||'%'
       OR d.content ILIKE '%'||btrim(p_search)||'%')
  AND (p_before IS NULL OR (d.created_at,d.id)<(p_before,coalesce(p_before_id,'00000000-0000-0000-0000-000000000000'::uuid)))
 ORDER BY d.created_at DESC,d.id DESC
 LIMIT least(greatest(coalesce(p_limit,20),1),50)
$$;
REVOKE ALL ON FUNCTION list_deliverables(text,text,timestamptz,timestamptz,timestamptz,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION list_deliverables(text,text,timestamptz,timestamptz,timestamptz,uuid,integer) TO authenticated;

-- Editing is one atomic compare-and-swap: the owner edits a specific version,
-- a new immutable version is appended, and the stable document id is retained.
CREATE OR REPLACE FUNCTION update_deliverable(
 p_deliverable_id uuid,
 p_expected_version integer,
 p_title text,
 p_content text
) RETURNS deliverables
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d deliverables;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 SELECT * INTO d FROM deliverables WHERE id=p_deliverable_id AND workspace_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 IF d.version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'STALE_VERSION'; END IF;
 IF length(btrim(coalesce(p_title,''))) NOT BETWEEN 1 AND 200 OR length(coalesce(p_content,'')) NOT BETWEEN 1 AND 80000 THEN RAISE EXCEPTION 'INVALID_DOCUMENT'; END IF;
 UPDATE deliverables SET title=btrim(p_title),content=p_content,version=version+1,updated_at=now()
  WHERE id=d.id RETURNING * INTO d;
 INSERT INTO deliverable_versions(workspace_id,deliverable_id,version,title,content,provenance,source_refs,context_refs,limitations)
  VALUES(d.workspace_id,d.id,d.version,d.title,d.content,'{"editedBy":"owner"}'::jsonb,d.source_refs,d.context_refs,d.limitations);
 RETURN d;
END $$;
REVOKE ALL ON FUNCTION update_deliverable(uuid,integer,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION update_deliverable(uuid,integer,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION delete_deliverable(p_deliverable_id uuid,p_expected_version integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 DELETE FROM deliverables WHERE id=p_deliverable_id AND workspace_id=auth.uid() AND version=p_expected_version;
 IF NOT FOUND THEN
  IF EXISTS(SELECT 1 FROM deliverables WHERE id=p_deliverable_id AND workspace_id=auth.uid()) THEN RAISE EXCEPTION 'STALE_VERSION'; END IF;
  RAISE EXCEPTION 'NOT_FOUND';
 END IF;
END $$;
REVOKE ALL ON FUNCTION delete_deliverable(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION delete_deliverable(uuid,integer) TO authenticated;

-- The ownership trigger predates documents. Extend the same checked origin
-- contract instead of weakening the existing trigger.
CREATE OR REPLACE FUNCTION validate_task_origin_owner() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE o jsonb:=NEW.origin; c uuid; v integer;
BEGIN
 IF o='{}'::jsonb AND NEW.conversation_id IS NOT NULL THEN
  o:=jsonb_build_object('kind','direct','conversationId',NEW.conversation_id);NEW.origin:=o;
 END IF;
 IF jsonb_typeof(o) IS DISTINCT FROM 'object' OR coalesce(o->>'kind','') NOT IN ('direct','wizard_question','roadmap_step','document') THEN RAISE EXCEPTION 'INVALID_TASK_ORIGIN' USING ERRCODE='23503'; END IF;
 BEGIN c:=(o->>'conversationId')::uuid; EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'INVALID_TASK_ORIGIN' USING ERRCODE='23503'; END;
 IF c IS NULL OR c IS DISTINCT FROM NEW.conversation_id OR NOT EXISTS(SELECT 1 FROM conversations WHERE id=c AND workspace_id=NEW.workspace_id) THEN RAISE EXCEPTION 'INVALID_TASK_ORIGIN' USING ERRCODE='23503'; END IF;
 IF o->>'kind'='wizard_question' AND NOT EXISTS(
  SELECT 1 FROM question_research_links l JOIN discovery_questions q ON q.id=l.question_id AND q.workspace_id=l.workspace_id
   JOIN discovery_drafts d ON d.id=l.draft_id AND d.workspace_id=l.workspace_id
  WHERE l.id::text=o->>'researchLinkId' AND l.workspace_id=NEW.workspace_id AND d.id::text=o->>'draftId'
   AND q.id::text=o->>'questionId' AND q.draft_id=d.id AND l.conversation_id=c
 ) THEN RAISE EXCEPTION 'INVALID_TASK_ORIGIN' USING ERRCODE='23503'; END IF;
 IF o->>'kind'='roadmap_step' AND NOT EXISTS(
  SELECT 1 FROM roadmap_steps s JOIN roadmap_versions v ON v.id=s.plan_version_id AND v.workspace_id=s.workspace_id
  WHERE s.id::text=o->>'stepId' AND s.workspace_id=NEW.workspace_id AND s.roadmap_id::text=o->>'planId'
   AND v.id::text=o->>'planVersionId' AND v.roadmap_id=s.roadmap_id
 ) THEN RAISE EXCEPTION 'INVALID_TASK_ORIGIN' USING ERRCODE='23503'; END IF;
 IF o->>'kind'='document' THEN
  BEGIN v:=(o->>'version')::integer; EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'INVALID_TASK_ORIGIN' USING ERRCODE='23503'; END;
  IF NOT EXISTS(
   SELECT 1 FROM deliverable_versions dv JOIN deliverables d ON d.id=dv.deliverable_id AND d.workspace_id=dv.workspace_id
   WHERE d.workspace_id=NEW.workspace_id AND d.id::text=o->>'deliverableId' AND dv.version=v
  ) THEN RAISE EXCEPTION 'INVALID_TASK_ORIGIN' USING ERRCODE='23503'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION validate_task_origin_owner() FROM PUBLIC,anon;

-- "Continue with Director" is a checked document origin, not a free-form hint.
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
 ELSIF kind='document' THEN
  IF coalesce(p_origin->>'deliverableId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
   OR coalesce(p_origin->>'version','') !~ '^[0-9]{1,9}$' THEN RAISE EXCEPTION 'INVALID_ORIGIN'; END IF;
  IF NOT EXISTS(SELECT 1 FROM deliverables WHERE id=(p_origin->>'deliverableId')::uuid AND workspace_id=w)
   OR NOT EXISTS(SELECT 1 FROM deliverable_versions WHERE workspace_id=w AND deliverable_id=(p_origin->>'deliverableId')::uuid AND version=(p_origin->>'version')::integer)
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
