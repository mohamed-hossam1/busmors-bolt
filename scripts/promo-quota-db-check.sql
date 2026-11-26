-- Phase 1 acceptance: promo codes, phone-locked workspace access, and the 6 heavy-task
-- quota. Writes are service-only; the browser can read its own workspace_access row via RLS
-- and call get_heavy_task_quota, but cannot read promo_codes, write workspace_access, or call
-- the reserve/settle/release RPCs. auth.users in the local harness has only (id).
-- Self-rolls-back.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id) VALUES('a1000000-0000-4000-8000-000000000001');
INSERT INTO auth.users(id) VALUES('a1000000-0000-4000-8000-000000000002');

-- ===== Cases 1-4: promo lifecycle, all service_role only. =====
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',true);
DO $$
DECLARE
 v_check jsonb;
 v_res jsonb;
 v_fin jsonb;
 v_promo promo_codes%ROWTYPE;
 v_access workspace_access%ROWTYPE;
 v_ws workspaces%ROWTYPE;
 v_settings workspace_settings%ROWTYPE;
 u1 uuid := 'a1000000-0000-4000-8000-000000000001';
 phone1 text := '+201000000001';
 phone2 text := '+201000000002';
 t1 uuid := 'd1000000-0000-4000-8000-000000000001';
 t2 uuid := 'd1000000-0000-4000-8000-000000000002';
 t1b uuid := 'd1000000-0000-4000-8000-000000000003';
 t1c uuid := 'd1000000-0000-4000-8000-000000000004';
