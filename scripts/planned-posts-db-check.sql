-- C02 acceptance: planned_posts write protection + two-user ownership isolation.
-- Runs against a Supabase database with auth schema present. Self-rolls-back.
\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users(id) VALUES('a1111111-1111-4111-8111-111111111111');
INSERT INTO auth.users(id) VALUES('b2222222-2222-4222-8222-222222222222');

-- A creates a draft post via the RPC and drives it through approve -> publish -> edit.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a1111111-1111-4111-8111-111111111111',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);

CREATE TEMP TABLE a_post(id uuid) ON COMMIT DROP;

DO $$
DECLARE pa planned_posts; changed integer; v integer;
BEGIN
  PERFORM bootstrap_workspace();
  pa := create_post('facebook','A owned caption','#a',NULL,'{}'::jsonb,'',gen_random_uuid());
  IF pa.id IS NULL OR pa.workspace_id <> auth.uid() OR pa.status <> 'draft' THEN RAISE EXCEPTION 'create_post failed'; END IF;
  IF (SELECT count(*) FROM post_versions WHERE post_id=pa.id AND revision=1) <> 1 THEN RAISE EXCEPTION 'version 1 missing'; END IF;
  INSERT INTO a_post(id) VALUES(pa.id);

  -- Direct client DML must be denied (no table grant).
  BEGIN
    UPDATE planned_posts SET caption='hacked' WHERE id=pa.id;
    RAISE EXCEPTION 'Direct UPDATE should be denied';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO planned_posts(workspace_id,platform,caption) VALUES(auth.uid(),'facebook','direct');
    RAISE EXCEPTION 'Direct INSERT should be denied';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  changed := update_post(ARRAY[pa.id],NULL,NULL,'approved');
  IF changed <> 1 THEN RAISE EXCEPTION 'approve failed'; END IF;
  IF (SELECT approval_state FROM planned_posts WHERE id=pa.id) <> 'approved' THEN RAISE EXCEPTION 'approval_state not set'; END IF;

  -- Edit after approval returns the post to draft, invalidates approval and bumps version.
  changed := update_post(ARRAY[pa.id],NULL,'A edited caption',NULL);
  IF changed <> 1 THEN RAISE EXCEPTION 'edit failed'; END IF;
  IF (SELECT approval_state FROM planned_posts WHERE id=pa.id) <> 'unapproved' THEN RAISE EXCEPTION 'edit did not invalidate approval'; END IF;
  IF (SELECT status FROM planned_posts WHERE id=pa.id) <> 'draft' THEN RAISE EXCEPTION 'edit did not return the post to draft'; END IF;
  IF (SELECT count(*) FROM post_versions WHERE post_id=pa.id) <> 2 THEN RAISE EXCEPTION 'edit did not create a new version'; END IF;

  -- Owner-reported publication, then the published post is read-only.
  changed := update_post(ARRAY[pa.id],NULL,NULL,'approved');
  changed := update_post(ARRAY[pa.id],NULL,NULL,'published');
  IF changed <> 1 THEN RAISE EXCEPTION 'publish failed'; END IF;
  IF (SELECT execution_state FROM planned_posts WHERE id=pa.id) <> 'owner_reported' THEN RAISE EXCEPTION 'owner_reported not set'; END IF;
  BEGIN
    PERFORM update_post(ARRAY[pa.id],NULL,'Rewrite history',NULL);
    RAISE EXCEPTION 'Published post edited';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%LOCKED%' THEN RAISE; END IF; END;

  -- Stale expected version is rejected.
  v := (SELECT version FROM planned_posts WHERE id=pa.id);
  BEGIN
    PERFORM update_post(ARRAY[pa.id], v+5, 'stale write', NULL);
    RAISE EXCEPTION 'Stale version accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%VERSION_CONFLICT%' THEN RAISE; END IF; END;

  -- Publish without approval is rejected.
  pa := create_post('facebook','A unapproved caption','',NULL,'{}'::jsonb,'',gen_random_uuid());
  BEGIN
    PERFORM update_post(ARRAY[pa.id],NULL,NULL,'published');
    RAISE EXCEPTION 'Unapproved publish accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%NOT_APPROVED%' THEN RAISE; END IF; END;
END $$;

-- B is a different workspace.
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','b2222222-2222-4222-8222-222222222222',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);

