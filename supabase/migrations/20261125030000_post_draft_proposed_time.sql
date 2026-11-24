-- Store valid future p_proposed_time into planned_posts.proposed_for (never scheduled_for).
-- Preserves draft-only status, unapproved approval_state, and idle execution_state.
CREATE OR REPLACE FUNCTION create_post_draft(
  p_platform text,
  p_caption text,
  p_hashtags text DEFAULT '',
  p_proposed_time text DEFAULT NULL,
  p_task_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  w uuid := auth.uid();
  pp planned_posts;
  prop timestamptz := NULL;
BEGIN
  IF w IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF p_platform NOT IN ('facebook','instagram','x') OR length(coalesce(p_caption,''))=0 THEN RAISE EXCEPTION 'INVALID_POST'; END IF;
  IF p_proposed_time IS NOT NULL AND length(btrim(p_proposed_time)) > 0 THEN
    BEGIN
      prop := btrim(p_proposed_time)::timestamptz;
      IF prop <= now() THEN prop := NULL; END IF;
    EXCEPTION WHEN others THEN
      prop := NULL;
    END;
  END IF;
  INSERT INTO planned_posts(workspace_id,task_id,platform,caption,hashtags,status,proposed_for)
  VALUES(w,p_task_id,p_platform,p_caption,coalesce(p_hashtags,''),'draft',prop)
  RETURNING * INTO pp;
  RETURN jsonb_build_object('id',pp.id,'status',pp.status,'proposedFor',pp.proposed_for);
END $$;

REVOKE ALL ON FUNCTION create_post_draft(text,text,text,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_post_draft(text,text,text,text,uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
