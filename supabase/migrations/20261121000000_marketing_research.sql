-- Marketing Research — Egyptian-first multi-agent system.
-- FREE_TIER_ONLY is enforced here: the allowance row cannot record paid fallback,
-- and provider calls are reserved and settled against that single row.
-- Nothing enters the Brain without owner approval: research proposals are written
-- as pending rows and only the approval RPC creates brain nodes.

-- Owner-approved research becomes a first-class Brain source.
ALTER TABLE brain_nodes DROP CONSTRAINT IF EXISTS brain_nodes_source_check;
ALTER TABLE brain_nodes ADD CONSTRAINT brain_nodes_source_check
 CHECK (source IN ('crawler','conversation','task','manual','research'));

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_type_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_type_check CHECK (type IN (
 'simple_answer','marketing_research','content_creation','campaign_planning',
 'performance_diagnosis','publishing','clarification','market_research','competitor_analysis'));
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS research_mode text;
ALTER TABLE tasks ADD CONSTRAINT tasks_research_mode_check
 CHECK (research_mode IS NULL OR research_mode IN ('quick','standard','deep'));

-- Provider-aware, inspectable sources. A blocked page is stored with an empty
-- excerpt and availability='blocked'; it is never fabricated into content.
ALTER TABLE sources ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'website';
ALTER TABLE sources ADD COLUMN IF NOT EXISTS tool_action text NOT NULL DEFAULT '';
ALTER TABLE sources ADD COLUMN IF NOT EXISTS toolkit_version text NOT NULL DEFAULT '';
ALTER TABLE sources ADD COLUMN IF NOT EXISTS captured_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE sources ADD COLUMN IF NOT EXISTS valid_until timestamptz;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS usage jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS credits integer NOT NULL DEFAULT 0;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS storage_policy text NOT NULL DEFAULT 'workspace';
ALTER TABLE sources ADD COLUMN IF NOT EXISTS sector text;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS authority text;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS geography text;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS period text;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS blocked_reason text;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS canonical_url text;
DO $$ BEGIN
 ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_availability_check;
 ALTER TABLE sources ADD CONSTRAINT sources_availability_check
  CHECK (availability IN ('retrieved','partial','blocked','unavailable'));
 ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_storage_policy_check;
 ALTER TABLE sources ADD CONSTRAINT sources_storage_policy_check
  CHECK (storage_policy IN ('ephemeral','excerpt','workspace'));
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- Real Canvas rendering needs instance and correlation ids, roles, redacted
-- parameters, consumption and timing on every event.
ALTER TABLE agent_events ADD COLUMN IF NOT EXISTS correlation_id uuid;
ALTER TABLE agent_events ADD COLUMN IF NOT EXISTS parent_instance_id uuid;
ALTER TABLE agent_events ADD COLUMN IF NOT EXISTS agent_role text NOT NULL DEFAULT 'subagent';
ALTER TABLE agent_events ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'step';
ALTER TABLE agent_events ADD COLUMN IF NOT EXISTS public_message text NOT NULL DEFAULT '';
ALTER TABLE agent_events ADD COLUMN IF NOT EXISTS redacted_parameters jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE agent_events ADD COLUMN IF NOT EXISTS source_ids jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE agent_events ADD COLUMN IF NOT EXISTS consumption jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE agent_events ADD COLUMN IF NOT EXISTS started_at timestamptz;
ALTER TABLE agent_events ADD COLUMN IF NOT EXISTS ended_at timestamptz;
ALTER TABLE agent_events ADD COLUMN IF NOT EXISTS failure_reason text;
ALTER TABLE agent_events DROP CONSTRAINT IF EXISTS agent_events_event_type_check;
ALTER TABLE agent_events ADD CONSTRAINT agent_events_event_type_check CHECK (event_type IN (
 'agent_started','agent_tool_used','agent_completed','agent_error','flow_connection',
 'tool_call','skill_read','delegation'));