BEGIN
 -- Case 1: check_promo_code normalizes case/whitespace and reports valid + limit 6.
 INSERT INTO promo_codes(code) VALUES('BETA-TEST-0001');
 SELECT check_promo_code('beta-test-0001') INTO v_check;
 IF (v_check->>'valid') IS DISTINCT FROM 'true' THEN
  RAISE EXCEPTION 'Case 1 failed: lowercase code not valid: %', v_check;
 END IF;
 IF (v_check->>'heavyTasksLimit') IS DISTINCT FROM '6' THEN
  RAISE EXCEPTION 'Case 1 failed: heavyTasksLimit not 6: %', v_check;
 END IF;
 SELECT check_promo_code('  BETA-TEST-0001  ') INTO v_check;
 IF (v_check->>'valid') IS DISTINCT FROM 'true' THEN
  RAISE EXCEPTION 'Case 1 failed: whitespace-padded code not normalized to valid: %', v_check;
 END IF;
 RAISE NOTICE 'PASS: case 1 check_promo_code valid + normalization';

 -- Case 2: first reserve ok; a second reserve of the same code (different phone) is PROMO_ALREADY_USED.
 SELECT reserve_promo_signup('BETA-TEST-0001', phone1, t1) INTO v_res;
 IF (v_res->>'ok') IS DISTINCT FROM 'true' THEN
  RAISE EXCEPTION 'Case 2 failed: first reserve did not succeed: %', v_res;
 END IF;
 IF (v_res->>'heavyTasksLimit') IS DISTINCT FROM '6' THEN
  RAISE EXCEPTION 'Case 2 failed: reserve heavyTasksLimit not 6: %', v_res;
 END IF;
 SELECT reserve_promo_signup('BETA-TEST-0001', phone2, t1b) INTO v_res;
 IF (v_res->>'ok') IS DISTINCT FROM 'false' OR (v_res->>'errorCode') IS DISTINCT FROM 'PROMO_ALREADY_USED' THEN
  RAISE EXCEPTION 'Case 2 failed: second reserve not PROMO_ALREADY_USED: %', v_res;
 END IF;
 RAISE NOTICE 'PASS: case 2 reserve once + PROMO_ALREADY_USED on reuse';

 -- Case 3: reserving a second promo with an already-reserved phone is PHONE_ALREADY_REGISTERED.
 INSERT INTO promo_codes(code) VALUES('BETA-TEST-0002');
 SELECT reserve_promo_signup('BETA-TEST-0002', phone1, t1c) INTO v_res;
 IF (v_res->>'ok') IS DISTINCT FROM 'false' OR (v_res->>'errorCode') IS DISTINCT FROM 'PHONE_ALREADY_REGISTERED' THEN
  RAISE EXCEPTION 'Case 3 failed: duplicate phone not PHONE_ALREADY_REGISTERED: %', v_res;
 END IF;
 RAISE NOTICE 'PASS: case 3 duplicate phone rejected';

 -- Case 4: release restores active (token + reserved fields cleared), then reserve + finalize.
 PERFORM release_promo_signup('BETA-TEST-0001', t1);
 SELECT * INTO v_promo FROM promo_codes WHERE code='BETA-TEST-0001';
 IF v_promo.status IS DISTINCT FROM 'active' OR v_promo.reservation_token IS NOT NULL
    OR v_promo.reserved_until IS NOT NULL OR v_promo.reserved_phone IS NOT NULL THEN
  RAISE EXCEPTION 'Case 4 failed: release did not restore clean active state: %', v_promo;
 END IF;
 SELECT reserve_promo_signup('BETA-TEST-0001', phone1, t2) INTO v_res;
 IF (v_res->>'ok') IS DISTINCT FROM 'true' THEN
  RAISE EXCEPTION 'Case 4 failed: re-reserve after release did not succeed: %', v_res;
 END IF;
 SELECT finalize_promo_signup(u1, 'BETA-TEST-0001', phone1, 'Beta1@Example.com', t2) INTO v_fin;
 IF (v_fin->>'ok') IS DISTINCT FROM 'true' OR (v_fin->>'workspaceId') IS DISTINCT FROM u1::text
    OR (v_fin->>'heavyTasksLimit') IS DISTINCT FROM '6' THEN
  RAISE EXCEPTION 'Case 4 failed: finalize did not return ok/workspace/limit: %', v_fin;
 END IF;
 SELECT * INTO v_ws FROM workspaces WHERE id=u1;
 IF NOT FOUND THEN RAISE EXCEPTION 'Case 4 failed: workspaces row missing for user1'; END IF;
 SELECT * INTO v_settings FROM workspace_settings WHERE workspace_id=u1;
 IF NOT FOUND THEN RAISE EXCEPTION 'Case 4 failed: workspace_settings row missing for user1'; END IF;
 SELECT * INTO v_access FROM workspace_access WHERE workspace_id=u1;
 IF NOT FOUND THEN RAISE EXCEPTION 'Case 4 failed: workspace_access row missing for user1'; END IF;
 IF v_access.phone_number IS DISTINCT FROM phone1 OR v_access.heavy_tasks_limit <> 6 OR v_access.heavy_tasks_used <> 0 THEN
  RAISE EXCEPTION 'Case 4 failed: workspace_access wrong phone/limit/used: %', v_access;
 END IF;
 SELECT * INTO v_promo FROM promo_codes WHERE code='BETA-TEST-0001';
 IF v_promo.status IS DISTINCT FROM 'redeemed' OR v_promo.redeemed_by_workspace_id IS DISTINCT FROM u1 THEN
  RAISE EXCEPTION 'Case 4 failed: promo not redeemed by user1: %', v_promo;
 END IF;
 RAISE NOTICE 'PASS: case 4 release restores active + finalize creates workspace/settings/access';
END $$;

-- ===== Case 5: browser (authenticated as user1) is denied writes/reads and sees its quota. =====
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
DO $$
DECLARE v_quota jsonb;
BEGIN
 -- promo_codes is service-only: browser SELECT raises insufficient_privilege.
 BEGIN PERFORM count(*) FROM promo_codes; RAISE EXCEPTION 'Client read promo_codes';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 -- workspace_access is SELECT-only for the browser: UPDATE raises insufficient_privilege.
 BEGIN UPDATE workspace_access SET heavy_tasks_used = 1 WHERE workspace_id = auth.uid(); RAISE EXCEPTION 'Client updated workspace_access';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 -- get_heavy_task_quota is callable and reports a fresh 6/0/0/6 quota.
 SELECT get_heavy_task_quota() INTO v_quota;
 IF (v_quota->>'activated') IS DISTINCT FROM 'true' OR (v_quota->>'limit') IS DISTINCT FROM '6'
    OR (v_quota->>'used') IS DISTINCT FROM '0' OR (v_quota->>'reserved') IS DISTINCT FROM '0'
    OR (v_quota->>'remaining') IS DISTINCT FROM '6' THEN
  RAISE EXCEPTION 'Case 5 failed: get_heavy_task_quota not activated/6/0/0/6: %', v_quota;
 END IF;
 -- settle/release are service-only: browser calls raise insufficient_privilege.
 BEGIN PERFORM settle_heavy_task(auth.uid(), 'b2000000-0000-4000-8000-000000000099'); RAISE EXCEPTION 'Client called settle_heavy_task';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM release_heavy_task(auth.uid(), 'b2000000-0000-4000-8000-000000000099', 'released_failed'); RAISE EXCEPTION 'Client called release_heavy_task';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'PASS: case 5 browser denied promo read/access write/settle/release; quota 6/0/0/6';
