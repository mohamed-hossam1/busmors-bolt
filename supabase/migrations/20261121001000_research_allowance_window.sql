-- The shared free-tier allowance runs on a rolling window so a workspace can run
-- research again tomorrow without any paid fallback. Paid fallback remains
-- unstorable (CHECK NOT paid_fallback).

ALTER TABLE free_tier_allowance ADD COLUMN IF NOT EXISTS window_started_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE free_tier_allowance ADD COLUMN IF NOT EXISTS window_hours integer NOT NULL DEFAULT 24 CHECK (window_hours > 0);

CREATE OR REPLACE FUNCTION reserve_provider_call(
  p_task_id uuid, p_call_id uuid, p_provider text, p_operation text, p_estimate jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w uuid:=auth.uid(); a free_tier_allowance; u provider_usage;
 pages integer:=coalesce((p_estimate->>'pages')::integer,0);
 tokens integer:=coalesce((p_estimate->>'tokens')::integer,0);
 credits integer:=coalesce((p_estimate->>'credits')::integer,0);
BEGIN
  IF w IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF p_provider IS NULL OR p_provider NOT IN ('firecrawl','tavily','exa','egypt_official','osm','composio')
   OR length(coalesce(p_operation,'')) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'INVALID_PROVIDER_CALL'; END IF;
  IF pages < 0 OR tokens < 0 OR credits < 0 THEN RAISE EXCEPTION 'INVALID_ESTIMATE'; END IF;
  IF NOT EXISTS(SELECT 1 FROM tasks WHERE id=p_task_id AND workspace_id=w) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  SELECT * INTO a FROM free_tier_allowance WHERE workspace_id=w FOR UPDATE;
  IF NOT FOUND THEN
   INSERT INTO free_tier_allowance(workspace_id) VALUES(w) RETURNING * INTO a;
  END IF;
  IF a.paid_fallback THEN RAISE EXCEPTION 'POLICY_VIOLATION'; END IF;
  IF now() >= a.window_started_at + make_interval(hours => a.window_hours) THEN
   UPDATE free_tier_allowance
    SET calls_used=0, pages_used=0, tokens_used=0, credits_used=0, window_started_at=now(), updated_at=now()
    WHERE workspace_id=w RETURNING * INTO a;
  END IF;
  IF a.calls_used + 1 > a.calls_limit OR a.pages_used + pages > a.pages_limit
   OR a.credits_used + credits > a.credits_limit THEN
   RAISE EXCEPTION 'INSUFFICIENT_ALLOWANCE' USING ERRCODE='P0001';
  END IF;
  INSERT INTO provider_usage(workspace_id,task_id,call_id,provider,operation,reserved,status)
   VALUES(w,p_task_id,p_call_id,p_provider,p_operation,jsonb_build_object('calls',1,'pages',pages,'tokens',tokens,'credits',credits),'reserved')
   RETURNING * INTO u;
  UPDATE free_tier_allowance
   SET calls_used=calls_used+1, pages_used=pages_used+pages, credits_used=credits_used+credits, updated_at=now()
   WHERE workspace_id=w RETURNING * INTO a;
  RETURN jsonb_build_object('reservationId',u.id,'allowance',jsonb_build_object(
   'calls',a.calls_limit-a.calls_used,'pages',a.pages_limit-a.pages_used,
   'tokens',a.tokens_limit-a.tokens_used,'credits',a.credits_limit-a.credits_used,
   'windowEndsAt',a.window_started_at + make_interval(hours => a.window_hours),
   'reserved',jsonb_build_object('calls',1,'pages',pages,'tokens',tokens,'credits',credits)));
END $$;

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
  UPDATE free_tier_allowance
   SET tokens_used=tokens_used+tokens,
       pages_used=pages_used + greatest(pages - coalesce((u.reserved->>'pages')::integer,0),0),
       credits_used=credits_used + greatest(credits - coalesce((u.reserved->>'credits')::integer,0),0),
       updated_at=now()
   WHERE workspace_id=w RETURNING * INTO a;
  RETURN jsonb_build_object('reservationId',u.id,'settled',true,'usage',p_actual,'allowance',jsonb_build_object(
   'calls',a.calls_limit-a.calls_used,'pages',a.pages_limit-a.pages_used,
   'tokens',a.tokens_limit-a.tokens_used,'credits',a.credits_limit-a.credits_used));
END $$;

REVOKE ALL ON FUNCTION reserve_provider_call(uuid,uuid,text,text,jsonb), settle_provider_call(uuid,uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION reserve_provider_call(uuid,uuid,text,text,jsonb), settle_provider_call(uuid,uuid,jsonb) TO authenticated;

