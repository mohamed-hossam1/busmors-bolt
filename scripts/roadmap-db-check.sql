\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id) VALUES
 ('aaaaaaaa-1111-4111-8111-111111111111'),
 ('bbbbbbbb-2222-4222-8222-222222222222');
INSERT INTO workspaces(id) VALUES
 ('aaaaaaaa-1111-4111-8111-111111111111'),
 ('bbbbbbbb-2222-4222-8222-222222222222');

DO $$
DECLARE
  seed_node uuid;
BEGIN
  INSERT INTO brain_nodes(workspace_id, category, title, summary, status, is_current, version)
  VALUES ('aaaaaaaa-1111-4111-8111-111111111111', 'audience', 'Local SMEs', 'Retail shops in Cairo', 'approved', true, 1)
  RETURNING id INTO seed_node;
  INSERT INTO brain_versions(workspace_id, node_id, version, snapshot, provenance)
  SELECT 'aaaaaaaa-1111-4111-8111-111111111111', id, version, to_jsonb(brain_nodes), '{}'::jsonb FROM brain_nodes WHERE id = seed_node;
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-1111-4111-8111-111111111111',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);

DO $$
DECLARE
 d discovery_drafts;
 q discovery_questions;
 synced jsonb;
 node_id uuid;
 node_v integer;
 gen jsonb;
 v_roadmap_id uuid;
 step_director uuid;
 step_owner uuid;
 act jsonb;
 obj jsonb;
 chk jsonb;
 rev roadmap_revisions;
 approved jsonb;
 rev2 roadmap_revisions;
 entry roadmap_learning_log;
 prop jsonb;
 promoted roadmap_learning_log;
 loaded jsonb;
 idemp uuid := '11111111-2222-4333-8444-555555555555';
 conv_id uuid := '22222222-3333-4444-8555-666666666666';