END $$;

-- ===== Case 6: service_role drives reserve/release/settle with idempotency and exhaustion. =====
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claim.role','service_role',true);
DO $$
DECLARE
 v_res jsonb;
 v_run uuid;
 v_used integer := 1;
 ids uuid[] := ARRAY[
  'b2000000-0000-4000-8000-000000000003',
  'b2000000-0000-4000-8000-000000000004',
  'b2000000-0000-4000-8000-000000000005',
  'b2000000-0000-4000-8000-000000000006',
  'b2000000-0000-4000-8000-000000000007'
 ]::uuid[];
 u1 uuid := 'a1000000-0000-4000-8000-000000000001';
BEGIN
 -- Reserve then release a clarification: used stays 0, remaining back to 6.
 SELECT reserve_heavy_task(u1, 'b2000000-0000-4000-8000-000000000001', 'director_chat') INTO v_res;
 IF (v_res->>'allowed') IS DISTINCT FROM 'true' THEN
  RAISE EXCEPTION 'Case 6 failed: reserve for release did not allow: %', v_res;
 END IF;
 SELECT release_heavy_task(u1, 'b2000000-0000-4000-8000-000000000001', 'released_clarification') INTO v_res;
 IF (v_res->>'released') IS DISTINCT FROM 'true' OR (v_res->>'used') IS DISTINCT FROM '0'
    OR (v_res->>'remaining') IS DISTINCT FROM '6' THEN
  RAISE EXCEPTION 'Case 6 failed: release did not keep used 0 / remaining 6: %', v_res;
 END IF;

 -- Reserve then settle twice: used is exactly 1 (idempotent second settle).
 SELECT reserve_heavy_task(u1, 'b2000000-0000-4000-8000-000000000002', 'director_chat') INTO v_res;
 IF (v_res->>'allowed') IS DISTINCT FROM 'true' THEN
  RAISE EXCEPTION 'Case 6 failed: reserve for settle did not allow: %', v_res;
 END IF;
 SELECT settle_heavy_task(u1, 'b2000000-0000-4000-8000-000000000002') INTO v_res;
 IF (v_res->>'settled') IS DISTINCT FROM 'true' OR (v_res->>'used') IS DISTINCT FROM '1' THEN
  RAISE EXCEPTION 'Case 6 failed: first settle did not set used 1: %', v_res;
 END IF;
 SELECT settle_heavy_task(u1, 'b2000000-0000-4000-8000-000000000002') INTO v_res;
 IF (v_res->>'used') IS DISTINCT FROM '1' THEN
  RAISE EXCEPTION 'Case 6 failed: second settle was not idempotent (used<>1): %', v_res;
 END IF;

 -- Consume 5 more runs so used climbs 2..6.
 FOREACH v_run IN ARRAY ids LOOP
  SELECT reserve_heavy_task(u1, v_run, 'roadmap_generate') INTO v_res;
  IF (v_res->>'allowed') IS DISTINCT FROM 'true' THEN
   RAISE EXCEPTION 'Case 6 failed: reserve % did not allow: %', v_run, v_res;
  END IF;
  SELECT settle_heavy_task(u1, v_run) INTO v_res;
  v_used := v_used + 1;
  IF (v_res->>'used') IS DISTINCT FROM v_used::text THEN
   RAISE EXCEPTION 'Case 6 failed: expected used=% after consume, got %', v_used, v_res;
  END IF;
 END LOOP;
 IF v_used <> 6 THEN RAISE EXCEPTION 'Case 6 failed: used did not reach 6 (got %)', v_used; END IF;

 -- 6/6 used: the next reserve is refused with QUOTA_EXHAUSTED.
 SELECT reserve_heavy_task(u1, 'b2000000-0000-4000-8000-000000000008', 'director_chat') INTO v_res;
 IF (v_res->>'allowed') IS DISTINCT FROM 'false' OR (v_res->>'reason') IS DISTINCT FROM 'QUOTA_EXHAUSTED' THEN
  RAISE EXCEPTION 'Case 6 failed: reserve past 6 not QUOTA_EXHAUSTED: %', v_res;
 END IF;
 RAISE NOTICE 'PASS: case 6 release keeps used 0, settle idempotent at 1, 6/6 then QUOTA_EXHAUSTED';
