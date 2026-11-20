-- Run after migrations against a disposable PostgreSQL/Supabase test database.
-- Fictional data and all changes are rolled back at the end.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id) VALUES ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222');
INSERT INTO workspaces(id) VALUES ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222');
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
DECLARE
  v_candidates jsonb := '[
    {"category":"offering","title":"Ledger Pro","summary":"Ledger Pro is designed for small businesses and their accounting teams.","source_url":"https://www.example.com/products","confidence":0.9,"properties":{"extracted_by":"ai","evidence_quote":"Ledger Pro is designed for small businesses and their accounting teams."}},
    {"category":"audience","title":"Small businesses","summary":"Ledger Pro is designed for small businesses and their accounting teams.","source_url":"https://example.com/products","confidence":0.85,"properties":{"extracted_by":"ai","evidence_quote":"Ledger Pro is designed for small businesses and their accounting teams."}}
  ]';
  v_edges jsonb := '[{"source_index":0,"target_index":1,"relation_type":"TARGETS","source_url":"https://example.com/products","evidence_quote":"Ledger Pro is designed for small businesses and their accounting teams.","confidence":0.9}]';
  v_result jsonb;
  v_count integer;
  v_audit integer;
  v_settings jsonb;
  v_first uuid;
  v_second uuid;
  v_manual uuid;
  v_stale uuid;
  v_other uuid;
