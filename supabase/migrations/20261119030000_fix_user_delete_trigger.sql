-- Fix brain_before_delete trigger to allow clean cascade deletion when a user or workspace is deleted.
-- When a user is deleted from auth.users, workspaces is deleted via ON DELETE CASCADE.
-- Cascading to brain_nodes would attempt to insert into audit_log with OLD.workspace_id,
-- which violates audit_log_workspace_id_fkey because the parent workspace is already being deleted.

CREATE OR REPLACE FUNCTION brain_before_delete() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 -- If the parent workspace is already being deleted (e.g. account / user deletion cascade), skip audit logging and context cascade
 IF NOT EXISTS (SELECT 1 FROM workspaces WHERE id = OLD.workspace_id) THEN
  RETURN OLD;
 END IF;

 PERFORM mark_brain_context_changed(OLD.id,'Business context deleted: '||OLD.title);
 UPDATE post_holds SET dependency_id=NULL WHERE dependency_id IN (SELECT id FROM context_dependencies WHERE node_id=OLD.id AND workspace_id=OLD.workspace_id);
 DELETE FROM context_dependencies WHERE node_id=OLD.id AND workspace_id=OLD.workspace_id;
 DELETE FROM brain_proposals WHERE node_id=OLD.id AND workspace_id=OLD.workspace_id;
 INSERT INTO audit_log(workspace_id,actor_id,action,entity_type,entity_id,details)
  VALUES(OLD.workspace_id,coalesce(auth.uid(),OLD.workspace_id),'knowledge_deleted','brain_node',OLD.id,jsonb_build_object('version',OLD.version));
 RETURN OLD;
END $$;
