-- Review fixes: settle refunds the unused part of a reservation, research proposals
-- are only decidable through the owner-approval RPC, and the policy probe is callable.

CREATE OR REPLACE FUNCTION settle_provider_call(
  p_task_id uuid, p_call_id uuid, p_actual jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w uuid:=auth.uid(); u provider_usage; a free_tier_allowance;
 tokens integer:=coalesce((p_actual->>'tokens')::integer,0);
 credits integer:=coalesce((p_actual->>'credits')::integer,0);
 pages integer:=coalesce((p_actual->>'pages')::integer,0);
BEGIN
  IF w IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF tokens < 0 OR credits < 0 OR pages < 0 THEN RAISE EXCEPTION 'INVALID_USAGE'; END IF;
  SELECT * INTO u FROM provider_usage WHERE task_id=p_task_id AND call_id=p_call_id AND workspace_id=w FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  SELECT * INTO a FROM free_tier_allowance WHERE workspace_id=w;
  IF u.status='settled' THEN
   RETURN jsonb_build_object('reservationId',u.id,'settled',true,'usage',u.actual,'allowance',jsonb_build_object(
    'calls',a.calls_limit-a.calls_used,'pages',a.pages_limit-a.pages_used,
    'tokens',a.tokens_limit-a.tokens_used,'credits',a.credits_limit-a.credits_used));
  END IF;
  IF u.status<>'reserved' THEN RAISE EXCEPTION 'INVALID_USAGE'; END IF;
  UPDATE provider_usage SET status='settled', actual=p_actual, settled_at=now() WHERE id=u.id;
  -- Settle the actual charge: the reserved-but-unused part goes back to the allowance.
  UPDATE free_tier_allowance
   SET tokens_used=tokens_used+tokens,
       pages_used=greatest(pages_used - coalesce((u.reserved->>'pages')::integer,0) + pages,0),
       credits_used=greatest(credits_used - coalesce((u.reserved->>'credits')::integer,0) + credits,0),
       updated_at=now()
   WHERE workspace_id=w RETURNING * INTO a;
  RETURN jsonb_build_object('reservationId',u.id,'settled',true,'usage',p_actual,'allowance',jsonb_build_object(
   'calls',a.calls_limit-a.calls_used,'pages',a.pages_limit-a.pages_used,
   'tokens',a.tokens_limit-a.tokens_used,'credits',a.credits_limit-a.credits_used));
END $$;

-- A client must not be able to approve a proposal by writing status directly.
DROP POLICY IF EXISTS "owner decide" ON research_proposals;
REVOKE UPDATE, INSERT ON research_proposals FROM authenticated;
GRANT SELECT ON research_proposals TO authenticated;

GRANT EXECUTE ON FUNCTION research_policy_checks() TO authenticated;
REVOKE ALL ON FUNCTION reserve_provider_call(uuid,uuid,text,text,jsonb), settle_provider_call(uuid,uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION reserve_provider_call(uuid,uuid,text,text,jsonb), settle_provider_call(uuid,uuid,jsonb) TO authenticated;