END $$;

-- ===== Case 7: invalid / revoked / expired promo codes, and no phone enumeration. =====
DO $$
DECLARE
 v_check jsonb;
 v_res jsonb;
BEGIN
 -- Unknown code is invalid.
 SELECT check_promo_code('NO-SUCH-CODE-9999') INTO v_check;
 IF (v_check->>'valid') IS DISTINCT FROM 'false' OR (v_check->>'reason') IS DISTINCT FROM 'invalid' THEN
  RAISE EXCEPTION 'Case 7 failed: unknown code not invalid: %', v_check;
 END IF;

 -- Revoked code reports revoked and cannot be reserved.
 INSERT INTO promo_codes(code, status) VALUES('BETA-REVOKED-7', 'revoked');
 SELECT check_promo_code('BETA-REVOKED-7') INTO v_check;
 IF (v_check->>'valid') IS DISTINCT FROM 'false' OR (v_check->>'reason') IS DISTINCT FROM 'revoked' THEN
  RAISE EXCEPTION 'Case 7 failed: revoked code not reported revoked: %', v_check;
 END IF;
 SELECT reserve_promo_signup('BETA-REVOKED-7', '+201000000071', 'e7000000-0000-4000-8000-000000000001') INTO v_res;
 IF (v_res->>'ok') IS DISTINCT FROM 'false' OR (v_res->>'errorCode') IS DISTINCT FROM 'PROMO_REVOKED' THEN
  RAISE EXCEPTION 'Case 7 failed: revoked code reserve not PROMO_REVOKED: %', v_res;
 END IF;

 -- Expired code reports expired and cannot be reserved.
 INSERT INTO promo_codes(code, expires_at) VALUES('BETA-EXPIRED-7', now() - interval '1 minute');
 SELECT check_promo_code('BETA-EXPIRED-7') INTO v_check;
 IF (v_check->>'valid') IS DISTINCT FROM 'false' OR (v_check->>'reason') IS DISTINCT FROM 'expired' THEN
  RAISE EXCEPTION 'Case 7 failed: expired code not reported expired: %', v_check;
 END IF;
 SELECT reserve_promo_signup('BETA-EXPIRED-7', '+201000000072', 'e7000000-0000-4000-8000-000000000002') INTO v_res;
 IF (v_res->>'ok') IS DISTINCT FROM 'false' OR (v_res->>'errorCode') IS DISTINCT FROM 'PROMO_EXPIRED' THEN
  RAISE EXCEPTION 'Case 7 failed: expired code reserve not PROMO_EXPIRED: %', v_res;
 END IF;

 -- Enumeration guard: an invalid code returns INVALID_PROMO_CODE even for an already-registered
 -- phone (phone1 belongs to u1), proving the promo check precedes the phone lookup.
 SELECT reserve_promo_signup('NO-SUCH-CODE-9999', '+201000000001', 'e7000000-0000-4000-8000-000000000003') INTO v_res;
 IF (v_res->>'ok') IS DISTINCT FROM 'false' OR (v_res->>'errorCode') IS DISTINCT FROM 'INVALID_PROMO_CODE' THEN
  RAISE EXCEPTION 'Case 7 failed: invalid code + registered phone not INVALID_PROMO_CODE: %', v_res;
 END IF;
 -- A revoked code likewise precedes the phone check (PROMO_REVOKED, not PHONE_ALREADY_REGISTERED).
 SELECT reserve_promo_signup('BETA-REVOKED-7', '+201000000001', 'e7000000-0000-4000-8000-000000000004') INTO v_res;
 IF (v_res->>'ok') IS DISTINCT FROM 'false' OR (v_res->>'errorCode') IS DISTINCT FROM 'PROMO_REVOKED' THEN
  RAISE EXCEPTION 'Case 7 failed: revoked code + registered phone not PROMO_REVOKED: %', v_res;
 END IF;
 RAISE NOTICE 'PASS: case 7 invalid/revoked/expired promo codes + no phone enumeration';