BEGIN
  IF has_function_privilege('anon', 'read_shared_crawl_key()', 'EXECUTE')
    OR has_function_privilege('authenticated', 'read_shared_crawl_key()', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'read_shared_crawl_key()', 'EXECUTE')
    OR has_function_privilege('anon', 'save_crawl_brain(text,jsonb,jsonb,integer,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Secret/function privileges are incorrect';
  END IF;
  RAISE NOTICE 'PASS: shared secrets are server-only; anonymous saving is denied';

  v_result := save_crawl_brain('https://example.com/', v_candidates, v_edges, 1, false);
  IF v_result <> '{"nodes_count":2,"edges_count":1}'::jsonb THEN RAISE EXCEPTION 'Wrong persisted counts'; END IF;
  IF (SELECT onboarding_state FROM workspace_settings WHERE workspace_id = auth.uid()) <> 'complete' THEN RAISE EXCEPTION 'Wrong completion state'; END IF;
  SELECT id INTO v_first FROM brain_nodes WHERE workspace_id = auth.uid() AND title = 'Ledger Pro';
  SELECT id INTO v_second FROM brain_nodes WHERE workspace_id = auth.uid() AND title = 'Small businesses';
  -- C10: AI-extracted, high-confidence crawl facts are persisted directly as approved records.
  IF (SELECT count(*) FROM brain_nodes WHERE workspace_id = auth.uid() AND status = 'approved' AND approval_state = 'approved') <> 2 THEN RAISE EXCEPTION 'AI crawl facts must be saved as approved'; END IF;
  IF (SELECT count(*) FROM brain_edges WHERE workspace_id = auth.uid() AND status = 'approved') <> 1 THEN RAISE EXCEPTION 'Crawl relationship must be approved'; END IF;
  -- Auto-approved facts must not leave anything in the owner approval queue.
  IF EXISTS (SELECT 1 FROM brain_proposals p JOIN brain_nodes n ON n.id = p.node_id WHERE n.workspace_id = auth.uid() AND p.status = 'pending') THEN RAISE EXCEPTION 'Auto-approved crawl facts must not require approval'; END IF;
  RAISE NOTICE 'PASS: AI crawl facts and relationships are approved directly without owner review; www is canonicalized';

  PERFORM save_crawl_brain('https://example.com/', v_candidates, v_edges, 1, false);
  IF (SELECT count(*) FROM brain_nodes WHERE workspace_id = auth.uid()) <> 2
    OR (SELECT count(*) FROM brain_edges WHERE workspace_id = auth.uid()) <> 1 THEN RAISE EXCEPTION 'Retry duplicated knowledge'; END IF;
  RAISE NOTICE 'PASS: repeated saves keep stable IDs and do not duplicate nodes/edges';
  -- Duplicate input on an already-saved graph must not inflate counts (edge already exists).
  v_result := save_crawl_brain('https://example.com/', v_candidates, v_edges || v_edges, 1, false);
  IF v_result->>'edges_count' <> '0' OR v_result->>'nodes_count' <> '0' THEN RAISE EXCEPTION 'Duplicate input inflated saved counts'; END IF;
  IF (SELECT count(*) FROM brain_edges WHERE workspace_id = auth.uid()) <> 1 THEN RAISE EXCEPTION 'Duplicate input created a second edge'; END IF;
  RAISE NOTICE 'PASS: duplicate input reports actual distinct persisted relationships';

  SELECT count(*) INTO v_audit FROM audit_log WHERE workspace_id = auth.uid();
  SELECT crawl_status INTO v_settings FROM workspace_settings WHERE workspace_id = auth.uid();
  BEGIN
    PERFORM save_crawl_brain('https://example.com/',
      jsonb_set(v_candidates, '{0,summary}', to_jsonb('A replacement summary that must roll back when relationship validation fails.'::text)),
      jsonb_set(v_edges, '{0,target_index}', '99'), 2, true);
    RAISE EXCEPTION 'Expected relationship failure';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Expected relationship failure' THEN RAISE; END IF;
  END;
  IF (SELECT summary FROM brain_nodes WHERE id = v_first) <> v_candidates->0->>'summary'
    OR (SELECT count(*) FROM brain_edges WHERE workspace_id = auth.uid()) <> 1
    OR (SELECT count(*) FROM audit_log WHERE workspace_id = auth.uid()) <> v_audit
    OR (SELECT crawl_status FROM workspace_settings WHERE workspace_id = auth.uid()) <> v_settings THEN
    RAISE EXCEPTION 'Failed save did not roll back all changes';
  END IF;
  RAISE NOTICE 'PASS: relationship failure rolls back node updates, edge cleanup, settings and audit';

  BEGIN
    PERFORM save_crawl_brain('https://example.com/',
      jsonb_set(v_candidates, '{1,category}', '"invalid-category"'), '[]', 1, true);
    RAISE EXCEPTION 'Expected candidate failure';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Expected candidate failure' THEN RAISE; END IF;
  END;
  IF (SELECT count(*) FROM brain_nodes WHERE workspace_id = auth.uid()) <> 2 THEN RAISE EXCEPTION 'Candidate failure changed knowledge'; END IF;
  RAISE NOTICE 'PASS: invalid candidate rolls back the entire save';

  -- C09 governance: crawl saves never rewrite owner edits, manual edges, other-workspace
  -- data, or silently retire existing facts. A p_replace save is additive-only.
  UPDATE brain_nodes SET summary = 'This business detail was explicitly edited by a user.',
    properties = properties || '{"user_edited":true}'::jsonb WHERE id = v_first;
  INSERT INTO brain_nodes(workspace_id, category, title, summary, source, status)
    VALUES(auth.uid(), 'company_fact', 'Manual context', 'A user-maintained company fact that must survive all crawls.', 'manual', 'approved') RETURNING id INTO v_manual;
  INSERT INTO brain_edges(workspace_id, source_node_id, target_node_id, relation_type, status)
    VALUES(auth.uid(), v_manual, v_first, 'RELATED_TO', 'approved');
  INSERT INTO brain_nodes(workspace_id, category, title, summary, source, source_detail, status)
    VALUES(auth.uid(), 'offering', 'Obsolete unedited crawler fact', 'A legacy crawler result with no user edits or manual relationships.', 'crawler', 'https://example.com/old', 'approved') RETURNING id INTO v_stale;
  INSERT INTO brain_nodes(workspace_id, category, title, summary, source, source_detail, status)
    VALUES('22222222-2222-4222-8222-222222222222', 'company_profile', 'Other workspace', 'Another workspace must never be affected by this crawl.', 'crawler', 'https://example.com/', 'approved') RETURNING id INTO v_other;
  PERFORM save_crawl_brain('https://example.com/', v_candidates, v_edges, 1, true);
  IF (SELECT summary FROM brain_nodes WHERE id = v_first) <> 'This business detail was explicitly edited by a user.'
    OR NOT EXISTS (SELECT 1 FROM brain_edges WHERE source_node_id = v_manual AND target_node_id = v_first)
    OR (SELECT status FROM brain_nodes WHERE id = v_stale) <> 'approved'
    OR (SELECT status FROM brain_nodes WHERE id = v_other) <> 'approved' THEN RAISE EXCEPTION 'Crawl damaged preserved knowledge'; END IF;
  RAISE NOTICE 'PASS: crawl preserves edits, manual edges, other workspaces, and never auto-retires facts';

  PERFORM save_crawl_brain('https://example.com/', jsonb_set(jsonb_set(v_candidates, '{1,properties,extracted_by}', '"heuristic"'), '{1,summary}', to_jsonb('A weaker heuristic summary that must not replace an AI-backed fact.'::text)), '[]', 1, false);
  IF (SELECT summary FROM brain_nodes WHERE id = v_second) <> v_candidates->1->>'summary' THEN RAISE EXCEPTION 'Fallback downgraded an AI fact'; END IF;
  PERFORM save_crawl_brain('https://example.com/', '[{"category":"company_fact","title":"Suggested context","summary":"A heuristic suggestion requiring user review before use.","source_url":"https://example.com/","confidence":0.6,"properties":{"extracted_by":"heuristic","evidence_quote":"A heuristic suggestion requiring user review before use."}}]', '[]', 1, false);
  IF (SELECT status FROM brain_nodes WHERE workspace_id = auth.uid() AND title = 'Suggested context') <> 'approved'
    OR (SELECT approval_state FROM brain_nodes WHERE workspace_id = auth.uid() AND title = 'Suggested context') <> 'approved' THEN RAISE EXCEPTION 'Website fact was not auto-approved'; END IF;
  RAISE NOTICE 'PASS: degraded extraction cannot downgrade AI facts and is approved automatically';

  PERFORM save_crawl_brain('https://example.com/', jsonb_build_array(v_candidates->1), '[]', 1, true);
  IF (SELECT status FROM brain_nodes WHERE id = v_second) <> 'approved'
    OR NOT EXISTS (SELECT 1 FROM brain_edges WHERE source_node_id = v_first AND target_node_id = v_second) THEN
    RAISE EXCEPTION 'Partial extraction damaged previously supported facts or relationships';
  END IF;
  RAISE NOTICE 'PASS: partial AI extraction cannot retire a more complete existing Brain';

  PERFORM save_ai_key('openai', 'fixture-model', 'fictional-personal-key-for-test', NULL);
  IF read_ai_key(auth.uid()) <> 'fictional-personal-key-for-test' THEN RAISE EXCEPTION 'Owner cannot read their personal key'; END IF;
  PERFORM set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
  BEGIN
    PERFORM read_ai_key('11111111-1111-4111-8111-111111111111');
    RAISE EXCEPTION 'Expected personal key authorization failure';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'Not authorized' THEN RAISE; END IF;
  END;
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  IF read_ai_key('11111111-1111-4111-8111-111111111111') <> 'fictional-personal-key-for-test' THEN
    RAISE EXCEPTION 'Server cannot decrypt an authenticated workspace key';
  END IF;
  RAISE NOTICE 'PASS: personal key decryption permits its owner and server and denies other workspaces';

  PERFORM set_config('request.jwt.claim.sub', '', true);
  BEGIN
    PERFORM save_crawl_brain('https://example.com/', v_candidates, '[]', 1, true);
    RAISE EXCEPTION 'Expected authorization failure';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT IN ('Not authorized', 'NOT_AUTHENTICATED') THEN RAISE; END IF;
  END;
  RAISE NOTICE 'PASS: missing identity cannot save knowledge';
END;
$$;
ROLLBACK;
