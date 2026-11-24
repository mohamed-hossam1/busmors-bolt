-- Roadmap as a working relationship with the Marketing Director.
--
-- This migration is additive on top of the existing Discovery, task-origin,
-- research and roadmap tables:
--   * richer roadmap step execution metadata (milestones, priority, evidence),
--   * a persisted Discovery-question -> Director-task workflow using the existing
--     question_research_links table and wizard_question task origin,
--   * structured answer proposals the owner must explicitly accept,
--   * progress check-ins, a learning log and proposed roadmap revisions stored as
--     immutable roadmap_versions awaiting owner approval.
--
-- Nothing here deletes or rewrites historical user data. Every write is owner
-- scoped, optimistic-concurrency guarded where a concurrent edit is possible,
-- audit logged and routed through SECURITY DEFINER functions.

-- ---------------------------------------------------------------------------
-- 1. Roadmap step execution metadata
-- ---------------------------------------------------------------------------
ALTER TABLE roadmap_steps
 ADD COLUMN IF NOT EXISTS milestone_key text,
 ADD COLUMN IF NOT EXISTS success_criteria text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'medium',
 ADD COLUMN IF NOT EXISTS metric text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS due_hint text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS owner_note text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS completed_at timestamptz;

ALTER TABLE roadmap_steps DROP CONSTRAINT IF EXISTS roadmap_steps_priority_check;
ALTER TABLE roadmap_steps ADD CONSTRAINT roadmap_steps_priority_check
 CHECK (priority IN ('critical','high','medium','low')) NOT VALID;

CREATE INDEX IF NOT EXISTS roadmap_steps_milestone_idx
 ON roadmap_steps(roadmap_id, milestone_key);

-- The original generator stored the plan summary but not per-action milestone,
-- priority, metric or success criteria. Persist them so the execution view can be
-- derived deterministically from stored rows instead of model text.
CREATE OR REPLACE FUNCTION save_generated_roadmap(
 p_draft_id uuid,
 p_goal text,
 p_expected_draft_version integer,
 p_plan jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 w uuid:=auth.uid();
 d discovery_drafts;
 v_roadmap roadmaps;
 v_version roadmap_versions;
 item jsonb;
 ref jsonb;
 v_position integer:=0;
 v_steps_count integer:=0;
 v_context_refs jsonb:='[]'::jsonb;
 v_summary jsonb;
 v_node_version integer;
BEGIN
 IF w IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 IF p_plan IS NULL OR jsonb_typeof(p_plan) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_PLAN'; END IF;
 IF jsonb_typeof(p_plan->'steps') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_plan->'steps') NOT BETWEEN 1 AND 12 THEN
  RAISE EXCEPTION 'INVALID_PLAN';
 END IF;

 SELECT * INTO d FROM discovery_drafts WHERE id=p_draft_id AND workspace_id=w FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 IF d.version IS DISTINCT FROM p_expected_draft_version THEN RAISE EXCEPTION 'STALE_VERSION'; END IF;

 IF jsonb_typeof(p_plan->'contextRefs')='array' THEN
  FOR ref IN SELECT value FROM jsonb_array_elements(p_plan->'contextRefs') LOOP
   CONTINUE WHEN jsonb_typeof(ref) IS DISTINCT FROM 'object' OR NOT (ref ? 'nodeId');
   SELECT b.version INTO v_node_version
     FROM brain_nodes b
     JOIN brain_versions bv ON bv.node_id=b.id AND bv.workspace_id=b.workspace_id AND bv.version=b.version
    WHERE b.id=(ref->>'nodeId')::uuid AND b.workspace_id=w
      AND b.status='approved' AND b.approval_state='approved' AND b.is_current
    LIMIT 1;
   IF v_node_version IS NOT NULL AND NOT EXISTS(
     SELECT 1 FROM jsonb_array_elements(v_context_refs) e WHERE e->>'nodeId'=ref->>'nodeId'
   ) THEN
    v_context_refs:=v_context_refs||jsonb_build_array(jsonb_build_object('nodeId',ref->>'nodeId','version',v_node_version));
   END IF;
   v_node_version:=NULL;
  END LOOP;
 END IF;

 -- One active roadmap per workspace. History is archived, never deleted.
 UPDATE roadmaps SET status='archived',updated_at=now() WHERE workspace_id=w AND status='active';
 UPDATE roadmap_versions SET status='archived' WHERE workspace_id=w AND status='active';

 INSERT INTO roadmaps(workspace_id,goal,version,status,draft_id)
  VALUES(w,p_goal,1,'active',d.id) RETURNING * INTO v_roadmap;

 v_summary:=jsonb_build_object(
  'title',coalesce(p_plan->>'title',''),
  'summary',coalesce(p_plan->>'summary',''),
  'uncertainty',coalesce(p_plan->>'uncertainty',''),
  'diagnosis',coalesce(p_plan->'diagnosis','{}'::jsonb),
  'objective',coalesce(p_plan->'objective','{}'::jsonb),
  'metrics',coalesce(p_plan->'metrics','[]'::jsonb),
  'priorities',coalesce(p_plan->'priorities','[]'::jsonb),
  'milestones',coalesce(p_plan->'milestones','[]'::jsonb),
  'risks',coalesce(p_plan->'risks','[]'::jsonb),
  'review',coalesce(p_plan->'review','{}'::jsonb),
  'goalLabel',coalesce(p_plan->>'goalLabel','')
 );

 INSERT INTO roadmap_versions(workspace_id,roadmap_id,version,base_version,status,summary,diff,context_refs)
  VALUES(w,v_roadmap.id,1,NULL,'active',v_summary,'{}'::jsonb,v_context_refs)
  RETURNING * INTO v_version;

 UPDATE roadmaps SET active_version_id=v_version.id,updated_at=now()
  WHERE id=v_roadmap.id RETURNING * INTO v_roadmap;

 FOR item IN SELECT value FROM jsonb_array_elements(p_plan->'steps') LOOP
  CONTINUE WHEN jsonb_typeof(item) IS DISTINCT FROM 'object';
  v_position:=v_position+1;
  INSERT INTO roadmap_steps(
   workspace_id,roadmap_id,plan_version_id,step_key,position,title,objective,rationale,
   evidence,uncertainty,responsibility,execution_mode,inputs,dependencies,expected_output,
   checklist,effort,external_approval,status,milestone_key,success_criteria,priority,metric,due_hint
  ) VALUES (
   w,v_roadmap.id,v_version.id,
   coalesce(nullif(item->>'key',''),'step_'||v_position),
   v_position,
   coalesce(nullif(item->>'title',''),'Untitled step'),
   coalesce(item->>'objective',''),
   coalesce(item->>'rationale',''),
   coalesce(item->'evidence','[]'::jsonb),
   coalesce(item->>'uncertainty',''),
   CASE WHEN item->>'responsibility'='system' THEN 'system' ELSE 'owner' END,
   CASE WHEN item->>'executionMode'='director' THEN 'director' ELSE 'owner' END,
   coalesce(item->'inputs','[]'::jsonb),
   coalesce(item->'dependencies','[]'::jsonb),
   coalesce(item->>'expectedOutput',''),
   coalesce(item->'checklist','[]'::jsonb),
   coalesce(nullif(item->>'effort',''),'Not estimated'),
   nullif(item->>'externalApproval',''),
   'ready',
   nullif(item->>'milestoneKey',''),
   coalesce(item->>'successCriteria',''),
   CASE WHEN item->>'priority' IN ('critical','high','medium','low') THEN item->>'priority' ELSE 'medium' END,
   coalesce(item->>'metric',''),
   coalesce(item->>'dueHint','')
  );
  v_steps_count:=v_steps_count+1;
 END LOOP;

 FOR ref IN SELECT value FROM jsonb_array_elements(v_context_refs) LOOP
  INSERT INTO context_dependencies(workspace_id,node_id,node_version,consumer_type,consumer_id,consumer_version)
   VALUES(w,(ref->>'nodeId')::uuid,coalesce((ref->>'version')::integer,1),'roadmap',v_roadmap.id,1);
 END LOOP;

 UPDATE discovery_drafts SET status='planned',version=version+1,updated_at=now()
  WHERE id=d.id RETURNING * INTO d;

 INSERT INTO audit_log(workspace_id,actor_id,action,entity_type,entity_id,details)
  VALUES(w,w,'roadmap.generated','roadmap',v_roadmap.id,
   jsonb_build_object('versionId',v_version.id,'steps',v_steps_count,'draftVersion',d.version));

 RETURN jsonb_build_object('roadmapId',v_roadmap.id,'versionId',v_version.id,'version',1,'steps',v_steps_count);
