-- Phase 4: one Facebook Page connection per workspace through a publishing
-- provider (Composio). Writes are server-only RPCs called with the admin client;
-- the browser keeps read access through the "select own connections" policy.

-- Hold kinds, so re-scheduling knows which holds it may clear. Existing holds
-- (save_task_result, mark_brain_context_changed) are Brain-context holds.
ALTER TABLE post_holds ADD COLUMN kind text NOT NULL DEFAULT 'context'
  CHECK (kind IN ('context','connection','missed_window','uncertain'));

-- Connect or switch the Page. A different Page or provider account bumps the
-- authorization generation, which invalidates publish approvals for the old one.
CREATE OR REPLACE FUNCTION upsert_facebook_connection(p_workspace_id uuid,p_connection_ref text,p_page_id text,p_page_name text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF p_workspace_id IS NULL OR coalesce(p_connection_ref,'')='' OR coalesce(p_page_id,'')='' THEN RAISE EXCEPTION 'INVALID_CONNECTION'; END IF;
 INSERT INTO platform_connections(workspace_id,platform,external_account_id,page_id,page_name,account_name,status,connected_at,permissions)
  VALUES(p_workspace_id,'facebook',p_connection_ref,p_page_id,coalesce(p_page_name,''),coalesce(p_page_name,''),'connected',now(),'[]'::jsonb)
 ON CONFLICT (workspace_id,platform) DO UPDATE SET
  authorization_generation=platform_connections.authorization_generation
   +CASE WHEN platform_connections.page_id IS DISTINCT FROM EXCLUDED.page_id
          OR platform_connections.external_account_id IS DISTINCT FROM EXCLUDED.external_account_id THEN 1 ELSE 0 END,
  external_account_id=EXCLUDED.external_account_id,
  page_id=EXCLUDED.page_id,
  page_name=EXCLUDED.page_name,
  account_name=EXCLUDED.account_name,
  status='connected',
  connected_at=now(),
  permissions='[]'::jsonb;
END $$;

-- Disconnect: every scheduled post loses its publish approval and is held with
-- its time kept as a proposal. Content approval stays. Nothing is released on
-- reconnect; the owner schedules again.
CREATE OR REPLACE FUNCTION disconnect_facebook_connection(p_workspace_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p planned_posts;
BEGIN
 UPDATE platform_connections SET status='disconnected',authorization_generation=authorization_generation+1
  WHERE workspace_id=p_workspace_id AND platform='facebook';
 FOR p IN SELECT * FROM planned_posts WHERE workspace_id=p_workspace_id AND execution_state='scheduled' FOR UPDATE LOOP
  UPDATE post_approvals SET revoked_at=now() WHERE workspace_id=p_workspace_id AND post_id=p.id AND revoked_at IS NULL;
  UPDATE planned_posts SET proposed_for=coalesce(scheduled_for,proposed_for),scheduled_for=NULL,status='approved',execution_state='held' WHERE id=p.id;
  INSERT INTO post_holds(workspace_id,post_id,kind,reason) VALUES(p_workspace_id,p.id,'connection','Facebook Page disconnected. Reconnect and schedule again to publish.');
 END LOOP;
END $$;

REVOKE ALL ON FUNCTION upsert_facebook_connection(uuid,text,text,text),disconnect_facebook_connection(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION upsert_facebook_connection(uuid,text,text,text),disconnect_facebook_connection(uuid) TO service_role;
