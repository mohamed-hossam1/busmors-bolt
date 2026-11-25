-- Phase 3: Director delivery RPCs.
--
-- The legacy task/offer creation path (save_task_result / accept_deliverable_offer)
-- was dropped together with the retired Employee tables. The Director still needs
-- to persist substantial outputs and publishable drafts, so this adds two focused
-- SECURITY DEFINER functions that reuse the SAME tables and invariants as before:
--
--   * create_or_version_deliverable: create a Deliverable (version 1) or append a
--     new IMMUTABLE version to an existing one (compare-and-swap on version).
--     Idempotent by an origin-stored key so a retried tool call cannot duplicate.
--   * create_or_update_post_draft: create a Calendar draft (never scheduled or
--     published) with an AI-proposed time, or revise an existing draft. A content
--     revision appends an immutable post version and INVALIDATES any approval,
--     exactly like update_post. It never sets scheduled_for/published_at.
--
-- Workspace is always derived from auth.uid(); caller-supplied ids are never
-- trusted. No publishing, scheduling, spending or Brain mutation happens here.

-- 1. Deliverable create-or-version (immutable versions, idempotent create).
CREATE OR REPLACE FUNCTION create_or_version_deliverable(
  p_deliverable_id uuid,
  p_expected_version integer,
  p_title text,
  p_type text,
  p_content text,
  p_source_refs jsonb DEFAULT '[]'::jsonb,
  p_context_refs jsonb DEFAULT '[]'::jsonb,
  p_limitations jsonb DEFAULT '[]'::jsonb,
  p_idempotency_key uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  w uuid := auth.uid();
  d deliverables;
  v deliverable_versions;
  idem text;
BEGIN
  IF w IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF length(btrim(coalesce(p_title,''))) NOT BETWEEN 1 AND 200
     OR length(coalesce(p_content,'')) NOT BETWEEN 1 AND 80000
     OR p_type IS NULL OR p_type NOT IN
        ('research_report','competitor_analysis','content_posts','content_calendar','performance_diagnosis','general')
     OR (p_source_refs IS NOT NULL AND jsonb_typeof(p_source_refs)<>'array')
     OR (p_context_refs IS NOT NULL AND jsonb_typeof(p_context_refs)<>'array')
     OR (p_limitations IS NOT NULL AND jsonb_typeof(p_limitations)<>'array') THEN
    RAISE EXCEPTION 'INVALID_DOCUMENT';
  END IF;

  IF p_deliverable_id IS NULL THEN
    -- Idempotent create: reuse an existing deliverable with the same key.
    IF p_idempotency_key IS NOT NULL THEN
      idem := p_idempotency_key::text;
      SELECT * INTO d FROM deliverables
        WHERE workspace_id=w AND origin->>'idempotencyKey'=idem
        ORDER BY created_at DESC LIMIT 1;
      IF FOUND THEN
        RETURN jsonb_build_object('deliverableId',d.id,'version',d.version,'created',false);
      END IF;
    END IF;
    INSERT INTO deliverables(workspace_id,title,type,content,origin,context_refs,source_refs,limitations)
      VALUES(w,btrim(p_title),p_type,p_content,
             jsonb_build_object('kind','director','idempotencyKey',idem),
             coalesce(p_context_refs,'[]'::jsonb),coalesce(p_source_refs,'[]'::jsonb),coalesce(p_limitations,'[]'::jsonb))
      RETURNING * INTO d;
    INSERT INTO deliverable_versions(workspace_id,deliverable_id,version,title,content,provenance,source_refs,context_refs,limitations)
      VALUES(d.workspace_id,d.id,d.version,d.title,d.content,'{"createdBy":"director"}'::jsonb,d.source_refs,d.context_refs,d.limitations)
      RETURNING * INTO v;
    RETURN jsonb_build_object('deliverableId',d.id,'version',d.version,'created',true);
  END IF;

  -- Version an existing deliverable (immutable append, compare-and-swap).
  SELECT * INTO d FROM deliverables WHERE id=p_deliverable_id AND workspace_id=w FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF p_expected_version IS NOT NULL AND d.version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'STALE_VERSION';
  END IF;
  UPDATE deliverables SET title=btrim(p_title),content=p_content,version=version+1,
    source_refs=coalesce(p_source_refs,source_refs),context_refs=coalesce(p_context_refs,context_refs),
    limitations=coalesce(p_limitations,limitations),updated_at=now()
    WHERE id=d.id RETURNING * INTO d;
  INSERT INTO deliverable_versions(workspace_id,deliverable_id,version,title,content,provenance,source_refs,context_refs,limitations)
    VALUES(d.workspace_id,d.id,d.version,d.title,d.content,'{"createdBy":"director","revised":true}'::jsonb,d.source_refs,d.context_refs,d.limitations);
  RETURN jsonb_build_object('deliverableId',d.id,'version',d.version,'created',false);
END $$;

REVOKE ALL ON FUNCTION create_or_version_deliverable(uuid,integer,text,text,text,jsonb,jsonb,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION create_or_version_deliverable(uuid,integer,text,text,text,jsonb,jsonb,jsonb,uuid) TO authenticated;

-- 2. Calendar draft create-or-update (proposed time only; never schedules/publishes).
CREATE OR REPLACE FUNCTION create_or_update_post_draft(
  p_post_id uuid,
  p_expected_version integer,
  p_platform text,
  p_caption text,
  p_hashtags text DEFAULT '',
  p_proposed_for timestamptz DEFAULT NULL,
  p_origin jsonb DEFAULT '{}'::jsonb,
  p_visual_brief text DEFAULT '',
  p_idempotency_key uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  w uuid := auth.uid();
  p planned_posts;
  pv post_versions;
  nextrev integer;
  prop timestamptz;
BEGIN
  IF w IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF p_platform NOT IN ('facebook','instagram') OR length(coalesce(p_caption,'')) NOT BETWEEN 1 AND 6000
     OR length(coalesce(p_hashtags,''))>1000 OR length(coalesce(p_visual_brief,''))>4000 THEN
    RAISE EXCEPTION 'INVALID_POST';
  END IF;
  -- A proposed time is a suggestion only; a past time is dropped, never a schedule.
  prop := p_proposed_for;
  IF prop IS NOT NULL AND prop<=now() THEN prop:=NULL; END IF;

  IF p_post_id IS NULL THEN
    IF p_idempotency_key IS NOT NULL AND EXISTS(
      SELECT 1 FROM planned_posts WHERE workspace_id=w AND idempotency_key=p_idempotency_key) THEN
      SELECT * INTO p FROM planned_posts WHERE workspace_id=w AND idempotency_key=p_idempotency_key;
      RETURN jsonb_build_object('postId',p.id,'version',p.version,'created',false,'proposedFor',p.proposed_for);
    END IF;
    INSERT INTO planned_posts(workspace_id,platform,caption,hashtags,status,scheduled_for,proposed_for,origin,visual_brief,idempotency_key)
      VALUES(w,p_platform,p_caption,coalesce(p_hashtags,''),'draft',NULL,prop,coalesce(p_origin,'{}'::jsonb),coalesce(p_visual_brief,''),
             coalesce(p_idempotency_key,gen_random_uuid()))
      RETURNING * INTO p;
    INSERT INTO post_versions(workspace_id,post_id,revision,text,provenance)
      VALUES(w,p.id,1,p.caption||E'\n'||p.hashtags,
             jsonb_build_object('caption',p.caption,'hashtags',p.hashtags,'platform',p.platform,'visualBrief',p.visual_brief,'origin',p.origin,'proposedAt',prop))
      RETURNING * INTO pv;
    UPDATE planned_posts SET current_version_id=pv.id WHERE id=p.id RETURNING * INTO p;
    RETURN jsonb_build_object('postId',p.id,'version',p.version,'created',true,'proposedFor',p.proposed_for);
  END IF;

  -- Revise an existing draft: content edit appends an immutable version and
  -- invalidates any (unsent) approval. A sent post is locked and cannot change.
  SELECT * INTO p FROM planned_posts WHERE id=p_post_id AND workspace_id=w FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF p_expected_version IS NOT NULL AND p.version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'VERSION_CONFLICT';
  END IF;
  IF p.status IN ('published','publishing','scheduled') THEN RAISE EXCEPTION 'LOCKED'; END IF;

  IF p_caption IS DISTINCT FROM p.caption THEN
    SELECT coalesce(max(revision),0)+1 INTO nextrev FROM post_versions WHERE post_id=p.id;
    INSERT INTO post_versions(workspace_id,post_id,revision,text,provenance)
      VALUES(w,p.id,nextrev,p_caption||E'\n'||coalesce(p_hashtags,''),
             jsonb_build_object('caption',p_caption,'hashtags',coalesce(p_hashtags,p.hashtags),'platform',p.platform,'edited',true,'proposedAt',prop))
      RETURNING * INTO pv;
    UPDATE post_approvals SET revoked_at=now() WHERE workspace_id=w AND post_id=p.id AND revoked_at IS NULL;
    UPDATE planned_posts SET caption=p_caption,hashtags=coalesce(p_hashtags,hashtags),current_version_id=pv.id,
      version=version+1,status='draft',approval_state='unapproved',execution_state='idle',
      proposed_for=coalesce(prop,proposed_for),published_at=NULL,publish_result=NULL,updated_at=now()
      WHERE id=p.id RETURNING * INTO p;
  ELSIF prop IS DISTINCT FROM p.proposed_for THEN
    UPDATE planned_posts SET proposed_for=prop,version=version+1,updated_at=now() WHERE id=p.id RETURNING * INTO p;
  END IF;
  RETURN jsonb_build_object('postId',p.id,'version',p.version,'created',false,'proposedFor',p.proposed_for);
END $$;

REVOKE ALL ON FUNCTION create_or_update_post_draft(uuid,integer,text,text,text,timestamptz,jsonb,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION create_or_update_post_draft(uuid,integer,text,text,text,timestamptz,jsonb,text,uuid) TO authenticated;