-- C10 follow-up: AI-extracted, high-confidence website facts are persisted
-- directly as approved Brain records instead of candidates that need owner
-- approval. Degraded/heuristic or low-confidence extractions stay candidates so
-- they still require review. brain_proposals is kept as an audit trail, but an
-- unchanged already-approved claim skips the proposal (and therefore the
-- approval queue) via the existing dedup check below. p_replace is accepted for
-- backward compatibility; this version stays additive-only and never rewrites
-- owner edits, manual edges or other workspaces.
CREATE OR REPLACE FUNCTION save_crawl_brain(p_url text,p_candidates jsonb,p_relations jsonb,p_pages_read integer,p_replace boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w uuid:=auth.uid(); c jsonb; r jsonb; n brain_nodes; ids uuid[]:=ARRAY[]::uuid[]; d jsonb; sid uuid; pid uuid; count_nodes integer:=0; count_edges integer:=0; e_source uuid; e_target uuid; v_auto boolean;
BEGIN
 IF w IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 IF p_url IS NULL OR p_url !~ '^https?://[^/@[:space:]]+' OR length(p_url)>2000 OR p_pages_read NOT BETWEEN 1 AND 20
  OR jsonb_typeof(p_candidates) IS DISTINCT FROM 'array' OR jsonb_array_length(p_candidates) NOT BETWEEN 1 AND 80
  OR jsonb_typeof(p_relations) IS DISTINCT FROM 'array' OR jsonb_array_length(p_relations)>120 OR length(p_candidates::text)>200000 THEN RAISE EXCEPTION 'INVALID_IMPORT'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('brain-import:'||w::text,0));
 FOR c IN SELECT value FROM jsonb_array_elements(p_candidates) LOOP
  IF c->>'category' IS NULL OR c->>'category' NOT IN ('company_profile','offering','audience','brand_rule','positioning','strategic_goal','channel','competitor','company_fact')
   OR length(btrim(coalesce(c->>'title',''))) NOT BETWEEN 1 AND 150 OR length(coalesce(c->>'summary',''))>6000
   OR jsonb_typeof(c->'properties') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_CANDIDATE'; END IF;
  -- Only AI-extracted, high-confidence claims qualify for direct approval.
  v_auto:=coalesce(c->'properties'->>'extracted_by','')='ai' AND coalesce((c->>'confidence')::numeric,0)>=0.8;
  SELECT * INTO n FROM brain_nodes WHERE workspace_id=w AND category=c->>'category' AND lower(btrim(title))=lower(btrim(c->>'title')) ORDER BY created_at LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
   INSERT INTO brain_nodes(workspace_id,category,title,summary,properties,status,source,source_detail,confidence,approval_state,verification_state,provenance)
    VALUES(w,c->>'category',btrim(c->>'title'),coalesce(c->>'summary',''),c->'properties',CASE WHEN v_auto THEN 'approved' ELSE 'candidate' END,'crawler',coalesce(c->>'source_url',p_url),least(.95,greatest(0,coalesce((c->>'confidence')::numeric,.5))),CASE WHEN v_auto THEN 'approved' ELSE 'pending' END,'unverified',jsonb_build_object('kind','website_suggestion','url',p_url)) RETURNING * INTO n;
   INSERT INTO brain_versions(workspace_id,node_id,version,snapshot,provenance) VALUES(w,n.id,n.version,to_jsonb(n),n.provenance);
   count_nodes:=count_nodes+1;
  END IF;
  ids:=array_append(ids,n.id);
  IF n.status IN ('rejected','retired') THEN CONTINUE; END IF;
  INSERT INTO sources(workspace_id,url,title,excerpt,content_hash,source_type)
   VALUES(w,coalesce(c->>'source_url',p_url),c->>'title',coalesce(c->'properties'->>'evidence_quote',c->>'summary',''),md5(coalesce(c->'properties'->>'evidence_quote',c->>'summary','')),'website')
   ON CONFLICT(workspace_id,content_hash,url) DO UPDATE SET accessed_at=now() RETURNING id INTO sid;
  d:=jsonb_build_object('category',c->>'category','title',btrim(c->>'title'),'summary',coalesce(c->>'summary',''),'properties',c->'properties','source_detail',coalesce(c->>'source_url',p_url),'epistemic_kind','claim');
  -- A currently approved identical claim needs no repeated approval queue.
  IF n.approval_state='approved' AND n.summary=d->>'summary' AND (n.properties-'user_edited')=((d->'properties')-'user_edited') THEN CONTINUE; END IF;
  INSERT INTO brain_proposals(workspace_id,node_id,base_version,diff,source_refs,fingerprint)
   VALUES(w,n.id,n.version,d,jsonb_build_array(sid),md5(n.id::text||n.version::text||d::text)) ON CONFLICT DO NOTHING RETURNING id INTO pid;
  IF pid IS NOT NULL THEN
   INSERT INTO notifications(workspace_id,type,subject_type,subject_id,title,body,dedupe_key) VALUES(w,'brain_proposal','brain_proposal',pid,'Website suggestion ready',n.title,'brain-proposal:'||pid);
  END IF;
 END LOOP;
 FOR r IN SELECT value FROM jsonb_array_elements(p_relations) LOOP
  IF coalesce(r->>'source_index','') !~ '^\d+$' OR coalesce(r->>'target_index','') !~ '^\d+$' OR r->>'relation_type' IS NULL OR r->>'relation_type' NOT IN ('TARGETS','COMPETES_WITH','HAS_TONE','SOLVES_PAIN_POINT','RELATED_TO') THEN RAISE EXCEPTION 'INVALID_RELATIONSHIP'; END IF;
  e_source:=ids[(r->>'source_index')::integer+1];e_target:=ids[(r->>'target_index')::integer+1];
  IF e_source IS NULL OR e_target IS NULL OR e_source=e_target THEN RAISE EXCEPTION 'INVALID_RELATIONSHIP'; END IF;
  IF NOT EXISTS(SELECT 1 FROM brain_edges WHERE workspace_id=w AND source_node_id=e_source AND target_node_id=e_target AND relation_type=r->>'relation_type') THEN
   INSERT INTO brain_edges(workspace_id,source_node_id,target_node_id,relation_type,status,weight,provenance,properties)
    VALUES(w,e_source,e_target,r->>'relation_type','approved',least(.95,greatest(0,coalesce((r->>'confidence')::numeric,.5))),jsonb_build_object('kind','website_suggestion','url',r->>'source_url','excerpt',r->>'evidence_quote'),r);
   count_edges:=count_edges+1;
  END IF;
 END LOOP;
 UPDATE workspace_settings SET company_url=p_url,crawl_status=jsonb_build_object('pages_read',p_pages_read,'finished',true),updated_at=now() WHERE workspace_id=w;
 INSERT INTO audit_log(workspace_id,actor_id,action,entity_type,details) VALUES(w,w,'website_proposals_saved','brain_proposal',jsonb_build_object('proposals',count_nodes,'relationships',count_edges,'url',p_url));
 RETURN jsonb_build_object('nodes_count',count_nodes,'edges_count',count_edges);
END $$;
REVOKE ALL ON FUNCTION save_crawl_brain(text,jsonb,jsonb,integer,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION save_crawl_brain(text,jsonb,jsonb,integer,boolean) TO authenticated;