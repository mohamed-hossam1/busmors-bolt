DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM workspaces WHERE name='Preserved legacy business') THEN RAISE EXCEPTION 'Business lost'; END IF;
 IF NOT EXISTS(SELECT 1 FROM workspace_settings WHERE workspace_id='77777777-7777-4777-8777-777777777777' AND language='en' AND ui_language='en' AND conversation_language='en' AND content_register='english' AND confirmed_intake_version IS NULL) THEN RAISE EXCEPTION 'Legacy preferences not normalized or confirmation invented'; END IF;
 IF NOT EXISTS(SELECT 1 FROM brain_nodes WHERE title='Legacy offering' AND summary='Keep this exact owner text.' AND approval_state='legacy') THEN RAISE EXCEPTION 'Legacy knowledge lost or approval invented'; END IF;
 IF (SELECT count(*) FROM brain_versions WHERE node_id='77777777-7777-4777-8777-111111111111')<>1 THEN RAISE EXCEPTION 'Missing legacy snapshot'; END IF;
 IF NOT EXISTS(SELECT 1 FROM planned_posts WHERE caption='Legacy published claim' AND execution_state='owner_reported' AND published_at IS NULL) THEN RAISE EXCEPTION 'Verified publication invented'; END IF;
 IF NOT EXISTS(SELECT 1 FROM planned_posts WHERE caption='Legacy schedule' AND status='draft' AND approval_state='unapproved') THEN RAISE EXCEPTION 'Legacy schedule unsafe'; END IF;
 IF (SELECT count(*) FROM deliverable_versions)<>1 THEN RAISE EXCEPTION 'Document backfill missing'; END IF;
 BEGIN
  UPDATE workspace_settings SET language='ar' WHERE workspace_id='77777777-7777-4777-8777-777777777777';
  RAISE EXCEPTION 'Removed locale allowed';
 EXCEPTION WHEN check_violation THEN NULL; END;
 RAISE NOTICE 'PASS: populated upgrade preserves content, normalizes preferences, records legacy provenance and does not invent publication or confirmation';
END $$;
