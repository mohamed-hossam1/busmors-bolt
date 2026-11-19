-- JSON/polymorphic references need owner checks in addition to ordinary FKs.
CREATE FUNCTION validate_task_origin_owner() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE o jsonb:=NEW.origin; c uuid;
BEGIN
 IF o='{}'::jsonb AND NEW.conversation_id IS NOT NULL THEN
  o:=jsonb_build_object('kind','direct','conversationId',NEW.conversation_id);NEW.origin:=o;
 END IF;
 IF jsonb_typeof(o) IS DISTINCT FROM 'object' OR coalesce(o->>'kind','') NOT IN ('direct','wizard_question','roadmap_step') THEN RAISE EXCEPTION 'INVALID_TASK_ORIGIN' USING ERRCODE='23503'; END IF;
 BEGIN c:=(o->>'conversationId')::uuid; EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'INVALID_TASK_ORIGIN' USING ERRCODE='23503'; END;
 IF c IS NULL OR c IS DISTINCT FROM NEW.conversation_id OR NOT EXISTS(SELECT 1 FROM conversations WHERE id=c AND workspace_id=NEW.workspace_id) THEN RAISE EXCEPTION 'INVALID_TASK_ORIGIN' USING ERRCODE='23503'; END IF;
 IF o->>'kind'='wizard_question' AND NOT EXISTS(
  SELECT 1 FROM question_research_links l JOIN discovery_questions q ON q.id=l.question_id AND q.workspace_id=l.workspace_id
   JOIN discovery_drafts d ON d.id=l.draft_id AND d.workspace_id=l.workspace_id
  WHERE l.id::text=o->>'researchLinkId' AND l.workspace_id=NEW.workspace_id AND d.id::text=o->>'draftId'
   AND q.id::text=o->>'questionId' AND q.draft_id=d.id AND l.conversation_id=c
 ) THEN RAISE EXCEPTION 'INVALID_TASK_ORIGIN' USING ERRCODE='23503'; END IF;
 IF o->>'kind'='roadmap_step' AND NOT EXISTS(
  SELECT 1 FROM roadmap_steps s JOIN roadmap_versions v ON v.id=s.plan_version_id AND v.workspace_id=s.workspace_id
  WHERE s.id::text=o->>'stepId' AND s.workspace_id=NEW.workspace_id AND s.roadmap_id::text=o->>'planId'
   AND v.id::text=o->>'planVersionId' AND v.roadmap_id=s.roadmap_id
 ) THEN RAISE EXCEPTION 'INVALID_TASK_ORIGIN' USING ERRCODE='23503'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER task_origin_owner BEFORE INSERT OR UPDATE OF origin,conversation_id,workspace_id ON tasks FOR EACH ROW EXECUTE FUNCTION validate_task_origin_owner();

CREATE FUNCTION validate_context_consumer_owner() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE target_table text; found_version integer;
BEGIN
 target_table:=CASE NEW.consumer_type WHEN 'task' THEN 'tasks' WHEN 'document' THEN 'deliverables' WHEN 'post' THEN 'planned_posts' WHEN 'roadmap' THEN 'roadmaps' END;
 IF target_table IS NULL THEN RAISE EXCEPTION 'INVALID_CONTEXT_CONSUMER' USING ERRCODE='23503'; END IF;
 EXECUTE format('SELECT version FROM %I WHERE id=$1 AND workspace_id=$2',target_table) INTO found_version USING NEW.consumer_id,NEW.workspace_id;
 IF found_version IS NULL OR NEW.consumer_version NOT BETWEEN 1 AND found_version THEN RAISE EXCEPTION 'INVALID_CONTEXT_CONSUMER' USING ERRCODE='23503'; END IF;
 IF NEW.node_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM brain_versions WHERE node_id=NEW.node_id AND workspace_id=NEW.workspace_id AND version=NEW.node_version) THEN RAISE EXCEPTION 'INVALID_CONTEXT_VERSION' USING ERRCODE='23503'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER context_consumer_owner BEFORE INSERT OR UPDATE OF workspace_id,consumer_type,consumer_id,consumer_version,node_id,node_version ON context_dependencies FOR EACH ROW EXECUTE FUNCTION validate_context_consumer_owner();
REVOKE ALL ON FUNCTION validate_task_origin_owner(),validate_context_consumer_owner() FROM PUBLIC,anon;
