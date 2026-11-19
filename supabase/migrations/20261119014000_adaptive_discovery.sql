-- C18: adaptive saved Discovery.
-- A draft is owner-scoped and versioned. Questions keep one stable row per
-- (draft, question_key); a goal change deactivates questions instead of
-- deleting their saved answers. Answers themselves are versioned so two tabs
-- cannot silently overwrite each other.

ALTER TABLE discovery_questions
 ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
 ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
 ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS discovery_questions_active_position_idx
 ON discovery_questions(draft_id, position) WHERE active;

-- One bounded load for the wizard. Returns the newest draft and every question
-- (active and historical) so a goal change can still show earlier answers.
CREATE OR REPLACE FUNCTION load_discovery()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public STABLE AS $$
DECLARE
 w uuid:=auth.uid();
 d discovery_drafts;
 qs jsonb;
BEGIN
 IF w IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 SELECT * INTO d FROM discovery_drafts WHERE workspace_id=w ORDER BY created_at DESC LIMIT 1;
 IF NOT FOUND THEN
  RETURN jsonb_build_object('draft',NULL,'questions','[]'::jsonb);
 END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.position,q.created_at),'[]'::jsonb)
  INTO qs
  FROM discovery_questions q
  WHERE q.workspace_id=w AND q.draft_id=d.id;
 RETURN jsonb_build_object('draft',to_jsonb(d),'questions',qs);
END $$;
REVOKE ALL ON FUNCTION load_discovery() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION load_discovery() TO authenticated;

-- Create the first draft or change its goal with an expected version.
-- Expected version 0 means "create"; every later write must match.
CREATE OR REPLACE FUNCTION save_discovery_draft(
 p_goal text,
 p_expected_version integer,
 p_context_refs jsonb DEFAULT '[]'::jsonb
) RETURNS discovery_drafts
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 w uuid:=auth.uid();
 d discovery_drafts;
BEGIN
 IF w IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 IF p_goal IS NULL OR p_goal NOT IN ('acquire_first_customers','grow_customers','convert_inquiries','launch_offer','repeat_referral','custom') THEN
  RAISE EXCEPTION 'INVALID_GOAL';
 END IF;
 IF p_context_refs IS NOT NULL AND jsonb_typeof(p_context_refs) IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'INVALID_CONTEXT';
 END IF;

 SELECT * INTO d FROM discovery_drafts WHERE workspace_id=w ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
 IF NOT FOUND THEN
  IF p_expected_version IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'STALE_VERSION'; END IF;
  INSERT INTO discovery_drafts(workspace_id,goal,version,status,context_refs)
   VALUES(w,p_goal,1,'draft',coalesce(p_context_refs,'[]'::jsonb))
   RETURNING * INTO d;
 ELSE
  IF d.version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'STALE_VERSION'; END IF;
  UPDATE discovery_drafts
   SET goal=p_goal,
       context_refs=coalesce(p_context_refs,d.context_refs),
       version=version+1,
       updated_at=now()
   WHERE id=d.id
   RETURNING * INTO d;
 END IF;
 RETURN d;