END $$;
REVOKE ALL ON FUNCTION save_generated_roadmap(uuid,text,integer,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION save_generated_roadmap(uuid,text,integer,jsonb) TO authenticated;

-- Owner-driven step state change. A completed status records the owner's note
-- and timestamp; an AI task finishing is never itself a real-world outcome.
CREATE OR REPLACE FUNCTION set_roadmap_step_status(
 p_step_id uuid,
 p_status text,
 p_attestation jsonb DEFAULT '{}'::jsonb
) RETURNS roadmap_steps
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 w uuid:=auth.uid();
 s roadmap_steps;
 v_note text;
BEGIN
 IF w IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 IF p_status IS NULL OR p_status NOT IN ('ready','running','completed','owner_reported','skipped','blocked','inapplicable') THEN
  RAISE EXCEPTION 'INVALID_STATUS';
 END IF;
 IF p_attestation IS NOT NULL AND jsonb_typeof(p_attestation) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'INVALID_ATTESTATION';
 END IF;
 SELECT * INTO s FROM roadmap_steps WHERE id=p_step_id AND workspace_id=w FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 v_note:=left(coalesce(p_attestation->>'note',''),4000);
 UPDATE roadmap_steps
  SET status=p_status,
      attestation=CASE WHEN p_status IN ('completed','owner_reported') THEN coalesce(p_attestation,'{}'::jsonb) ELSE attestation END,
      owner_note=CASE WHEN p_status IN ('completed','owner_reported') THEN v_note ELSE owner_note END,
      completed_at=CASE WHEN p_status IN ('completed','owner_reported') THEN now() ELSE NULL END
  WHERE id=s.id
  RETURNING * INTO s;
 INSERT INTO audit_log(workspace_id,actor_id,action,entity_type,entity_id,details)
  VALUES(w,w,'roadmap.step_status','roadmap_step',s.id,jsonb_build_object('status',p_status,'note',v_note));
 RETURN s;
END $$;
REVOKE ALL ON FUNCTION set_roadmap_step_status(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION set_roadmap_step_status(uuid,text,jsonb) TO authenticated;

-- Load the active roadmap plus a deterministic warning when a Brain fact behind
-- it has changed, lost approval or been deleted. The plan is not silently
-- rewritten: the owner is asked to review.
CREATE OR REPLACE FUNCTION load_active_roadmap()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public STABLE AS $$
DECLARE
 w uuid:=auth.uid();
 r roadmaps;
 v roadmap_versions;
 steps jsonb;
 stale jsonb:='[]'::jsonb;
 d record;
BEGIN
 IF w IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 SELECT * INTO r FROM roadmaps WHERE workspace_id=w AND status='active' ORDER BY created_at DESC LIMIT 1;
 IF NOT FOUND THEN RETURN jsonb_build_object('roadmap',NULL); END IF;
 SELECT * INTO v FROM roadmap_versions WHERE id=r.active_version_id AND workspace_id=w;
 IF NOT FOUND THEN
  SELECT * INTO v FROM roadmap_versions WHERE roadmap_id=r.id AND workspace_id=w ORDER BY version DESC LIMIT 1;
 END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.position,s.created_at),'[]'::jsonb) INTO steps
  FROM roadmap_steps s WHERE s.roadmap_id=r.id AND s.plan_version_id=v.id;

 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'nodeId',cd.node_id,'nodeVersion',cd.node_version,'title',b.title,
   'reason',CASE
    WHEN b.id IS NULL THEN 'This business fact was deleted.'
    WHEN NOT b.is_current THEN 'A newer version of this business fact exists.'
    WHEN b.approval_state<>'approved' OR b.status<>'approved' THEN 'This business fact is no longer approved.'
    WHEN b.version<>cd.node_version THEN 'This business fact changed after the roadmap was generated.'
    ELSE 'This business fact may have changed.' END)),'[]'::jsonb)
  INTO stale
  FROM context_dependencies cd
  LEFT JOIN brain_nodes b ON b.id=cd.node_id AND b.workspace_id=cd.workspace_id
  WHERE cd.workspace_id=w AND cd.consumer_type='roadmap' AND cd.consumer_id=r.id
    AND cd.resolved_at IS NULL
    AND (b.id IS NULL OR NOT b.is_current OR b.approval_state<>'approved' OR b.status<>'approved' OR b.version<>cd.node_version);

 RETURN jsonb_build_object('roadmap',to_jsonb(r),'version',to_jsonb(v),'steps',steps,'staleContext',stale);