BEGIN
 -- 1. Setup Discovery + Brain node + Employee conversation
 d := save_discovery_draft('validate_idea', 0, '[]'::jsonb);
 synced := sync_discovery_questions(
   d.id, d.version,
   jsonb_build_array(
     jsonb_build_object(
       'question_key', 'vi_problem',
       'position', 0,
       'branch', 'validate_idea',
       'schema', jsonb_build_object('label', 'Problem?', 'why', 'Why', 'type', 'choice', 'askDirectorEligible', true)
     )
   ),
   '{}'::jsonb
 );
 SELECT * INTO q FROM discovery_questions WHERE draft_id = d.id AND question_key = 'vi_problem';

 -- Phase 2: save_director_question_proposal must NOT touch status, value, or version
 q := save_director_question_proposal(
   q.id,
   jsonb_build_object('proposedAnswer', 'Saves time/effort', 'rationale', 'Matches Brain', 'confidence', 'high')
 );
 IF q.status <> 'unanswered' OR q.value IS NOT NULL OR q.version <> 1
    OR (q.provenance -> 'directorProposal' ->> 'proposedAnswer') <> 'Saves time/effort' THEN
   RAISE EXCEPTION 'save_director_question_proposal mutated active answer or failed to persist';
 END IF;

 SELECT id, version INTO node_id, node_v FROM brain_nodes WHERE workspace_id = 'aaaaaaaa-1111-4111-8111-111111111111' LIMIT 1;

 INSERT INTO employee_conversations(id, workspace_id, user_id, title)
 VALUES (conv_id, 'aaaaaaaa-1111-4111-8111-111111111111', 'aaaaaaaa-1111-4111-8111-111111111111', 'Competitor analysis');

 -- 2. Phase 3: create_generated_roadmap + context_dependencies + objective update
 SELECT version INTO node_v FROM discovery_drafts WHERE id = d.id;
 gen := create_generated_roadmap(
   d.id,
   node_v,
   'validate_idea',
   jsonb_build_object('primaryObjective', jsonb_build_object('title', 'Validate demand', 'outcome', '10 interviews', 'proposedTarget', '10', 'isProposedTarget', true)),
   jsonb_build_array(
     jsonb_build_object('stepKey', 's1', 'position', 0, 'title', 'Research competitors', 'objective', 'Map top 3 rivals', 'rationale', 'Baseline', 'responsibleParty', 'director', 'actionKind', 'research', 'expectedOutput', 'Report', 'milestoneKey', 'm1', 'milestoneTitle', 'Week 1', 'milestonePosition', 0, 'priority', 'high'),
     jsonb_build_object('stepKey', 's2', 'position', 1, 'title', 'Interview 5 leads', 'objective', 'Confirm pain', 'rationale', 'Direct signal', 'responsibleParty', 'owner', 'actionKind', 'owner_execution', 'expectedOutput', 'Notes', 'milestoneKey', 'm1', 'milestoneTitle', 'Week 1', 'milestonePosition', 0, 'priority', 'medium')
   ),
   jsonb_build_array(jsonb_build_object('nodeId', node_id, 'nodeVersion', 1)),
   7,
   NULL
 );
 v_roadmap_id := (gen -> 'roadmap' ->> 'id')::uuid;
 IF v_roadmap_id IS NULL OR jsonb_array_length(gen -> 'steps') <> 2 THEN
   RAISE EXCEPTION 'create_generated_roadmap failed';
 END IF;

 -- Stale Brain dependency detection (superadmin/service_role bumps Brain version, or create proposal; simulate via reset role)
 RESET ROLE;
 UPDATE brain_nodes SET version = 2 WHERE id = node_id;
 SET LOCAL ROLE authenticated;
 PERFORM set_config('request.jwt.claim.sub','aaaaaaaa-1111-4111-8111-111111111111',true);
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 loaded := load_active_roadmap();
 IF jsonb_array_length(loaded -> 'staleDependencies') <> 1 THEN
   RAISE EXCEPTION 'staleDependencies did not detect bumped Brain version';
 END IF;

 -- Objective update + optimistic concurrency
 obj := update_roadmap_objective(v_roadmap_id, 1, jsonb_build_object('title', 'Validate demand', 'outcome', '15 interviews', 'proposedTarget', '15', 'isProposedTarget', false));
 IF (obj -> 'roadmap' ->> 'version')::integer <> 2 THEN
   RAISE EXCEPTION 'update_roadmap_objective did not bump version';
 END IF;
 BEGIN
   PERFORM update_roadmap_objective(v_roadmap_id, 1, '{}'::jsonb);
   RAISE EXCEPTION 'Stale objective update accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'STALE_VERSION' THEN RAISE; END IF; END;

 -- 3. Phase 4: step actions + idempotency + completion rule
 SELECT id INTO step_director FROM roadmap_steps WHERE roadmap_id = v_roadmap_id AND step_key = 's1';
 SELECT id INTO step_owner FROM roadmap_steps WHERE roadmap_id = v_roadmap_id AND step_key = 's2';

 act := perform_roadmap_step_action(step_director, 'run', idemp, jsonb_build_object('conversationId', conv_id));
 IF (act -> 'step' ->> 'execution_state') <> 'waiting_for_director' THEN
   RAISE EXCEPTION 'Director run did not set waiting_for_director';
 END IF;
 -- Idempotent replay
 act := perform_roadmap_step_action(step_director, 'run', idemp, jsonb_build_object('conversationId', conv_id));
 IF (act -> 'step' ->> 'execution_state') <> 'waiting_for_director' THEN
   RAISE EXCEPTION 'Idempotent replay failed';
 END IF;
 -- waiting_owner must NOT auto-complete
 act := perform_roadmap_step_action(step_director, 'waiting_owner', gen_random_uuid(), '{}'::jsonb);
 IF (act -> 'step' ->> 'status') = 'completed' OR (act -> 'step' ->> 'execution_state') <> 'waiting_for_owner' THEN
   RAISE EXCEPTION 'waiting_owner auto-completed step';
 END IF;
 -- Owner marks s2 complete
 act := perform_roadmap_step_action(step_owner, 'complete', gen_random_uuid(), jsonb_build_object('resultNote', 'Done 5 interviews'));
 IF (act -> 'step' ->> 'status') <> 'completed' OR (act -> 'step' ->> 'result_note') <> 'Done 5 interviews' THEN
   RAISE EXCEPTION 'Owner complete failed';
 END IF;

 -- 4. Phase 5: check-in, revision proposal + approval (immutable v2 preserving s2 completed), rejection, learning log + Brain promotion
 chk := save_roadmap_checkin(v_roadmap_id, 'Completed interviews', '3 interested', 'Slow DMs', 'None', 'Lower price tier', 'Adjust', 'Good signal', 'Focus on bundle', 7);
 IF (chk -> 'checkin' ->> 'director_recommendation') <> 'Adjust' THEN
   RAISE EXCEPTION 'save_roadmap_checkin failed';
 END IF;

 rev := save_roadmap_revision_proposal(
   v_roadmap_id, 2, 'Shift to WhatsApp outreach', 'Faster feedback',
   jsonb_build_object('added', jsonb_build_array(), 'removedOrPostponed', jsonb_build_array(), 'modified', jsonb_build_array(), 'summaryChanges', jsonb_build_array('Added WhatsApp step')),
   jsonb_build_object('primaryObjective', jsonb_build_object('title', 'Validate demand', 'outcome', '15 interviews', 'proposedTarget', '15', 'isProposedTarget', false)),
   jsonb_build_array(
     jsonb_build_object('stepKey', 's2', 'position', 0, 'title', 'Interview 5 leads', 'objective', 'Confirm pain', 'rationale', 'Direct signal', 'responsibleParty', 'owner', 'actionKind', 'owner_execution', 'expectedOutput', 'Notes', 'milestoneKey', 'm1', 'milestoneTitle', 'Week 1', 'milestonePosition', 0, 'priority', 'medium'),
     jsonb_build_object('stepKey', 's3', 'position', 1, 'title', 'Test WhatsApp offer', 'objective', 'Send 20 messages', 'rationale', 'Fast test', 'responsibleParty', 'owner', 'actionKind', 'owner_execution', 'expectedOutput', 'Replies', 'milestoneKey', 'm1', 'milestoneTitle', 'Week 1', 'milestonePosition', 0, 'priority', 'high')
   )
 );
 IF rev.status <> 'proposed' THEN RAISE EXCEPTION 'Revision did not start as proposed'; END IF;

 approved := approve_roadmap_revision(rev.id, 2);
 IF (approved -> 'roadmap' ->> 'version')::integer <> 3 OR jsonb_array_length(approved -> 'versions') <> 2 THEN
   RAISE EXCEPTION 'approve_roadmap_revision did not create immutable v2';
 END IF;
 -- s2 should carry over completed state, s3 should be ready
 IF NOT EXISTS (
   SELECT 1 FROM roadmap_steps
    WHERE plan_version_id = (approved -> 'activeVersion' ->> 'id')::uuid
      AND step_key = 's2' AND status = 'completed'
 ) THEN
   RAISE EXCEPTION 'Completed step did not carry over on revision approval';
 END IF;

 -- Rejection path
 rev2 := save_roadmap_revision_proposal(v_roadmap_id, 3, 'Another change', 'Test reject', '{}'::jsonb, '{}'::jsonb, '[]'::jsonb);
 rev2 := reject_roadmap_revision(rev2.id);
 IF rev2.status <> 'rejected' THEN RAISE EXCEPTION 'reject_roadmap_revision failed'; END IF;

 -- Learning log + Brain proposal promotion (must stay pending, never mutate brain_nodes directly)
 entry := create_learning_log_entry(v_roadmap_id, step_owner, 'WhatsApp replies faster', 'Sent 20 DMs', '20% reply', '40% reply', 'Buyers prefer WhatsApp over forms', 'Use WhatsApp CTA');
 prop := propose_brain_change('add', NULL, 'Buyers prefer WhatsApp', '40% reply rate on WhatsApp vs forms', 'audience', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'Roadmap Learning Log', 'Observed in experiment', '[]'::jsonb, 'learn-' || entry.id::text);
 promoted := mark_learning_promoted(entry.id, (prop ->> 'proposalId')::uuid);
 IF promoted.promoted_proposal_id IS NULL THEN RAISE EXCEPTION 'mark_learning_promoted failed'; END IF;

 -- 5. Cross-workspace RLS isolation check
 PERFORM set_config('request.jwt.claim.sub','bbbbbbbb-2222-4222-8222-222222222222',true);
 loaded := load_active_roadmap();
 IF (loaded -> 'roadmap') IS DISTINCT FROM 'null'::jsonb THEN
   RAISE EXCEPTION 'Cross-workspace leak in load_active_roadmap';
 END IF;
 IF EXISTS (SELECT 1 FROM roadmap_checkins) OR EXISTS (SELECT 1 FROM roadmap_revisions) OR EXISTS (SELECT 1 FROM roadmap_learning_log) THEN
   RAISE EXCEPTION 'Cross-workspace RLS leak on Phase 5 tables';
 END IF;

 RAISE NOTICE 'PASS: all Phase 2-5 roadmap migrations, RPCs, versioning carry-over, Brain promotion, and RLS isolation verified';
END $$;
ROLLBACK;
