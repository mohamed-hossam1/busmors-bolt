-- Phase 4 acceptance: connection writes are service-only; switching Page bumps the
-- authorization generation; disconnect holds scheduled posts (approval revoked,
-- content approval kept). Self-rolls-back.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id) VALUES('d7777777-7777-4777-8777-777777777777');
INSERT INTO workspaces(id) VALUES('d7777777-7777-4777-8777-777777777777') ON CONFLICT DO NOTHING;

-- The browser cannot call the RPCs or write the table.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','d7777777-7777-4777-8777-777777777777',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
DO $$ BEGIN
 BEGIN PERFORM upsert_facebook_connection(auth.uid(),'ca_x','p1','Page'); RAISE EXCEPTION 'Client called upsert';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM disconnect_facebook_connection(auth.uid()); RAISE EXCEPTION 'Client called disconnect';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN INSERT INTO platform_connections(workspace_id,platform) VALUES(auth.uid(),'facebook'); RAISE EXCEPTION 'Client wrote connections';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',true);
DO $$
DECLARE w uuid:='d7777777-7777-4777-8777-777777777777'; c platform_connections; g integer; post uuid; v uuid;
BEGIN
 PERFORM upsert_facebook_connection(w,'ca_one','page_1','First Page');
 SELECT * INTO c FROM platform_connections WHERE workspace_id=w AND platform='facebook';
 IF c.status<>'connected' OR c.page_id<>'page_1' OR c.page_name<>'First Page' OR c.external_account_id<>'ca_one' OR c.permissions<>'[]'::jsonb THEN RAISE EXCEPTION 'Connection not stored'; END IF;
 g:=c.authorization_generation;
 PERFORM upsert_facebook_connection(w,'ca_one','page_1','First Page renamed');
 IF (SELECT authorization_generation FROM platform_connections WHERE id=c.id)<>g THEN RAISE EXCEPTION 'Same Page bumped the generation'; END IF;
 PERFORM upsert_facebook_connection(w,'ca_one','page_2','Second Page');
 IF (SELECT authorization_generation FROM platform_connections WHERE id=c.id)<>g+1 THEN RAISE EXCEPTION 'Page switch did not bump the generation'; END IF;
 PERFORM upsert_facebook_connection(w,'ca_two','page_2','Second Page');
 IF (SELECT authorization_generation FROM platform_connections WHERE id=c.id)<>g+2 THEN RAISE EXCEPTION 'Account switch did not bump the generation'; END IF;

 -- A scheduled post with an active publish approval.
 INSERT INTO planned_posts(workspace_id,platform,caption,hashtags,status,approval_state,execution_state,scheduled_for)
  VALUES(w,'facebook','Scheduled caption','','scheduled','approved','scheduled',now()+interval '2 days') RETURNING id INTO post;
 INSERT INTO post_versions(workspace_id,post_id,revision,text) VALUES(w,post,1,'Scheduled caption') RETURNING id INTO v;
 INSERT INTO post_approvals(workspace_id,post_id,post_version_id,connection_id,page_id,authorization_generation,scheduled_time)
  VALUES(w,post,v,c.id,'page_2',g+2,'{}'::jsonb);

 PERFORM disconnect_facebook_connection(w);
 IF (SELECT status FROM platform_connections WHERE id=c.id)<>'disconnected' OR (SELECT authorization_generation FROM platform_connections WHERE id=c.id)<>g+3 THEN RAISE EXCEPTION 'Disconnect not recorded'; END IF;
 IF EXISTS(SELECT 1 FROM post_approvals WHERE post_id=post AND revoked_at IS NULL) THEN RAISE EXCEPTION 'Publish approval not revoked'; END IF;
 IF NOT EXISTS(SELECT 1 FROM planned_posts WHERE id=post AND status='approved' AND approval_state='approved' AND execution_state='held' AND scheduled_for IS NULL AND proposed_for IS NOT NULL) THEN RAISE EXCEPTION 'Scheduled post not held with its time kept as a proposal'; END IF;
 IF NOT EXISTS(SELECT 1 FROM post_holds WHERE post_id=post AND kind='connection' AND resolved_at IS NULL) THEN RAISE EXCEPTION 'Connection hold missing'; END IF;
 IF EXISTS(SELECT 1 FROM post_holds WHERE kind='context' AND post_id=post) THEN RAISE EXCEPTION 'Wrong hold kind'; END IF;

 PERFORM upsert_facebook_connection(w,'ca_two','page_2','Second Page');
 IF NOT EXISTS(SELECT 1 FROM planned_posts WHERE id=post AND execution_state='held') THEN RAISE EXCEPTION 'Reconnect released a held post'; END IF;
 RAISE NOTICE 'PASS: service-only connection writes, generation bump on Page/account switch, disconnect holds scheduled posts, reconnect releases nothing';
END $$;
ROLLBACK;
