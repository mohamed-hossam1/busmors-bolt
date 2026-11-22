-- Migration: sync_workspace_name_from_brain
-- Ensure workspace name is updated whenever company_profile is created, updated, or crawled.

-- 1. Grant UPDATE policy on workspaces for authenticated users
DROP POLICY IF EXISTS "update own workspace" ON public.workspaces;
CREATE POLICY "update own workspace" ON public.workspaces FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- 2. Update update_brain_item to automatically sync workspaces.name when company_profile is modified
CREATE OR REPLACE FUNCTION public.update_brain_item(
  p_node_id uuid,
  p_expected_version integer,
  p_title text,
  p_summary text,
  p_category text,
  p_properties jsonb DEFAULT NULL,
  p_status text DEFAULT 'approved'
)
RETURNS brain_nodes LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  w uuid := auth.uid();
  n brain_nodes;
  provenance_value jsonb;
BEGIN
  IF w IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF length(btrim(coalesce(p_title,''))) NOT BETWEEN 1 AND 150 OR length(coalesce(p_summary,''))>6000
   OR p_category IS NULL OR p_category NOT IN ('company_profile','offering','audience','brand_rule','positioning','strategic_goal','channel','competitor','company_fact')
   OR p_status IS NULL OR p_status NOT IN ('approved','rejected','retired','candidate')
   OR (p_properties IS NOT NULL AND (jsonb_typeof(p_properties)<>'object' OR length(p_properties::text)>20000)) THEN RAISE EXCEPTION 'INVALID_KNOWLEDGE'; END IF;
  IF p_category='offering' AND nullif(p_properties->>'amount','') IS NOT NULL AND
   (p_properties->>'amount' !~ '^[0-9]+(\.[0-9]{1,2})?$' OR coalesce(p_properties->>'currency','') !~ '^[A-Z]{3}$') THEN RAISE EXCEPTION 'INVALID_PRICE'; END IF;
  provenance_value:=jsonb_build_object('kind','owner_edited','actorId',w,'at',now());
  IF p_node_id IS NULL THEN
   IF p_expected_version IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'STALE_VERSION'; END IF;
   INSERT INTO brain_nodes(workspace_id,category,title,summary,properties,status,source,confidence,epistemic_kind,approval_state,verification_state,provenance)
    VALUES(w,p_category,btrim(p_title),coalesce(p_summary,''),coalesce(p_properties,'{}'),p_status,'manual',1,'claim',CASE WHEN p_status='approved' THEN 'approved' WHEN p_status='candidate' THEN 'pending' ELSE 'rejected' END,'owner_reported',provenance_value) RETURNING * INTO n;
  ELSE
   SELECT * INTO n FROM brain_nodes WHERE id=p_node_id AND workspace_id=w FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
   IF n.version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'STALE_VERSION'; END IF;
   IF n.title IS DISTINCT FROM btrim(p_title) OR n.summary IS DISTINCT FROM p_summary OR n.category IS DISTINCT FROM p_category OR n.properties IS DISTINCT FROM coalesce(p_properties,n.properties) OR n.status IS DISTINCT FROM p_status THEN
    PERFORM mark_brain_context_changed(n.id,'Business context changed: '||n.title);
   END IF;
   UPDATE brain_nodes SET title=btrim(p_title),summary=coalesce(p_summary,''),category=p_category,properties=coalesce(p_properties,n.properties)||'{"user_edited":true}'::jsonb,
    status=p_status,approval_state=CASE WHEN p_status='approved' THEN 'approved' WHEN p_status='candidate' THEN 'pending' ELSE 'rejected' END,verification_state='owner_reported',
    provenance=provenance_value,version=version+1,is_current=(p_status<>'retired'),updated_at=now() WHERE id=n.id RETURNING * INTO n;
  END IF;

  -- Synchronize workspace name whenever company_profile is created or updated
  IF p_category = 'company_profile' AND p_status IN ('approved', 'candidate') AND length(btrim(p_title)) > 0 THEN
    UPDATE public.workspaces SET name = btrim(p_title) WHERE id = w;
  END IF;

  INSERT INTO brain_versions(workspace_id,node_id,version,snapshot,provenance) VALUES(w,n.id,n.version,to_jsonb(n),n.provenance);
  INSERT INTO audit_log(workspace_id,actor_id,action,entity_type,entity_id,details) VALUES(w,w,'knowledge_'||p_status,'brain_node',n.id,jsonb_build_object('version',n.version,'title',n.title));
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.update_brain_item(uuid,integer,text,text,text,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_brain_item(uuid,integer,text,text,text,jsonb,text) TO authenticated;

-- 3. One-time retroactive sync for all workspaces still showing 'My Company'
UPDATE public.workspaces w
SET name = bn.title
FROM public.brain_nodes bn
WHERE bn.workspace_id = w.id
  AND bn.category = 'company_profile'
  AND bn.status = 'approved'
  AND length(btrim(bn.title)) > 0
  AND (w.name = 'My Company' OR w.name IS NULL OR w.name = '');
