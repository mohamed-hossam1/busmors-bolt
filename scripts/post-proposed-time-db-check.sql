-- Phase 2 acceptance: an AI-proposed time is stored as proposed_for only. It never
-- becomes a schedule or an approval; past and malformed times are dropped without
-- failing the result. Self-rolls-back.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id) VALUES('c6666666-6666-4666-8666-666666666666');
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.sub','c6666666-6666-4666-8666-666666666666',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
DO $$ BEGIN PERFORM bootstrap_workspace(); END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','c6666666-6666-4666-8666-666666666666',true);
SELECT set_config('request.jwt.claim.role','service_role',true);
DO $$
DECLARE c uuid; t tasks; saved jsonb; future timestamptz:=date_trunc('minute',now()+interval '3 days'); good planned_posts; m messages;
BEGIN
 INSERT INTO conversations(workspace_id,title) VALUES(auth.uid(),'Proposed times') RETURNING id INTO c;
 t:=enqueue_task(c,'Write 3 posts for next week',jsonb_build_object('kind','direct','conversationId',c),gen_random_uuid());
 t:=admit_task(t.id,gen_random_uuid());
 saved:=save_task_result(t.id,t.run_id,jsonb_build_object('reply','3 draft Posts are ready.','posts',jsonb_build_array(
  jsonb_build_object('caption','Future','hashtags','','platform','facebook','proposedAt',to_char(future AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"')),
  jsonb_build_object('caption','Past','hashtags','','platform','facebook','proposedAt','2020-01-01T10:00:00Z'),
  jsonb_build_object('caption','Garbage','hashtags','','platform','facebook','proposedAt','next tuesday'))));
 IF jsonb_array_length(saved->'postIds')<>3 THEN RAISE EXCEPTION 'A bad proposed time dropped a post'; END IF;
 SELECT * INTO good FROM planned_posts WHERE caption='Future';
 IF good.proposed_for IS DISTINCT FROM future THEN RAISE EXCEPTION 'Future proposed time not stored'; END IF;
 IF good.scheduled_for IS NOT NULL OR good.approval_state<>'unapproved' OR good.execution_state<>'idle' OR good.status<>'draft' THEN RAISE EXCEPTION 'Proposed time became a schedule or approval'; END IF;
 IF (SELECT proposed_for FROM planned_posts WHERE caption='Past') IS NOT NULL THEN RAISE EXCEPTION 'Past proposed time kept'; END IF;
 IF (SELECT proposed_for FROM planned_posts WHERE caption='Garbage') IS NOT NULL THEN RAISE EXCEPTION 'Malformed proposed time kept'; END IF;
 IF (SELECT (provenance->>'proposedAt')::timestamptz FROM post_versions WHERE post_id=good.id) IS DISTINCT FROM future THEN RAISE EXCEPTION 'Provenance missing proposed time'; END IF;
 SELECT * INTO m FROM messages WHERE type='post_reference' AND payload->>'postId'=good.id::text;
 IF (m.payload->>'proposedFor')::timestamptz IS DISTINCT FROM future THEN RAISE EXCEPTION 'Post reference missing proposed time'; END IF;
  IF EXISTS(SELECT 1 FROM planned_posts WHERE workspace_id=auth.uid() AND scheduled_for IS NOT NULL) THEN RAISE EXCEPTION 'A schedule was invented'; END IF;
 RAISE NOTICE 'PASS: proposed times stored as suggestions only; past and malformed times dropped without losing posts';
END $$;
ROLLBACK;