END $$;
REVOKE ALL ON FUNCTION load_active_roadmap() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION load_active_roadmap() TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Discovery question -> Director research
-- ---------------------------------------------------------------------------
ALTER TABLE question_research_links
 ADD COLUMN IF NOT EXISTS error_message text,
 ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE question_research_links DROP CONSTRAINT IF EXISTS question_research_links_status_check;
ALTER TABLE question_research_links ADD CONSTRAINT question_research_links_status_check
 CHECK (status IN ('researching','ready','selected','confirmed','failed','rejected','superseded')) NOT VALID;

CREATE INDEX IF NOT EXISTS question_research_links_question_idx
 ON question_research_links(question_id, created_at DESC);

-- Create a Director conversation, persist the question link, then enqueue a real
-- research task through the validated wizard_question origin. The URL only needs
-- identifiers; all business context stays in the database and task brief.
CREATE OR REPLACE FUNCTION start_question_research(
 p_question_id uuid,
 p_title text,
 p_request text,
 p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 w uuid:=auth.uid();
 q discovery_questions;
 l question_research_links;
 t tasks;
 cid uuid;
 existing_task tasks;
BEGIN
 IF w IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 IF p_idempotency_key IS NULL THEN RAISE EXCEPTION 'INVALID_REQUEST'; END IF;
 IF length(btrim(coalesce(p_request,''))) NOT BETWEEN 1 AND 12000 THEN RAISE EXCEPTION 'INVALID_REQUEST'; END IF;

 SELECT * INTO q FROM discovery_questions
  WHERE id=p_question_id AND workspace_id=w FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 IF NOT q.active THEN RAISE EXCEPTION 'INACTIVE_QUESTION'; END IF;

 SELECT * INTO existing_task FROM tasks WHERE workspace_id=w AND idempotency_key=p_idempotency_key;
 IF FOUND THEN
  SELECT * INTO l FROM question_research_links WHERE workspace_id=w AND task_id=existing_task.id LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
  RETURN jsonb_build_object('conversationId',l.conversation_id,'linkId',l.id,'taskId',existing_task.id,'question',to_jsonb(q),'idempotent',true);
 END IF;

 -- One current research attempt per question. Earlier attempts stay readable.
 UPDATE question_research_links SET status='superseded',updated_at=now()
  WHERE question_id=q.id AND workspace_id=w AND status IN ('researching','ready');

 INSERT INTO conversations(workspace_id,title)
  VALUES(w,left(coalesce(nullif(btrim(p_title),''),'Roadmap research'),60))
  RETURNING id INTO cid;

 INSERT INTO question_research_links(workspace_id,draft_id,question_id,conversation_id,status,version)
  VALUES(w,q.draft_id,q.id,cid,'researching',1)
  RETURNING * INTO l;

 -- Preserve the previous explicit state so a failed attempt can restore it
 -- without inventing an answer.
 UPDATE discovery_questions
  SET status='researching',
      provenance=jsonb_build_object(
       'kind','director','researchLinkId',l.id,
       'previousStatus',q.status,'previousValue',q.value),
      version=version+1,
      updated_at=now()
  WHERE id=q.id RETURNING * INTO q;

 t:=enqueue_task(
  cid,
  btrim(p_request),
  jsonb_build_object('kind','wizard_question','conversationId',cid,'draftId',q.draft_id,
                     'questionId',q.id,'researchLinkId',l.id),
  p_idempotency_key);

 UPDATE question_research_links SET task_id=t.id,updated_at=now()
  WHERE id=l.id RETURNING * INTO l;

 INSERT INTO audit_log(workspace_id,actor_id,action,entity_type,entity_id,details)
  VALUES(w,w,'roadmap.research_started','question_research_link',l.id,
   jsonb_build_object('questionId',q.id,'taskId',t.id,'conversationId',cid));

 RETURN jsonb_build_object('conversationId',cid,'linkId',l.id,'taskId',t.id,'question',to_jsonb(q));
END $$;
REVOKE ALL ON FUNCTION start_question_research(uuid,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION start_question_research(uuid,text,text,uuid) TO authenticated;

-- Persist the Director's structured answer proposal. The Discovery field is not
-- touched until the owner accepts it. Repeating the same attempt is idempotent.
CREATE OR REPLACE FUNCTION save_question_research_proposal(
 p_link_id uuid,
 p_expected_version integer,
 p_proposal jsonb
) RETURNS question_research_links
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w uuid:=auth.uid(); l question_research_links;
BEGIN
 IF w IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 IF p_proposal IS NULL OR jsonb_typeof(p_proposal) IS DISTINCT FROM 'object'
    OR length(p_proposal::text)>24000
    OR length(btrim(coalesce(p_proposal->>'answer',''))) NOT BETWEEN 1 AND 8000 THEN
  RAISE EXCEPTION 'INVALID_PROPOSAL';
 END IF;
 SELECT * INTO l FROM question_research_links WHERE id=p_link_id AND workspace_id=w FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 IF l.version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'STALE_VERSION'; END IF;
 IF l.status NOT IN ('researching','ready') THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
 UPDATE question_research_links
  SET proposed_answer=p_proposal,status='ready',error_message=NULL,version=version+1,updated_at=now()
  WHERE id=l.id RETURNING * INTO l;
 INSERT INTO audit_log(workspace_id,actor_id,action,entity_type,entity_id,details)
  VALUES(w,w,'roadmap.research_proposal','question_research_link',l.id,jsonb_build_object('version',l.version));
 RETURN l;
END $$;
REVOKE ALL ON FUNCTION save_question_research_proposal(uuid,integer,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION save_question_research_proposal(uuid,integer,jsonb) TO authenticated;

-- Owner decision on a proposal. Accepting is the only path that fills a Discovery
-- answer from research; rejecting or failing restores the previous explicit state.
CREATE OR REPLACE FUNCTION decide_question_research(
 p_link_id uuid,
 p_expected_version integer,
 p_action text,
 p_status text DEFAULT NULL,
 p_value jsonb DEFAULT NULL,
 p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 w uuid:=auth.uid();
 l question_research_links;
 q discovery_questions;
 v_prev_status text;
 v_prev_value jsonb;
 v_result uuid;
BEGIN
 IF w IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 IF p_action IS NULL OR p_action NOT IN ('accept','reject','fail') THEN RAISE EXCEPTION 'INVALID_ACTION'; END IF;
 SELECT * INTO l FROM question_research_links WHERE id=p_link_id AND workspace_id=w FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 IF l.version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'STALE_VERSION'; END IF;
 SELECT * INTO q FROM discovery_questions WHERE id=l.question_id AND workspace_id=w FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

 IF p_action='accept' THEN
  IF l.status<>'ready' THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
  IF p_status IS NULL OR p_status NOT IN ('answered','confirmed') THEN RAISE EXCEPTION 'INVALID_ANSWER'; END IF;
  IF p_value IS NULL OR jsonb_typeof(p_value) IS DISTINCT FROM 'object'
     OR (nullif(btrim(coalesce(p_value->>'text','')),'') IS NULL AND nullif(p_value->>'choice','') IS NULL) THEN
   RAISE EXCEPTION 'INVALID_ANSWER';
  END IF;
  IF NOT q.active THEN RAISE EXCEPTION 'INACTIVE_QUESTION'; END IF;

  SELECT d.deliverable_id INTO v_result
   FROM deliverable_offers d
   WHERE d.workspace_id=w AND d.task_id=l.task_id AND d.state='saved' AND d.deliverable_id IS NOT NULL
   LIMIT 1;

  UPDATE discovery_questions
   SET status=p_status,
       value=p_value,
       provenance=jsonb_build_object(
        'kind','director','researchLinkId',l.id,'linkVersion',l.version,
        'acceptedAt',now(),'edited',coalesce(p_note,'')='edited',
        'confidence',coalesce(l.proposed_answer->>'confidence','')),
       version=version+1,
       updated_at=now()
   WHERE id=q.id RETURNING * INTO q;

  UPDATE question_research_links
   SET status='confirmed',result_id=coalesce(v_result,l.result_id),version=version+1,updated_at=now()
   WHERE id=l.id RETURNING * INTO l;

  INSERT INTO audit_log(workspace_id,actor_id,action,entity_type,entity_id,details)
   VALUES(w,w,'roadmap.research_accepted','question_research_link',l.id,
    jsonb_build_object('questionId',q.id,'edited',coalesce(p_note,'')='edited'));
  RETURN jsonb_build_object('link',to_jsonb(l),'question',to_jsonb(q));
 END IF;

 -- Reject or failure: never leave an answer that only exists because research
 -- was once running. Restore only when this link still owns the question state.
 v_prev_status:=coalesce(nullif(q.provenance->>'previousStatus',''),'unanswered');
 IF v_prev_status NOT IN ('unanswered','answered','unknown','skipped','not_applicable','confirmed') THEN
  v_prev_status:='unanswered';
 END IF;
 v_prev_value:=q.provenance->'previousValue';
 IF v_prev_status IN ('answered','confirmed') THEN
  IF v_prev_value IS NULL OR jsonb_typeof(v_prev_value) IS DISTINCT FROM 'object' THEN v_prev_status:='unknown'; v_prev_value:=NULL; END IF;
 ELSE
  v_prev_value:=NULL;
 END IF;

 IF q.status='researching' AND (q.provenance->>'researchLinkId')=l.id::text THEN
  UPDATE discovery_questions
   SET status=v_prev_status,value=v_prev_value,
       provenance=jsonb_build_object('kind','owner','restoredAfterResearch',true),
       version=version+1,updated_at=now()
   WHERE id=q.id RETURNING * INTO q;
 END IF;

 UPDATE question_research_links
  SET status=CASE WHEN p_action='reject' THEN 'rejected' ELSE 'failed' END,
      error_message=left(coalesce(p_note,''),2000),
      version=version+1,updated_at=now()
  WHERE id=l.id RETURNING * INTO l;

 INSERT INTO audit_log(workspace_id,actor_id,action,entity_type,entity_id,details)
  VALUES(w,w,CASE WHEN p_action='reject' THEN 'roadmap.research_rejected' ELSE 'roadmap.research_failed' END,
   'question_research_link',l.id,jsonb_build_object('questionId',q.id,'reason',left(coalesce(p_note,''),500)));
 RETURN jsonb_build_object('link',to_jsonb(l),'question',to_jsonb(q));
END $$;
REVOKE ALL ON FUNCTION decide_question_research(uuid,integer,text,text,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION decide_question_research(uuid,integer,text,text,jsonb,text) TO authenticated;

-- Latest research attempt per question with the live task state and saved
-- report reference. Used by both the Discovery card and the Employee page.
CREATE OR REPLACE FUNCTION load_question_research(p_question_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public STABLE AS $$
DECLARE w uuid:=auth.uid(); q discovery_questions; out jsonb;
BEGIN
 IF w IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 SELECT * INTO q FROM discovery_questions WHERE id=p_question_id AND workspace_id=w;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'link',to_jsonb(l),
   'taskStatus',t.status,
   'taskSummary',t.result_summary,
   'offerId',o.id,
   'offerState',o.state,
   'deliverableId',coalesce(o.deliverable_id,l.result_id)
 ) ORDER BY l.created_at DESC),'[]'::jsonb)
 INTO out
 FROM question_research_links l
 LEFT JOIN tasks t ON t.id=l.task_id AND t.workspace_id=l.workspace_id
 LEFT JOIN LATERAL (
   SELECT d.id,d.state,d.deliverable_id FROM deliverable_offers d
   WHERE d.workspace_id=l.workspace_id AND d.task_id=l.task_id
   ORDER BY d.created_at DESC LIMIT 1
 ) o ON true
 WHERE l.workspace_id=w AND l.question_id=q.id;
 RETURN jsonb_build_object('question',to_jsonb(q),'attempts',out);
END $$;
REVOKE ALL ON FUNCTION load_question_research(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION load_question_research(uuid) TO authenticated;

-- Delegate a Director-led roadmap action through the existing validated
-- roadmap_step origin. The persisted step.task_id is the source of truth.
CREATE OR REPLACE FUNCTION start_roadmap_step_task(
 p_step_id uuid,
 p_title text,
 p_request text,
 p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 w uuid:=auth.uid();
 s roadmap_steps;
 r roadmaps;
 t tasks;
 cid uuid;
BEGIN
 IF w IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 IF p_idempotency_key IS NULL OR length(btrim(coalesce(p_request,''))) NOT BETWEEN 1 AND 12000 THEN
  RAISE EXCEPTION 'INVALID_REQUEST';
 END IF;
 SELECT * INTO s FROM roadmap_steps WHERE id=p_step_id AND workspace_id=w FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 SELECT * INTO r FROM roadmaps WHERE id=s.roadmap_id AND workspace_id=w;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

 SELECT * INTO t FROM tasks WHERE workspace_id=w AND idempotency_key=p_idempotency_key;
 IF FOUND THEN
  RETURN jsonb_build_object('conversationId',t.conversation_id,'taskId',t.id,'step',to_jsonb(s),'idempotent',true);
 END IF;

 INSERT INTO conversations(workspace_id,title)
  VALUES(w,left(coalesce(nullif(btrim(p_title),''),'Roadmap action'),60))
  RETURNING id INTO cid;

 t:=enqueue_task(
  cid,
  btrim(p_request),
  jsonb_build_object('kind','roadmap_step','conversationId',cid,'planId',r.id,
                     'planVersionId',s.plan_version_id,'stepId',s.id),
  p_idempotency_key);

 UPDATE roadmap_steps
  SET task_id=t.id,status=CASE WHEN status IN ('completed','owner_reported','skipped','inapplicable') THEN status ELSE 'running' END
  WHERE id=s.id RETURNING * INTO s;

 INSERT INTO audit_log(workspace_id,actor_id,action,entity_type,entity_id,details)
  VALUES(w,w,'roadmap.step_delegated','roadmap_step',s.id,jsonb_build_object('taskId',t.id,'conversationId',cid));
 RETURN jsonb_build_object('conversationId',cid,'taskId',t.id,'step',to_jsonb(s));
END $$;
REVOKE ALL ON FUNCTION start_roadmap_step_task(uuid,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION start_roadmap_step_task(uuid,text,text,uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Progress check-ins and learning log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roadmap_checkins (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 roadmap_id uuid NOT NULL,
 roadmap_version_id uuid NOT NULL,
 answers jsonb NOT NULL DEFAULT '{}'::jsonb,
 evaluation jsonb NOT NULL DEFAULT '{}'::jsonb,
 recommendation text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded','evaluated')),
 version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,id)
);
ALTER TABLE roadmap_checkins ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS roadmap_checkins_workspace_idx ON roadmap_checkins(workspace_id);
CREATE INDEX IF NOT EXISTS roadmap_checkins_roadmap_idx ON roadmap_checkins(roadmap_id,created_at DESC);
CREATE POLICY "owner read" ON roadmap_checkins FOR SELECT TO authenticated USING(workspace_id=auth.uid());
REVOKE ALL ON roadmap_checkins FROM PUBLIC, anon, authenticated;
GRANT SELECT ON roadmap_checkins TO authenticated;
GRANT ALL ON roadmap_checkins TO service_role;

CREATE TABLE IF NOT EXISTS roadmap_learning (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 roadmap_id uuid NOT NULL,
 roadmap_version_id uuid,
 checkin_id uuid,
 milestone_key text,
 hypothesis text NOT NULL DEFAULT '',
 experiment text NOT NULL DEFAULT '',
 expected_outcome text NOT NULL DEFAULT '',
 actual_outcome text NOT NULL DEFAULT '',
 evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
 learning text NOT NULL,
 decision text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,id)
);
ALTER TABLE roadmap_learning ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS roadmap_learning_workspace_idx ON roadmap_learning(workspace_id);
CREATE INDEX IF NOT EXISTS roadmap_learning_roadmap_idx ON roadmap_learning(roadmap_id,created_at DESC);
CREATE POLICY "owner read" ON roadmap_learning FOR SELECT TO authenticated USING(workspace_id=auth.uid());
REVOKE ALL ON roadmap_learning FROM PUBLIC, anon, authenticated;
GRANT SELECT ON roadmap_learning TO authenticated;
GRANT ALL ON roadmap_learning TO service_role;

CREATE OR REPLACE FUNCTION record_roadmap_checkin(
 p_roadmap_id uuid,
 p_roadmap_version_id uuid,
 p_answers jsonb
) RETURNS roadmap_checkins
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w uuid:=auth.uid(); r roadmaps; c roadmap_checkins;
BEGIN
 IF w IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 IF p_answers IS NULL OR jsonb_typeof(p_answers) IS DISTINCT FROM 'object' OR length(p_answers::text)>20000 THEN
  RAISE EXCEPTION 'INVALID_CHECKIN';
 END IF;
 SELECT * INTO r FROM roadmaps WHERE id=p_roadmap_id AND workspace_id=w;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 IF NOT EXISTS(SELECT 1 FROM roadmap_versions WHERE id=p_roadmap_version_id AND workspace_id=w AND roadmap_id=r.id) THEN
  RAISE EXCEPTION 'NOT_FOUND';
 END IF;
 INSERT INTO roadmap_checkins(workspace_id,roadmap_id,roadmap_version_id,answers)
  VALUES(w,r.id,p_roadmap_version_id,p_answers) RETURNING * INTO c;
 INSERT INTO audit_log(workspace_id,actor_id,action,entity_type,entity_id,details)
  VALUES(w,w,'roadmap.checkin','roadmap_checkin',c.id,jsonb_build_object('roadmapId',r.id));
 RETURN c;
END $$;
REVOKE ALL ON FUNCTION record_roadmap_checkin(uuid,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION record_roadmap_checkin(uuid,uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION save_checkin_evaluation(
 p_checkin_id uuid,
 p_expected_version integer,
 p_evaluation jsonb,
 p_recommendation text
) RETURNS roadmap_checkins
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w uuid:=auth.uid(); c roadmap_checkins;
BEGIN
 IF w IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 IF p_evaluation IS NULL OR jsonb_typeof(p_evaluation) IS DISTINCT FROM 'object' OR length(p_evaluation::text)>30000 THEN
  RAISE EXCEPTION 'INVALID_EVALUATION';
 END IF;
 IF p_recommendation NOT IN ('continue','adjust','pause','change_direction') THEN RAISE EXCEPTION 'INVALID_RECOMMENDATION'; END IF;
 SELECT * INTO c FROM roadmap_checkins WHERE id=p_checkin_id AND workspace_id=w FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 IF c.version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'STALE_VERSION'; END IF;
 UPDATE roadmap_checkins SET evaluation=p_evaluation,recommendation=p_recommendation,status='evaluated',version=version+1,updated_at=now()
  WHERE id=c.id RETURNING * INTO c;
 RETURN c;
END $$;
REVOKE ALL ON FUNCTION save_checkin_evaluation(uuid,integer,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION save_checkin_evaluation(uuid,integer,jsonb,text) TO authenticated;

CREATE OR REPLACE FUNCTION add_roadmap_learning(
 p_roadmap_id uuid,
 p_roadmap_version_id uuid,
 p_checkin_id uuid,
 p_milestone_key text,
 p_hypothesis text,
 p_experiment text,
 p_expected_outcome text,
 p_actual_outcome text,
 p_evidence jsonb,
 p_learning text,
 p_decision text
) RETURNS roadmap_learning
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w uuid:=auth.uid(); r roadmaps; l roadmap_learning;
BEGIN
 IF w IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 IF length(btrim(coalesce(p_learning,''))) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'INVALID_LEARNING'; END IF;
 IF p_evidence IS NOT NULL AND jsonb_typeof(p_evidence) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'INVALID_EVIDENCE'; END IF;
 SELECT * INTO r FROM roadmaps WHERE id=p_roadmap_id AND workspace_id=w;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 IF p_roadmap_version_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM roadmap_versions WHERE id=p_roadmap_version_id AND workspace_id=w AND roadmap_id=r.id
 ) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 IF p_checkin_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM roadmap_checkins WHERE id=p_checkin_id AND workspace_id=w AND roadmap_id=r.id
 ) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 INSERT INTO roadmap_learning(workspace_id,roadmap_id,roadmap_version_id,checkin_id,milestone_key,
   hypothesis,experiment,expected_outcome,actual_outcome,evidence,learning,decision)
  VALUES(w,r.id,p_roadmap_version_id,p_checkin_id,left(coalesce(p_milestone_key,''),120),
   left(coalesce(p_hypothesis,''),4000),left(coalesce(p_experiment,''),4000),
   left(coalesce(p_expected_outcome,''),4000),left(coalesce(p_actual_outcome,''),4000),
   coalesce(p_evidence,'[]'::jsonb),left(p_learning,4000),left(coalesce(p_decision,''),2000))
  RETURNING * INTO l;
 INSERT INTO audit_log(workspace_id,actor_id,action,entity_type,entity_id,details)
  VALUES(w,w,'roadmap.learning_added','roadmap_learning',l.id,jsonb_build_object('roadmapId',r.id));
 RETURN l;
END $$;
REVOKE ALL ON FUNCTION add_roadmap_learning(uuid,uuid,uuid,text,text,text,text,text,jsonb,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION add_roadmap_learning(uuid,uuid,uuid,text,text,text,text,text,jsonb,text,text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Proposed revisions (new immutable roadmap version, owner approval)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION propose_roadmap_revision(
 p_roadmap_id uuid,
 p_base_version_id uuid,
 p_expected_roadmap_version integer,
 p_request text,
 p_plan jsonb,
 p_diff jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 w uuid:=auth.uid();
 r roadmaps;
 base roadmap_versions;
 v roadmap_versions;
 item jsonb;
 v_position integer:=0;
 v_steps integer:=0;
 v_version_number integer;
 v_summary jsonb;
BEGIN
 IF w IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 IF p_plan IS NULL OR jsonb_typeof(p_plan) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_plan->'steps') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_plan->'steps') NOT BETWEEN 1 AND 12 THEN
  RAISE EXCEPTION 'INVALID_PLAN';
 END IF;
 IF length(btrim(coalesce(p_request,''))) NOT BETWEEN 1 AND 8000 THEN RAISE EXCEPTION 'INVALID_REQUEST'; END IF;
 SELECT * INTO r FROM roadmaps WHERE id=p_roadmap_id AND workspace_id=w FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 IF r.status<>'active' THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
 IF r.version IS DISTINCT FROM p_expected_roadmap_version THEN RAISE EXCEPTION 'STALE_VERSION'; END IF;
 SELECT * INTO base FROM roadmap_versions WHERE id=p_base_version_id AND workspace_id=w AND roadmap_id=r.id;
 IF NOT FOUND OR base.status<>'active' THEN RAISE EXCEPTION 'STALE_VERSION'; END IF;

 SELECT coalesce(max(version),0)+1 INTO v_version_number FROM roadmap_versions WHERE roadmap_id=r.id;

 v_summary:=jsonb_build_object(
  'title',coalesce(p_plan->>'title',''),
  'summary',coalesce(p_plan->>'summary',''),
  'uncertainty',coalesce(p_plan->>'uncertainty',''),
  'diagnosis',coalesce(p_plan->'diagnosis','{}'::jsonb),
  'objective',coalesce(p_plan->'objective','{}'::jsonb),
  'metrics',coalesce(p_plan->'metrics','[]'::jsonb),
  'priorities',coalesce(p_plan->'priorities','[]'::jsonb),
  'milestones',coalesce(p_plan->'milestones','[]'::jsonb),
  'risks',coalesce(p_plan->'risks','[]'::jsonb),
  'review',coalesce(p_plan->'review','{}'::jsonb),
  'goalLabel',coalesce(p_plan->>'goalLabel','')
 );

 INSERT INTO roadmap_versions(workspace_id,roadmap_id,version,base_version,status,summary,diff,context_refs)
  VALUES(w,r.id,v_version_number,base.version,'proposed',v_summary,
   coalesce(p_diff,'{}'::jsonb)||jsonb_build_object('request',left(p_request,8000),'proposedAt',now()),
   base.context_refs)
  RETURNING * INTO v;

 FOR item IN SELECT value FROM jsonb_array_elements(p_plan->'steps') LOOP
  CONTINUE WHEN jsonb_typeof(item) IS DISTINCT FROM 'object';
  v_position:=v_position+1;
  INSERT INTO roadmap_steps(
   workspace_id,roadmap_id,plan_version_id,step_key,position,title,objective,rationale,
   evidence,uncertainty,responsibility,execution_mode,inputs,dependencies,expected_output,
   checklist,effort,external_approval,status,milestone_key,success_criteria,priority,metric,due_hint
  ) VALUES (
   w,r.id,v.id,
   coalesce(nullif(item->>'key',''),'step_'||v_position),v_position,
   coalesce(nullif(item->>'title',''),'Untitled step'),coalesce(item->>'objective',''),
   coalesce(item->>'rationale',''),coalesce(item->'evidence','[]'::jsonb),
   coalesce(item->>'uncertainty',''),
   CASE WHEN item->>'responsibility'='system' THEN 'system' ELSE 'owner' END,
   CASE WHEN item->>'executionMode'='director' THEN 'director' ELSE 'owner' END,
   coalesce(item->'inputs','[]'::jsonb),coalesce(item->'dependencies','[]'::jsonb),
   coalesce(item->>'expectedOutput',''),coalesce(item->'checklist','[]'::jsonb),
   coalesce(nullif(item->>'effort',''),'Not estimated'),nullif(item->>'externalApproval',''),
   'ready',nullif(item->>'milestoneKey',''),coalesce(item->>'successCriteria',''),
   CASE WHEN item->>'priority' IN ('critical','high','medium','low') THEN item->>'priority' ELSE 'medium' END,
   coalesce(item->>'metric',''),coalesce(item->>'dueHint','')
  );
  v_steps:=v_steps+1;
 END LOOP;

 INSERT INTO audit_log(workspace_id,actor_id,action,entity_type,entity_id,details)
  VALUES(w,w,'roadmap.revision_proposed','roadmap_version',v.id,
   jsonb_build_object('roadmapId',r.id,'version',v_version_number,'steps',v_steps,'request',left(p_request,500)));

 RETURN jsonb_build_object('version',to_jsonb(v),'steps',v_steps);
END $$;
REVOKE ALL ON FUNCTION propose_roadmap_revision(uuid,uuid,integer,text,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION propose_roadmap_revision(uuid,uuid,integer,text,jsonb,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION decide_roadmap_revision(
 p_version_id uuid,
 p_expected_roadmap_version integer,
 p_action text,
 p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 w uuid:=auth.uid();
 v roadmap_versions;
 r roadmaps;
 old roadmap_versions;
 new_step roadmap_steps;
 prior roadmap_steps;
BEGIN
 IF w IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 IF p_action IS NULL OR p_action NOT IN ('approve','reject') THEN RAISE EXCEPTION 'INVALID_ACTION'; END IF;
 SELECT * INTO v FROM roadmap_versions WHERE id=p_version_id AND workspace_id=w FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 IF v.status<>'proposed' THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
 SELECT * INTO r FROM roadmaps WHERE id=v.roadmap_id AND workspace_id=w FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 IF r.version IS DISTINCT FROM p_expected_roadmap_version THEN RAISE EXCEPTION 'STALE_VERSION'; END IF;

 IF p_action='reject' THEN
  UPDATE roadmap_versions SET status='rejected',
   diff=diff||jsonb_build_object('rejectedAt',now(),'rejectReason',left(coalesce(p_note,''),2000))
   WHERE id=v.id RETURNING * INTO v;
  INSERT INTO audit_log(workspace_id,actor_id,action,entity_type,entity_id,details)
   VALUES(w,w,'roadmap.revision_rejected','roadmap_version',v.id,jsonb_build_object('roadmapId',r.id));
  RETURN jsonb_build_object('version',to_jsonb(v),'roadmap',to_jsonb(r));
 END IF;

 SELECT * INTO old FROM roadmap_versions WHERE id=r.active_version_id AND workspace_id=w;

 -- Carry forward real-world completion and delegation for unchanged actions.
 IF old.id IS NOT NULL THEN
  FOR new_step IN SELECT * FROM roadmap_steps WHERE plan_version_id=v.id AND workspace_id=w LOOP
   SELECT * INTO prior FROM roadmap_steps
    WHERE plan_version_id=old.id AND workspace_id=w AND step_key=new_step.step_key LIMIT 1;
   IF FOUND THEN
    UPDATE roadmap_steps
     SET status=prior.status,attestation=prior.attestation,owner_note=prior.owner_note,
         completed_at=prior.completed_at,task_id=coalesce(prior.task_id,new_step.task_id)
     WHERE id=new_step.id;
   END IF;
  END LOOP;
  UPDATE roadmap_versions SET status='archived' WHERE id=old.id;
 END IF;

 UPDATE roadmap_versions SET status='active',
  diff=diff||jsonb_build_object('approvedAt',now())
  WHERE id=v.id RETURNING * INTO v;
 UPDATE roadmaps SET active_version_id=v.id,version=v.version,updated_at=now()
  WHERE id=r.id RETURNING * INTO r;

 INSERT INTO audit_log(workspace_id,actor_id,action,entity_type,entity_id,details)
  VALUES(w,w,'roadmap.revision_approved','roadmap_version',v.id,
   jsonb_build_object('roadmapId',r.id,'version',v.version,'baseVersion',v.base_version));
 RETURN jsonb_build_object('version',to_jsonb(v),'roadmap',to_jsonb(r));
END $$;
REVOKE ALL ON FUNCTION decide_roadmap_revision(uuid,integer,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION decide_roadmap_revision(uuid,integer,text,text) TO authenticated;

-- One bounded read for version history, check-ins, learning and any pending
-- revision. Previous versions and their steps remain available.
CREATE OR REPLACE FUNCTION load_roadmap_history(p_roadmap_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public STABLE AS $$
DECLARE w uuid:=auth.uid(); r roadmaps; vs jsonb; cs jsonb; ls jsonb; pending jsonb; psteps jsonb;
BEGIN
 IF w IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 SELECT * INTO r FROM roadmaps WHERE id=p_roadmap_id AND workspace_id=w;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY v.version DESC),'[]'::jsonb) INTO vs
  FROM roadmap_versions v WHERE v.workspace_id=w AND v.roadmap_id=r.id;
 SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.created_at DESC),'[]'::jsonb) INTO cs
  FROM roadmap_checkins c WHERE c.workspace_id=w AND c.roadmap_id=r.id;
 SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.created_at DESC),'[]'::jsonb) INTO ls
  FROM roadmap_learning l WHERE l.workspace_id=w AND l.roadmap_id=r.id;
 SELECT to_jsonb(v) INTO pending FROM roadmap_versions v
  WHERE v.workspace_id=w AND v.roadmap_id=r.id AND v.status='proposed'
  ORDER BY v.version DESC LIMIT 1;
 IF pending IS NOT NULL THEN
  SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.position),'[]'::jsonb) INTO psteps
   FROM roadmap_steps s WHERE s.workspace_id=w AND s.plan_version_id=(pending->>'id')::uuid;
 END IF;
 RETURN jsonb_build_object('roadmap',to_jsonb(r),'versions',vs,'checkins',cs,'learning',ls,
  'pendingRevision',pending,'pendingSteps',coalesce(psteps,'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION load_roadmap_history(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION load_roadmap_history(uuid) TO authenticated;
