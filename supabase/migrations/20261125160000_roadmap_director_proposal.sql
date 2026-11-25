-- Inline "Ask my Marketing Director" proposal persistence.
-- A proposal is stored only under provenance.directorProposal. The active answer
-- status, value and version are never changed here, so owner saves and
-- optimistic concurrency remain untouched until the owner explicitly uses it.

CREATE OR REPLACE FUNCTION save_director_question_proposal(
 p_question_id uuid,
 p_proposal jsonb
) RETURNS discovery_questions
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 w uuid:=auth.uid();
 q discovery_questions;
BEGIN
 IF w IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 IF p_proposal IS NULL OR jsonb_typeof(p_proposal) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'INVALID_PROPOSAL';
 END IF;

 SELECT * INTO q FROM discovery_questions
  WHERE id=p_question_id AND workspace_id=w FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

 UPDATE discovery_questions
  SET provenance=jsonb_set(
   coalesce(provenance,'{}'::jsonb),
   '{directorProposal}',
   coalesce(p_proposal,'{}'::jsonb),
   true
  ),
  updated_at=now()
  WHERE id=q.id
  RETURNING * INTO q;
 RETURN q;
END $$;
REVOKE ALL ON FUNCTION save_director_question_proposal(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION save_director_question_proposal(uuid,jsonb) TO authenticated;