END $$;
REVOKE ALL ON FUNCTION save_discovery_draft(text,integer,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION save_discovery_draft(text,integer,jsonb) TO authenticated;

-- Replace the active question plan for the draft. Existing question rows keep
-- their id, answer, status and provenance. Questions that are not in the new
-- plan are marked inactive, never deleted. New questions may receive an
-- explicit prefill derived from eligible approved Brain facts.
CREATE OR REPLACE FUNCTION sync_discovery_questions(
 p_draft_id uuid,
 p_expected_version integer,
 p_questions jsonb,
 p_prefill jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 w uuid:=auth.uid();
 d discovery_drafts;
 q discovery_questions;
 item jsonb;
 v_key text;
 v_position integer;
 v_schema jsonb;
 v_branch text;
 pref jsonb;
 v_status text;
 v_value jsonb;
 v_provenance jsonb;
 keys text[]:='{}';
BEGIN
 IF w IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 IF p_questions IS NULL OR jsonb_typeof(p_questions) IS DISTINCT FROM 'array' OR jsonb_array_length(p_questions)>40 THEN
  RAISE EXCEPTION 'INVALID_QUESTIONS';
 END IF;
 IF p_prefill IS NOT NULL AND jsonb_typeof(p_prefill) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'INVALID_PREFILL';
 END IF;

 SELECT * INTO d FROM discovery_drafts WHERE id=p_draft_id AND workspace_id=w FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 IF d.version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'STALE_VERSION'; END IF;

 FOR item IN SELECT value FROM jsonb_array_elements(p_questions) LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_QUESTIONS'; END IF;
  v_key:=item->>'question_key';
  IF v_key IS NULL OR v_key !~ '^[a-z0-9_]{2,64}$' THEN RAISE EXCEPTION 'INVALID_QUESTIONS'; END IF;
  IF EXISTS(SELECT 1 FROM unnest(keys) k WHERE k=v_key) THEN RAISE EXCEPTION 'DUPLICATE_QUESTION_KEY'; END IF;
  BEGIN v_position:=(item->>'position')::integer; EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'INVALID_QUESTIONS'; END;
  IF v_position IS NULL OR v_position<0 OR v_position>39 THEN RAISE EXCEPTION 'INVALID_QUESTIONS'; END IF;
  v_schema:=item->'schema';
  IF v_schema IS NULL OR jsonb_typeof(v_schema) IS DISTINCT FROM 'object' OR length(v_schema::text)>20000 THEN RAISE EXCEPTION 'INVALID_QUESTIONS'; END IF;
  v_branch:=nullif(item->>'branch','');
  keys:=array_append(keys,v_key);

  SELECT * INTO q FROM discovery_questions
   WHERE draft_id=d.id AND question_key=v_key FOR UPDATE;
  IF FOUND THEN
   UPDATE discovery_questions
    SET position=v_position,schema=v_schema,branch=v_branch,active=true,updated_at=now()
    WHERE id=q.id;
  ELSE
   v_status:='unanswered';v_value:=NULL;v_provenance:='{}'::jsonb;
   pref:=p_prefill->v_key;
   IF pref IS NOT NULL AND jsonb_typeof(pref)='object' AND pref->>'status' IN ('answered','confirmed')
    AND jsonb_typeof(pref->'value')='object'
    AND (nullif(btrim(coalesce(pref->'value'->>'text','')),'') IS NOT NULL OR nullif(pref->'value'->>'choice','') IS NOT NULL) THEN
    v_status:=pref->>'status';v_value:=pref->'value';
    v_provenance:=CASE WHEN jsonb_typeof(pref->'provenance')='object' THEN pref->'provenance' ELSE '{}'::jsonb END;
   END IF;
   INSERT INTO discovery_questions(
    workspace_id,draft_id,question_key,position,schema,status,value,provenance,branch,active,version,updated_at
   ) VALUES(
    w,d.id,v_key,v_position,v_schema,v_status,v_value,v_provenance,v_branch,true,1,now()
   ) RETURNING * INTO q;
  END IF;
 END LOOP;

 UPDATE discovery_questions
  SET active=false,updated_at=now()
  WHERE draft_id=d.id AND active AND NOT (question_key=ANY(keys));

 UPDATE discovery_drafts SET version=version+1,updated_at=now()
  WHERE id=d.id RETURNING * INTO d;

 SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.position,q.created_at),'[]'::jsonb)
  INTO p_questions
  FROM discovery_questions q
  WHERE q.workspace_id=w AND q.draft_id=d.id;
 RETURN jsonb_build_object('draft',to_jsonb(d),'questions',p_questions);
