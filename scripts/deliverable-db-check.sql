\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id) VALUES
 ('aaaaaaaa-1111-4111-8111-111111111111'),
 ('bbbbbbbb-2222-4222-8222-222222222222');
INSERT INTO workspaces(id) VALUES
 ('aaaaaaaa-1111-4111-8111-111111111111'),
 ('bbbbbbbb-2222-4222-8222-222222222222');
INSERT INTO conversations(id,workspace_id,title) VALUES
 ('cccccccc-3333-4333-8333-333333333333','aaaaaaaa-1111-4111-8111-111111111111','Continue a document');
INSERT INTO deliverables(id,workspace_id,title,type,content,version,created_at) VALUES
 ('dddddddd-4444-4444-8444-444444444444','aaaaaaaa-1111-4111-8111-111111111111','First report','general','Alpha body',1,'2026-11-01 10:00:00+00'),
 ('eeeeeeee-5555-4555-8555-555555555555','aaaaaaaa-1111-4111-8111-111111111111','Second report','research_report','Beta body',1,'2026-11-02 10:00:00+00'),
 ('ffffffff-6666-4666-8666-666666666666','bbbbbbbb-2222-4222-8222-222222222222','Foreign report','general','Secret body',1,'2026-11-03 10:00:00+00');
INSERT INTO deliverable_versions(workspace_id,deliverable_id,version,title,content,source_refs,context_refs,limitations) VALUES
 ('aaaaaaaa-1111-4111-8111-111111111111','dddddddd-4444-4444-8444-444444444444',1,'First report','Alpha body','[]','[]','[]'),
 ('aaaaaaaa-1111-4111-8111-111111111111','eeeeeeee-5555-4555-8555-555555555555',1,'Second report','Beta body','[{"id":"source-1"}]','[]','["Limited sample"]'),
 ('bbbbbbbb-2222-4222-8222-222222222222','ffffffff-6666-4666-8666-666666666666',1,'Foreign report','Secret body','[]','[]','[]');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-1111-4111-8111-111111111111',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