-- One shared free-tier allowance record per workspace. The CHECK on paid_fallback
-- makes a paid fallback unstorable, not merely discouraged.
CREATE TABLE IF NOT EXISTS free_tier_allowance (
  workspace_id uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  calls_limit integer NOT NULL DEFAULT 24 CHECK (calls_limit > 0),
  pages_limit integer NOT NULL DEFAULT 18 CHECK (pages_limit > 0),
  tokens_limit integer NOT NULL DEFAULT 24000 CHECK (tokens_limit > 0),
  credits_limit integer NOT NULL DEFAULT 24 CHECK (credits_limit > 0),
  calls_used integer NOT NULL DEFAULT 0 CHECK (calls_used >= 0),
  pages_used integer NOT NULL DEFAULT 0 CHECK (pages_used >= 0),
  tokens_used integer NOT NULL DEFAULT 0 CHECK (tokens_used >= 0),
  credits_used integer NOT NULL DEFAULT 0 CHECK (credits_used >= 0),
  paid_fallback boolean NOT NULL DEFAULT false CHECK (NOT paid_fallback),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE free_tier_allowance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner read" ON free_tier_allowance FOR SELECT TO authenticated USING(workspace_id=auth.uid());
REVOKE ALL ON free_tier_allowance FROM PUBLIC, anon, authenticated;
GRANT SELECT ON free_tier_allowance TO authenticated;
GRANT ALL ON free_tier_allowance TO service_role;

CREATE TABLE IF NOT EXISTS provider_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  task_id uuid NOT NULL,
  call_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('firecrawl','tavily','exa','egypt_official','osm','composio')),
  operation text NOT NULL,
  reserved jsonb NOT NULL DEFAULT '{}'::jsonb,
  actual jsonb,
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','settled','released','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz,
  UNIQUE(task_id, call_id)
);
ALTER TABLE provider_usage ENABLE ROW LEVEL SECURITY;
CREATE INDEX provider_usage_workspace_idx ON provider_usage(workspace_id, task_id);
CREATE POLICY "owner read" ON provider_usage FOR SELECT TO authenticated USING(workspace_id=auth.uid());
REVOKE ALL ON provider_usage FROM PUBLIC, anon, authenticated;
GRANT SELECT ON provider_usage TO authenticated;
GRANT ALL ON provider_usage TO service_role;

CREATE TABLE IF NOT EXISTS research_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  task_id uuid NOT NULL,
  mode text NOT NULL CHECK (mode IN ('quick','standard','deep')),
  request text NOT NULL,
  reply text NOT NULL,
  report jsonb NOT NULL,
  citation_coverage numeric NOT NULL DEFAULT 0,
  claim_quality numeric NOT NULL DEFAULT 0,
  coverage_gaps jsonb NOT NULL DEFAULT '[]'::jsonb,
  consumption jsonb NOT NULL DEFAULT '{}'::jsonb,
  partial boolean NOT NULL DEFAULT false,
  report_json_path text NOT NULL DEFAULT '',
  report_html_path text NOT NULL DEFAULT '',
  pdf_path text,
  pdf_page_count integer,
  pdf_checks jsonb NOT NULL DEFAULT '[]'::jsonb,
  pdf_passed boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, id)
);
ALTER TABLE research_reports ENABLE ROW LEVEL SECURITY;
CREATE INDEX research_reports_workspace_idx ON research_reports(workspace_id, task_id);
CREATE POLICY "owner read" ON research_reports FOR SELECT TO authenticated USING(workspace_id=auth.uid());
REVOKE ALL ON research_reports FROM PUBLIC, anon, authenticated;
GRANT SELECT ON research_reports TO authenticated;
GRANT ALL ON research_reports TO service_role;

CREATE TABLE IF NOT EXISTS research_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  report_id uuid NOT NULL REFERENCES research_reports(id) ON DELETE CASCADE,
  claim_id text NOT NULL,
  statement text NOT NULL,
  statement_ar text,
  kind text NOT NULL,
  confidence text NOT NULL CHECK (confidence IN ('hypothesis','supported','validated','strong')),
  evidence_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  geography text,
  valid_from timestamptz,
  valid_until timestamptz,
  claim_quality jsonb NOT NULL DEFAULT '{}'::jsonb,
  conflicts jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(report_id, claim_id)
);
ALTER TABLE research_claims ENABLE ROW LEVEL SECURITY;
CREATE INDEX research_claims_workspace_idx ON research_claims(workspace_id, report_id);
CREATE POLICY "owner read" ON research_claims FOR SELECT TO authenticated USING(workspace_id=auth.uid());
REVOKE ALL ON research_claims FROM PUBLIC, anon, authenticated;
GRANT SELECT ON research_claims TO authenticated;
GRANT ALL ON research_claims TO service_role;