END $$;
REVOKE ALL ON FUNCTION sync_discovery_questions(uuid,integer,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION sync_discovery_questions(uuid,integer,jsonb,jsonb) TO authenticated;

-- Answers are a separate compare-and-swap so autosave does not conflict with
-- the draft goal. Unknown/skipped/not-applicable answers cannot carry a value
-- that could later be mistaken for a positive fact.
CREATE OR REPLACE FUNCTION save_discovery_answer(
 p_question_id uuid,
 p_expected_version integer,
 p_status text,
 p_value jsonb,
 p_provenance jsonb DEFAULT '{}'::jsonb
) RETURNS discovery_questions
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 w uuid:=auth.uid();
 q discovery_questions;
BEGIN
 IF w IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 IF p_status IS NULL OR p_status NOT IN ('unanswered','answered','unknown','skipped','not_applicable','researching','confirmed') THEN
  RAISE EXCEPTION 'INVALID_ANSWER';
 END IF;
 IF p_provenance IS NOT NULL AND jsonb_typeof(p_provenance) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'INVALID_PROVENANCE';
 END IF;

 IF p_status IN ('answered','confirmed') THEN
  IF p_value IS NULL OR jsonb_typeof(p_value) IS DISTINCT FROM 'object'
   OR (nullif(btrim(coalesce(p_value->>'text','')),'') IS NULL AND nullif(p_value->>'choice','') IS NULL) THEN
   RAISE EXCEPTION 'INVALID_ANSWER';
  END IF;
 ELSE
  -- No answer status may smuggle a value into an unknown/skipped answer.
  IF p_value IS NOT NULL AND p_value NOT IN ('null'::jsonb,'{}'::jsonb) THEN
   RAISE EXCEPTION 'INVALID_ANSWER';
  END IF;
 END IF;

 SELECT * INTO q FROM discovery_questions
  WHERE id=p_question_id AND workspace_id=w FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 IF q.version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'STALE_VERSION'; END IF;
 IF NOT q.active THEN RAISE EXCEPTION 'INACTIVE_QUESTION'; END IF;

 UPDATE discovery_questions
  SET status=p_status,
      value=CASE WHEN p_status IN ('answered','confirmed') THEN p_value ELSE NULL END,
      provenance=coalesce(p_provenance,'{}'::jsonb),
      version=version+1,
      updated_at=now()
  WHERE id=q.id
  RETURNING * INTO q;
 RETURN q;
END $$;
REVOKE ALL ON FUNCTION save_discovery_answer(uuid,integer,text,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION save_discovery_answer(uuid,integer,text,jsonb,jsonb) TO authenticated;

-- Record that the owner chose to continue with a preliminary plan. This does
-- not generate or activate a Roadmap; it saves the disclosed open questions so
-- a later generation step can mark uncertainty instead of inventing answers.
CREATE OR REPLACE FUNCTION plan_discovery_draft(
 p_draft_id uuid,
 p_expected_version integer,
 p_open_question_keys jsonb DEFAULT '[]'::jsonb
) RETURNS discovery_drafts
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 w uuid:=auth.uid();
 d discovery_drafts;
BEGIN
 IF w IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 IF p_open_question_keys IS NOT NULL AND jsonb_typeof(p_open_question_keys) IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'INVALID_CONTEXT';
 END IF;
 SELECT * INTO d FROM discovery_drafts WHERE id=p_draft_id AND workspace_id=w FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 IF d.version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'STALE_VERSION'; END IF;
 UPDATE discovery_drafts
  SET status='planned',
      context_refs=context_refs||jsonb_build_array(jsonb_build_object(
       'kind','preliminary_plan','openQuestionKeys',coalesce(p_open_question_keys,'[]'::jsonb),'at',now()
      )),
      version=version+1,
      updated_at=now()
  WHERE id=d.id
  RETURNING * INTO d;
 RETURN d;
END $$;
REVOKE ALL ON FUNCTION plan_discovery_draft(uuid,integer,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION plan_discovery_draft(uuid,integer,jsonb) TO authenticated;
