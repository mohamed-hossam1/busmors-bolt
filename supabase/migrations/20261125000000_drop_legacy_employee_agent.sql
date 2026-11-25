-- Drop legacy Employee / Orchestrator / Tasks / Marketing Research tables and RPCs
-- so Employee v2 can start from a clean schema without affecting Onboarding Crawl,
-- Business Brain, Deliverables, Calendar/Publishing, Discovery/Roadmap, or Auth.

-- 1. Drop legacy RPCs & trigger functions
DROP FUNCTION IF EXISTS append_conversation_message(uuid, text, text, text, jsonb) CASCADE;
DROP FUNCTION IF EXISTS record_conversation_event(uuid, uuid, text, text, text, text, text, text, jsonb, text, timestamptz, timestamptz) CASCADE;
DROP FUNCTION IF EXISTS record_conversation_event(uuid, uuid, text, text, text, text, text, text, jsonb, text, timestamptz, timestamptz, uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS find_orchestrator_run(uuid) CASCADE;
DROP FUNCTION IF EXISTS record_orchestrator_run(uuid, uuid, text, text, text, uuid, uuid, text, jsonb) CASCADE;
DROP FUNCTION IF EXISTS list_conversation_events(uuid) CASCADE;

DROP FUNCTION IF EXISTS enqueue_task(uuid, text, jsonb, uuid) CASCADE;
DROP FUNCTION IF EXISTS recover_tasks(uuid) CASCADE;
DROP FUNCTION IF EXISTS admit_task(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS checkpoint_task(uuid, uuid, jsonb, text, jsonb) CASCADE;
DROP FUNCTION IF EXISTS heartbeat_task(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS record_task_step(uuid, uuid, uuid, text, text, text, jsonb) CASCADE;
DROP FUNCTION IF EXISTS stop_task(uuid, uuid, text, text) CASCADE;
DROP FUNCTION IF EXISTS resume_task(uuid, integer) CASCADE;
DROP FUNCTION IF EXISTS await_task_input(uuid, uuid, text, jsonb) CASCADE;
DROP FUNCTION IF EXISTS answer_task_input(uuid, integer, jsonb) CASCADE;
DROP FUNCTION IF EXISTS reserve_task_call(uuid, uuid, uuid, text, integer) CASCADE;
DROP FUNCTION IF EXISTS finish_task_call(uuid, uuid, boolean, jsonb) CASCADE;
DROP FUNCTION IF EXISTS save_task_result(uuid, uuid, jsonb, boolean) CASCADE;

DROP FUNCTION IF EXISTS accept_deliverable_offer(uuid) CASCADE;
DROP FUNCTION IF EXISTS dismiss_deliverable_offer(uuid) CASCADE;

DROP FUNCTION IF EXISTS reserve_provider_call(uuid, uuid, text, text, jsonb) CASCADE;
DROP FUNCTION IF EXISTS settle_provider_call(uuid, uuid, jsonb) CASCADE;
DROP FUNCTION IF EXISTS release_provider_call(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS set_research_mode(uuid, uuid, text) CASCADE;
DROP FUNCTION IF EXISTS record_research_event(uuid, uuid, uuid, uuid, uuid, bigint, text, text, text, text, text, text, jsonb, jsonb, jsonb, text, timestamptz, timestamptz) CASCADE;
DROP FUNCTION IF EXISTS save_research_result(uuid, uuid, jsonb, boolean) CASCADE;
DROP FUNCTION IF EXISTS decide_research_proposal(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS research_policy_checks() CASCADE;

DROP FUNCTION IF EXISTS validate_task_origin_owner() CASCADE;

-- 2. Drop legacy tables (CASCADE removes only FK constraints on kept tables, keeping those tables intact)
DROP TABLE IF EXISTS orchestrator_runs CASCADE;
DROP TABLE IF EXISTS deliverable_offers CASCADE;
DROP TABLE IF EXISTS research_proposals CASCADE;
DROP TABLE IF EXISTS research_claims CASCADE;
DROP TABLE IF EXISTS research_reports CASCADE;
DROP TABLE IF EXISTS provider_usage CASCADE;
DROP TABLE IF EXISTS free_tier_allowance CASCADE;
DROP TABLE IF EXISTS task_results CASCADE;
DROP TABLE IF EXISTS task_usage CASCADE;
DROP TABLE IF EXISTS task_inputs CASCADE;
DROP TABLE IF EXISTS task_steps CASCADE;
DROP TABLE IF EXISTS agent_events CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;
DROP TABLE IF EXISTS conversations CASCADE;

-- 3. Remove legacy 'task' branch from context_dependencies validation
CREATE OR REPLACE FUNCTION validate_context_consumer_owner() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE target_table text; found_version integer;
BEGIN
 target_table:=CASE NEW.consumer_type WHEN 'document' THEN 'deliverables' WHEN 'post' THEN 'planned_posts' WHEN 'roadmap' THEN 'roadmaps' END;
 IF target_table IS NULL THEN RAISE EXCEPTION 'INVALID_CONTEXT_CONSUMER' USING ERRCODE='23503'; END IF;
 EXECUTE format('SELECT version FROM %I WHERE id=$1 AND workspace_id=$2',target_table) INTO found_version USING NEW.consumer_id,NEW.workspace_id;
 IF found_version IS NULL OR NEW.consumer_version NOT BETWEEN 1 AND found_version THEN RAISE EXCEPTION 'INVALID_CONTEXT_CONSUMER' USING ERRCODE='23503'; END IF;
 IF NEW.node_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM brain_versions WHERE node_id=NEW.node_id AND workspace_id=NEW.workspace_id AND version=NEW.node_version) THEN RAISE EXCEPTION 'INVALID_CONTEXT_VERSION' USING ERRCODE='23503'; END IF;
 RETURN NEW;
END $$;
