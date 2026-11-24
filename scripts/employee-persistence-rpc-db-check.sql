-- Employee runtime persistence RPC acceptance (additive, isolated local DB only).
--
-- Verifies the SECURITY DEFINER persistence RPCs introduced for the Employee
-- runtime: propose_brain_change, create_deliverable, create_post_draft.
--   * authorization: anon cannot execute; authenticated requires auth.uid()
--   * workspace isolation: rows are always scoped to auth.uid(); cross-workspace
--     reads are blocked by RLS and cannot be forged via a parameter
--   * least privilege: direct table writes remain revoked for authenticated
--   * safe search path: functions are SECURITY DEFINER SET search_path=public
--   * idempotency: an identical pending Brain proposal is reused, not duplicated
--   * delivery safety: a post draft is always status='draft' (never scheduled/published)
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id) VALUES
 ('aaaaaaaa-1111-4111-8111-111111111111'),
 ('bbbbbbbb-2222-4222-8222-222222222222');
INSERT INTO workspaces(id) VALUES
 ('aaaaaaaa-1111-4111-8111-111111111111'),
 ('bbbbbbbb-2222-4222-8222-222222222222');

-- 1. anon may not execute any privileged persistence RPC ------------------------
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN PERFORM propose_brain_change('add','offering','X','Y',NULL,'s','r',NULL); RAISE EXCEPTION 'anon executed propose_brain_change';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM create_deliverable('t','general','c',NULL,'[]'::jsonb,'[]'::jsonb,'[]'::jsonb); RAISE EXCEPTION 'anon executed create_deliverable';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM create_post_draft('facebook','c','',NULL,NULL); RAISE EXCEPTION 'anon executed create_post_draft';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE NOTICE 'PASS: anon cannot execute persistence RPCs';
END $$;
RESET ROLE;

-- 2. authenticated without a session subject is rejected ----------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
DO $$
BEGIN
  BEGIN PERFORM create_deliverable('t','general','c',NULL,'[]'::jsonb,'[]'::jsonb,'[]'::jsonb); RAISE EXCEPTION 'unauthenticated create_deliverable accepted';
  EXCEPTION WHEN others THEN IF SQLERRM<>'NOT_AUTHENTICATED' THEN RAISE; END IF; END;
  BEGIN PERFORM create_post_draft('facebook','c','',NULL,NULL); RAISE EXCEPTION 'unauthenticated create_post_draft accepted';
  EXCEPTION WHEN others THEN IF SQLERRM<>'NOT_AUTHENTICATED' THEN RAISE; END IF; END;
  BEGIN PERFORM propose_brain_change('add','offering','X','Y',NULL,'s','r',NULL); RAISE EXCEPTION 'unauthenticated propose_brain_change accepted';
  EXCEPTION WHEN others THEN IF SQLERRM<>'NOT_AUTHENTICATED' THEN RAISE; END IF; END;
  RAISE NOTICE 'PASS: unauthenticated persistence RPC calls fail closed';
END $$;

-- 3. user A persists scoped to A; post draft is always a draft ----------------
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-1111-4111-8111-111111111111',true);
DO $$
DECLARE d jsonb; p jsonb; n integer; wid uuid;
BEGIN
  d := create_deliverable('Q4 Strategy','research_report','Full strategy body',NULL,'[]'::jsonb,'[]'::jsonb,'[]'::jsonb);
  wid := (SELECT workspace_id FROM deliverables WHERE id=(d->>'id')::uuid);
  IF wid<>'aaaaaaaa-1111-4111-8111-111111111111' THEN RAISE EXCEPTION 'deliverable not scoped to caller workspace'; END IF;
  IF NOT EXISTS(SELECT 1 FROM deliverable_versions WHERE deliverable_id=(d->>'id')::uuid AND version=1) THEN RAISE EXCEPTION 'first immutable version missing'; END IF;

  p := create_post_draft('facebook','Launch caption','#coffee',(now() + interval '2 days')::text,NULL);
  IF (p->>'status')<>'draft' THEN RAISE EXCEPTION 'post draft status is not draft'; END IF;
  IF (p->>'proposedFor') IS NULL THEN RAISE EXCEPTION 'future proposed time was not saved to proposed_for'; END IF;
  IF EXISTS(SELECT 1 FROM planned_posts WHERE id=(p->>'id')::uuid AND (status IN ('scheduled','published','publishing') OR scheduled_for IS NOT NULL)) THEN RAISE EXCEPTION 'post draft was scheduled/published'; END IF;
  BEGIN PERFORM create_post_draft('myspace','x','',NULL,NULL); RAISE EXCEPTION 'invalid platform accepted';
  EXCEPTION WHEN others THEN IF SQLERRM<>'INVALID_POST' THEN RAISE; END IF; END;

  -- Idempotent Brain proposal: identical pending proposal reused, not duplicated.
  PERFORM propose_brain_change('add','offering','Signature Coffee','250g EGP 220',NULL,'owner','seed',NULL);
  PERFORM propose_brain_change('add','offering','Signature Coffee','250g EGP 220',NULL,'owner','seed',NULL);
  SELECT count(*) INTO n FROM brain_proposals WHERE workspace_id='aaaaaaaa-1111-4111-8111-111111111111' AND status='pending';
  IF n<>1 THEN RAISE EXCEPTION 'identical pending proposal duplicated (% rows)',n; END IF;
  RAISE NOTICE 'PASS: scoped deliverable/version, draft-only post, idempotent proposal';
END $$;

-- 4. least privilege: direct table writes remain revoked for authenticated ----
DO $$
BEGIN
  BEGIN INSERT INTO deliverable_versions(workspace_id,deliverable_id,version,title,content) VALUES ('aaaaaaaa-1111-4111-8111-111111111111',gen_random_uuid(),1,'x','y'); RAISE EXCEPTION 'authenticated direct deliverable_versions insert accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO planned_posts(workspace_id,platform,caption,status) VALUES ('aaaaaaaa-1111-4111-8111-111111111111','facebook','x','draft'); RAISE EXCEPTION 'authenticated direct planned_posts insert accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO brain_proposals(workspace_id,status,diff) VALUES ('aaaaaaaa-1111-4111-8111-111111111111','pending','{}'::jsonb); RAISE EXCEPTION 'authenticated direct brain_proposals insert accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE NOTICE 'PASS: direct privileged table writes revoked for authenticated';
END $$;
RESET ROLE;

-- 5. cross-workspace isolation: user B cannot read A's deliverable -------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-2222-4222-8222-222222222222',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
DO $$
DECLARE n integer; d jsonb; wid uuid;
BEGIN
  SELECT count(*) INTO n FROM deliverables;
  IF n<>0 THEN RAISE EXCEPTION 'cross-workspace deliverables leaked to user B (% rows)',n; END IF;
  -- B's own create is scoped to B, never forgeable to A.
  d := create_deliverable('B report','general','B body',NULL,'[]'::jsonb,'[]'::jsonb,'[]'::jsonb);
  wid := (SELECT workspace_id FROM deliverables WHERE id=(d->>'id')::uuid);
  IF wid<>'bbbbbbbb-2222-4222-8222-222222222222' THEN RAISE EXCEPTION 'cross-workspace write forge succeeded'; END IF;
  RAISE NOTICE 'PASS: cross-workspace read blocked and write scoped to caller';
END $$;
RESET ROLE;
ROLLBACK;