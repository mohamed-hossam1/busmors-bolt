-- Invite-only beta: promo codes, per-workspace heavy-task quota, and heavy-task run ledger.
--
-- promo_codes is service-role only (zero browser access). workspace_access and
-- heavy_task_runs expose owner reads through RLS; all writes go through
-- SECURITY DEFINER RPCs. Heavy-task reservations are short-lived (15 min) and
-- settled exactly once. Only timestamptz values are written with now().

-- 1. promo_codes ---------------------------------------------------------------
CREATE TABLE promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE
    CHECK (code = upper(btrim(code)) AND length(code) BETWEEN 4 AND 64),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','reserved','redeemed','revoked')),
  heavy_tasks_limit integer NOT NULL DEFAULT 6 CHECK (heavy_tasks_limit > 0),
  batch_label text,
  note text,
  expires_at timestamptz,
  reservation_token uuid,
  reserved_until timestamptz,
  reserved_phone text,
  redeemed_by_workspace_id uuid UNIQUE REFERENCES workspaces(id) ON DELETE SET NULL,
  redeemed_phone text,
  redeemed_email text,
  redeemed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON promo_codes FROM PUBLIC, anon, authenticated;
GRANT ALL ON promo_codes TO service_role;

-- 2. workspace_access ----------------------------------------------------------
CREATE TABLE workspace_access (
  workspace_id uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  promo_code_id uuid UNIQUE REFERENCES promo_codes(id) ON DELETE RESTRICT,
  phone_number text UNIQUE,
  heavy_tasks_limit integer NOT NULL DEFAULT 6 CHECK (heavy_tasks_limit >= 0),
  heavy_tasks_used integer NOT NULL DEFAULT 0 CHECK (heavy_tasks_used >= 0),
  activated_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE workspace_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner read own access" ON workspace_access
  FOR SELECT TO authenticated USING (workspace_id = auth.uid());
REVOKE ALL ON workspace_access FROM PUBLIC, anon, authenticated;
GRANT SELECT ON workspace_access TO authenticated;
GRANT ALL ON workspace_access TO service_role;

-- 3. heavy_task_runs -----------------------------------------------------------
CREATE TABLE heavy_task_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('director_chat','roadmap_generate')),
  conversation_id uuid,
  trace_id uuid,
  status text NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved','consumed','released_clarification','released_failed','expired')),
  reserved_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  settled_at timestamptz
);
CREATE INDEX heavy_task_runs_workspace_status_idx
  ON heavy_task_runs(workspace_id, status, expires_at);
ALTER TABLE heavy_task_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner read own heavy runs" ON heavy_task_runs
  FOR SELECT TO authenticated USING (workspace_id = auth.uid());
REVOKE ALL ON heavy_task_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON heavy_task_runs TO authenticated;
GRANT ALL ON heavy_task_runs TO service_role;

-- 4. RPCs ----------------------------------------------------------------------

-- check_promo_code: validity preview for the signup UI (service_role only).
CREATE FUNCTION check_promo_code(p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_code text := upper(btrim(coalesce(p_code,'')));
  v_promo promo_codes;
BEGIN
  IF coalesce(nullif(auth.role(), ''), current_user) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;

  IF v_code = '' THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'invalid');
  END IF;

  SELECT * INTO v_promo FROM promo_codes WHERE code = v_code;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'invalid');
  END IF;
  IF v_promo.status = 'revoked' THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'revoked');
  END IF;
  IF v_promo.status = 'redeemed' THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'used');
  END IF;
  IF v_promo.expires_at IS NOT NULL AND v_promo.expires_at <= now() THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'expired');
  END IF;
  IF v_promo.status = 'reserved' AND v_promo.reserved_until > now() THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'used');
  END IF;

  RETURN jsonb_build_object('valid', true, 'heavyTasksLimit', v_promo.heavy_tasks_limit);
END $$;