-- Typed brain proposals produced only from structured claims. Pending until the
-- owner approves; approval is the only path that creates a brain node.
CREATE TABLE IF NOT EXISTS research_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  report_id uuid NOT NULL REFERENCES research_reports(id) ON DELETE CASCADE,
  proposal_kind text NOT NULL CHECK (proposal_kind IN (
   'market_fact','competitor','audience_insight','positioning_claim','price_observation','opportunity_hypothesis')),
  title text NOT NULL,
  summary text NOT NULL,
  summary_ar text,
  diff jsonb NOT NULL,
  evidence_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence text NOT NULL CHECK (confidence IN ('hypothesis','supported','validated','strong')),
  geography text,
  valid_from timestamptz,
  valid_until timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, id)
);
ALTER TABLE research_proposals ENABLE ROW LEVEL SECURITY;
CREATE INDEX research_proposals_workspace_idx ON research_proposals(workspace_id, status);
CREATE POLICY "owner read" ON research_proposals FOR SELECT TO authenticated USING(workspace_id=auth.uid());
CREATE POLICY "owner decide" ON research_proposals FOR ALL TO authenticated USING(workspace_id=auth.uid()) WITH CHECK(workspace_id=auth.uid());
GRANT SELECT, INSERT, UPDATE ON research_proposals TO authenticated;
GRANT ALL ON research_proposals TO service_role;

-- Reserve one call/page unit from the shared allowance. Paid fallback cannot be
-- stored, so an exhausted allowance is a typed non-retryable refusal.
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
  IF u.status='settled' THEN
   SELECT * INTO a FROM free_tier_allowance WHERE workspace_id=w;
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

