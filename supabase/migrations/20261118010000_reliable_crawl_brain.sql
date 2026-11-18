-- Keep shared secrets server-only, including inherited PUBLIC privileges.
REVOKE ALL ON FUNCTION public.read_shared_crawl_key() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_shared_crawl_key() TO service_role;

-- The Edge Function validates the user's JWT, then decrypts with its service role.
CREATE OR REPLACE FUNCTION public.read_ai_key(p_workspace uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_root text; v_ciphertext text;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' AND (auth.uid() IS NULL OR auth.uid() <> p_workspace) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT value INTO v_root FROM app_secrets WHERE name = 'ai_key_root';
  SELECT key_ciphertext INTO v_ciphertext FROM ai_keys WHERE workspace_id = p_workspace;
  IF v_ciphertext IS NULL THEN RETURN NULL; END IF;
  RETURN pgp_sym_decrypt(decode(v_ciphertext, 'base64'), v_root);
END;
$$;
REVOKE ALL ON FUNCTION public.read_ai_key(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.read_ai_key(uuid) TO authenticated, service_role;

ALTER TABLE public.brain_edges ADD COLUMN IF NOT EXISTS properties jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Nodes, edges, settings and audit commit together or all roll back.
-- The caller's identity supplies the workspace; no client workspace ID is trusted.
CREATE OR REPLACE FUNCTION public.save_crawl_brain(
  p_url text, p_candidates jsonb, p_relations jsonb, p_pages_read integer, p_replace boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_workspace uuid := auth.uid();
  v_site text := regexp_replace(lower(substring(p_url from '^https?://[^/]+')), '^https?://(www\.)?', '');
  v_item jsonb;
  v_edge jsonb;
  v_existing brain_nodes%ROWTYPE;
  v_ids uuid[] := ARRAY[]::uuid[];
  v_id uuid;
  v_source uuid;
  v_target uuid;
  v_properties jsonb;
  v_snapshot jsonb;
  v_confidence numeric;
  v_edges integer := 0;
  v_nodes integer;
  v_previous_approved integer;
  v_can_replace boolean;
  v_edge_id uuid;
  v_edge_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF v_workspace IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF v_site IS NULL OR length(p_url) > 2048 OR p_pages_read IS NULL OR p_pages_read NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'Invalid website crawl';
  END IF;
  IF jsonb_typeof(p_candidates) IS DISTINCT FROM 'array' OR jsonb_typeof(p_relations) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid crawl data';
  END IF;
  IF jsonb_array_length(p_candidates) NOT BETWEEN 1 AND 20 OR jsonb_array_length(p_relations) > 12 THEN
    RAISE EXCEPTION 'Invalid crawl size';
  END IF;
  -- Serializes retries and simultaneous crawls for this workspace.
  PERFORM pg_advisory_xact_lock(hashtextextended('crawl:' || v_workspace::text, 0));
  SELECT count(*) INTO v_previous_approved FROM brain_nodes
    WHERE workspace_id = v_workspace AND source = 'crawler' AND status = 'approved'
      AND properties->>'extracted_by' = 'ai'
      AND regexp_replace(lower(substring(source_detail from '^https?://[^/]+')), '^https?://(www\.)?', '') = v_site;
  v_can_replace := p_replace AND (SELECT count(*) FROM jsonb_array_elements(p_candidates) AS c
    WHERE c->'properties'->>'extracted_by' = 'ai' AND (c->>'confidence')::numeric >= 0.8) >= greatest(1, v_previous_approved);

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_candidates) LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
      OR length(btrim(coalesce(v_item->>'title', ''))) NOT BETWEEN 2 AND 60
      OR length(btrim(coalesce(v_item->>'summary', ''))) NOT BETWEEN 20 AND 280
      OR jsonb_typeof(v_item->'properties') IS DISTINCT FROM 'object'
      OR length(coalesce(v_item->'properties'->>'evidence_quote', '')) < 20
      OR regexp_replace(lower(substring(v_item->>'source_url' from '^https?://[^/]+')), '^https?://(www\.)?', '') IS DISTINCT FROM v_site
      OR jsonb_typeof(v_item->'confidence') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'Invalid knowledge candidate';
    END IF;
    v_confidence := (v_item->>'confidence')::numeric;
    IF v_confidence NOT BETWEEN 0 AND 1 THEN RAISE EXCEPTION 'Invalid confidence'; END IF;
    v_snapshot := jsonb_build_object('title', v_item->>'title', 'summary', v_item->>'summary', 'category', v_item->>'category');
    v_properties := (v_item->'properties') || jsonb_build_object('managed_by', 'crawler', 'crawl_site', v_site, 'crawl_snapshot', v_snapshot);

    SELECT * INTO v_existing FROM brain_nodes
      WHERE workspace_id = v_workspace AND category = v_item->>'category'
        AND lower(btrim(title)) = lower(btrim(v_item->>'title'))
      ORDER BY (source <> 'crawler') DESC, created_at LIMIT 1 FOR UPDATE;
    IF FOUND THEN
      v_id := v_existing.id;
      -- Preserve manually edited, rejected and retired facts and legacy edits.
      IF v_existing.source = 'crawler' AND v_existing.status NOT IN ('rejected', 'retired')
        AND coalesce(v_existing.properties->>'user_edited', 'false') <> 'true'
        AND (v_existing.updated_at = v_existing.created_at OR
          v_existing.properties->'crawl_snapshot' = jsonb_build_object('title', v_existing.title, 'summary', v_existing.summary, 'category', v_existing.category))
        AND regexp_replace(lower(substring(v_existing.source_detail from '^https?://[^/]+')), '^https?://(www\.)?', '') = v_site THEN
        -- A fallback must not downgrade an existing AI extraction.
        IF v_item->'properties'->>'extracted_by' = 'ai' OR coalesce(v_existing.properties->>'extracted_by', '') <> 'ai' THEN
          UPDATE brain_nodes SET summary = v_item->>'summary', properties = v_properties,
            source_detail = v_item->>'source_url', confidence = v_confidence,
            status = CASE WHEN v_item->'properties'->>'extracted_by' = 'ai' AND v_confidence >= 0.8 THEN 'approved' ELSE 'candidate' END,
            updated_at = now() WHERE id = v_id;
        END IF;
      END IF;
    ELSE
      INSERT INTO brain_nodes(workspace_id, category, title, summary, properties, status, source, source_detail, confidence)
      VALUES(v_workspace, v_item->>'category', v_item->>'title', v_item->>'summary', v_properties,
        CASE WHEN v_item->'properties'->>'extracted_by' = 'ai' AND v_confidence >= 0.8 THEN 'approved' ELSE 'candidate' END,
        'crawler', v_item->>'source_url', v_confidence) RETURNING id INTO v_id;
    END IF;
    v_ids := array_append(v_ids, v_id);
  END LOOP;

  IF v_can_replace THEN
    -- Never delete manual edges. Legacy edges also remain intact.
    DELETE FROM brain_edges WHERE jsonb_array_length(p_relations) > 0 AND workspace_id = v_workspace
      AND properties->>'managed_by' = 'crawler' AND properties->>'crawl_site' = v_site;
    -- Retain history, and do not retire edited facts or facts referenced by manual edges.
    UPDATE brain_nodes n SET status = 'retired', updated_at = now()
      WHERE n.workspace_id = v_workspace AND n.source = 'crawler' AND n.id <> ALL(v_ids)
        AND n.status NOT IN ('rejected', 'retired')
        AND regexp_replace(lower(substring(n.source_detail from '^https?://[^/]+')), '^https?://(www\.)?', '') = v_site
        AND coalesce(n.properties->>'user_edited', 'false') <> 'true'
        AND (n.updated_at = n.created_at OR n.properties->'crawl_snapshot' = jsonb_build_object('title', n.title, 'summary', n.summary, 'category', n.category))
        AND NOT EXISTS (SELECT 1 FROM brain_edges e WHERE (e.source_node_id = n.id OR e.target_node_id = n.id)
          AND coalesce(e.properties->>'managed_by', '') <> 'crawler');
  END IF;

  FOR v_edge IN SELECT value FROM jsonb_array_elements(p_relations) LOOP
    IF jsonb_typeof(v_edge->'source_index') IS DISTINCT FROM 'number'
      OR jsonb_typeof(v_edge->'target_index') IS DISTINCT FROM 'number'
      OR (v_edge->>'source_index')::numeric <> trunc((v_edge->>'source_index')::numeric)
      OR (v_edge->>'target_index')::numeric <> trunc((v_edge->>'target_index')::numeric) THEN
      RAISE EXCEPTION 'Invalid relationship index';
    END IF;
    v_source := v_ids[(v_edge->>'source_index')::integer + 1];
    v_target := v_ids[(v_edge->>'target_index')::integer + 1];
    IF v_source IS NULL OR v_target IS NULL OR v_source = v_target
      OR length(coalesce(v_edge->>'evidence_quote', '')) NOT BETWEEN 25 AND 500 THEN
      RAISE EXCEPTION 'Invalid relationship';
    END IF;
    SELECT id INTO v_edge_id FROM brain_edges WHERE workspace_id = v_workspace
      AND source_node_id = v_source AND target_node_id = v_target AND relation_type = v_edge->>'relation_type' LIMIT 1;
    IF NOT FOUND THEN
      INSERT INTO brain_edges(workspace_id, source_node_id, target_node_id, relation_type, status, weight, properties)
      VALUES(v_workspace, v_source, v_target, v_edge->>'relation_type',
        CASE WHEN coalesce((v_edge->>'confidence')::numeric, 0.65) >= 0.8
          AND (SELECT count(*) FROM brain_nodes WHERE id IN (v_source, v_target) AND status = 'approved') = 2
          THEN 'approved' ELSE 'candidate' END,
        least(0.95, greatest(0, coalesce((v_edge->>'confidence')::numeric, 0.65))),
        jsonb_build_object('managed_by', 'crawler', 'crawl_site', v_site,
          'source_url', v_edge->>'source_url', 'evidence_quote', v_edge->>'evidence_quote')) RETURNING id INTO v_edge_id;
    END IF;
    v_edge_ids := array_append(v_edge_ids, v_edge_id);
  END LOOP;

  SELECT count(DISTINCT id) INTO v_nodes FROM unnest(v_ids) AS ids(id);
  SELECT count(DISTINCT id) INTO v_edges FROM unnest(v_edge_ids) AS ids(id);
  INSERT INTO workspace_settings(workspace_id, company_url, onboarding_state, crawl_status)
    VALUES(v_workspace, p_url, 'complete', jsonb_build_object('pages_read', p_pages_read, 'nodes_count', v_nodes, 'edges_count', v_edges, 'finished', true))
    ON CONFLICT(workspace_id) DO UPDATE SET company_url = excluded.company_url,
      onboarding_state = 'complete', crawl_status = excluded.crawl_status, updated_at = now();
  INSERT INTO audit_log(workspace_id, action, entity_type, details)
    VALUES(v_workspace, CASE WHEN p_replace THEN 'brain_reorganized_with_ai' ELSE 'crawler_knowledge_saved' END,
      'brain_nodes', jsonb_build_object('count', v_nodes, 'edges', v_edges, 'url', p_url));
  RETURN jsonb_build_object('nodes_count', v_nodes, 'edges_count', v_edges);
END;
$$;
REVOKE ALL ON FUNCTION public.save_crawl_brain(text, jsonb, jsonb, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_crawl_brain(text, jsonb, jsonb, integer, boolean) TO authenticated;
