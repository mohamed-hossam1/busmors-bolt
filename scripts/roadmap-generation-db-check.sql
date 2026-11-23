\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id) VALUES
 ('aaaaaaaa-1111-4111-8111-111111111111'),
 ('bbbbbbbb-2222-4222-8222-222222222222');
INSERT INTO workspaces(id) VALUES
 ('aaaaaaaa-1111-4111-8111-111111111111'),
 ('bbbbbbbb-2222-4222-8222-222222222222');

-- Seed an approved, current Brain fact + its version snapshot as superuser so a
-- roadmap can record a context_dependency against it.
INSERT INTO brain_nodes(id,workspace_id,category,title,summary,status,source,approval_state,verification_state,is_current,version)
 VALUES ('99999999-9999-4999-8999-999999999999','aaaaaaaa-1111-4111-8111-111111111111','audience','Local households','Repeat buyers in the city.','approved','conversation','approved','owner_reported',true,1);
INSERT INTO brain_versions(workspace_id,node_id,version,snapshot)
 VALUES ('aaaaaaaa-1111-4111-8111-111111111111','99999999-9999-4999-8999-999999999999',1,'{"title":"Local households"}'::jsonb);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-1111-4111-8111-111111111111',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);

DO $$
DECLARE
 w_a uuid:='aaaaaaaa-1111-4111-8111-111111111111';
 w_b uuid:='bbbbbbbb-2222-4222-8222-222222222222';
 bn uuid:='99999999-9999-4999-8999-999999999999';
 d discovery_drafts;
 sync jsonb;
 res jsonb;
 r roadmaps;
 v roadmap_versions;
 s1 roadmap_steps;
 s2 roadmap_steps;
 loaded jsonb;
 n integer;
 plan jsonb;
 plan2 jsonb;
 bad jsonb;
 old_id uuid;
 old_steps integer;
 old_status text;
 ctx integer;