-- reserve_promo_signup: atomically move a code to a 2-minute phone reservation.
CREATE FUNCTION reserve_promo_signup(p_code text, p_phone text, p_reservation_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_code text := upper(btrim(coalesce(p_code,'')));
  v_promo promo_codes;
BEGIN
  IF coalesce(nullif(auth.role(), ''), current_user) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;

  IF v_code = '' THEN
    RETURN jsonb_build_object('ok', false, 'errorCode', 'INVALID_PROMO_CODE');
  END IF;
  IF coalesce(p_phone,'') = '' THEN
    RETURN jsonb_build_object('ok', false, 'errorCode', 'INVALID_PROMO_CODE');
  END IF;
  IF p_reservation_token IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'errorCode', 'INVALID_PROMO_CODE');
  END IF;

  -- Validate the promo code BEFORE the phone lookup so an attacker cannot use the
  -- PHONE_ALREADY_REGISTERED response to enumerate which phone numbers exist.
  SELECT * INTO v_promo FROM promo_codes WHERE code = v_code FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'errorCode', 'INVALID_PROMO_CODE');
  END IF;
  IF v_promo.status = 'revoked' THEN
    RETURN jsonb_build_object('ok', false, 'errorCode', 'PROMO_REVOKED');
  END IF;
  IF v_promo.expires_at IS NOT NULL AND v_promo.expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'errorCode', 'PROMO_EXPIRED');
  END IF;
  IF v_promo.status = 'redeemed'
     OR (v_promo.status = 'reserved' AND v_promo.reserved_until > now()) THEN
    RETURN jsonb_build_object('ok', false, 'errorCode', 'PROMO_ALREADY_USED');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('promo_phone:' || p_phone, 0));

  IF EXISTS (
    SELECT 1 FROM workspace_access WHERE phone_number = p_phone
  ) OR EXISTS (
    SELECT 1 FROM promo_codes
    WHERE reserved_phone = p_phone AND status = 'reserved' AND reserved_until > now()
  ) THEN
    RETURN jsonb_build_object('ok', false, 'errorCode', 'PHONE_ALREADY_REGISTERED');
  END IF;

  UPDATE promo_codes SET
    status = 'reserved',
    reservation_token = p_reservation_token,
    reserved_until = now() + interval '2 minutes',
    reserved_phone = p_phone
  WHERE id = v_promo.id;

  RETURN jsonb_build_object('ok', true, 'promoId', v_promo.id, 'heavyTasksLimit', v_promo.heavy_tasks_limit);
END $$;

