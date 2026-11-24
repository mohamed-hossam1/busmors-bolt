-- Employee runtime persistence RPCs (additive, forward-only).
--
-- The governance and planned-posts migrations revoked direct INSERT/UPDATE/DELETE
-- from `authenticated` on brain_proposals and planned_posts, and deliverable_versions
-- is SELECT-only for authenticated. The real Employee runtime therefore persists
-- through these SECURITY DEFINER functions, scoped to auth.uid(), instead of broad
-- table grants. No historical migration is modified; existing data and policies are
-- untouched. RLS is bypassed inside the definer functions, so each function filters
-- strictly by auth.uid().

-- 1. Propose a Business Brain change (pending approval only; never applies) -------
CREATE OR REPLACE FUNCTION propose_brain_change(
  p_change text,
  p_category text,
  p_title text,
  p_proposed_value text,
  p_previous_value text DEFAULT NULL,
  p_source text DEFAULT '',
  p_rationale text DEFAULT '',
  p_node_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w uuid := auth.uid(); p brain_proposals; fp text;
BEGIN
  IF w IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF p_change NOT IN ('add','edit','delete') OR length(coalesce(p_title,'')) = 0 THEN RAISE EXCEPTION 'INVALID_PROPOSAL'; END IF;
  fp := p_change||':'||coalesce(p_category,'')||':'||p_title||':'||coalesce(p_proposed_value,'');
  -- Idempotent: reuse an existing identical pending proposal.
  SELECT * INTO p FROM brain_proposals
   WHERE workspace_id=w AND status='pending' AND diff->>'fingerprint'=fp LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('id',p.id,'status',p.status); END IF;
  INSERT INTO brain_proposals(workspace_id,node_id,status,diff,source_refs)
  VALUES(w,p_node_id,'pending',
    jsonb_build_object('change',p_change,'title',p_title,'summary',p_proposed_value,'category',p_category,
      'previousValue',p_previous_value,'source',p_source,'rationale',p_rationale,'fingerprint',fp),
    CASE WHEN length(coalesce(p_source,''))>0 THEN jsonb_build_array(jsonb_build_object('source',p_source)) ELSE '[]'::jsonb END)
  RETURNING * INTO p;
  RETURN jsonb_build_object('id',p.id,'status',p.status);
END $$;

REVOKE ALL ON FUNCTION propose_brain_change(text,text,text,text,text,text,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION propose_brain_change(text,text,text,text,text,text,text,uuid) TO authenticated;

-- 2. Persist a Deliverable + immutable first version ----------------------------
CREATE OR REPLACE FUNCTION create_deliverable(
  p_title text,
  p_type text,
  p_content text,
  p_task_id uuid DEFAULT NULL,
  p_source_refs jsonb DEFAULT '[]'::jsonb,
  p_context_refs jsonb DEFAULT '[]'::jsonb,
  p_limitations jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w uuid := auth.uid(); d deliverables;
BEGIN
  IF w IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF length(coalesce(p_title,''))=0 OR length(coalesce(p_content,''))=0 THEN RAISE EXCEPTION 'INVALID_DELIVERABLE'; END IF;
  INSERT INTO deliverables(workspace_id,task_id,title,type,content,source_refs,context_refs,limitations)
  VALUES(w,p_task_id,p_title,coalesce(p_type,'general'),p_content,coalesce(p_source_refs,'[]'::jsonb),coalesce(p_context_refs,'[]'::jsonb),coalesce(p_limitations,'[]'::jsonb))
  RETURNING * INTO d;
  INSERT INTO deliverable_versions(workspace_id,deliverable_id,version,title,content,provenance,source_refs,context_refs,limitations)
  VALUES(w,d.id,d.version,d.title,d.content,'{}'::jsonb,coalesce(p_source_refs,'[]'::jsonb),coalesce(p_context_refs,'[]'::jsonb),coalesce(p_limitations,'[]'::jsonb));
  RETURN jsonb_build_object('id',d.id,'version',d.version);
END $$;

REVOKE ALL ON FUNCTION create_deliverable(text,text,text,uuid,jsonb,jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_deliverable(text,text,text,uuid,jsonb,jsonb,jsonb) TO authenticated;

-- 3. Create a Calendar post DRAFT (never publishes or schedules) ----------------
CREATE OR REPLACE FUNCTION create_post_draft(
  p_platform text,
  p_caption text,
  p_hashtags text DEFAULT '',
  p_proposed_time text DEFAULT NULL,
  p_task_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w uuid := auth.uid(); pp planned_posts;
BEGIN
  IF w IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF p_platform NOT IN ('facebook','instagram','x') OR length(coalesce(p_caption,''))=0 THEN RAISE EXCEPTION 'INVALID_POST'; END IF;
  INSERT INTO planned_posts(workspace_id,task_id,platform,caption,hashtags,status)
  VALUES(w,p_task_id,p_platform,p_caption,coalesce(p_hashtags,''),'draft')
  RETURNING * INTO pp;
  RETURN jsonb_build_object('id',pp.id,'status',pp.status);
END $$;

REVOKE ALL ON FUNCTION create_post_draft(text,text,text,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_post_draft(text,text,text,text,uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';