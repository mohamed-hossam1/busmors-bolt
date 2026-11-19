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
  changed := update_post(ARRAY[pa.id],NULL,NULL,'published');
  IF changed <> 1 THEN RAISE EXCEPTION 'publish failed'; END IF;
  IF (SELECT execution_state FROM planned_posts WHERE id=pa.id) <> 'owner_reported' THEN RAISE EXCEPTION 'owner_reported not set'; END IF;

  -- Edit after approval invalidates approval and bumps version.
  changed := update_post(ARRAY[pa.id],NULL,'A edited caption',NULL);
  IF changed <> 1 THEN RAISE EXCEPTION 'edit failed'; END IF;
  IF (SELECT approval_state FROM planned_posts WHERE id=pa.id) <> 'unapproved' THEN RAISE EXCEPTION 'edit did not invalidate approval'; END IF;
  IF (SELECT count(*) FROM post_versions WHERE post_id=pa.id) <> 2 THEN RAISE EXCEPTION 'edit did not create a new version'; END IF;

  -- Stale expected version is rejected.
  v := (SELECT version FROM planned_posts WHERE id=pa.id);
  BEGIN
    PERFORM update_post(ARRAY[pa.id], v+5, 'stale write', NULL);
    RAISE EXCEPTION 'Stale version accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%VERSION_CONFLICT%' THEN RAISE; END IF; END;

  -- Publish without approval is rejected.
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

ROLLBACK;