END $$;

-- ===== Case 8: an expired phone reservation is reclaimed by the next caller. =====
DO $$
DECLARE
 v_res jsonb;
 v_promo promo_codes%ROWTYPE;
BEGIN
 INSERT INTO promo_codes(code) VALUES('BETA-EXPIRE-RES-8');
 SELECT reserve_promo_signup('BETA-EXPIRE-RES-8', '+201000000081', 'e8000000-0000-4000-8000-000000000001') INTO v_res;
 IF (v_res->>'ok') IS DISTINCT FROM 'true' THEN
  RAISE EXCEPTION 'Case 8 failed: first reserve did not succeed: %', v_res;
 END IF;
 -- Force the reservation to look stale (reserved_until in the past, status still reserved).
 UPDATE promo_codes SET reserved_until = now() - interval '1 minute' WHERE code='BETA-EXPIRE-RES-8';
 -- A different caller reclaims the stale reservation.
 SELECT reserve_promo_signup('BETA-EXPIRE-RES-8', '+201000000082', 'e8000000-0000-4000-8000-000000000002') INTO v_res;
 IF (v_res->>'ok') IS DISTINCT FROM 'true' THEN
  RAISE EXCEPTION 'Case 8 failed: expired reservation not reclaimed: %', v_res;
 END IF;
 SELECT * INTO v_promo FROM promo_codes WHERE code='BETA-EXPIRE-RES-8';
 IF v_promo.status IS DISTINCT FROM 'reserved' OR v_promo.reserved_phone IS DISTINCT FROM '+201000000082'
    OR v_promo.reservation_token IS DISTINCT FROM 'e8000000-0000-4000-8000-000000000002'::uuid THEN
  RAISE EXCEPTION 'Case 8 failed: reclaim did not overwrite the reservation owner: %', v_promo;
 END IF;
 RAISE NOTICE 'PASS: case 8 expired reservation reclaimed by next caller';
END $$;

-- ===== Case 9: a reserved (unsettled) heavy-task slot blocks the 7th reservation until released. =====
DO $$
DECLARE
 v_res jsonb;
 v_run uuid;
 v_used integer := 0;
 ids uuid[] := ARRAY[
  'f9000000-0000-4000-8000-000000000001',
  'f9000000-0000-4000-8000-000000000002',
  'f9000000-0000-4000-8000-000000000003',
  'f9000000-0000-4000-8000-000000000004',
  'f9000000-0000-4000-8000-000000000005'
 ]::uuid[];
 u2 uuid := 'a1000000-0000-4000-8000-000000000002';
 phoneU2 text := '+201000000091';
 tokenU2 uuid := 'e9000000-0000-4000-8000-000000000000';
