-- Phase 5 (revised 22 Nov 2026, owner decision): two-step approval and publishing
-- with Facebook's NATIVE scheduling. There is no BUSMORA scheduler.
-- Step 1 (update_post 'approved') approves the text only. Step 2 is an owner click:
--   * Publish now -> the exact version is sent and published immediately.
--   * Schedule    -> the exact version is sent to Facebook right away with
--                    published=false + scheduled_publish_time; Facebook publishes it.
-- Either way the version is sent exactly once (publish_attempts UNIQUE(post_version_id))
-- by server-only code, recorded with Facebook's post id, and never retried
-- automatically. Once sent (scheduled or published) a post is locked in BUSMORA:
-- no edit, no delete. BUSMORA never edits, deletes or reads back a post on Facebook.

ALTER TABLE publish_attempts ADD COLUMN mode text NOT NULL DEFAULT 'now' CHECK (mode IN ('now','schedule'));

-- 1. update_post: posts sent to Facebook are read-only; a caption edit on an unsent
--    post returns it to draft and revokes its (unsent) publish approval.
CREATE OR REPLACE FUNCTION update_post(
  p_ids uuid[],
  p_expected_version integer DEFAULT NULL,
  p_caption text DEFAULT NULL,
  p_status text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w uuid := auth.uid(); cur_id uuid; p planned_posts; pv post_versions; nextrev integer; changed integer := 0;
BEGIN
  IF w IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_ids IS NULL OR array_length(p_ids,1) IS NULL OR array_length(p_ids,1) > 500 THEN RAISE EXCEPTION 'INVALID_IDS'; END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('approved','rejected','published') THEN RAISE EXCEPTION 'INVALID_STATUS'; END IF;
  IF p_caption IS NOT NULL AND length(p_caption) NOT BETWEEN 1 AND 6000 THEN RAISE EXCEPTION 'INVALID_CAPTION'; END IF;

  FOREACH cur_id IN ARRAY p_ids LOOP
    SELECT * INTO p FROM planned_posts WHERE id=cur_id AND workspace_id=w FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    IF p_expected_version IS NOT NULL AND p.version <> p_expected_version THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;

    -- Content edit: a new immutable version; any unsent approval is revoked.
    IF p_caption IS NOT NULL AND p_caption <> p.caption THEN
      IF p.status IN ('published','publishing','scheduled') THEN RAISE EXCEPTION 'LOCKED'; END IF;
      SELECT coalesce(max(revision),0)+1 INTO nextrev FROM post_versions WHERE post_id=p.id;
      INSERT INTO post_versions(workspace_id,post_id,revision,text,provenance)
        VALUES(w,p.id,nextrev,p_caption||E'\n'||coalesce(p.hashtags,''),jsonb_build_object('caption',p_caption,'hashtags',p.hashtags,'platform',p.platform,'edited',true))
        RETURNING * INTO pv;
      UPDATE post_approvals SET revoked_at=now() WHERE workspace_id=w AND post_id=p.id AND revoked_at IS NULL;
      UPDATE post_holds SET resolved_at=now(), resolution='edited'
        WHERE workspace_id=w AND post_id=p.id AND resolved_at IS NULL AND kind IN ('connection','missed_window');
      UPDATE planned_posts SET caption=p_caption, current_version_id=pv.id, version=version+1,
        status='draft', approval_state='unapproved',
        -- Still held only while another hold (Brain context, unconfirmed send) is unresolved.
        execution_state=CASE WHEN EXISTS(SELECT 1 FROM post_holds h WHERE h.post_id=p.id AND h.resolved_at IS NULL) THEN 'held' ELSE 'idle' END,
        published_at=NULL, publish_result=NULL, updated_at=now()
        WHERE id=p.id RETURNING * INTO p;
    END IF;

    -- Status transition (owner decision). Guard against illegal jumps.
    IF p_status IS NOT NULL AND p_status <> p.status THEN
      IF p_status='approved' AND p.status NOT IN ('draft','pending_approval','rejected') THEN RAISE EXCEPTION 'INVALID_TRANSITION'; END IF;
      IF p_status='rejected' AND p.status NOT IN ('draft','pending_approval','approved') THEN RAISE EXCEPTION 'INVALID_TRANSITION'; END IF;
      IF p_status='published' AND (p.status <> 'approved' OR p.approval_state <> 'approved') THEN RAISE EXCEPTION 'NOT_APPROVED'; END IF;
      IF p_status='published' THEN
        UPDATE post_approvals SET revoked_at=now() WHERE workspace_id=w AND post_id=p.id AND revoked_at IS NULL;
        UPDATE planned_posts SET status='published', execution_state='owner_reported', published_at=now(),
          publish_result=coalesce(publish_result,'{}'::jsonb)||jsonb_build_object('published_by','user','at',now()), version=version+1, updated_at=now()
          WHERE id=p.id;
      ELSIF p_status='approved' THEN
        UPDATE planned_posts SET status='approved', approval_state='approved', version=version+1, updated_at=now() WHERE id=p.id;
      ELSIF p_status='rejected' THEN
        UPDATE post_approvals SET revoked_at=now() WHERE workspace_id=w AND post_id=p.id AND revoked_at IS NULL;
        UPDATE planned_posts SET status='rejected', approval_state='rejected', version=version+1, updated_at=now() WHERE id=p.id;
      END IF;
    END IF;
    changed := changed + 1;
  END LOOP;
  RETURN changed;
END $$;

-- 2. delete_post: a post that was ever sent keeps its evidence and cannot be deleted.
CREATE OR REPLACE FUNCTION delete_post(p_ids uuid[])
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w uuid := auth.uid(); cur_id uuid; changed integer := 0;
BEGIN
  IF w IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_ids IS NULL OR array_length(p_ids,1) IS NULL OR array_length(p_ids,1) > 500 THEN RAISE EXCEPTION 'INVALID_IDS'; END IF;
  FOREACH cur_id IN ARRAY p_ids LOOP
    IF EXISTS(SELECT 1 FROM publish_attempts WHERE post_id=cur_id AND workspace_id=w) THEN RAISE EXCEPTION 'HAS_PUBLISH_HISTORY'; END IF;
    DELETE FROM planned_posts WHERE id=cur_id AND workspace_id=w;
    IF FOUND THEN changed := changed + 1; END IF;
  END LOOP;
  RETURN changed;
END $$;

-- 3. authorize_post_publish (owner click, step 2): binds the exact version, Page and
--    time to a publish approval. It does not send; the server claims and sends next.
--    p_mode 'now' publishes immediately; 'schedule' asks Facebook to publish at
--    p_instant, which must be 15 minutes to 29 days ahead (Facebook allows 10 minutes
--    to 30 days; ours keeps a safety margin on both ends).
CREATE OR REPLACE FUNCTION authorize_post_publish(p_post_id uuid,p_expected_version integer,p_mode text,p_instant timestamptz,p_zone text)
RETURNS planned_posts LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w uuid := auth.uid(); p planned_posts; conn platform_connections; pv post_versions; st jsonb; nextrev integer; existing post_approvals; at_time timestamptz;
BEGIN
  IF w IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_mode NOT IN ('now','schedule') THEN RAISE EXCEPTION 'INVALID_MODE'; END IF;
  SELECT * INTO p FROM planned_posts WHERE id=p_post_id AND workspace_id=w FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  -- Already sent (or being sent): a second click never sends again.
  IF p.status IN ('publishing','scheduled','published') THEN RAISE EXCEPTION 'ALREADY_ATTEMPTED'; END IF;
  IF p.version <> p_expected_version THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
  IF p.status <> 'approved' OR p.approval_state <> 'approved' THEN RAISE EXCEPTION 'NOT_APPROVED'; END IF;

  UPDATE post_holds SET resolved_at=now(), resolution='rescheduled'
    WHERE workspace_id=w AND post_id=p.id AND resolved_at IS NULL AND kind IN ('connection','missed_window');
  IF EXISTS(SELECT 1 FROM post_holds WHERE workspace_id=w AND post_id=p.id AND resolved_at IS NULL) THEN RAISE EXCEPTION 'HELD'; END IF;

  SELECT * INTO conn FROM platform_connections WHERE workspace_id=w AND platform='facebook' AND status='connected' AND page_id IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_CONNECTION'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=p_zone) THEN RAISE EXCEPTION 'INVALID_ZONE'; END IF;

  IF p_mode='schedule' THEN
    IF p_instant IS NULL OR p_instant < now() + interval '15 minutes' OR p_instant > now() + interval '29 days' THEN RAISE EXCEPTION 'TIME_OUT_OF_RANGE'; END IF;
    at_time := p_instant;
  ELSE
    at_time := now();
  END IF;
  -- latenessAllowanceMinutes is required by the post_versions CHECK; with Facebook
  -- scheduling there is no lateness window, so it is always 0.
  st := jsonb_build_object('instant',at_time,'zone',p_zone,'latenessAllowanceMinutes',0,'mode',p_mode);

  -- A time or destination change creates a new post version (PRD FR-34).
  SELECT * INTO pv FROM post_versions WHERE id=p.current_version_id AND workspace_id=w FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF pv.scheduled_time IS NULL AND pv.page_id IS NULL AND NOT EXISTS(SELECT 1 FROM publish_attempts WHERE post_version_id=pv.id) THEN
    UPDATE post_versions SET scheduled_time=st, page_id=conn.page_id, connection_id=conn.id WHERE id=pv.id RETURNING * INTO pv;
  ELSIF pv.scheduled_time IS DISTINCT FROM st OR pv.page_id IS DISTINCT FROM conn.page_id OR pv.connection_id IS DISTINCT FROM conn.id THEN
    SELECT coalesce(max(revision),0)+1 INTO nextrev FROM post_versions WHERE post_id=p.id;
    INSERT INTO post_versions(workspace_id,post_id,revision,text,link,media_asset_id,provenance,scheduled_time,page_id,connection_id)
      VALUES(w,p.id,nextrev,pv.text,pv.link,pv.media_asset_id,pv.provenance,st,conn.page_id,conn.id) RETURNING * INTO pv;
    UPDATE planned_posts SET current_version_id=pv.id WHERE id=p.id;
  END IF;
  IF EXISTS(SELECT 1 FROM publish_attempts WHERE post_version_id=pv.id) THEN RAISE EXCEPTION 'ALREADY_ATTEMPTED'; END IF;

  UPDATE post_approvals SET revoked_at=now() WHERE workspace_id=w AND post_id=p.id AND revoked_at IS NULL AND post_version_id<>pv.id;
  SELECT * INTO existing FROM post_approvals WHERE post_version_id=pv.id;
  IF FOUND THEN
    UPDATE post_approvals SET revoked_at=NULL, connection_id=conn.id, page_id=conn.page_id, authorization_generation=conn.authorization_generation, scheduled_time=st WHERE id=existing.id;
  ELSE
    INSERT INTO post_approvals(workspace_id,post_id,post_version_id,connection_id,page_id,authorization_generation,scheduled_time)
      VALUES(w,p.id,pv.id,conn.id,conn.page_id,conn.authorization_generation,st);
  END IF;

  SELECT * INTO p FROM planned_posts WHERE id=p.id;
  INSERT INTO audit_log(workspace_id,actor_id,action,entity_type,entity_id,details)
    VALUES(w,w,CASE WHEN p_mode='schedule' THEN 'post_schedule_authorized' ELSE 'post_publish_authorized' END,'post',p.id,
      jsonb_build_object('postVersionId',pv.id,'instant',at_time,'zone',p_zone));
  RETURN p;
END $$;

-- 4. claim_post_publish (server-only): the single gate before any send.
CREATE OR REPLACE FUNCTION claim_post_publish(p_post_id uuid,p_mode text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p planned_posts; a post_approvals; conn platform_connections; pv post_versions; instant timestamptz; attempt_id uuid;
BEGIN
  IF p_mode NOT IN ('now','schedule') THEN RAISE EXCEPTION 'INVALID_MODE'; END IF;
  SELECT * INTO p FROM planned_posts WHERE id=p_post_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('state','not_approved'); END IF;
  -- Never send the same version twice (checked before anything else can change state).
  IF EXISTS(SELECT 1 FROM publish_attempts WHERE post_version_id=p.current_version_id) THEN RETURN jsonb_build_object('state','already_attempted'); END IF;
  SELECT * INTO a FROM post_approvals WHERE post_version_id=p.current_version_id AND revoked_at IS NULL;
  IF NOT FOUND OR coalesce(a.scheduled_time->>'mode','now')<>p_mode THEN RETURN jsonb_build_object('state','not_approved'); END IF;

  SELECT * INTO conn FROM platform_connections WHERE workspace_id=p.workspace_id AND platform='facebook';
  IF NOT FOUND OR conn.status<>'connected' OR conn.id<>a.connection_id OR conn.authorization_generation<>a.authorization_generation THEN
    UPDATE post_approvals SET revoked_at=now() WHERE id=a.id;
    UPDATE planned_posts SET execution_state='held', updated_at=now() WHERE id=p.id;
    INSERT INTO post_holds(workspace_id,post_id,kind,reason) VALUES(p.workspace_id,p.id,'connection','The Facebook connection changed. Approve the send again after reconnecting.');
    RETURN jsonb_build_object('state','held','reason','auth_changed');
  END IF;
  IF EXISTS(SELECT 1 FROM post_holds WHERE post_id=p.id AND resolved_at IS NULL) THEN RETURN jsonb_build_object('state','held'); END IF;

  instant := (a.scheduled_time->>'instant')::timestamptz;
  -- Facebook rejects schedules under 10 minutes ahead; never send one that slipped.
  IF p_mode='schedule' AND instant < now() + interval '10 minutes' THEN
    UPDATE post_approvals SET revoked_at=now() WHERE id=a.id;
    RETURN jsonb_build_object('state','too_soon');
  END IF;

  INSERT INTO publish_attempts(workspace_id,post_id,post_version_id,connection_id,authorization_generation,state,mode)
    VALUES(p.workspace_id,p.id,p.current_version_id,conn.id,conn.authorization_generation,'claimed',p_mode) RETURNING id INTO attempt_id;
  UPDATE planned_posts SET status='publishing', execution_state='submitted', updated_at=now() WHERE id=p.id;
  SELECT * INTO pv FROM post_versions WHERE id=p.current_version_id;
  RETURN jsonb_build_object('state','claimed','attemptId',attempt_id,'workspaceId',p.workspace_id,'pageId',a.page_id,
    'connectionRef',conn.external_account_id,'message',rtrim(pv.text,E'\n '),
    'scheduleAt',CASE WHEN p_mode='schedule' THEN floor(extract(epoch FROM instant))::bigint END);
END $$;

-- 5. record_publish_result (server-only): idempotent; stores codes, never owner text.
CREATE OR REPLACE FUNCTION record_publish_result(p_attempt_id uuid,p_state text,p_provider_id text,p_permalink text,p_evidence jsonb,p_error_code text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE att publish_attempts; instant timestamptz; kind_type text; title text;
BEGIN
  IF p_state NOT IN ('confirmed','failed','uncertain') THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
  SELECT * INTO att FROM publish_attempts WHERE id=p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT (att.state IN ('claimed','submitted') OR (att.state='uncertain' AND att.error_code='stale_claim' AND p_state='confirmed')) THEN RETURN; END IF;

  UPDATE publish_attempts SET state=p_state, submitted_at=coalesce(submitted_at,now()),
    confirmed_at=CASE WHEN p_state='confirmed' THEN now() END, evidence=coalesce(p_evidence,'{}'::jsonb),
    error_code=p_error_code, provider_id=p_provider_id, permalink=p_permalink
    WHERE id=att.id;

  IF p_state='confirmed' AND att.mode='schedule' THEN
    -- Facebook accepted the scheduled post and will publish it at its time.
    SELECT (scheduled_time->>'instant')::timestamptz INTO instant FROM post_versions WHERE id=att.post_version_id;
    UPDATE planned_posts SET status='scheduled', execution_state='confirmed', scheduled_for=instant,
      publish_result=jsonb_build_object('provider','composio','id',p_provider_id,'permalink',p_permalink,'scheduledOnFacebook',true,'scheduledFor',instant), updated_at=now()
      WHERE id=att.post_id;
    UPDATE post_holds SET resolved_at=now(), resolution='confirmed_late' WHERE post_id=att.post_id AND resolved_at IS NULL AND kind='uncertain';
    kind_type:='post_scheduled'; title:='Post scheduled on Facebook';
  ELSIF p_state='confirmed' THEN
    UPDATE planned_posts SET status='published', execution_state='confirmed', published_at=now(),
      publish_result=jsonb_build_object('provider','composio','id',p_provider_id,'permalink',p_permalink), updated_at=now()
      WHERE id=att.post_id;
    UPDATE post_holds SET resolved_at=now(), resolution='confirmed_late' WHERE post_id=att.post_id AND resolved_at IS NULL AND kind='uncertain';
    kind_type:='post_published'; title:='Post published on Facebook';
  ELSIF p_state='failed' THEN
    UPDATE planned_posts SET status='failed', execution_state='failed', publish_result=jsonb_build_object('errorCode',p_error_code), updated_at=now()
      WHERE id=att.post_id;
    IF p_error_code='auth_expired' THEN UPDATE platform_connections SET status='expired' WHERE id=att.connection_id; END IF;
    kind_type:='post_failed'; title:='Post was not sent to Facebook';
  ELSE
    UPDATE planned_posts SET status='failed', execution_state='uncertain', publish_result=jsonb_build_object('errorCode',p_error_code), updated_at=now()
      WHERE id=att.post_id;
    INSERT INTO post_holds(workspace_id,post_id,kind,reason) VALUES(att.workspace_id,att.post_id,'uncertain','We could not confirm whether Facebook received this post. Check your Page (including its scheduled posts) before retrying.');
    kind_type:='post_needs_review'; title:='Post needs review';
  END IF;
  INSERT INTO notifications(workspace_id,type,subject_type,subject_id,title,dedupe_key)
    VALUES(att.workspace_id,kind_type,'post',att.post_id,title,'publish:'||att.id||':'||p_state)
    ON CONFLICT (workspace_id,dedupe_key) DO NOTHING;
END $$;

-- 6. resolve_context_holds: "I reviewed it, keep this text" (unsent posts only; posts
--    already on Facebook are never put on hold by Brain changes).
CREATE OR REPLACE FUNCTION resolve_context_holds(p_post_id uuid,p_expected_version integer)
RETURNS planned_posts LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w uuid := auth.uid(); p planned_posts;
BEGIN
  IF w IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT * INTO p FROM planned_posts WHERE id=p_post_id AND workspace_id=w FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF p.version <> p_expected_version THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
  UPDATE post_holds SET resolved_at=now(), resolution='owner_reviewed' WHERE workspace_id=w AND post_id=p.id AND resolved_at IS NULL AND kind='context';
  UPDATE planned_posts SET
    execution_state=CASE WHEN execution_state='held' AND NOT EXISTS(SELECT 1 FROM post_holds h WHERE h.post_id=p.id AND h.resolved_at IS NULL) THEN 'idle' ELSE execution_state END,
    version=version+1, updated_at=now()
    WHERE id=p.id RETURNING * INTO p;
  INSERT INTO audit_log(workspace_id,actor_id,action,entity_type,entity_id) VALUES(w,w,'post_context_reviewed','post',p.id);
  RETURN p;
END $$;

-- 7. prepare_post_retry: after a failed or unconfirmed send, a new version (one send
--    per exact version), back to approved. Never sends.
CREATE OR REPLACE FUNCTION prepare_post_retry(p_post_id uuid,p_expected_version integer)
RETURNS planned_posts LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w uuid := auth.uid(); p planned_posts; pv post_versions; nv post_versions; nextrev integer;
BEGIN
  IF w IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT * INTO p FROM planned_posts WHERE id=p_post_id AND workspace_id=w FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF p.version <> p_expected_version THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
  IF p.execution_state NOT IN ('failed','uncertain') THEN RAISE EXCEPTION 'INVALID_TRANSITION'; END IF;
  SELECT * INTO pv FROM post_versions WHERE id=p.current_version_id;
  SELECT coalesce(max(revision),0)+1 INTO nextrev FROM post_versions WHERE post_id=p.id;
  INSERT INTO post_versions(workspace_id,post_id,revision,text,link,media_asset_id,provenance)
    VALUES(w,p.id,nextrev,pv.text,pv.link,pv.media_asset_id,pv.provenance) RETURNING * INTO nv;
  UPDATE post_approvals SET revoked_at=now() WHERE workspace_id=w AND post_id=p.id AND revoked_at IS NULL;
  UPDATE post_holds SET resolved_at=now(), resolution='owner_checked_retry' WHERE workspace_id=w AND post_id=p.id AND resolved_at IS NULL AND kind='uncertain';
  UPDATE planned_posts SET current_version_id=nv.id, status='approved',
    execution_state=CASE WHEN EXISTS(SELECT 1 FROM post_holds h WHERE h.post_id=p.id AND h.resolved_at IS NULL) THEN 'held' ELSE 'idle' END,
    scheduled_for=NULL, publish_result=NULL, version=version+1, updated_at=now()
    WHERE id=p.id RETURNING * INTO p;
  RETURN p;
END $$;

-- 8. mark_stale_publish_attempts (server-only): a claim left unrecorded for 10 minutes
--    becomes Needs review. Called when the owner loads the calendar. Never retries.
CREATE OR REPLACE FUNCTION mark_stale_publish_attempts()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE att publish_attempts; n integer := 0;
BEGIN
  FOR att IN SELECT * FROM publish_attempts WHERE state IN ('claimed','submitted') AND created_at < now() - interval '10 minutes' FOR UPDATE SKIP LOCKED LOOP
    UPDATE publish_attempts SET state='uncertain', error_code='stale_claim' WHERE id=att.id;
    UPDATE planned_posts SET status='failed', execution_state='uncertain', publish_result=jsonb_build_object('errorCode','stale_claim'), updated_at=now()
      WHERE id=att.post_id AND current_version_id=att.post_version_id;
    INSERT INTO post_holds(workspace_id,post_id,kind,reason) VALUES(att.workspace_id,att.post_id,'uncertain','We could not confirm whether Facebook received this post. Check your Page (including its scheduled posts) before retrying.');
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

-- 9. Grants (rule 0.3.6). update_post/delete_post keep their existing grants.
REVOKE ALL ON FUNCTION authorize_post_publish(uuid,integer,text,timestamptz,text),
  resolve_context_holds(uuid,integer), prepare_post_retry(uuid,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION authorize_post_publish(uuid,integer,text,timestamptz,text),
  resolve_context_holds(uuid,integer), prepare_post_retry(uuid,integer) TO authenticated;
REVOKE ALL ON FUNCTION claim_post_publish(uuid,text), record_publish_result(uuid,text,text,text,jsonb,text),
  mark_stale_publish_attempts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_post_publish(uuid,text), record_publish_result(uuid,text,text,text,jsonb,text),
  mark_stale_publish_attempts() TO service_role;
