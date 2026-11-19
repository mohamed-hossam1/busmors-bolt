\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id) VALUES
 ('aaaaaaaa-1111-4111-8111-111111111111'),
 ('bbbbbbbb-2222-4222-8222-222222222222');
INSERT INTO workspaces(id) VALUES
 ('aaaaaaaa-1111-4111-8111-111111111111'),
 ('bbbbbbbb-2222-4222-8222-222222222222');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-1111-4111-8111-111111111111',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
DO $$
DECLARE
 d discovery_drafts;
 q discovery_questions;
 q_audience discovery_questions;
 q_route discovery_questions;
 q_inquiry discovery_questions;
 r jsonb;
 n integer;
begin
 -- A first goal creates a versioned draft. No fixed long survey is needed.
 d:=save_discovery_draft('acquire_first_customers',0,'[]'::jsonb);
 IF d.version<>1 OR d.goal<>'acquire_first_customers' OR d.status<>'draft' THEN RAISE EXCEPTION 'Initial draft was not created correctly'; END IF;

 -- A new question may reuse an eligible Brain fact as a visible confirmed answer.
 r:=sync_discovery_questions(d.id,d.version,jsonb_build_array(
  jsonb_build_object('question_key','priority_audience','position',0,'branch','acquire_first_customers','schema',jsonb_build_object('label','Who is the priority customer?','why','Proof and channels depend on this.','type','choice','options',jsonb_build_array(jsonb_build_object('value','Local households','label','Local households')))),
  jsonb_build_object('question_key','no_website_route','position',1,'branch','acquire_first_customers','schema',jsonb_build_object('label','Where should a ready buyer go?','why','A real next step is required.','type','choice'))
 ),jsonb_build_object('priority_audience',jsonb_build_object(
  'status','confirmed',
  'value',jsonb_build_object('choice','Local households'),
  'provenance',jsonb_build_object('kind','brain','nodeId','11111111-1111-4111-8111-111111111111','title','Local households','version',1)
 )));
 IF (r->'draft'->>'version')::integer<>2 THEN RAISE EXCEPTION 'Question sync did not advance the draft version'; END IF;
 SELECT * INTO q_audience FROM discovery_questions WHERE draft_id=d.id AND question_key='priority_audience';
 SELECT * INTO q_route FROM discovery_questions WHERE draft_id=d.id AND question_key='no_website_route';
 IF q_audience.status<>'confirmed' OR q_audience.value->>'choice'<>'Local households' OR q_audience.provenance->>'kind'<>'brain' THEN RAISE EXCEPTION 'Brain prefill was not saved visibly'; END IF;
 IF q_route.status<>'unanswered' OR q_route.value IS NOT NULL THEN RAISE EXCEPTION 'New question should start unanswered'; END IF;

 -- Answers are compare-and-swap and keep their stable question id.
 q_audience:=save_discovery_answer(q_audience.id,q_audience.version,'answered',jsonb_build_object('choice','Local households'),jsonb_build_object('kind','owner'));
 IF q_audience.version<>2 OR q_audience.status<>'answered' THEN RAISE EXCEPTION 'Answer was not saved as a new question version'; END IF;
 BEGIN PERFORM save_discovery_answer(q_audience.id,1,'answered',jsonb_build_object('choice','Stale'),'{}'::jsonb); RAISE EXCEPTION 'Stale answer accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'STALE_VERSION' THEN RAISE; END IF; END;

 -- Unknown, skipped and not applicable are stored without a positive value.
 q_route:=save_discovery_answer(q_route.id,q_route.version,'unknown',NULL,'{}'::jsonb);
 IF q_route.status<>'unknown' OR q_route.value IS NOT NULL THEN RAISE EXCEPTION 'Unknown answer carried a value'; END IF;
 BEGIN PERFORM save_discovery_answer(q_route.id,q_route.version,'skipped',jsonb_build_object('text','smuggled'),'{}'::jsonb); RAISE EXCEPTION 'Skipped answer accepted a value';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVALID_ANSWER' THEN RAISE; END IF; END;
 BEGIN PERFORM save_discovery_answer(q_route.id,q_route.version,'answered',NULL,'{}'::jsonb); RAISE EXCEPTION 'Answered status accepted no value';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVALID_ANSWER' THEN RAISE; END IF; END;

 -- Changing the goal adapts questions and deactivates old ones without deleting
 -- their saved context. The stable audience id and answer survive.
 r:=sync_discovery_questions(d.id,2,jsonb_build_array(
  jsonb_build_object('question_key','priority_audience','position',0,'branch','convert_inquiries','schema',jsonb_build_object('label','Who is the priority customer?','why','Proof and channels depend on this.','type','choice')),
  jsonb_build_object('question_key','inquiry_response','position',1,'branch','convert_inquiries','schema',jsonb_build_object('label','Where does the inquiry path break?','why','Fix the real break.','type','choice'))
 ),'{}'::jsonb);
 IF (r->'draft'->>'version')::integer<>3 THEN RAISE EXCEPTION 'Goal sync did not advance the draft version'; END IF;
 SELECT * INTO q_audience FROM discovery_questions WHERE draft_id=d.id AND question_key='priority_audience';
 SELECT * INTO q_route FROM discovery_questions WHERE draft_id=d.id AND question_key='no_website_route';
 SELECT * INTO q_inquiry FROM discovery_questions WHERE draft_id=d.id AND question_key='inquiry_response';
 IF q_audience.question_key<>'priority_audience' OR q_audience.status<>'answered' OR q_audience.value->>'choice'<>'Local households' OR NOT q_audience.active THEN RAISE EXCEPTION 'Compatible answer was lost on goal change'; END IF;
 IF q_route.active OR q_route.status<>'unknown' OR q_route.value IS NOT NULL THEN RAISE EXCEPTION 'Incompatible question was deleted or its unknown state changed'; END IF;
 IF NOT q_inquiry.active OR q_inquiry.status<>'unanswered' THEN RAISE EXCEPTION 'New goal question was not created'; END IF;
 IF (SELECT count(*) FROM discovery_questions WHERE draft_id=d.id)<>3 THEN RAISE EXCEPTION 'Historical questions were deleted'; END IF;
 q_inquiry:=save_discovery_answer(q_inquiry.id,q_inquiry.version,'answered',jsonb_build_object('text','Replies are too slow'),'{"kind":"owner"}'::jsonb);

 -- Switching back restores the earlier branch and its saved answer.
 r:=sync_discovery_questions(d.id,3,jsonb_build_array(
  jsonb_build_object('question_key','priority_audience','position',0,'branch','acquire_first_customers','schema',jsonb_build_object('label','Who is the priority customer?','why','Proof and channels depend on this.','type','choice')),
  jsonb_build_object('question_key','no_website_route','position',1,'branch','acquire_first_customers','schema',jsonb_build_object('label','Where should a ready buyer go?','why','A real next step is required.','type','choice'))
 ),'{}'::jsonb);
 SELECT * INTO q_route FROM discovery_questions WHERE draft_id=d.id AND question_key='no_website_route';
 SELECT * INTO q_inquiry FROM discovery_questions WHERE draft_id=d.id AND question_key='inquiry_response';
 IF NOT q_route.active OR q_route.status<>'unknown' OR q_route.value IS NOT NULL THEN RAISE EXCEPTION 'Earlier branch did not restore its saved unknown state'; END IF;
 IF q_inquiry.active OR q_inquiry.status<>'answered' OR q_inquiry.value->>'text'<>'Replies are too slow' THEN RAISE EXCEPTION 'Inactive branch answer was destroyed'; END IF;

 -- A preliminary plan records open unknowns but does not generate or activate a Roadmap.
 d:=plan_discovery_draft(d.id,4,jsonb_build_array('no_website_route'));
 IF d.status<>'planned' THEN RAISE EXCEPTION 'Preliminary plan status was not saved'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(d.context_refs) item WHERE item->>'kind'='preliminary_plan' AND item->'openQuestionKeys' ? 'no_website_route') THEN RAISE EXCEPTION 'Open unknowns were not recorded'; END IF;
 IF EXISTS(SELECT 1 FROM roadmaps WHERE workspace_id='aaaaaaaa-1111-4111-8111-111111111111') THEN RAISE EXCEPTION 'Preliminary plan must not create an active Roadmap'; END IF;

 -- Capture ids for the cross-workspace checks below.
 PERFORM set_config('test.discovery_draft_id',d.id::text,false);
 PERFORM set_config('test.discovery_question_id',q_audience.id::text,false);

 -- The load RPC returns the draft, active questions and historical answers.
 r:=load_discovery();
 IF (r->'draft'->>'version')::integer<>5 THEN RAISE EXCEPTION 'Load did not return the latest draft version'; END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(r->'questions') item)<>3 THEN RAISE EXCEPTION 'Load did not return historical questions'; END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(r->'questions') item WHERE (item->>'active')::boolean)<>2 THEN RAISE EXCEPTION 'Load returned the wrong active question count'; END IF;
 SELECT count(*) INTO n FROM jsonb_array_elements(r->'questions') item WHERE item->>'question_key'='no_website_route' AND item->>'status'='unknown';
 IF n<>1 THEN RAISE EXCEPTION 'Load lost the saved unknown status'; END IF;

 RAISE NOTICE 'PASS: versioned Discovery draft, stable question ids, confirmed Brain prefill, typed answers, stale rejection, goal adaptation without deletion, preliminary plan disclosure';
END $$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-2222-4222-8222-222222222222',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
DO $$
DECLARE d discovery_drafts; q uuid; r jsonb;
begin
 -- A second workspace starts empty and cannot read or mutate the first one.
 r:=load_discovery();
 IF r->'draft' IS NOT NULL AND r->'draft'<>'null'::jsonb THEN RAISE EXCEPTION 'Foreign Discovery leaked'; END IF;
 q:=current_setting('test.discovery_question_id')::uuid;
 BEGIN PERFORM save_discovery_answer(q,1,'answered',jsonb_build_object('text','Hijack'),'{}'::jsonb); RAISE EXCEPTION 'Cross-owner answer accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE; END IF; END;
 BEGIN PERFORM sync_discovery_questions(current_setting('test.discovery_draft_id')::uuid,1,'[]'::jsonb,'{}'::jsonb); RAISE EXCEPTION 'Cross-owner sync accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE; END IF; END;
 d:=save_discovery_draft('custom',0,'[]'::jsonb);
 IF d.workspace_id<>'bbbbbbbb-2222-4222-8222-222222222222' OR d.version<>1 THEN RAISE EXCEPTION 'Second workspace could not start its own draft'; END IF;
END $$;
ROLLBACK;