BEGIN
 -- Provision a fresh workspace for u2 through a promo.
 INSERT INTO promo_codes(code) VALUES('BETA-U2-9');
 SELECT reserve_promo_signup('BETA-U2-9', phoneU2, tokenU2) INTO v_res;
 IF (v_res->>'ok') IS DISTINCT FROM 'true' THEN
  RAISE EXCEPTION 'Case 9 failed: promo reserve for u2 did not succeed: %', v_res;
 END IF;
 SELECT finalize_promo_signup(u2, 'BETA-U2-9', phoneU2, 'u2@example.com', tokenU2) INTO v_res;
 IF (v_res->>'ok') IS DISTINCT FROM 'true' THEN
  RAISE EXCEPTION 'Case 9 failed: finalize for u2 did not succeed: %', v_res;
 END IF;

 -- Consume 5 slots (used 0 -> 5).
 FOREACH v_run IN ARRAY ids LOOP
  SELECT reserve_heavy_task(u2, v_run, 'roadmap_generate') INTO v_res;
  IF (v_res->>'allowed') IS DISTINCT FROM 'true' THEN
   RAISE EXCEPTION 'Case 9 failed: reserve % did not allow: %', v_run, v_res;
  END IF;
  SELECT settle_heavy_task(u2, v_run) INTO v_res;
  v_used := v_used + 1;
  IF (v_res->>'used') IS DISTINCT FROM v_used::text THEN
   RAISE EXCEPTION 'Case 9 failed: expected used=% after consume, got %', v_used, v_res;
  END IF;
 END LOOP;

 -- Reserve a 6th slot but do NOT settle it: 5 used + 1 reserved => remaining 0.
 SELECT reserve_heavy_task(u2, 'f9000000-0000-4000-8000-000000000006', 'director_chat') INTO v_res;
 IF (v_res->>'allowed') IS DISTINCT FROM 'true' OR (v_res->>'remaining') IS DISTINCT FROM '0' THEN
  RAISE EXCEPTION 'Case 9 failed: 6th reserve (reserved) not allowed with remaining 0: %', v_res;
 END IF;

 -- The 7th reservation is refused while the 6th slot is still reserved.
 SELECT reserve_heavy_task(u2, 'f9000000-0000-4000-8000-000000000007', 'director_chat') INTO v_res;
 IF (v_res->>'allowed') IS DISTINCT FROM 'false' OR (v_res->>'reason') IS DISTINCT FROM 'QUOTA_EXHAUSTED' THEN
  RAISE EXCEPTION 'Case 9 failed: 7th reserve not QUOTA_EXHAUSTED while a slot is reserved: %', v_res;
 END IF;

 -- Releasing the reserved slot frees capacity for a new reservation.
 SELECT release_heavy_task(u2, 'f9000000-0000-4000-8000-000000000006', 'released_failed') INTO v_res;
 IF (v_res->>'released') IS DISTINCT FROM 'true' OR (v_res->>'used') IS DISTINCT FROM '5'
    OR (v_res->>'reserved') IS DISTINCT FROM '0' OR (v_res->>'remaining') IS DISTINCT FROM '1' THEN
  RAISE EXCEPTION 'Case 9 failed: release did not free the reserved slot: %', v_res;
 END IF;
 SELECT reserve_heavy_task(u2, 'f9000000-0000-4000-8000-000000000007', 'director_chat') INTO v_res;
 IF (v_res->>'allowed') IS DISTINCT FROM 'true' THEN
  RAISE EXCEPTION 'Case 9 failed: reserve after release did not allow: %', v_res;
 END IF;
 RAISE NOTICE 'PASS: case 9 reserved slot blocks the 7th reserve until released';
END $$;

-- ===== Case 10: deleting the auth user cascades access/runs and nulls the redeemed promo link. =====
RESET ROLE;
DO $$
DECLARE
 v_promo promo_codes%ROWTYPE;
 v_count integer;
 u1 uuid := 'a1000000-0000-4000-8000-000000000001';
BEGIN
  DELETE FROM auth.users WHERE id=u1;
  SELECT count(*) INTO v_count FROM workspace_access WHERE workspace_id=u1;
  IF v_count <> 0 THEN RAISE EXCEPTION 'Case 10 failed: workspace_access not cascade-deleted (% rows)', v_count; END IF;
  SELECT count(*) INTO v_count FROM heavy_task_runs WHERE workspace_id=u1;
  IF v_count <> 0 THEN RAISE EXCEPTION 'Case 10 failed: heavy_task_runs not cascade-deleted (% rows)', v_count; END IF;
  SELECT * INTO v_promo FROM promo_codes WHERE code='BETA-TEST-0001';
  IF NOT FOUND THEN RAISE EXCEPTION 'Case 10 failed: promo_codes row disappeared'; END IF;
  IF v_promo.status IS DISTINCT FROM 'redeemed' THEN
   RAISE EXCEPTION 'Case 10 failed: promo status not redeemed after user delete: %', v_promo.status;
  END IF;
  IF v_promo.redeemed_by_workspace_id IS NOT NULL THEN
   RAISE EXCEPTION 'Case 10 failed: redeemed_by_workspace_id not nulled after user delete';
  END IF;
  RAISE NOTICE 'PASS: case 10 user delete cascades access/runs, promo stays redeemed with null workspace';
  RAISE NOTICE 'PASS: promo-quota-db-check all cases (1-10)';
END $$;
ROLLBACK;