-- release_promo_signup: free a reservation that did not complete in time.
CREATE FUNCTION release_promo_signup(p_code text, p_reservation_token uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_code text := upper(btrim(coalesce(p_code,'')));
BEGIN
  IF coalesce(nullif(auth.role(), ''), current_user) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;

  UPDATE promo_codes SET
    status = 'active',
    reservation_token = NULL,
    reserved_until = NULL,
    reserved_phone = NULL
  WHERE code = v_code AND status = 'reserved' AND reservation_token = p_reservation_token;
END $$;

-- finalize_promo_signup: redeem a reservation and provision the workspace.
CREATE FUNCTION finalize_promo_signup(
  p_user_id uuid,
  p_code text,
  p_phone text,
  p_email text,
  p_reservation_token uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_code text := upper(btrim(coalesce(p_code,'')));
  v_promo promo_codes;
BEGIN
  IF coalesce(nullif(auth.role(), ''), current_user) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;

  SELECT * INTO v_promo FROM promo_codes
   WHERE code = v_code AND reservation_token = p_reservation_token AND status = 'reserved'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROMO_RESERVATION_INVALID';
  END IF;

  INSERT INTO workspaces(id) VALUES (p_user_id) ON CONFLICT (id) DO NOTHING;
  INSERT INTO workspace_settings(workspace_id) VALUES (p_user_id) ON CONFLICT (workspace_id) DO NOTHING;

  UPDATE promo_codes SET
    status = 'redeemed',
    redeemed_by_workspace_id = p_user_id,
    redeemed_phone = p_phone,
    redeemed_email = lower(btrim(coalesce(p_email,''))),
    redeemed_at = now(),
    reservation_token = NULL,
    reserved_until = NULL,
    reserved_phone = NULL
  WHERE id = v_promo.id;

  INSERT INTO workspace_access(workspace_id, promo_code_id, phone_number, heavy_tasks_limit, heavy_tasks_used)
  VALUES (p_user_id, v_promo.id, p_phone, v_promo.heavy_tasks_limit, 0);

  RETURN jsonb_build_object('ok', true, 'workspaceId', p_user_id, 'heavyTasksLimit', v_promo.heavy_tasks_limit);
END $$;

-- get_heavy_task_quota: live quota snapshot for the signed-in owner.
CREATE FUNCTION get_heavy_task_quota()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a workspace_access;
  v_reserved integer;
BEGIN
  SELECT * INTO a FROM workspace_access WHERE workspace_id = auth.uid();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('activated', false, 'limit', 0, 'used', 0, 'reserved', 0, 'remaining', 0);
  END IF;

  SELECT count(*) INTO v_reserved
    FROM heavy_task_runs
   WHERE workspace_id = auth.uid() AND status = 'reserved' AND expires_at > now();

  RETURN jsonb_build_object(
    'activated', true,
    'limit', a.heavy_tasks_limit,
    'used', a.heavy_tasks_used,
    'reserved', v_reserved,
    'remaining', greatest(0, a.heavy_tasks_limit - a.heavy_tasks_used - v_reserved)
  );
END $$;

-- reserve_heavy_task: claim a heavy-task slot for a new run (service_role only).
CREATE FUNCTION reserve_heavy_task(
  p_workspace_id uuid,
  p_run_id uuid,
  p_source text,
  p_conversation_id uuid DEFAULT NULL,
  p_trace_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a workspace_access;
  v_reserved integer;
BEGIN
  IF coalesce(nullif(auth.role(), ''), current_user) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;

  IF p_source IS NULL OR p_source NOT IN ('director_chat','roadmap_generate') THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'INVALID_SOURCE', 'limit', 0, 'used', 0, 'reserved', 0, 'remaining', 0);
  END IF;

  SELECT * INTO a FROM workspace_access WHERE workspace_id = p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'NO_WORKSPACE_ACCESS', 'limit', 0, 'used', 0, 'reserved', 0, 'remaining', 0);
  END IF;

  UPDATE heavy_task_runs SET status = 'expired', settled_at = now()
   WHERE workspace_id = p_workspace_id AND status = 'reserved' AND expires_at <= now();

  SELECT count(*) INTO v_reserved
    FROM heavy_task_runs
   WHERE workspace_id = p_workspace_id AND status = 'reserved' AND expires_at > now();

  IF a.heavy_tasks_used + v_reserved >= a.heavy_tasks_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'QUOTA_EXHAUSTED',
      'limit', a.heavy_tasks_limit,
      'used', a.heavy_tasks_used,
      'reserved', v_reserved,
      'remaining', 0
    );
  END IF;

  INSERT INTO heavy_task_runs(id, workspace_id, source, conversation_id, trace_id, status)
  VALUES (p_run_id, p_workspace_id, p_source, p_conversation_id, p_trace_id, 'reserved');

  RETURN jsonb_build_object(
    'allowed', true,
    'runId', p_run_id,
    'limit', a.heavy_tasks_limit,
    'used', a.heavy_tasks_used,
    'reserved', v_reserved + 1,
    'remaining', greatest(0, a.heavy_tasks_limit - a.heavy_tasks_used - v_reserved - 1)
  );
END $$;