DO $$
DECLARE a_id uuid; changed integer; ok boolean := false;
BEGIN
  PERFORM bootstrap_workspace();
  SELECT id INTO a_id FROM a_post;
  IF a_id IS NULL THEN RAISE EXCEPTION 'test setup: A post id missing'; END IF;

  -- RLS hides A's post from B.
  IF EXISTS(SELECT 1 FROM planned_posts WHERE id=a_id) THEN RAISE EXCEPTION 'B can see A post (RLS leak)'; END IF;

  -- Even given A's exact id, the RPC binds to auth.uid() and must reject.
  BEGIN
    changed := update_post(ARRAY[a_id],NULL,'intruder',NULL);
    RAISE EXCEPTION 'B updated A post';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE '%NOT_FOUND%' THEN ok := true; ELSE RAISE; END IF;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'Cross-workspace guard did not trigger'; END IF;

  -- B cannot delete A's post either: delete_post reports 0 changed (RLS-scoped).
  changed := delete_post(ARRAY[a_id]);
  IF changed <> 0 THEN RAISE EXCEPTION 'B deleted A post'; END IF;
END $$;

-- Phase 5 (Facebook-native scheduling): two-step approval, exact-version authorization,
-- one send per version, sent posts locked.
RESET ROLE;
CREATE TEMP TABLE p5(name text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT ALL ON p5 TO authenticated, service_role;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a1111111-1111-4111-8111-111111111111',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
DO $$
DECLARE pc planned_posts; pn planned_posts;
BEGIN
  pc := create_post('facebook','Phase 5 scheduled caption','#p5',NULL,'{}'::jsonb,'',gen_random_uuid());
  pn := create_post('facebook','Phase 5 publish-now caption','',NULL,'{}'::jsonb,'',gen_random_uuid());
  INSERT INTO p5 VALUES('pc',pc.id),('pn',pn.id);
  BEGIN
    PERFORM authorize_post_publish(pc.id,pc.version,'schedule',now()+interval '1 day','Africa/Cairo');
    RAISE EXCEPTION 'Authorized before Approve';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%NOT_APPROVED%' THEN RAISE; END IF; END;
  PERFORM update_post(ARRAY[pc.id,pn.id],NULL,NULL,'approved');
  SELECT * INTO pc FROM planned_posts WHERE id=pc.id;
  BEGIN
    PERFORM authorize_post_publish(pc.id,pc.version,'schedule',now()+interval '1 day','Africa/Cairo');
    RAISE EXCEPTION 'Authorized without a connection';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%NO_CONNECTION%' THEN RAISE; END IF; END;
END $$;

-- The client cannot write platform_connections; the test row is inserted as the table owner.
RESET ROLE;
INSERT INTO platform_connections(workspace_id,platform,external_account_id,page_id,page_name,account_name,status)
  VALUES('a1111111-1111-4111-8111-111111111111','facebook','ca_test','page_a','Test Page','Test Page','connected');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a1111111-1111-4111-8111-111111111111',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
DO $$
DECLARE pc planned_posts; pn planned_posts; first_version uuid; versions integer; t1 timestamptz := date_trunc('minute',now()+interval '1 day');
BEGIN
  SELECT * INTO pc FROM planned_posts WHERE id=(SELECT id FROM p5 WHERE name='pc');
  BEGIN
    PERFORM authorize_post_publish(pc.id,pc.version,'schedule',now()+interval '5 minutes','Africa/Cairo');
    RAISE EXCEPTION 'Schedule under 15 minutes accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%TIME_OUT_OF_RANGE%' THEN RAISE; END IF; END;
  BEGIN
    PERFORM authorize_post_publish(pc.id,pc.version,'schedule',now()+interval '40 days','Africa/Cairo');
    RAISE EXCEPTION 'Schedule beyond 29 days accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%TIME_OUT_OF_RANGE%' THEN RAISE; END IF; END;
  pc := authorize_post_publish(pc.id,pc.version,'schedule',t1,'Africa/Cairo');
  IF pc.status<>'approved' OR (SELECT count(*) FROM post_approvals WHERE post_id=pc.id AND revoked_at IS NULL AND post_version_id=pc.current_version_id)<>1 THEN RAISE EXCEPTION 'No active approval for the exact version'; END IF;
  first_version := pc.current_version_id;
  SELECT count(*) INTO versions FROM post_versions WHERE post_id=pc.id;
  -- A different time creates a new revision and moves the approval to it.
  pc := authorize_post_publish(pc.id,pc.version,'schedule',t1+interval '2 hours','Africa/Cairo');
  IF pc.current_version_id=first_version OR (SELECT count(*) FROM post_versions WHERE post_id=pc.id)<>versions+1 THEN RAISE EXCEPTION 'Different time did not create a new revision'; END IF;
  IF EXISTS(SELECT 1 FROM post_approvals WHERE post_version_id=first_version AND revoked_at IS NULL) THEN RAISE EXCEPTION 'Old version approval still active'; END IF;
  SELECT * INTO pn FROM planned_posts WHERE id=(SELECT id FROM p5 WHERE name='pn');
  pn := authorize_post_publish(pn.id,pn.version,'now',NULL,'Africa/Cairo');
  BEGIN
    PERFORM claim_post_publish(pc.id,'schedule');
    RAISE EXCEPTION 'Client claimed a send';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',true);
DO $$
DECLARE pid uuid := (SELECT id FROM p5 WHERE name='pc'); nid uuid := (SELECT id FROM p5 WHERE name='pn'); first jsonb; second jsonb; nowclaim jsonb;
BEGIN
  IF claim_post_publish(pid,'now')->>'state'<>'not_approved' THEN RAISE EXCEPTION 'Mode mismatch was claimed'; END IF;
  first := claim_post_publish(pid,'schedule');
  IF first->>'state'<>'claimed' OR first->>'pageId'<>'page_a' OR first->>'connectionRef'<>'ca_test' OR first->>'message' IS NULL OR (first->>'scheduleAt')::bigint < extract(epoch FROM now()+interval '1 day')::bigint THEN RAISE EXCEPTION 'Schedule claim failed: %', first; END IF;
  second := claim_post_publish(pid,'schedule');
  IF second->>'state'<>'already_attempted' THEN RAISE EXCEPTION 'Second claim was not refused: %', second; END IF;
  PERFORM record_publish_result((first->>'attemptId')::uuid,'confirmed','111_222','https://www.facebook.com/111_222','{"id":"111_222"}',NULL);
  PERFORM record_publish_result((first->>'attemptId')::uuid,'failed',NULL,NULL,NULL,'provider_error');
  IF NOT EXISTS(SELECT 1 FROM planned_posts WHERE id=pid AND status='scheduled' AND execution_state='confirmed' AND scheduled_for IS NOT NULL AND published_at IS NULL AND publish_result->>'id'='111_222' AND (publish_result->>'scheduledOnFacebook')::boolean) THEN RAISE EXCEPTION 'Scheduled-on-Facebook result not recorded (or overwritten)'; END IF;
  IF (SELECT count(*) FROM notifications WHERE subject_id=pid AND type='post_scheduled')<>1 THEN RAISE EXCEPTION 'Schedule notification missing'; END IF;
  nowclaim := claim_post_publish(nid,'now');
  IF nowclaim->>'state'<>'claimed' OR nowclaim->>'scheduleAt' IS NOT NULL THEN RAISE EXCEPTION 'Publish-now claim failed: %', nowclaim; END IF;
  PERFORM record_publish_result((nowclaim->>'attemptId')::uuid,'confirmed','111_333','https://www.facebook.com/111_333','{"id":"111_333"}',NULL);
  IF NOT EXISTS(SELECT 1 FROM planned_posts WHERE id=nid AND status='published' AND execution_state='confirmed' AND published_at IS NOT NULL) THEN RAISE EXCEPTION 'Publish-now result not recorded'; END IF;
END $$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a1111111-1111-4111-8111-111111111111',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
DO $$
DECLARE pid uuid := (SELECT id FROM p5 WHERE name='pc'); pc planned_posts;
BEGIN
  SELECT * INTO pc FROM planned_posts WHERE id=pid;
  BEGIN
    PERFORM authorize_post_publish(pid,pc.version,'now',NULL,'Africa/Cairo');
    RAISE EXCEPTION 'A sent post was authorized again';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%ALREADY_ATTEMPTED%' THEN RAISE; END IF; END;
  BEGIN
    PERFORM update_post(ARRAY[pid],NULL,'Change a post scheduled on Facebook',NULL);
    RAISE EXCEPTION 'Scheduled post edited';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%LOCKED%' THEN RAISE; END IF; END;
  BEGIN
    PERFORM delete_post(ARRAY[pid]);
    RAISE EXCEPTION 'Post with publish history deleted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%HAS_PUBLISH_HISTORY%' THEN RAISE; END IF; END;
  BEGIN
    PERFORM update_post(ARRAY[(SELECT id FROM p5 WHERE name='pn')],NULL,'Change a published post',NULL);
    RAISE EXCEPTION 'Published post edited';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%LOCKED%' THEN RAISE; END IF; END;
  RAISE NOTICE 'PASS: two-step approval, exact-version authorization, Facebook-native schedule, one send per version, sent posts locked';
END $$;

ROLLBACK;
