-- Challenge-based Discovery goals.
--
-- The goal picker evolved from six marketing-goal keys into eight plain business
-- challenges. `discovery_drafts.goal` is free text (no CHECK), so no table change
-- is needed; only the write validator in save_discovery_draft must accept the new
-- keys. Legacy keys stay valid so existing drafts keep loading and saving.

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
 IF p_goal IS NULL OR p_goal NOT IN (
   'validate_idea','win_first_customers','grow_customers','convert_inquiries',
   'unprofitable_marketing','launch_offer','increase_repeat_referral','something_else',
   'acquire_first_customers','repeat_referral','custom'
 ) THEN
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
       status=CASE WHEN d.goal IS DISTINCT FROM p_goal THEN 'draft' ELSE d.status END,
       version=version+1,
       updated_at=now()
   WHERE id=d.id
   RETURNING * INTO d;
 END IF;
 RETURN d;
END $$;
REVOKE ALL ON FUNCTION save_discovery_draft(text,integer,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION save_discovery_draft(text,integer,jsonb) TO authenticated;