-- settle_heavy_task: consume a reserved (or expired) run exactly once.
CREATE FUNCTION settle_heavy_task(p_workspace_id uuid, p_run_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a workspace_access;
  r heavy_task_runs;
  v_reserved integer;
BEGIN
  IF coalesce(nullif(auth.role(), ''), current_user) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;

  SELECT * INTO a FROM workspace_access WHERE workspace_id = p_workspace_id FOR UPDATE;

  SELECT * INTO r FROM heavy_task_runs
   WHERE id = p_run_id AND workspace_id = p_workspace_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'HEAVY_TASK_RUN_NOT_FOUND';
  END IF;

  IF r.status = 'consumed' THEN
    SELECT count(*) INTO v_reserved
      FROM heavy_task_runs
     WHERE workspace_id = p_workspace_id AND status = 'reserved' AND expires_at > now();
    RETURN jsonb_build_object(
      'settled', true,
      'limit', a.heavy_tasks_limit,
      'used', a.heavy_tasks_used,
      'reserved', v_reserved,
      'remaining', greatest(0, a.heavy_tasks_limit - a.heavy_tasks_used - v_reserved)
    );
  END IF;

  IF r.status IN ('reserved','expired') THEN
    UPDATE heavy_task_runs SET status = 'consumed', settled_at = now()
     WHERE id = p_run_id AND workspace_id = p_workspace_id;
    UPDATE workspace_access SET
      heavy_tasks_used = least(heavy_tasks_limit, heavy_tasks_used + 1),
      updated_at = now()
     WHERE workspace_id = p_workspace_id
     RETURNING * INTO a;
  END IF;

  SELECT count(*) INTO v_reserved
    FROM heavy_task_runs
   WHERE workspace_id = p_workspace_id AND status = 'reserved' AND expires_at > now();

  RETURN jsonb_build_object(
    'settled', true,
    'limit', a.heavy_tasks_limit,
    'used', a.heavy_tasks_used,
    'reserved', v_reserved,
    'remaining', greatest(0, a.heavy_tasks_limit - a.heavy_tasks_used - v_reserved)
  );
END $$;

-- release_heavy_task: free a reservation without consuming quota.
CREATE FUNCTION release_heavy_task(p_workspace_id uuid, p_run_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a workspace_access;
  v_reserved integer;
BEGIN
  IF coalesce(nullif(auth.role(), ''), current_user) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;

  IF p_reason IS NULL OR p_reason NOT IN ('released_clarification','released_failed') THEN
    RAISE EXCEPTION 'INVALID_RELEASE_REASON';
  END IF;

  UPDATE heavy_task_runs SET status = p_reason, settled_at = now()
   WHERE id = p_run_id AND workspace_id = p_workspace_id AND status = 'reserved';

  SELECT * INTO a FROM workspace_access WHERE workspace_id = p_workspace_id;

  SELECT count(*) INTO v_reserved
    FROM heavy_task_runs
   WHERE workspace_id = p_workspace_id AND status = 'reserved' AND expires_at > now();

  RETURN jsonb_build_object(
    'released', true,
    'limit', a.heavy_tasks_limit,
    'used', a.heavy_tasks_used,
    'reserved', v_reserved,
    'remaining', greatest(0, a.heavy_tasks_limit - a.heavy_tasks_used - v_reserved)
  );
END $$;

-- Grants for the RPCs ----------------------------------------------------------
REVOKE ALL ON FUNCTION check_promo_code(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION reserve_promo_signup(text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION release_promo_signup(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION finalize_promo_signup(uuid, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION reserve_heavy_task(uuid, uuid, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION settle_heavy_task(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION release_heavy_task(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION check_promo_code(text) TO service_role;
GRANT EXECUTE ON FUNCTION reserve_promo_signup(text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION release_promo_signup(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION finalize_promo_signup(uuid, text, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION reserve_heavy_task(uuid, uuid, text, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION settle_heavy_task(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION release_heavy_task(uuid, uuid, text) TO service_role;

-- get_heavy_task_quota is callable by the signed-in owner and by service_role.
REVOKE ALL ON FUNCTION get_heavy_task_quota() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_heavy_task_quota() TO authenticated, service_role;

-- 5. Backfill: every existing workspace gets the default heavy-task allowance. --
INSERT INTO workspace_access (workspace_id, heavy_tasks_limit, heavy_tasks_used)
SELECT id, 6, 0 FROM workspaces
ON CONFLICT (workspace_id) DO NOTHING;