DO $$
DECLARE d deliverables; n integer;
BEGIN
 -- Bounded, owner-scoped search, type and date filters agree with the result.
 SELECT count(*) INTO n FROM list_deliverables(NULL,NULL,NULL,NULL,NULL,NULL,20);
 IF n<>2 THEN RAISE EXCEPTION 'Owner library leaked or lost rows: %',n; END IF;
 SELECT count(*) INTO n FROM list_deliverables('Beta',NULL,NULL,NULL,NULL,NULL,20);
 IF n<>1 THEN RAISE EXCEPTION 'Search filter did not isolate the document'; END IF;
 SELECT count(*) INTO n FROM list_deliverables(NULL,'general',NULL,NULL,NULL,NULL,20);
 IF n<>1 THEN RAISE EXCEPTION 'Type filter did not isolate the document'; END IF;
 SELECT count(*) INTO n FROM list_deliverables(NULL,NULL,'2026-11-02 00:00:00+00'::timestamptz,NULL,NULL,NULL,20);
 IF n<>1 THEN RAISE EXCEPTION 'Date filter did not isolate the document'; END IF;
 SELECT count(*) INTO n FROM list_deliverables(NULL,NULL,NULL,NULL,'2026-11-02 10:00:00+00'::timestamptz,'eeeeeeee-5555-4555-8555-555555555555',1);
 IF n<>1 OR (SELECT id FROM list_deliverables(NULL,NULL,NULL,NULL,'2026-11-02 10:00:00+00'::timestamptz,'eeeeeeee-5555-4555-8555-555555555555',1))<>'dddddddd-4444-4444-8444-444444444444' THEN RAISE EXCEPTION 'Cursor page did not continue after the last row'; END IF;
 IF (SELECT count(*) FROM list_deliverables(NULL,NULL,NULL,NULL,NULL,NULL,500))<>2 THEN RAISE EXCEPTION 'Library limit was not bounded'; END IF;

 -- An owner edit appends version 2 and leaves version 1 inspectable.
 SELECT * INTO d FROM update_deliverable('dddddddd-4444-4444-8444-444444444444',1,'First report revised','Alpha body v2');
 IF d.version<>2 OR d.content<>'Alpha body v2' THEN RAISE EXCEPTION 'Edit did not create a new version'; END IF;
 IF NOT EXISTS(SELECT 1 FROM deliverable_versions WHERE deliverable_id=d.id AND version=1 AND title='First report' AND content='Alpha body') THEN RAISE EXCEPTION 'Version 1 was overwritten'; END IF;
 IF (SELECT count(*) FROM deliverable_versions WHERE deliverable_id=d.id)<>2 THEN RAISE EXCEPTION 'History did not retain both versions'; END IF;
 BEGIN PERFORM update_deliverable('dddddddd-4444-4444-8444-444444444444',1,'Stale','Stale body'); RAISE EXCEPTION 'Stale edit accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'STALE_VERSION' THEN RAISE; END IF; END;
 BEGIN PERFORM update_deliverable('ffffffff-6666-4666-8666-666666666666',1,'Hijack','Hijack body'); RAISE EXCEPTION 'Foreign document edit accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE; END IF; END;

 -- Continue with Director retains an exact, owner-checked document version.
 PERFORM enqueue_task('cccccccc-3333-4333-8333-333333333333','Continue the saved report',jsonb_build_object('kind','document','conversationId','cccccccc-3333-4333-8333-333333333333','deliverableId','dddddddd-4444-4444-8444-444444444444','version',2),'90000000-0000-4000-8000-000000000001');
 PERFORM enqueue_task('cccccccc-3333-4333-8333-333333333333','Continue from version one',jsonb_build_object('kind','document','conversationId','cccccccc-3333-4333-8333-333333333333','deliverableId','dddddddd-4444-4444-8444-444444444444','version',1),'90000000-0000-4000-8000-000000000002');
 BEGIN PERFORM enqueue_task('cccccccc-3333-4333-8333-333333333333','Forge foreign document',jsonb_build_object('kind','document','conversationId','cccccccc-3333-4333-8333-333333333333','deliverableId','ffffffff-6666-4666-8666-666666666666','version',1),'90000000-0000-4000-8000-000000000003'); RAISE EXCEPTION 'Foreign document origin accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVALID_ORIGIN' THEN RAISE; END IF; END;
 BEGIN PERFORM enqueue_task('cccccccc-3333-4333-8333-333333333333','Forge missing version',jsonb_build_object('kind','document','conversationId','cccccccc-3333-4333-8333-333333333333','deliverableId','dddddddd-4444-4444-8444-444444444444','version',99),'90000000-0000-4000-8000-000000000004'); RAISE EXCEPTION 'Missing document version origin accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVALID_ORIGIN' THEN RAISE; END IF; END;

 BEGIN PERFORM delete_deliverable('dddddddd-4444-4444-8444-444444444444',1); RAISE EXCEPTION 'Stale delete accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'STALE_VERSION' THEN RAISE; END IF; END;
 PERFORM delete_deliverable('dddddddd-4444-4444-8444-444444444444',2);
 IF EXISTS(SELECT 1 FROM deliverables WHERE id='dddddddd-4444-4444-8444-444444444444') OR EXISTS(SELECT 1 FROM deliverable_versions WHERE deliverable_id='dddddddd-4444-4444-8444-444444444444') THEN RAISE EXCEPTION 'Delete did not remove the document and its versions'; END IF;
 RAISE NOTICE 'PASS: owner-scoped bounded search/type/date/cursor library, immutable edit versions, stale/foreign edit rejection, exact document origin, governed delete';
END $$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-2222-4222-8222-222222222222',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
DO $$
BEGIN
 IF (SELECT count(*) FROM list_deliverables(NULL,NULL,NULL,NULL,NULL,NULL,20))<>1 THEN RAISE EXCEPTION 'Foreign library rows leaked'; END IF;
 BEGIN PERFORM update_deliverable('eeeeeeee-5555-4555-8555-555555555555',1,'Hijack','Hijack'); RAISE EXCEPTION 'Cross-owner edit accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE; END IF; END;
 BEGIN PERFORM delete_deliverable('eeeeeeee-5555-4555-8555-555555555555',1); RAISE EXCEPTION 'Cross-owner delete accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE; END IF; END;
END $$;
ROLLBACK;
