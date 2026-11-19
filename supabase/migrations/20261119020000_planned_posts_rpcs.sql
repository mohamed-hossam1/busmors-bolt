-- C02: protect planned_posts approval/publication fields from direct client writes.
-- Posts remain owner-readable; all writes go through SECURITY DEFINER RPCs that bind
-- the workspace, enforce an expected version, and invalidate approval on content edits.
-- Existing rows are preserved; legacy rows are grandfathered as unapproved/draft by the
-- prior competition migration and are never auto-approved here.

-- 1. Remove direct client write access. SELECT stays via RLS "select own posts".
REVOKE INSERT, UPDATE, DELETE ON planned_posts FROM authenticated;
DROP POLICY IF EXISTS "insert own posts" ON planned_posts;
DROP POLICY IF EXISTS "update own posts" ON planned_posts;
DROP POLICY IF EXISTS "delete own posts" ON planned_posts;

-- 2. Create a draft Post (and its first immutable version) owned by the caller.
CREATE OR REPLACE FUNCTION create_post(
  p_platform text,
  p_caption text,
  p_hashtags text DEFAULT '',
  p_scheduled_for timestamptz DEFAULT NULL,
  p_origin jsonb DEFAULT '{}'::jsonb,
  p_visual_brief text DEFAULT '',
  p_idempotency_key uuid DEFAULT NULL
) RETURNS planned_posts
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w uuid := auth.uid(); p planned_posts; pv post_versions;
BEGIN
  IF w IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_platform NOT IN ('facebook','instagram') OR length(coalesce(p_caption,'')) NOT BETWEEN 1 AND 6000
     OR length(coalesce(p_hashtags,'')) > 1000 OR length(coalesce(p_visual_brief,'')) > 4000 THEN
    RAISE EXCEPTION 'INVALID_POST';
  END IF;
  IF p_idempotency_key IS NOT NULL AND EXISTS(
    SELECT 1 FROM planned_posts WHERE workspace_id=w AND idempotency_key=p_idempotency_key) THEN
    SELECT * INTO p FROM planned_posts WHERE workspace_id=w AND idempotency_key=p_idempotency_key;
    RETURN p;
  END IF;
  INSERT INTO planned_posts(workspace_id,platform,caption,hashtags,status,scheduled_for,origin,visual_brief,idempotency_key)
    VALUES(w,p_platform,p_caption,coalesce(p_hashtags,''),'draft',p_scheduled_for,coalesce(p_origin,'{}'::jsonb),coalesce(p_visual_brief,''),coalesce(p_idempotency_key,gen_random_uuid()))
    RETURNING * INTO p;
  INSERT INTO post_versions(workspace_id,post_id,revision,text,provenance)
    VALUES(w,p.id,1,p.caption||E'\n'||p.hashtags,jsonb_build_object('caption',p.caption,'hashtags',p.hashtags,'platform',p.platform,'visualBrief',p.visual_brief,'origin',p.origin))
    RETURNING * INTO pv;
  UPDATE planned_posts SET current_version_id=pv.id WHERE id=p.id RETURNING * INTO p;
  RETURN p;
END $$;

-- 3. Edit content and/or transition status. Content edits create a new immutable version
--    and invalidate any approval (approval is bound to an exact version). Status changes
--    model owner decisions only; system-verified publication is never set from the client.
CREATE OR REPLACE FUNCTION update_post(
  p_ids uuid[],
  p_expected_version integer DEFAULT NULL,
  p_caption text DEFAULT NULL,
  p_status text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w uuid := auth.uid(); id uuid; p planned_posts; pv post_versions; nextrev integer; changed integer := 0;
BEGIN
  IF w IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_ids IS NULL OR array_length(p_ids,1) IS NULL OR array_length(p_ids,1) > 500 THEN RAISE EXCEPTION 'INVALID_IDS'; END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('approved','rejected','published') THEN RAISE EXCEPTION 'INVALID_STATUS'; END IF;
  IF p_caption IS NOT NULL AND length(p_caption) NOT BETWEEN 1 AND 6000 THEN RAISE EXCEPTION 'INVALID_CAPTION'; END IF;

  FOREACH id IN ARRAY p_ids LOOP
    SELECT * INTO p FROM planned_posts WHERE id=id AND workspace_id=w FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    IF p_expected_version IS NOT NULL AND p.version <> p_expected_version THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;

    -- Content edit: create a new immutable version and invalidate approval/execution.
    IF p_caption IS NOT NULL AND p_caption <> p.caption THEN
      SELECT coalesce(max(revision),0)+1 INTO nextrev FROM post_versions WHERE post_id=p.id;
      INSERT INTO post_versions(workspace_id,post_id,revision,text,provenance)
        VALUES(w,p.id,nextrev,p_caption||E'\n'||coalesce(p.hashtags,''),jsonb_build_object('caption',p_caption,'hashtags',p.hashtags,'platform',p.platform,'edited',true))
        RETURNING * INTO pv;
      UPDATE planned_posts SET caption=p_caption, current_version_id=pv.id, version=version+1,
        approval_state='unapproved', status=CASE WHEN status IN ('approved','published','scheduled') THEN 'pending_approval' ELSE status END,
        execution_state='idle', published_at=NULL, publish_result=NULL, updated_at=now()
        WHERE id=p.id RETURNING * INTO p;
    END IF;

    -- Status transition (owner decision). Guard against illegal jumps.
    IF p_status IS NOT NULL AND p_status <> p.status THEN
      IF p_status='approved' AND p.status NOT IN ('pending_approval','rejected') THEN RAISE EXCEPTION 'INVALID_TRANSITION'; END IF;
      IF p_status='rejected' AND p.status NOT IN ('pending_approval','approved') THEN RAISE EXCEPTION 'INVALID_TRANSITION'; END IF;
      IF p_status='published' AND (p.status <> 'approved' OR p.approval_state <> 'approved') THEN RAISE EXCEPTION 'NOT_APPROVED'; END IF;
      IF p_status='published' THEN
        UPDATE planned_posts SET status='published', execution_state='owner_reported', published_at=now(),
          publish_result=coalesce(publish_result,'{}'::jsonb)||jsonb_build_object('published_by','user','at',now()), version=version+1, updated_at=now()
          WHERE id=p.id;
      ELSE
        UPDATE planned_posts SET status=p_status, version=version+1, updated_at=now() WHERE id=p.id;
      END IF;
    END IF;
    changed := changed + 1;
  END LOOP;
  RETURN changed;
END $$;

-- 4. Governed delete: owner can delete their own posts; versions cascade.
CREATE OR REPLACE FUNCTION delete_post(p_ids uuid[])
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w uuid := auth.uid(); id uuid; changed integer := 0;
BEGIN
  IF w IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_ids IS NULL OR array_length(p_ids,1) IS NULL OR array_length(p_ids,1) > 500 THEN RAISE EXCEPTION 'INVALID_IDS'; END IF;
  FOREACH id IN ARRAY p_ids LOOP
    DELETE FROM planned_posts WHERE id=id AND workspace_id=w;
    IF FOUND THEN changed := changed + 1; END IF;
  END LOOP;
  RETURN changed;
END $$;

REVOKE ALL ON FUNCTION create_post(text,text,text,timestamptz,jsonb,text,uuid),
  update_post(uuid[],integer,text,text), delete_post(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_post(text,text,text,timestamptz,jsonb,text,uuid),
  update_post(uuid[],integer,text,text), delete_post(uuid[]) TO authenticated;