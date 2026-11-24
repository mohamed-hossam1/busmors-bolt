-- Admin read-audit (spec §13.7).
--
-- Records every administrative read of trace data (list, detail, payload,
-- export): who read what, when, scope and outcome. This is additive and
-- forward-only; it does not alter historical migrations, existing tables, or the
-- record_admin_trace path. Service-role only, like the rest of the admin surface.

CREATE TABLE IF NOT EXISTS admin_read_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('list','detail','payload','export')),
  trace_id uuid,
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  outcome text NOT NULL DEFAULT 'success' CHECK (outcome IN ('success','denied','error')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_read_audit_actor_idx ON admin_read_audit(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_read_audit_trace_idx ON admin_read_audit(trace_id, created_at DESC);

ALTER TABLE admin_read_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON admin_read_audit FROM PUBLIC, anon, authenticated;
GRANT ALL ON admin_read_audit TO service_role;

-- Service-role-only append. Never stores payloads; only references and scope.
CREATE OR REPLACE FUNCTION record_admin_read_audit(
  p_actor_id uuid,
  p_action text,
  p_trace_id uuid DEFAULT NULL,
  p_scope jsonb DEFAULT '{}'::jsonb,
  p_outcome text DEFAULT 'success'
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  r admin_read_audit;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  IF p_actor_id IS NULL OR p_action NOT IN ('list','detail','payload','export') THEN RAISE EXCEPTION 'INVALID_AUDIT'; END IF;
  INSERT INTO admin_read_audit(actor_id,action,trace_id,scope,outcome)
  VALUES(p_actor_id,p_action,p_trace_id,coalesce(p_scope,'{}'::jsonb),coalesce(p_outcome,'success'))
  RETURNING * INTO r;
  RETURN r.id;
END $$;

REVOKE ALL ON FUNCTION record_admin_read_audit(uuid,text,uuid,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_admin_read_audit(uuid,text,uuid,jsonb,text) TO service_role;

NOTIFY pgrst, 'reload schema';