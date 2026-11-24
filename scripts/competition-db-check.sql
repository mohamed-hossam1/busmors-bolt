\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id) VALUES ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
INSERT INTO workspaces(id) SELECT id FROM auth.users WHERE id IN ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222');
INSERT INTO conversations(id,workspace_id) VALUES ('22222222-2222-4222-8222-333333333333','22222222-2222-4222-8222-222222222222');
INSERT INTO brain_nodes(id,workspace_id,category,title) VALUES ('22222222-2222-4222-8222-444444444444','22222222-2222-4222-8222-222222222222','offering','Other owner');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
DO $$
DECLARE d uuid; c integer; own_conversation uuid;
BEGIN
 PERFORM bootstrap_workspace(); PERFORM bootstrap_workspace();
 IF (SELECT count(*) FROM workspace_settings) <> 1 THEN RAISE EXCEPTION 'Bootstrap not idempotent or RLS leaked'; END IF;
 IF EXISTS(SELECT 1 FROM conversations) OR EXISTS(SELECT 1 FROM brain_nodes) THEN RAISE EXCEPTION 'Cross-owner read'; END IF;
 SELECT id INTO d FROM save_business_draft('{}',0);
 INSERT INTO conversations(workspace_id,title) VALUES(auth.uid(),'Owner test') RETURNING id INTO own_conversation;
 BEGIN
  INSERT INTO business_drafts(workspace_id) VALUES('22222222-2222-4222-8222-222222222222');
  RAISE EXCEPTION 'Cross-owner insert allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  INSERT INTO messages(workspace_id,conversation_id,role,content) VALUES(auth.uid(),'22222222-2222-4222-8222-333333333333','user','Forged relation');
  SET CONSTRAINTS ALL IMMEDIATE;
  RAISE EXCEPTION 'Forged conversation accepted';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 BEGIN
  INSERT INTO context_dependencies(workspace_id,node_id,consumer_type,consumer_id,consumer_version)
   VALUES(auth.uid(),'22222222-2222-4222-8222-444444444444','task',gen_random_uuid(),1);
  SET CONSTRAINTS ALL IMMEDIATE;
  RAISE EXCEPTION 'Forged Brain dependency accepted';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 BEGIN
  INSERT INTO post_approvals(workspace_id,post_id,post_version_id,connection_id,page_id,authorization_generation,scheduled_time)
   VALUES(auth.uid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'fake',1,'{}');
  RAISE EXCEPTION 'Direct approval write allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  INSERT INTO platform_connections(workspace_id,platform,account_name) VALUES(auth.uid(),'facebook','fake');
  RAISE EXCEPTION 'Fake connection write allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  SELECT count(*) INTO c FROM connection_credentials;
  RAISE EXCEPTION 'Credential read allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 INSERT INTO storage.objects(bucket_id,name) VALUES('owner-media',auth.uid()::text || '/owned.png');
 BEGIN
  INSERT INTO storage.objects(bucket_id,name) VALUES('owner-media','22222222-2222-4222-8222-222222222222/stolen.png');
  RAISE EXCEPTION 'Cross-owner media write allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'PASS: bootstrap idempotency, owner RLS, related-ID forgery, private credentials, protected approvals/connections, private media';
END $$;
RESET ROLE;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
SELECT set_config('request.jwt.claim.role','service_role',true);
DO $$
DECLARE own_conversation uuid;
BEGIN
 SELECT id INTO own_conversation FROM conversations WHERE workspace_id='11111111-1111-4111-8111-111111111111' ORDER BY created_at LIMIT 1;
 BEGIN
  PERFORM enqueue_task(own_conversation,'Forged direct origin','{"kind":"direct","conversationId":"22222222-2222-4222-8222-333333333333"}',gen_random_uuid());
  RAISE EXCEPTION 'Forged JSON origin accepted';
 EXCEPTION WHEN others THEN IF SQLERRM NOT IN ('INVALID_ORIGIN','INVALID_TASK_ORIGIN') THEN RAISE; END IF; END;
 BEGIN
  PERFORM enqueue_task(own_conversation,'Forged research origin',jsonb_build_object('kind','wizard_question','conversationId',own_conversation,'draftId',gen_random_uuid(),'questionId',gen_random_uuid(),'researchLinkId',gen_random_uuid()),gen_random_uuid());
  RAISE EXCEPTION 'Unrelated research origin accepted';
 EXCEPTION WHEN others THEN IF SQLERRM NOT IN ('INVALID_ORIGIN','INVALID_TASK_ORIGIN') THEN RAISE; END IF; END;
 RAISE NOTICE 'PASS: exact origin validation remains enforced for service-role task creation';
END $$;
RESET ROLE;
ROLLBACK;
