-- Phase 1 acceptance: results are offered, not auto-saved; Save is idempotent,
-- routes to the proposed section, links posts; Not now can be reversed; another
-- owner cannot touch the offer. Self-rolls-back.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id) VALUES('a5555555-5555-4555-8555-555555555555'),('b5555555-5555-4555-8555-555555555555');
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.sub','a5555555-5555-4555-8555-555555555555',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
DO $$ BEGIN PERFORM bootstrap_workspace(); END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','a5555555-5555-4555-8555-555555555555',true);
SELECT set_config('request.jwt.claim.role','service_role',true);
CREATE TABLE offer_ids(name text PRIMARY KEY, id uuid);
GRANT SELECT ON offer_ids TO authenticated;
DO $$
DECLARE c uuid; runner uuid:=gen_random_uuid(); t tasks; saved jsonb; first jsonb; again jsonb; o deliverable_offers; m messages; quiet jsonb;
BEGIN
 INSERT INTO conversations(workspace_id,title) VALUES(auth.uid(),'Offer acceptance') RETURNING id INTO c;

 -- Posts + document → offer card is the last message, nothing in Deliverables yet.
 t:=enqueue_task(c,'Write 2 posts',jsonb_build_object('kind','direct','conversationId',c),gen_random_uuid());
 t:=admit_task(t.id,runner);
 saved:=save_task_result(t.id,t.run_id,'{"reply":"2 draft Posts are ready.","document":{"title":"Post drafts: Write 2 posts","type":"content_posts","content":"# Post drafts\n\n## Post 1\nA"},"posts":[{"caption":"A","hashtags":"","platform":"facebook"},{"caption":"B","hashtags":"","platform":"facebook"}]}');
 IF saved->>'documentId' IS NOT NULL OR saved->>'offerId' IS NULL THEN RAISE EXCEPTION 'Result did not return an offer instead of a document'; END IF;
  IF EXISTS(SELECT 1 FROM deliverables WHERE workspace_id=auth.uid()) OR EXISTS(SELECT 1 FROM messages WHERE type='deliverable_card' AND workspace_id=auth.uid()) THEN RAISE EXCEPTION 'Result was auto-saved to Deliverables'; END IF;
 IF jsonb_array_length(saved->'messageIds')<>4 THEN RAISE EXCEPTION 'Expected 2 post references, the reply and the offer'; END IF;
 SELECT * INTO m FROM messages WHERE id=(saved->'messageIds'->>3)::uuid;
 IF m.type<>'deliverable_offer' OR m.payload->>'state'<>'offered' OR m.payload->>'proposedType'<>'content_posts' OR (m.payload->>'postCount')::int<>2 THEN RAISE EXCEPTION 'Offer message missing or wrong'; END IF;
 INSERT INTO offer_ids VALUES('posts',(saved->>'offerId')::uuid);

 -- Save twice → one deliverable of the proposed type; posts linked; message updated.
 first:=accept_deliverable_offer((saved->>'offerId')::uuid);
 again:=accept_deliverable_offer((saved->>'offerId')::uuid);
  IF first<>again OR (SELECT count(*) FROM deliverables WHERE workspace_id=auth.uid())<>1 OR (SELECT count(*) FROM deliverable_versions dv JOIN deliverables d ON d.id=dv.deliverable_id WHERE d.workspace_id=auth.uid())<>1 THEN RAISE EXCEPTION 'Double save created duplicates'; END IF;
  IF (SELECT type FROM deliverables WHERE workspace_id=auth.uid())<>'content_posts' OR first->>'type'<>'content_posts' THEN RAISE EXCEPTION 'Deliverable saved to the wrong section'; END IF;
 IF (SELECT count(*) FROM planned_posts WHERE deliverable_id=(first->>'deliverableId')::uuid)<>2 THEN RAISE EXCEPTION 'Posts not linked to the saved snapshot'; END IF;
 SELECT * INTO m FROM messages WHERE id=m.id;
 IF m.payload->>'state'<>'saved' OR m.payload->>'deliverableId'<>first->>'deliverableId' THEN RAISE EXCEPTION 'Offer message not marked saved'; END IF;
 IF NOT EXISTS(SELECT 1 FROM audit_log WHERE action='deliverable_saved' AND entity_id=(first->>'deliverableId')::uuid) THEN RAISE EXCEPTION 'Save not audited'; END IF;
 PERFORM dismiss_deliverable_offer((saved->>'offerId')::uuid);
 IF (SELECT state FROM deliverable_offers WHERE id=(saved->>'offerId')::uuid)<>'saved' THEN RAISE EXCEPTION 'Dismiss overwrote a saved offer'; END IF;

 -- Diagnosis → dismiss → still saveable, into its own section.
 t:=enqueue_task(c,'Diagnose slow sales',jsonb_build_object('kind','direct','conversationId',c),gen_random_uuid());
 t:=admit_task(t.id,runner);
 saved:=save_task_result(t.id,t.run_id,'{"reply":"Your diagnosis is ready.","document":{"title":"Diagnose slow sales","type":"performance_diagnosis","content":"Findings"},"posts":[]}');
 PERFORM dismiss_deliverable_offer((saved->>'offerId')::uuid);
 SELECT * INTO o FROM deliverable_offers WHERE id=(saved->>'offerId')::uuid;
 IF o.state<>'dismissed' OR o.decided_at IS NULL OR (SELECT payload->>'state' FROM messages WHERE id=o.message_id)<>'dismissed' THEN RAISE EXCEPTION 'Dismiss not recorded'; END IF;
  IF (SELECT count(*) FROM deliverables WHERE workspace_id=auth.uid())<>1 THEN RAISE EXCEPTION 'Dismiss created a deliverable'; END IF;
 first:=accept_deliverable_offer(o.id);
  IF first->>'type'<>'performance_diagnosis' OR (SELECT count(*) FROM deliverables WHERE workspace_id=auth.uid())<>2 THEN RAISE EXCEPTION 'Dismissed offer could not be saved later'; END IF;
 INSERT INTO offer_ids VALUES('diagnosis',o.id);

 -- Short reply without a document → no offer.
 t:=enqueue_task(c,'hi',jsonb_build_object('kind','direct','conversationId',c),gen_random_uuid());
 t:=admit_task(t.id,runner);
 quiet:=save_task_result(t.id,t.run_id,'{"reply":"Hello.","posts":[]}');
 IF quiet->>'offerId' IS NOT NULL OR EXISTS(SELECT 1 FROM deliverable_offers WHERE task_id=t.id) THEN RAISE EXCEPTION 'Short reply produced an offer'; END IF;

 RAISE NOTICE 'PASS: results offered not auto-saved, idempotent save to the proposed section, posts linked, dismiss reversible';
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a5555555-5555-4555-8555-555555555555',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
DO $$
BEGIN
 -- Direct table writes stay closed to the client.
 BEGIN
  UPDATE deliverable_offers SET state='saved';
  RAISE EXCEPTION 'Client updated offers directly';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'PASS: direct offer writes denied to authenticated clients';
END $$;

SELECT set_config('request.jwt.claim.sub','b5555555-5555-4555-8555-555555555555',true);
DO $$
DECLARE target uuid;
BEGIN
 PERFORM bootstrap_workspace();
 IF EXISTS(SELECT 1 FROM deliverable_offers) THEN RAISE EXCEPTION 'Foreign offers visible'; END IF;
 SELECT id INTO target FROM offer_ids WHERE name='posts';
 BEGIN PERFORM accept_deliverable_offer(target); RAISE EXCEPTION 'Foreign save accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE; END IF; END;
 BEGIN PERFORM dismiss_deliverable_offer(target); RAISE EXCEPTION 'Foreign dismiss accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE; END IF; END;
 RAISE NOTICE 'PASS: offers are owner-isolated';
END $$;
ROLLBACK;