BEGIN
 -- A Discovery draft with one active question.
 d:=save_discovery_draft('grow_customers',0,'[]'::jsonb);
 sync:=sync_discovery_questions(d.id,d.version,jsonb_build_array(
  jsonb_build_object('question_key','growth_motion','position',0,'branch','grow_customers',
   'schema',jsonb_build_object('label','Which growth motion?','why','Focus.','type','choice'))
 ));
 SELECT * INTO d FROM discovery_drafts WHERE id=d.id;
 IF d.version<>2 THEN RAISE EXCEPTION 'draft version not advanced after sync: %',d.version; END IF;

 plan:=jsonb_build_object(
  'title','Repeat purchase plan',
  'summary','Bring existing customers back.',
  'uncertainty','Baseline unknown.',
  'diagnosis',jsonb_build_object('whatIsHappening','Slow repeat purchase','ownerBelief','Price','directorHypothesis','No follow-up','evidence',jsonb_build_array('Owner report'),'confidence','medium','unknowns',jsonb_build_array('Repeat rate')),
  'objective',jsonb_build_object('statement','Add 10 repeat customers','proposed',true,'rationale','Cheapest growth.'),
  'metrics',jsonb_build_array(jsonb_build_object('name','Repeat rate','baseline','unknown','target','20%','method','Count repeat buyers')),
  'priorities',jsonb_build_array(jsonb_build_object('priority','Follow up','why','Fresh experience')),
  'risks',jsonb_build_array(jsonb_build_object('risk','Low demand','assumption','Demand exists','mitigation','Test small')),
  'review',jsonb_build_object('cadence','weekly','rationale','Short loop'),
  'steps',jsonb_build_array(
   jsonb_build_object('key','s1','title','Call past customers','objective','Reach 20','responsibility','owner','executionMode','owner','checklist',jsonb_build_array('List','Call'),'effort','2h'),
   jsonb_build_object('key','s2','title','Draft win-back offer','objective','Offer','responsibility','system','executionMode','director','dependencies',jsonb_build_array('s1'))
  ),
  'contextRefs',jsonb_build_array(jsonb_build_object('nodeId',bn::text,'version',1))
 );

 res:=save_generated_roadmap(d.id,'grow_customers',d.version,plan);
 IF (res->>'roadmapId') IS NULL OR (res->>'steps')::integer<>2 THEN RAISE EXCEPTION 'save_generated_roadmap returned wrong result: %',res; END IF;

 SELECT * INTO r FROM roadmaps WHERE id=(res->>'roadmapId')::uuid;
 IF r.status<>'active' OR r.draft_id<>d.id OR r.goal<>'grow_customers' THEN RAISE EXCEPTION 'roadmap row wrong: %',r; END IF;
 SELECT * INTO v FROM roadmap_versions WHERE id=(res->>'versionId')::uuid;
 IF v.status<>'active' OR v.summary->>'title'<>'Repeat purchase plan' THEN RAISE EXCEPTION 'version summary wrong: %',v.summary; END IF;
 IF r.active_version_id<>v.id THEN RAISE EXCEPTION 'active_version_id not set'; END IF;

 SELECT * INTO s1 FROM roadmap_steps WHERE plan_version_id=v.id AND step_key='s1';
 SELECT * INTO s2 FROM roadmap_steps WHERE plan_version_id=v.id AND step_key='s2';
 IF s1.responsibility<>'owner' OR s1.execution_mode<>'owner' THEN RAISE EXCEPTION 's1 responsibility wrong'; END IF;
 IF s2.responsibility<>'system' OR s2.execution_mode<>'director' OR s2.dependencies->>0<>'s1' THEN RAISE EXCEPTION 's2 responsibility/deps wrong'; END IF;

 -- Brain fact recorded as a roadmap context dependency.
 SELECT count(*) INTO ctx FROM context_dependencies WHERE consumer_type='roadmap' AND consumer_id=r.id AND node_id=bn;
 IF ctx<>1 THEN RAISE EXCEPTION 'expected 1 roadmap context dependency, got %',ctx; END IF;

 -- Discovery draft marked planned and version advanced.
 SELECT * INTO d FROM discovery_drafts WHERE id=d.id;
 IF d.status<>'planned' THEN RAISE EXCEPTION 'draft not planned: %',d.status; END IF;

 -- load_active_roadmap returns roadmap + steps.
 loaded:=load_active_roadmap();
 IF (loaded->'roadmap'->>'id')<>r.id::text THEN RAISE EXCEPTION 'load_active_roadmap roadmap wrong'; END IF;
 IF jsonb_array_length(loaded->'steps')<>2 THEN RAISE EXCEPTION 'load steps wrong: %',loaded->'steps'; END IF;

 -- Owner completes an owner step; Director steps are not owner-completable via status guard? (owner may still attest)
 s1:=set_roadmap_step_status(s1.id,'completed',jsonb_build_object('note','Called 20'));
 IF s1.status<>'completed' OR s1.attestation->>'note'<>'Called 20' THEN RAISE EXCEPTION 'step status update failed: %',s1.status; END IF;

 -- Invalid status rejected.
 BEGIN
  PERFORM set_roadmap_step_status(s1.id,'nonsense',NULL);
  RAISE EXCEPTION 'invalid status was accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE '%INVALID_STATUS%' THEN RAISE; END IF;
 END;

 -- Workspace isolation: user B sees no roadmap and cannot touch A's step.
 PERFORM set_config('request.jwt.claim.sub',w_b::text,true);
 loaded:=load_active_roadmap();
 IF loaded->>'roadmap' IS NOT NULL THEN RAISE EXCEPTION 'workspace B saw workspace A roadmap'; END IF;
 BEGIN
  PERFORM set_roadmap_step_status(s1.id,'completed',NULL);
  RAISE EXCEPTION 'workspace B updated workspace A step';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE '%NOT_FOUND%' THEN RAISE; END IF;
 END;

 -- Back to A. Regenerate: previous roadmap archived, old steps preserved, one active.
 PERFORM set_config('request.jwt.claim.sub',w_a::text,true);
 SELECT * INTO d FROM discovery_drafts WHERE id=d.id;
 plan2:=jsonb_build_object('title','Second plan','steps',jsonb_build_array(
  jsonb_build_object('key','x1','title','New step','responsibility','owner','executionMode','owner')
 ));
 old_id:=r.id;
 res:=save_generated_roadmap(d.id,'grow_customers',d.version,plan2);
 IF (res->>'roadmapId')::uuid=old_id THEN RAISE EXCEPTION 'regeneration reused the same roadmap id'; END IF;
 SELECT count(*) INTO n FROM roadmaps WHERE workspace_id=w_a AND status='active';
 IF n<>1 THEN RAISE EXCEPTION 'expected exactly one active roadmap, got %',n; END IF;
 SELECT status INTO old_status FROM roadmaps WHERE id=old_id;
 IF old_status<>'archived' THEN RAISE EXCEPTION 'old roadmap not archived: %',old_status; END IF;
 SELECT count(*) INTO old_steps FROM roadmap_steps WHERE roadmap_id=old_id;
 IF old_steps<>2 THEN RAISE EXCEPTION 'old steps not preserved: %',old_steps; END IF;

 -- Invalid plan (no steps) rejected.
 BEGIN
  bad:=jsonb_build_object('title','x','steps','[]'::jsonb);
  PERFORM save_generated_roadmap(d.id,'grow_customers',d.version,bad);
  RAISE EXCEPTION 'invalid plan was accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE '%INVALID_PLAN%' THEN RAISE; END IF;
 END;

 -- Stale draft version rejected.
 BEGIN
  PERFORM save_generated_roadmap(d.id,'grow_customers',999999,plan2);
  RAISE EXCEPTION 'stale version was accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE '%STALE_VERSION%' THEN RAISE; END IF;
 END;
END $$;

ROLLBACK;