CREATE OR REPLACE FUNCTION release_provider_call(p_task_id uuid, p_call_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w uuid:=auth.uid(); u provider_usage;
BEGIN
  SELECT * INTO u FROM provider_usage WHERE task_id=p_task_id AND call_id=p_call_id AND workspace_id=w FOR UPDATE;
  IF NOT FOUND OR u.status<>'reserved' THEN RETURN; END IF;
  UPDATE provider_usage SET status='released', settled_at=now() WHERE id=u.id;
  UPDATE free_tier_allowance
   SET calls_used=greatest(calls_used-1,0),
       pages_used=greatest(pages_used-coalesce((u.reserved->>'pages')::integer,0),0),
       credits_used=greatest(credits_used-coalesce((u.reserved->>'credits')::integer,0),0),
       updated_at=now()
   WHERE workspace_id=w;
END $$;

CREATE OR REPLACE FUNCTION set_research_mode(p_task_id uuid, p_run_id uuid, p_mode text)
RETURNS tasks LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t tasks;
BEGIN
  SELECT * INTO t FROM tasks WHERE id=p_task_id AND workspace_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF t.status<>'running' OR t.run_id IS DISTINCT FROM p_run_id OR t.cancel_requested THEN RAISE EXCEPTION 'RUN_NOT_ACTIVE'; END IF;
  IF p_mode IS NULL OR p_mode NOT IN ('quick','standard','deep') THEN RAISE EXCEPTION 'INVALID_MODE'; END IF;
  UPDATE tasks SET research_mode=p_mode, type='marketing_research', version=version+1, updated_at=now()
   WHERE id=t.id RETURNING * INTO t;
  RETURN t;
END $$;

-- One event row plus its task step. Research runners call this for every agent,
-- tool and skill so a refresh rebuilds exactly the same graph.
CREATE OR REPLACE FUNCTION record_research_event(
  p_task_id uuid, p_run_id uuid, p_instance_id uuid, p_parent_instance_id uuid,
  p_correlation_id uuid, p_seq bigint, p_event_type text, p_agent_id text, p_agent_role text,
  p_label text, p_status text, p_public_message text, p_parameters jsonb,
  p_source_ids jsonb, p_consumption jsonb, p_failure_reason text,
  p_started_at timestamptz, p_ended_at timestamptz
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t tasks; previous_id uuid; step task_steps; v_seq bigint; v_step_status text;
BEGIN
  SELECT * INTO t FROM tasks WHERE id=p_task_id AND workspace_id=auth.uid() FOR UPDATE;
  IF NOT FOUND OR t.status<>'running' OR t.run_id IS DISTINCT FROM p_run_id OR t.cancel_requested THEN RAISE EXCEPTION 'RUN_NOT_ACTIVE'; END IF;
  IF p_event_type IS NULL OR p_event_type NOT IN ('agent_started','agent_completed','agent_error','tool_call','skill_read','delegation','flow_connection')
   OR length(coalesce(p_agent_id,'')) NOT BETWEEN 1 AND 60 OR length(coalesce(p_label,'')) NOT BETWEEN 1 AND 200
   OR p_status IS NULL OR p_status NOT IN ('queued','running','completed','partial','failed')
   OR length(coalesce(p_public_message,''))>1000 OR length(coalesce(p_failure_reason,''))>1000
   OR length(coalesce(p_parameters::text,''))>20000 OR length(coalesce(p_consumption::text,''))>4000 THEN
   RAISE EXCEPTION 'INVALID_EVENT';
  END IF;
  v_seq:=greatest(p_seq, coalesce((SELECT max(seq) FROM agent_events WHERE task_id=t.id AND run_id=p_run_id),0)+1);
  v_step_status:=CASE WHEN p_status IN ('completed','partial') THEN 'completed' WHEN p_status='failed' THEN 'failed'
   WHEN p_status='running' THEN 'running' ELSE 'planned' END;
  SELECT * INTO step FROM task_steps WHERE id=p_instance_id;
  IF step.id IS NULL THEN
   SELECT id INTO previous_id FROM task_steps WHERE task_id=t.id ORDER BY position DESC LIMIT 1;
   INSERT INTO task_steps(id,workspace_id,task_id,run_id,position,agent,label,status,started_at,completed_at)
    VALUES(p_instance_id,t.workspace_id,t.id,p_run_id,(SELECT count(*) FROM task_steps WHERE task_id=t.id),
     p_agent_id,p_label,v_step_status,
     coalesce(p_started_at,CASE WHEN p_status<>'queued' THEN now() END),
     CASE WHEN p_status IN ('completed','partial','failed') THEN coalesce(p_ended_at,now()) END);
  ELSE
   UPDATE task_steps SET status=v_step_status,
    output=coalesce(p_parameters,'{}'::jsonb), completed_at=CASE WHEN p_status IN ('completed','partial','failed') THEN coalesce(p_ended_at,now()) ELSE completed_at END
    WHERE id=step.id;
  END IF;
  INSERT INTO agent_events(workspace_id,task_id,run_id,instance_id,correlation_id,parent_instance_id,seq,event_type,
   agent_id,agent_role,public_message,redacted_parameters,source_ids,consumption,started_at,ended_at,failure_reason,payload)
   VALUES(t.workspace_id,t.id,p_run_id,p_instance_id,coalesce(p_correlation_id,gen_random_uuid()),p_parent_instance_id,v_seq,p_event_type,
    p_agent_id,coalesce(p_agent_role,'subagent'),coalesce(p_public_message,''),coalesce(p_parameters,'{}'::jsonb),
    coalesce(p_source_ids,'[]'::jsonb),coalesce(p_consumption,'{}'::jsonb),p_started_at,p_ended_at,p_failure_reason,
    jsonb_build_object('task_summary',p_label,'label',p_label,'status',p_status,'agent_role',coalesce(p_agent_role,'subagent'),
     'public_message',coalesce(p_public_message,''),'redacted_parameters',coalesce(p_parameters,'{}'::jsonb),
     'source_ids',coalesce(p_source_ids,'[]'::jsonb),'consumption',coalesce(p_consumption,'{}'::jsonb),
     'correlation_id',coalesce(p_correlation_id,gen_random_uuid()),'parent_instance_id',p_parent_instance_id,
     'started_at',p_started_at,'ended_at',p_ended_at,'failure_reason',p_failure_reason));
  IF p_event_type='delegation' AND previous_id IS NOT NULL AND previous_id<>p_instance_id THEN
   INSERT INTO agent_events(workspace_id,task_id,run_id,instance_id,correlation_id,seq,event_type,agent_id,agent_role,payload)
    VALUES(t.workspace_id,t.id,p_run_id,p_instance_id,coalesce(p_correlation_id,gen_random_uuid()),
     coalesce((SELECT max(seq) FROM agent_events WHERE task_id=t.id AND run_id=p_run_id),0)+1,'flow_connection',
     p_agent_id,coalesce(p_agent_role,'subagent'),jsonb_build_object('from',previous_id,'to',p_instance_id,'label',p_label));
  END IF;
  UPDATE tasks SET heartbeat_at=now() WHERE id=t.id;
  RETURN p_instance_id;
END $$;

-- Persist the report, its cited sources and its claim ledger in one transaction.
CREATE OR REPLACE FUNCTION save_research_result(
  p_task_id uuid, p_run_id uuid, p_result jsonb, p_partial boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 t tasks; existing jsonb; r research_reports; d deliverables; pv deliverable_versions;
 item jsonb; claim jsonb; src jsonb; ref jsonb; node brain_nodes; source_id uuid; source_map jsonb:='[]'::jsonb; support_ref jsonb; mapped_id text;
 doc_id uuid; msg_id uuid; message_ids jsonb:='[]'::jsonb; source_ids jsonb:='[]'::jsonb; claim_ids jsonb:='[]'::jsonb;
 report jsonb; mode text; citation numeric; quality numeric; gaps jsonb; consumption jsonb; partial boolean;
BEGIN
  SELECT * INTO t FROM tasks WHERE id=p_task_id AND workspace_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  SELECT task_results.output INTO existing FROM task_results WHERE task_id=t.id;
  IF FOUND THEN RETURN existing; END IF;
  IF t.status<>'running' OR t.run_id IS DISTINCT FROM p_run_id OR t.cancel_requested THEN RAISE EXCEPTION 'RUN_NOT_ACTIVE'; END IF;
  IF jsonb_typeof(p_result)<>'object' OR length(p_result::text)>160000
   OR length(coalesce(p_result->>'reply','')) NOT BETWEEN 1 AND 12000
   OR jsonb_typeof(p_result->'research')<>'object' THEN RAISE EXCEPTION 'INVALID_RESULT'; END IF;
  report:=p_result->'research';
  mode:=coalesce(report->>'mode','standard');
  IF mode NOT IN ('quick','standard','deep') THEN RAISE EXCEPTION 'INVALID_MODE'; END IF;
  partial:=coalesce(p_partial,false) OR coalesce((report->>'partial')::boolean,false);
  citation:=coalesce((report->>'citationCoverage')::numeric,0);
  quality:=coalesce((report->>'claimQuality')::numeric,0);
  gaps:=coalesce(report->'coverageGaps','[]'::jsonb);
  consumption:=coalesce(report->'consumption','{}'::jsonb);

  INSERT INTO research_reports(workspace_id,task_id,mode,request,reply,report,citation_coverage,claim_quality,
   coverage_gaps,consumption,partial,report_json_path,report_html_path,pdf_path,pdf_page_count,pdf_checks,pdf_passed)
   VALUES(t.workspace_id,t.id,mode,left(t.user_request,4000),p_result->>'reply',report,citation,quality,gaps,consumption,partial,
    coalesce(report->>'reportJsonPath',''),coalesce(report->>'reportHtmlPath',''),report->'pdf'->>'path',
    (report->'pdf'->>'pageCount')::integer,coalesce(report->'pdf'->'checks','[]'::jsonb),(report->'pdf'->>'passed')::boolean)
   RETURNING * INTO r;

  IF jsonb_typeof(p_result->'document')='object' THEN
   item:=p_result->'document';
   IF length(coalesce(item->>'title','')) NOT BETWEEN 1 AND 200 OR length(coalesce(item->>'content','')) NOT BETWEEN 1 AND 80000 THEN
    RAISE EXCEPTION 'INVALID_DOCUMENT'; END IF;
   INSERT INTO deliverables(workspace_id,task_id,title,type,content,origin,context_refs,source_refs,limitations)
    VALUES(t.workspace_id,t.id,item->>'title',coalesce(item->>'type','research_report'),item->>'content',t.origin,
     coalesce(t.checkpoint->'contextRefs','[]'::jsonb),source_ids,to_jsonb(gaps)) RETURNING * INTO d;
   doc_id:=d.id;
   INSERT INTO deliverable_versions(workspace_id,deliverable_id,version,title,content,context_refs,source_refs,limitations)
    VALUES(t.workspace_id,d.id,d.version,d.title,d.content,d.context_refs,d.source_refs,d.limitations) RETURNING * INTO pv;
   INSERT INTO messages(workspace_id,conversation_id,role,type,content,payload)
    VALUES(t.workspace_id,t.conversation_id,'agent','deliverable_card',d.title,
     jsonb_build_object('deliverable_id',d.id,'title',d.title,'type',d.type,'content',d.content,'taskId',t.id))
    RETURNING id INTO msg_id;
   message_ids:=message_ids||jsonb_build_array(msg_id);
  END IF;

  FOR src IN SELECT value FROM jsonb_array_elements(coalesce(p_result->'sources','[]'::jsonb)) LOOP
   IF jsonb_typeof(src)<>'object' OR length(coalesce(src->>'url','')) NOT BETWEEN 1 AND 2000
    OR length(coalesce(src->>'title','')) NOT BETWEEN 1 AND 500 OR length(coalesce(src->>'excerpt',''))>8000 THEN
    RAISE EXCEPTION 'INVALID_SOURCE';
   END IF;
   INSERT INTO sources(workspace_id,task_id,url,canonical_url,title,accessed_at,published_at,excerpt,content_hash,
    source_type,market,availability,provider,tool_action,toolkit_version,captured_at,valid_until,usage,credits,
    storage_policy,sector,authority,geography,period,blocked_reason)
    VALUES(t.workspace_id,t.id,src->>'url',coalesce(src->>'canonicalUrl',src->>'url'),src->>'title',
     coalesce((src->>'capturedAt')::timestamptz,now()),(src->>'publishedAt')::timestamptz,coalesce(src->>'excerpt',''),
     coalesce(src->>'contentHash',md5(src->>'url')),coalesce(src->>'sourceType','website'),src->>'market',
     coalesce(src->>'availability','retrieved'),coalesce(src->>'provider','website'),coalesce(src->>'toolAction',''),
     coalesce(src->>'toolkitVersion',''),coalesce((src->>'capturedAt')::timestamptz,now()),(src->>'validUntil')::timestamptz,
     coalesce(src->'usage','{}'::jsonb),coalesce((src->>'credits')::integer,0),coalesce(src->>'storagePolicy','workspace'),
     src->>'sector',src->>'authority',src->>'geography',src->>'period',src->>'blockedReason')
    ON CONFLICT (workspace_id,content_hash,url) DO UPDATE SET
     excerpt=excluded.excerpt, availability=excluded.availability, captured_at=excluded.captured_at,
     usage=excluded.usage, credits=excluded.credits, provider=excluded.provider, tool_action=excluded.tool_action,
     toolkit_version=excluded.toolkit_version, valid_until=excluded.valid_until, storage_policy=excluded.storage_policy,
     geography=excluded.geography, period=excluded.period, blocked_reason=excluded.blocked_reason
    RETURNING id INTO source_id;
   source_ids:=source_ids||jsonb_build_array(source_id::text);
   source_map:=source_map||jsonb_build_array(jsonb_build_object('key',src->>'id','id',source_id::text));
  END LOOP;

  FOR claim IN SELECT value FROM jsonb_array_elements(coalesce(report->'claims','[]'::jsonb)) LOOP
   IF jsonb_typeof(claim)<>'object' OR length(coalesce(claim->>'id','')) NOT BETWEEN 1 AND 120
    OR length(coalesce(claim->>'statement','')) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'INVALID_CLAIM'; END IF;
   INSERT INTO research_claims(workspace_id,report_id,claim_id,statement,statement_ar,kind,confidence,evidence_ids,
    source_ids,geography,valid_from,valid_until,claim_quality,conflicts)
    VALUES(t.workspace_id,r.id,claim->>'id',claim->>'statement',claim->>'statementAr',coalesce(claim->>'kind','observation'),
     coalesce(claim->>'confidence','hypothesis'),coalesce(claim->'evidenceIds','[]'::jsonb),coalesce(claim->'sourceIds','[]'::jsonb),
     claim->>'geography',(claim->>'validFrom')::timestamptz,(claim->>'validUntil')::timestamptz,
     coalesce(claim->'claimQuality','{}'::jsonb),coalesce(claim->'conflicts','[]'::jsonb))
    ON CONFLICT (report_id,claim_id) DO NOTHING;
   claim_ids:=claim_ids||jsonb_build_array(claim->>'id');
   IF doc_id IS NOT NULL THEN
    FOR support_ref IN SELECT value FROM jsonb_array_elements(coalesce(claim->'sourceIds','[]'::jsonb)) LOOP
     SELECT entry->>'id' INTO mapped_id FROM jsonb_array_elements(source_map) entry WHERE entry->>'key'=support_ref#>>'{}';
     IF mapped_id IS NOT NULL THEN
      INSERT INTO claim_sources(workspace_id,source_id,claim,consumer_type,consumer_id,support)
       VALUES(t.workspace_id,mapped_id::uuid,left(claim->>'statement',1000),'document',doc_id,'supports')
       ON CONFLICT DO NOTHING;
     END IF;
    END LOOP;
   END IF;
  END LOOP;

  FOR ref IN SELECT value FROM jsonb_array_elements(coalesce(t.checkpoint->'contextRefs','[]'::jsonb)) LOOP
   SELECT * INTO node FROM brain_nodes WHERE id=(ref->>'nodeId')::uuid AND workspace_id=t.workspace_id;
   IF NOT FOUND THEN
    IF doc_id IS NOT NULL THEN UPDATE deliverables SET stale_reason='Business context was deleted during generation.' WHERE id=doc_id; END IF;
    CONTINUE;
   END IF;
   IF doc_id IS NOT NULL THEN
    INSERT INTO context_dependencies(workspace_id,node_id,node_version,consumer_type,consumer_id,consumer_version)
     VALUES(t.workspace_id,node.id,(ref->>'version')::integer,'document',doc_id,1);
   END IF;
   IF node.version<>(ref->>'version')::integer OR node.approval_state<>'approved' OR NOT node.is_current THEN
    PERFORM mark_brain_context_changed(node.id,'Business context changed during generation: '||node.title);
   END IF;
  END LOOP;

  INSERT INTO messages(workspace_id,conversation_id,role,type,content,payload)
   VALUES(t.workspace_id,t.conversation_id,'agent','text_response',p_result->>'reply',jsonb_build_object('taskId',t.id))
   RETURNING id INTO msg_id;
  message_ids:=message_ids||jsonb_build_array(msg_id);

  INSERT INTO task_results(task_id,workspace_id,output)
   VALUES(t.id,t.workspace_id,jsonb_build_object('taskId',t.id,'documentId',doc_id,'postIds','[]'::jsonb,
    'messageIds',message_ids,'reportId',r.id,'sourceIds',source_ids,'claimIds',claim_ids,'partial',partial));
  UPDATE tasks SET status=CASE WHEN partial THEN 'partial' ELSE 'completed' END,
   result_summary=left(p_result->>'reply',500),type='marketing_research',research_mode=mode,
   checkpoint=checkpoint||jsonb_build_object('phase','done','outputRefs',jsonb_build_object(
    'taskId',t.id,'documentId',doc_id,'postIds','[]'::jsonb,'messageIds',message_ids,'reportId',r.id)),
   version=version+1,updated_at=now() WHERE id=t.id;
  INSERT INTO notifications(workspace_id,type,subject_type,subject_id,title,body,dedupe_key)
   VALUES(t.workspace_id,'task_complete','task',t.id,CASE WHEN partial THEN 'Partial research result ready' ELSE 'Research report ready' END,
    left(p_result->>'reply',500),'task-result:'||t.id);
  RETURN jsonb_build_object('taskId',t.id,'documentId',doc_id,'postIds','[]'::jsonb,'messageIds',message_ids,
   'reportId',r.id,'sourceIds',source_ids,'claimIds',claim_ids,'partial',partial);
END $$;

-- Owner approval is the only writer of research-backed brain nodes.
CREATE OR REPLACE FUNCTION decide_research_proposal(
  p_proposal_id uuid, p_decision text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w uuid:=auth.uid(); p research_proposals; n brain_nodes; v jsonb; existing brain_nodes;
BEGIN
  IF w IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'INVALID_DECISION'; END IF;
  SELECT * INTO p FROM research_proposals WHERE id=p_proposal_id AND workspace_id=w FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF p.status<>'pending' THEN
   IF p.status IS DISTINCT FROM p_decision THEN RAISE EXCEPTION 'STALE_DECISION'; END IF;
   RETURN jsonb_build_object('proposalId',p.id,'status',p.status,'nodeId',(p.diff->>'nodeId'));
  END IF;
  IF p_decision='approved' THEN
   v:=p.diff||jsonb_build_object('proposalKind',p.proposal_kind,'reportId',p.report_id,'evidenceIds',p.evidence_ids,
    'sourceUrls',p.source_urls,'confidence',p.confidence,'geography',p.geography);
   SELECT * INTO existing FROM brain_nodes WHERE workspace_id=w AND title=p.title AND is_current;
   IF existing.id IS NULL THEN
    INSERT INTO brain_nodes(workspace_id,category,title,summary,properties,status,source,source_detail,confidence,
     epistemic_kind,approval_state,verification_state,provenance)
     VALUES(w,coalesce(nullif(p.diff->>'category',''),'company_fact'),p.title,left(p.summary,6000),v,'approved','research',
      coalesce(p.source_urls->>0,''),case p.confidence when 'strong' then 0.9 when 'validated' then 0.8 when 'supported' then 0.65 else 0.4 end,
      'claim','approved','source_supported',
      jsonb_build_object('kind','owner_approved_research','proposalId',p.id,'reportId',p.report_id,'actorId',w,
       'evidenceIds',p.evidence_ids,'sourceUrls',p.source_urls,'geography',p.geography))
     RETURNING * INTO n;
   ELSE
    n:=update_brain_item(existing.id,existing.version,p.title,left(p.summary,6000),
     coalesce(nullif(p.diff->>'category',''),existing.category::text),v,'approved');
    UPDATE brain_nodes SET source='research', verification_state='source_supported',
     provenance=jsonb_build_object('kind','owner_approved_research','proposalId',p.id,'reportId',p.report_id,'actorId',w,
      'evidenceIds',p.evidence_ids,'sourceUrls',p.source_urls,'geography',p.geography)
     WHERE id=n.id RETURNING * INTO n;
   END IF;
   INSERT INTO brain_versions(workspace_id,node_id,version,snapshot,provenance)
    VALUES(w,n.id,n.version,to_jsonb(n),n.provenance);
   v:=jsonb_build_object('nodeId',n.id,'version',n.version);
  ELSE
   v:=jsonb_build_object('nodeId',null);
  END IF;
  UPDATE research_proposals SET status=p_decision, decided_at=now() WHERE id=p.id;
  INSERT INTO audit_log(workspace_id,actor_id,action,entity_type,entity_id,details)
   VALUES(w,w,'research_proposal_'||p_decision,'research_proposal',p.id,jsonb_build_object('reportId',p.report_id,'kind',p.proposal_kind));
  RETURN jsonb_build_object('proposalId',p.id,'status',p_decision,'nodeId',v->>'nodeId');
END $$;

REVOKE ALL ON FUNCTION reserve_provider_call(uuid,uuid,text,text,jsonb), settle_provider_call(uuid,uuid,jsonb),
 release_provider_call(uuid,uuid), set_research_mode(uuid,uuid,text),
 record_research_event(uuid,uuid,uuid,uuid,uuid,bigint,text,text,text,text,text,text,jsonb,jsonb,jsonb,text,timestamptz,timestamptz),
 save_research_result(uuid,uuid,jsonb,boolean), decide_research_proposal(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION reserve_provider_call(uuid,uuid,text,text,jsonb), settle_provider_call(uuid,uuid,jsonb),
 release_provider_call(uuid,uuid), set_research_mode(uuid,uuid,text),
 record_research_event(uuid,uuid,uuid,uuid,uuid,bigint,text,text,text,text,text,text,jsonb,jsonb,jsonb,text,timestamptz,timestamptz),
 save_research_result(uuid,uuid,jsonb,boolean), decide_research_proposal(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION research_policy_checks()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public STABLE AS $$
DECLARE w uuid:=auth.uid(); result jsonb;
BEGIN
  IF w IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  SELECT jsonb_build_object(
   'freeTierOnly', NOT EXISTS(SELECT 1 FROM free_tier_allowance WHERE workspace_id=w AND paid_fallback),
   'noUnapprovedResearchNodes', NOT EXISTS(SELECT 1 FROM brain_nodes WHERE workspace_id=w AND source='research'
     AND approval_state<>'approved'),
   'pendingProposals', (SELECT count(*) FROM research_proposals WHERE workspace_id=w AND status='pending'),
   'providersUsed', (SELECT coalesce(jsonb_agg(DISTINCT provider),'[]'::jsonb) FROM provider_usage WHERE workspace_id=w)
  ) INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION research_policy_checks() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION research_policy_checks() TO authenticated;