-- Additive competition contracts. No remote actions or invented approvals.
-- Existing rows remain intact. NOT VALID ownership constraints reject new forged
-- references while allowing an operator to inspect legacy inconsistencies first.
ALTER TABLE workspace_settings
  ADD COLUMN country text NOT NULL DEFAULT '',
  ADD COLUMN currency text NOT NULL DEFAULT '',
  ADD COLUMN timezone text NOT NULL DEFAULT 'UTC',
  ADD COLUMN ui_language text NOT NULL DEFAULT 'en' CHECK (ui_language IN ('en','ar')),
  ADD COLUMN conversation_language text NOT NULL DEFAULT 'en' CHECK (conversation_language IN ('en','ar')),
  ADD COLUMN content_register text NOT NULL DEFAULT 'english' CHECK (content_register IN ('english','egyptian_arabic','gulf_arabic','msa')),
  ADD COLUMN target_market text NOT NULL DEFAULT '',
  ADD COLUMN confirmed_intake_version integer;
ALTER TABLE audit_log ADD COLUMN actor_id uuid;
ALTER TABLE brain_nodes
  ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  ADD COLUMN epistemic_kind text NOT NULL DEFAULT 'claim' CHECK (epistemic_kind IN ('fact','claim','inference','unknown')),
  ADD COLUMN approval_state text NOT NULL DEFAULT 'pending' CHECK (approval_state IN ('pending','approved','rejected','legacy')),
  ADD COLUMN verification_state text NOT NULL DEFAULT 'unverified' CHECK (verification_state IN ('unverified','source_supported','contradicted','owner_reported')),
  ADD COLUMN provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN is_current boolean NOT NULL DEFAULT true;
-- Legacy approval is preserved, but is not retroactive owner confirmation.
UPDATE brain_nodes SET approval_state = CASE WHEN status='approved' THEN 'legacy' WHEN status='rejected' THEN 'rejected' ELSE 'pending' END;
ALTER TABLE tasks DROP CONSTRAINT tasks_status_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check CHECK (status IN ('pending','queued','running','awaiting_input','awaiting_approval','partial','completed','failed','cancelled','interrupted'));
ALTER TABLE tasks
  ADD COLUMN version integer NOT NULL DEFAULT 1,
  ADD COLUMN origin jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN context_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN allowance jsonb NOT NULL DEFAULT '{"calls":8,"pages":12,"tokens":16000,"seconds":240}'::jsonb,
  ADD COLUMN consumption jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN checkpoint jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN cancel_requested boolean NOT NULL DEFAULT false,
  ADD COLUMN run_id uuid,
  ADD COLUMN heartbeat_at timestamptz,
  ADD COLUMN idempotency_key uuid,
  ADD COLUMN request_hash text;
CREATE UNIQUE INDEX task_idempotency ON tasks(workspace_id,idempotency_key) WHERE idempotency_key IS NOT NULL;
ALTER TABLE agent_events ADD COLUMN instance_id uuid, ADD COLUMN run_id uuid;
-- Preserve existing duplicate event sequences; new run-scoped sequences are unique.
CREATE UNIQUE INDEX event_run_sequence ON agent_events(task_id,run_id,seq) WHERE run_id IS NOT NULL;
ALTER TABLE messages DROP CONSTRAINT messages_type_check;
ALTER TABLE messages ADD CONSTRAINT messages_type_check CHECK (type IN ('text','text_response','form','structured_form','task_status','deliverable_card','knowledge_notification','budget_extension_request','error','post_reference'));
ALTER TABLE deliverables ADD COLUMN version integer NOT NULL DEFAULT 1,
  ADD COLUMN origin jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN context_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN source_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN limitations jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN stale_reason text;
ALTER TABLE planned_posts ALTER COLUMN scheduled_for DROP NOT NULL;
ALTER TABLE planned_posts ALTER COLUMN scheduled_for DROP DEFAULT;
ALTER TABLE planned_posts ADD COLUMN version integer NOT NULL DEFAULT 1,
  ADD COLUMN current_version_id uuid,
  ADD COLUMN origin jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN context_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN approval_state text NOT NULL DEFAULT 'unapproved' CHECK (approval_state IN ('unapproved','approved','rejected')),
  ADD COLUMN execution_state text NOT NULL DEFAULT 'idle' CHECK (execution_state IN ('idle','scheduled','submitted','confirmed','failed','uncertain','held','cancelled','owner_reported')),
  ADD COLUMN published_at timestamptz,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
UPDATE planned_posts SET execution_state='owner_reported' WHERE status='published';
-- Old approvals have no exact-version binding and must never be dispatched.
UPDATE planned_posts SET status='draft' WHERE status IN ('approved','scheduled');
ALTER TABLE platform_connections ADD COLUMN authorization_generation integer NOT NULL DEFAULT 1,
  ADD COLUMN permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN page_id text,
  ADD COLUMN page_name text;
-- Connection metadata is server-owned. The existing OAuth Edge uses service_role.
REVOKE INSERT, UPDATE, DELETE ON platform_connections FROM authenticated;

CREATE TABLE business_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1, status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','confirmed')), path text NOT NULL DEFAULT 'manual' CHECK(path IN ('manual','website')), form jsonb NOT NULL DEFAULT '{}'::jsonb, field_sources jsonb NOT NULL DEFAULT '{}'::jsonb, confirmed_at timestamptz, crawl_status jsonb NOT NULL DEFAULT '{}'::jsonb, crawl_result jsonb, updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(workspace_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,id)
);
ALTER TABLE business_drafts ENABLE ROW LEVEL SECURITY;
CREATE INDEX business_drafts_workspace_idx ON business_drafts(workspace_id);
CREATE POLICY "owner read" ON business_drafts FOR SELECT TO authenticated USING(workspace_id=auth.uid());
CREATE POLICY "owner write" ON business_drafts FOR ALL TO authenticated USING(workspace_id=auth.uid()) WITH CHECK(workspace_id=auth.uid());
GRANT SELECT,INSERT,UPDATE,DELETE ON business_drafts TO authenticated;
GRANT ALL ON business_drafts TO service_role;

CREATE TABLE brain_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  node_id uuid NOT NULL, version integer NOT NULL CHECK(version > 0), snapshot jsonb NOT NULL, provenance jsonb NOT NULL DEFAULT '{}'::jsonb, UNIQUE(node_id,version),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,id)
);
ALTER TABLE brain_versions ENABLE ROW LEVEL SECURITY;
CREATE INDEX brain_versions_workspace_idx ON brain_versions(workspace_id);
CREATE POLICY "owner read" ON brain_versions FOR SELECT TO authenticated USING(workspace_id=auth.uid());
REVOKE ALL ON brain_versions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON brain_versions TO authenticated;
GRANT ALL ON brain_versions TO service_role;

CREATE TABLE brain_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  node_id uuid, base_version integer, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')), diff jsonb NOT NULL, source_refs jsonb NOT NULL DEFAULT '[]'::jsonb, decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,id)
);
ALTER TABLE brain_proposals ENABLE ROW LEVEL SECURITY;
CREATE INDEX brain_proposals_workspace_idx ON brain_proposals(workspace_id);
CREATE POLICY "owner read" ON brain_proposals FOR SELECT TO authenticated USING(workspace_id=auth.uid());
CREATE POLICY "owner write" ON brain_proposals FOR ALL TO authenticated USING(workspace_id=auth.uid()) WITH CHECK(workspace_id=auth.uid());
GRANT SELECT,INSERT,UPDATE,DELETE ON brain_proposals TO authenticated;
GRANT ALL ON brain_proposals TO service_role;

CREATE TABLE sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  task_id uuid, url text NOT NULL CHECK(url ~ '^https?://'), title text NOT NULL, accessed_at timestamptz NOT NULL DEFAULT now(), published_at timestamptz, excerpt text NOT NULL, content_hash text NOT NULL, source_type text NOT NULL DEFAULT 'website', market text, availability text NOT NULL DEFAULT 'retrieved', UNIQUE(workspace_id,content_hash,url),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,id)
);
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
CREATE INDEX sources_workspace_idx ON sources(workspace_id);
CREATE POLICY "owner read" ON sources FOR SELECT TO authenticated USING(workspace_id=auth.uid());
CREATE POLICY "owner write" ON sources FOR ALL TO authenticated USING(workspace_id=auth.uid()) WITH CHECK(workspace_id=auth.uid());
GRANT SELECT,INSERT,UPDATE,DELETE ON sources TO authenticated;
GRANT ALL ON sources TO service_role;

CREATE TABLE claim_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_id uuid NOT NULL, claim text NOT NULL, consumer_type text NOT NULL, consumer_id uuid NOT NULL, support text NOT NULL CHECK(support IN ('supports','contradicts','context')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,id)
);
ALTER TABLE claim_sources ENABLE ROW LEVEL SECURITY;
CREATE INDEX claim_sources_workspace_idx ON claim_sources(workspace_id);
CREATE POLICY "owner read" ON claim_sources FOR SELECT TO authenticated USING(workspace_id=auth.uid());
CREATE POLICY "owner write" ON claim_sources FOR ALL TO authenticated USING(workspace_id=auth.uid()) WITH CHECK(workspace_id=auth.uid());
GRANT SELECT,INSERT,UPDATE,DELETE ON claim_sources TO authenticated;
GRANT ALL ON claim_sources TO service_role;

CREATE TABLE context_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  node_id uuid, node_version integer, source_id uuid, consumer_type text NOT NULL CHECK(consumer_type IN ('task','document','post','roadmap')), consumer_id uuid NOT NULL, consumer_version integer NOT NULL, relevant_fields jsonb NOT NULL DEFAULT '[]'::jsonb, stale_reason text, resolved_at timestamptz, resolution text, CHECK(node_id IS NOT NULL OR source_id IS NOT NULL),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,id)
);
ALTER TABLE context_dependencies ENABLE ROW LEVEL SECURITY;
CREATE INDEX context_dependencies_workspace_idx ON context_dependencies(workspace_id);
CREATE POLICY "owner read" ON context_dependencies FOR SELECT TO authenticated USING(workspace_id=auth.uid());
CREATE POLICY "owner write" ON context_dependencies FOR ALL TO authenticated USING(workspace_id=auth.uid()) WITH CHECK(workspace_id=auth.uid());
GRANT SELECT,INSERT,UPDATE,DELETE ON context_dependencies TO authenticated;
GRANT ALL ON context_dependencies TO service_role;

CREATE TABLE task_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  task_id uuid NOT NULL, run_id uuid NOT NULL, position integer NOT NULL, agent text NOT NULL, label text NOT NULL, status text NOT NULL CHECK(status IN ('planned','running','completed','failed','cancelled')), input_summary text, output jsonb, started_at timestamptz, completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,id)
);
ALTER TABLE task_steps ENABLE ROW LEVEL SECURITY;
CREATE INDEX task_steps_workspace_idx ON task_steps(workspace_id);
CREATE POLICY "owner read" ON task_steps FOR SELECT TO authenticated USING(workspace_id=auth.uid());
CREATE POLICY "owner write" ON task_steps FOR ALL TO authenticated USING(workspace_id=auth.uid()) WITH CHECK(workspace_id=auth.uid());
GRANT SELECT,INSERT,UPDATE,DELETE ON task_steps TO authenticated;
GRANT ALL ON task_steps TO service_role;

CREATE TABLE task_inputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  task_id uuid NOT NULL, version integer NOT NULL DEFAULT 1, schema jsonb NOT NULL, answers jsonb, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','answered','skipped')), answered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,id)
);
ALTER TABLE task_inputs ENABLE ROW LEVEL SECURITY;
CREATE INDEX task_inputs_workspace_idx ON task_inputs(workspace_id);
CREATE POLICY "owner read" ON task_inputs FOR SELECT TO authenticated USING(workspace_id=auth.uid());
CREATE POLICY "owner write" ON task_inputs FOR ALL TO authenticated USING(workspace_id=auth.uid()) WITH CHECK(workspace_id=auth.uid());
GRANT SELECT,INSERT,UPDATE,DELETE ON task_inputs TO authenticated;
GRANT ALL ON task_inputs TO service_role;

CREATE TABLE task_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  task_id uuid NOT NULL, call_id uuid NOT NULL, operation text NOT NULL, usage jsonb NOT NULL DEFAULT '{}'::jsonb, UNIQUE(task_id,call_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,id)
);
ALTER TABLE task_usage ENABLE ROW LEVEL SECURITY;
CREATE INDEX task_usage_workspace_idx ON task_usage(workspace_id);
CREATE POLICY "owner read" ON task_usage FOR SELECT TO authenticated USING(workspace_id=auth.uid());
REVOKE ALL ON task_usage FROM PUBLIC, anon, authenticated;
GRANT SELECT ON task_usage TO authenticated;
GRANT ALL ON task_usage TO service_role;

CREATE TABLE discovery_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1, goal text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','planned','archived')), context_refs jsonb NOT NULL DEFAULT '[]'::jsonb, updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,id)
);
ALTER TABLE discovery_drafts ENABLE ROW LEVEL SECURITY;
CREATE INDEX discovery_drafts_workspace_idx ON discovery_drafts(workspace_id);
CREATE POLICY "owner read" ON discovery_drafts FOR SELECT TO authenticated USING(workspace_id=auth.uid());
CREATE POLICY "owner write" ON discovery_drafts FOR ALL TO authenticated USING(workspace_id=auth.uid()) WITH CHECK(workspace_id=auth.uid());
GRANT SELECT,INSERT,UPDATE,DELETE ON discovery_drafts TO authenticated;
GRANT ALL ON discovery_drafts TO service_role;

CREATE TABLE discovery_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  draft_id uuid NOT NULL, question_key text NOT NULL, position integer NOT NULL, schema jsonb NOT NULL, status text NOT NULL DEFAULT 'unanswered' CHECK(status IN ('unanswered','answered','unknown','skipped','not_applicable','researching','confirmed')), value jsonb, provenance jsonb NOT NULL DEFAULT '{}'::jsonb, branch text, UNIQUE(draft_id,question_key),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,id)
);
ALTER TABLE discovery_questions ENABLE ROW LEVEL SECURITY;
CREATE INDEX discovery_questions_workspace_idx ON discovery_questions(workspace_id);
CREATE POLICY "owner read" ON discovery_questions FOR SELECT TO authenticated USING(workspace_id=auth.uid());
CREATE POLICY "owner write" ON discovery_questions FOR ALL TO authenticated USING(workspace_id=auth.uid()) WITH CHECK(workspace_id=auth.uid());
GRANT SELECT,INSERT,UPDATE,DELETE ON discovery_questions TO authenticated;
GRANT ALL ON discovery_questions TO service_role;

CREATE TABLE question_research_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  draft_id uuid NOT NULL, question_id uuid NOT NULL, conversation_id uuid NOT NULL, task_id uuid, result_id uuid, proposed_answer jsonb, status text NOT NULL DEFAULT 'researching' CHECK(status IN ('researching','ready','selected','confirmed','failed')), version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,id)
);
ALTER TABLE question_research_links ENABLE ROW LEVEL SECURITY;
CREATE INDEX question_research_links_workspace_idx ON question_research_links(workspace_id);
CREATE POLICY "owner read" ON question_research_links FOR SELECT TO authenticated USING(workspace_id=auth.uid());
CREATE POLICY "owner write" ON question_research_links FOR ALL TO authenticated USING(workspace_id=auth.uid()) WITH CHECK(workspace_id=auth.uid());
GRANT SELECT,INSERT,UPDATE,DELETE ON question_research_links TO authenticated;
GRANT ALL ON question_research_links TO service_role;

CREATE TABLE roadmaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  goal text NOT NULL, version integer NOT NULL DEFAULT 1, status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','archived','rejected')), draft_id uuid, active_version_id uuid, updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,id)
);
ALTER TABLE roadmaps ENABLE ROW LEVEL SECURITY;
CREATE INDEX roadmaps_workspace_idx ON roadmaps(workspace_id);
CREATE POLICY "owner read" ON roadmaps FOR SELECT TO authenticated USING(workspace_id=auth.uid());
CREATE POLICY "owner write" ON roadmaps FOR ALL TO authenticated USING(workspace_id=auth.uid()) WITH CHECK(workspace_id=auth.uid());
GRANT SELECT,INSERT,UPDATE,DELETE ON roadmaps TO authenticated;
GRANT ALL ON roadmaps TO service_role;

CREATE TABLE roadmap_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  roadmap_id uuid NOT NULL, version integer NOT NULL, base_version integer, status text NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','active','archived','rejected')), summary jsonb NOT NULL DEFAULT '{}'::jsonb, diff jsonb NOT NULL DEFAULT '{}'::jsonb, context_refs jsonb NOT NULL DEFAULT '[]'::jsonb, UNIQUE(roadmap_id,version),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,id)
);
ALTER TABLE roadmap_versions ENABLE ROW LEVEL SECURITY;
CREATE INDEX roadmap_versions_workspace_idx ON roadmap_versions(workspace_id);
CREATE POLICY "owner read" ON roadmap_versions FOR SELECT TO authenticated USING(workspace_id=auth.uid());
REVOKE ALL ON roadmap_versions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON roadmap_versions TO authenticated;
GRANT ALL ON roadmap_versions TO service_role;

CREATE TABLE roadmap_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  roadmap_id uuid NOT NULL, plan_version_id uuid NOT NULL, step_key text NOT NULL, position integer NOT NULL, title text NOT NULL, objective text NOT NULL, rationale text NOT NULL, evidence jsonb NOT NULL DEFAULT '[]'::jsonb, uncertainty text NOT NULL DEFAULT '', responsibility text NOT NULL CHECK(responsibility IN ('owner','system')), execution_mode text NOT NULL CHECK(execution_mode IN ('director','owner')), inputs jsonb NOT NULL DEFAULT '[]'::jsonb, dependencies jsonb NOT NULL DEFAULT '[]'::jsonb, expected_output text NOT NULL, checklist jsonb NOT NULL DEFAULT '[]'::jsonb, effort text NOT NULL, external_approval text, status text NOT NULL DEFAULT 'ready' CHECK(status IN ('ready','running','completed','owner_reported','skipped','blocked','inapplicable')), attestation jsonb, task_id uuid, UNIQUE(plan_version_id,step_key),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,id)
);
ALTER TABLE roadmap_steps ENABLE ROW LEVEL SECURITY;
CREATE INDEX roadmap_steps_workspace_idx ON roadmap_steps(workspace_id);
CREATE POLICY "owner read" ON roadmap_steps FOR SELECT TO authenticated USING(workspace_id=auth.uid());
CREATE POLICY "owner write" ON roadmap_steps FOR ALL TO authenticated USING(workspace_id=auth.uid()) WITH CHECK(workspace_id=auth.uid());
GRANT SELECT,INSERT,UPDATE,DELETE ON roadmap_steps TO authenticated;
GRANT ALL ON roadmap_steps TO service_role;

CREATE TABLE step_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  step_id uuid NOT NULL, action text NOT NULL CHECK(action IN ('run','attest','skip','revisit','cancel')), idempotency_key uuid NOT NULL, payload jsonb NOT NULL DEFAULT '{}'::jsonb, UNIQUE(workspace_id,idempotency_key),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,id)
);
ALTER TABLE step_actions ENABLE ROW LEVEL SECURITY;
CREATE INDEX step_actions_workspace_idx ON step_actions(workspace_id);
CREATE POLICY "owner read" ON step_actions FOR SELECT TO authenticated USING(workspace_id=auth.uid());
REVOKE ALL ON step_actions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON step_actions TO authenticated;
GRANT ALL ON step_actions TO service_role;

CREATE TABLE deliverable_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  deliverable_id uuid NOT NULL, version integer NOT NULL, title text NOT NULL, content text NOT NULL, provenance jsonb NOT NULL DEFAULT '{}'::jsonb, source_refs jsonb NOT NULL DEFAULT '[]'::jsonb, context_refs jsonb NOT NULL DEFAULT '[]'::jsonb, limitations jsonb NOT NULL DEFAULT '[]'::jsonb, UNIQUE(deliverable_id,version),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,id)
);
ALTER TABLE deliverable_versions ENABLE ROW LEVEL SECURITY;
CREATE INDEX deliverable_versions_workspace_idx ON deliverable_versions(workspace_id);
CREATE POLICY "owner read" ON deliverable_versions FOR SELECT TO authenticated USING(workspace_id=auth.uid());
REVOKE ALL ON deliverable_versions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON deliverable_versions TO authenticated;
GRANT ALL ON deliverable_versions TO service_role;

CREATE TABLE campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title text NOT NULL, task_id uuid, deliverable_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,id)
);
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
CREATE INDEX campaigns_workspace_idx ON campaigns(workspace_id);
CREATE POLICY "owner read" ON campaigns FOR SELECT TO authenticated USING(workspace_id=auth.uid());
CREATE POLICY "owner write" ON campaigns FOR ALL TO authenticated USING(workspace_id=auth.uid()) WITH CHECK(workspace_id=auth.uid());
GRANT SELECT,INSERT,UPDATE,DELETE ON campaigns TO authenticated;
GRANT ALL ON campaigns TO service_role;

CREATE TABLE media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  object_path text NOT NULL, object_version text NOT NULL, digest text NOT NULL, mime text NOT NULL CHECK(mime IN ('image/png','image/jpeg','image/webp')), size_bytes bigint NOT NULL CHECK(size_bytes BETWEEN 1 AND 10485760), width integer NOT NULL CHECK(width BETWEEN 1 AND 10000), height integer NOT NULL CHECK(height BETWEEN 1 AND 10000), status text NOT NULL DEFAULT 'ready' CHECK(status IN ('ready','deleted','missing')), UNIQUE(workspace_id,object_path),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,id)
);
ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY;
CREATE INDEX media_assets_workspace_idx ON media_assets(workspace_id);
CREATE POLICY "owner read" ON media_assets FOR SELECT TO authenticated USING(workspace_id=auth.uid());
CREATE POLICY "owner write" ON media_assets FOR ALL TO authenticated USING(workspace_id=auth.uid()) WITH CHECK(workspace_id=auth.uid());
GRANT SELECT,INSERT,UPDATE,DELETE ON media_assets TO authenticated;
GRANT ALL ON media_assets TO service_role;

CREATE TABLE post_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  post_id uuid NOT NULL, revision integer NOT NULL, text text NOT NULL, link text, media_asset_id uuid, page_id text, connection_id uuid, scheduled_time jsonb, provenance jsonb NOT NULL DEFAULT '{}'::jsonb, UNIQUE(post_id,revision), CHECK(scheduled_time IS NULL OR (jsonb_typeof(scheduled_time)='object' AND scheduled_time ?& ARRAY['instant','zone','latenessAllowanceMinutes'])),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,id)
);
ALTER TABLE post_versions ENABLE ROW LEVEL SECURITY;
CREATE INDEX post_versions_workspace_idx ON post_versions(workspace_id);
CREATE POLICY "owner read" ON post_versions FOR SELECT TO authenticated USING(workspace_id=auth.uid());
REVOKE ALL ON post_versions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON post_versions TO authenticated;
GRANT ALL ON post_versions TO service_role;

CREATE TABLE post_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  post_id uuid NOT NULL, post_version_id uuid NOT NULL, connection_id uuid NOT NULL, page_id text NOT NULL, authorization_generation integer NOT NULL, scheduled_time jsonb NOT NULL, revoked_at timestamptz, UNIQUE(post_version_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,id)
);
ALTER TABLE post_approvals ENABLE ROW LEVEL SECURITY;
CREATE INDEX post_approvals_workspace_idx ON post_approvals(workspace_id);
CREATE POLICY "owner read" ON post_approvals FOR SELECT TO authenticated USING(workspace_id=auth.uid());
REVOKE ALL ON post_approvals FROM PUBLIC, anon, authenticated;
GRANT SELECT ON post_approvals TO authenticated;
GRANT ALL ON post_approvals TO service_role;

CREATE TABLE publish_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  post_id uuid NOT NULL, post_version_id uuid NOT NULL, connection_id uuid NOT NULL, authorization_generation integer NOT NULL, state text NOT NULL CHECK(state IN ('claimed','submitted','confirmed','failed','uncertain','held','cancelled')), provider_id text, permalink text, submitted_at timestamptz, confirmed_at timestamptz, evidence jsonb NOT NULL DEFAULT '{}'::jsonb, error_code text, UNIQUE(post_version_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,id)
);
ALTER TABLE publish_attempts ENABLE ROW LEVEL SECURITY;
CREATE INDEX publish_attempts_workspace_idx ON publish_attempts(workspace_id);
CREATE POLICY "owner read" ON publish_attempts FOR SELECT TO authenticated USING(workspace_id=auth.uid());
REVOKE ALL ON publish_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON publish_attempts TO authenticated;
GRANT ALL ON publish_attempts TO service_role;

CREATE TABLE post_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  post_id uuid NOT NULL, reason text NOT NULL, dependency_id uuid, resolved_at timestamptz, resolution text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,id)
);
ALTER TABLE post_holds ENABLE ROW LEVEL SECURITY;
CREATE INDEX post_holds_workspace_idx ON post_holds(workspace_id);
CREATE POLICY "owner read" ON post_holds FOR SELECT TO authenticated USING(workspace_id=auth.uid());
REVOKE ALL ON post_holds FROM PUBLIC, anon, authenticated;
GRANT SELECT ON post_holds TO authenticated;
GRANT ALL ON post_holds TO service_role;

CREATE TABLE connection_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL, token_ciphertext text NOT NULL, expires_at timestamptz, UNIQUE(connection_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,id)
);
ALTER TABLE connection_credentials ENABLE ROW LEVEL SECURITY;
CREATE INDEX connection_credentials_workspace_idx ON connection_credentials(workspace_id);
REVOKE ALL ON connection_credentials FROM PUBLIC, anon, authenticated;
GRANT ALL ON connection_credentials TO service_role;

CREATE TABLE oauth_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  state_hash text NOT NULL UNIQUE, platform text NOT NULL CHECK(platform='facebook'), intent text NOT NULL DEFAULT 'connect', expires_at timestamptz NOT NULL, consumed_at timestamptz, credential_ciphertext text, pages jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,id)
);
ALTER TABLE oauth_transactions ENABLE ROW LEVEL SECURITY;
CREATE INDEX oauth_transactions_workspace_idx ON oauth_transactions(workspace_id);
REVOKE ALL ON oauth_transactions FROM PUBLIC, anon, authenticated;
GRANT ALL ON oauth_transactions TO service_role;

CREATE TABLE analysis_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  task_id uuid, conversation_id uuid NOT NULL, version integer NOT NULL DEFAULT 1, filename text NOT NULL, file_hash text NOT NULL, template_version text NOT NULL, rows jsonb NOT NULL, mapping jsonb NOT NULL DEFAULT '{}'::jsonb, definitions jsonb NOT NULL DEFAULT '{}'::jsonb, warnings jsonb NOT NULL DEFAULT '[]'::jsonb, status text NOT NULL DEFAULT 'mapping' CHECK(status IN ('mapping','confirmed','completed','failed')), confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,id)
);
ALTER TABLE analysis_imports ENABLE ROW LEVEL SECURITY;
CREATE INDEX analysis_imports_workspace_idx ON analysis_imports(workspace_id);
CREATE POLICY "owner read" ON analysis_imports FOR SELECT TO authenticated USING(workspace_id=auth.uid());
CREATE POLICY "owner write" ON analysis_imports FOR ALL TO authenticated USING(workspace_id=auth.uid()) WITH CHECK(workspace_id=auth.uid());
GRANT SELECT,INSERT,UPDATE,DELETE ON analysis_imports TO authenticated;
GRANT ALL ON analysis_imports TO service_role;

CREATE TABLE metric_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  import_id uuid NOT NULL, name text NOT NULL, value numeric, unit text NOT NULL, period_start date, period_end date, status text NOT NULL CHECK(status IN ('available','unknown','undefined','incompatible')), explanation text, source_rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,id)
);
ALTER TABLE metric_observations ENABLE ROW LEVEL SECURITY;
CREATE INDEX metric_observations_workspace_idx ON metric_observations(workspace_id);
CREATE POLICY "owner read" ON metric_observations FOR SELECT TO authenticated USING(workspace_id=auth.uid());
CREATE POLICY "owner write" ON metric_observations FOR ALL TO authenticated USING(workspace_id=auth.uid()) WITH CHECK(workspace_id=auth.uid());
GRANT SELECT,INSERT,UPDATE,DELETE ON metric_observations TO authenticated;
GRANT ALL ON metric_observations TO service_role;

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  type text NOT NULL, subject_type text NOT NULL, subject_id uuid NOT NULL, subject_version integer, title text NOT NULL, body text NOT NULL DEFAULT '', read_at timestamptz, dedupe_key text NOT NULL, UNIQUE(workspace_id,dedupe_key),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,id)
);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE INDEX notifications_workspace_idx ON notifications(workspace_id);
CREATE POLICY "owner read" ON notifications FOR SELECT TO authenticated USING(workspace_id=auth.uid());
CREATE POLICY "owner write" ON notifications FOR ALL TO authenticated USING(workspace_id=auth.uid()) WITH CHECK(workspace_id=auth.uid());
GRANT SELECT,INSERT,UPDATE,DELETE ON notifications TO authenticated;
GRANT ALL ON notifications TO service_role;

ALTER TABLE brain_nodes ADD CONSTRAINT brain_nodes_workspace_id_unique UNIQUE(workspace_id,id);

ALTER TABLE conversations ADD CONSTRAINT conversations_workspace_id_unique UNIQUE(workspace_id,id);

ALTER TABLE tasks ADD CONSTRAINT tasks_workspace_id_unique UNIQUE(workspace_id,id);

ALTER TABLE deliverables ADD CONSTRAINT deliverables_workspace_id_unique UNIQUE(workspace_id,id);

ALTER TABLE planned_posts ADD CONSTRAINT planned_posts_workspace_id_unique UNIQUE(workspace_id,id);

ALTER TABLE platform_connections ADD CONSTRAINT platform_connections_workspace_id_unique UNIQUE(workspace_id,id);
ALTER TABLE brain_edges ADD CONSTRAINT brain_edges_source_node_id_owner_fk FOREIGN KEY(workspace_id,source_node_id) REFERENCES brain_nodes(workspace_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED NOT VALID;
ALTER TABLE brain_edges ADD CONSTRAINT brain_edges_target_node_id_owner_fk FOREIGN KEY(workspace_id,target_node_id) REFERENCES brain_nodes(workspace_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED NOT VALID;
ALTER TABLE messages ADD CONSTRAINT messages_conversation_id_owner_fk FOREIGN KEY(workspace_id,conversation_id) REFERENCES conversations(workspace_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED NOT VALID;
ALTER TABLE tasks ADD CONSTRAINT tasks_conversation_id_owner_fk FOREIGN KEY(workspace_id,conversation_id) REFERENCES conversations(workspace_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED NOT VALID;
ALTER TABLE agent_events ADD CONSTRAINT agent_events_task_id_owner_fk FOREIGN KEY(workspace_id,task_id) REFERENCES tasks(workspace_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED NOT VALID;
ALTER TABLE deliverables ADD CONSTRAINT deliverables_task_id_owner_fk FOREIGN KEY(workspace_id,task_id) REFERENCES tasks(workspace_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED NOT VALID;
ALTER TABLE planned_posts ADD CONSTRAINT planned_posts_task_id_owner_fk FOREIGN KEY(workspace_id,task_id) REFERENCES tasks(workspace_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED NOT VALID;
ALTER TABLE planned_posts ADD CONSTRAINT planned_posts_deliverable_id_owner_fk FOREIGN KEY(workspace_id,deliverable_id) REFERENCES deliverables(workspace_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED NOT VALID;
ALTER TABLE planned_posts ADD CONSTRAINT planned_posts_current_version_id_owner_fk FOREIGN KEY(workspace_id,current_version_id) REFERENCES post_versions(workspace_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED NOT VALID;
ALTER TABLE brain_versions ADD CONSTRAINT brain_versions_node_id_owner_fk FOREIGN KEY(workspace_id,node_id) REFERENCES brain_nodes(workspace_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE brain_proposals ADD CONSTRAINT brain_proposals_node_id_owner_fk FOREIGN KEY(workspace_id,node_id) REFERENCES brain_nodes(workspace_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE sources ADD CONSTRAINT sources_task_id_owner_fk FOREIGN KEY(workspace_id,task_id) REFERENCES tasks(workspace_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE claim_sources ADD CONSTRAINT claim_sources_source_id_owner_fk FOREIGN KEY(workspace_id,source_id) REFERENCES sources(workspace_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE context_dependencies ADD CONSTRAINT context_dependencies_node_id_owner_fk FOREIGN KEY(workspace_id,node_id) REFERENCES brain_nodes(workspace_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE context_dependencies ADD CONSTRAINT context_dependencies_source_id_owner_fk FOREIGN KEY(workspace_id,source_id) REFERENCES sources(workspace_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE task_steps ADD CONSTRAINT task_steps_task_id_owner_fk FOREIGN KEY(workspace_id,task_id) REFERENCES tasks(workspace_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE task_inputs ADD CONSTRAINT task_inputs_task_id_owner_fk FOREIGN KEY(workspace_id,task_id) REFERENCES tasks(workspace_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE task_usage ADD CONSTRAINT task_usage_task_id_owner_fk FOREIGN KEY(workspace_id,task_id) REFERENCES tasks(workspace_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE discovery_questions ADD CONSTRAINT discovery_questions_draft_id_owner_fk FOREIGN KEY(workspace_id,draft_id) REFERENCES discovery_drafts(workspace_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE question_research_links ADD CONSTRAINT question_research_links_draft_id_owner_fk FOREIGN KEY(workspace_id,draft_id) REFERENCES discovery_drafts(workspace_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE question_research_links ADD CONSTRAINT question_research_links_question_id_owner_fk FOREIGN KEY(workspace_id,question_id) REFERENCES discovery_questions(workspace_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE question_research_links ADD CONSTRAINT question_research_links_conversation_id_owner_fk FOREIGN KEY(workspace_id,conversation_id) REFERENCES conversations(workspace_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE question_research_links ADD CONSTRAINT question_research_links_task_id_owner_fk FOREIGN KEY(workspace_id,task_id) REFERENCES tasks(workspace_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE question_research_links ADD CONSTRAINT question_research_links_result_id_owner_fk FOREIGN KEY(workspace_id,result_id) REFERENCES deliverables(workspace_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE roadmaps ADD CONSTRAINT roadmaps_draft_id_owner_fk FOREIGN KEY(workspace_id,draft_id) REFERENCES discovery_drafts(workspace_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE roadmaps ADD CONSTRAINT roadmaps_active_version_id_owner_fk FOREIGN KEY(workspace_id,active_version_id) REFERENCES roadmap_versions(workspace_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE roadmap_versions ADD CONSTRAINT roadmap_versions_roadmap_id_owner_fk FOREIGN KEY(workspace_id,roadmap_id) REFERENCES roadmaps(workspace_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE roadmap_steps ADD CONSTRAINT roadmap_steps_roadmap_id_owner_fk FOREIGN KEY(workspace_id,roadmap_id) REFERENCES roadmaps(workspace_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE roadmap_steps ADD CONSTRAINT roadmap_steps_plan_version_id_owner_fk FOREIGN KEY(workspace_id,plan_version_id) REFERENCES roadmap_versions(workspace_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE roadmap_steps ADD CONSTRAINT roadmap_steps_task_id_owner_fk FOREIGN KEY(workspace_id,task_id) REFERENCES tasks(workspace_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE step_actions ADD CONSTRAINT step_actions_step_id_owner_fk FOREIGN KEY(workspace_id,step_id) REFERENCES roadmap_steps(workspace_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE deliverable_versions ADD CONSTRAINT deliverable_versions_deliverable_id_owner_fk FOREIGN KEY(workspace_id,deliverable_id) REFERENCES deliverables(workspace_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE campaigns ADD CONSTRAINT campaigns_task_id_owner_fk FOREIGN KEY(workspace_id,task_id) REFERENCES tasks(workspace_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE campaigns ADD CONSTRAINT campaigns_deliverable_id_owner_fk FOREIGN KEY(workspace_id,deliverable_id) REFERENCES deliverables(workspace_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE post_versions ADD CONSTRAINT post_versions_post_id_owner_fk FOREIGN KEY(workspace_id,post_id) REFERENCES planned_posts(workspace_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE post_versions ADD CONSTRAINT post_versions_media_asset_id_owner_fk FOREIGN KEY(workspace_id,media_asset_id) REFERENCES media_assets(workspace_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE post_versions ADD CONSTRAINT post_versions_connection_id_owner_fk FOREIGN KEY(workspace_id,connection_id) REFERENCES platform_connections(workspace_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE post_approvals ADD CONSTRAINT post_approvals_post_id_owner_fk FOREIGN KEY(workspace_id,post_id) REFERENCES planned_posts(workspace_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE post_approvals ADD CONSTRAINT post_approvals_post_version_id_owner_fk FOREIGN KEY(workspace_id,post_version_id) REFERENCES post_versions(workspace_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE post_approvals ADD CONSTRAINT post_approvals_connection_id_owner_fk FOREIGN KEY(workspace_id,connection_id) REFERENCES platform_connections(workspace_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE publish_attempts ADD CONSTRAINT publish_attempts_post_id_owner_fk FOREIGN KEY(workspace_id,post_id) REFERENCES planned_posts(workspace_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE publish_attempts ADD CONSTRAINT publish_attempts_post_version_id_owner_fk FOREIGN KEY(workspace_id,post_version_id) REFERENCES post_versions(workspace_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE publish_attempts ADD CONSTRAINT publish_attempts_connection_id_owner_fk FOREIGN KEY(workspace_id,connection_id) REFERENCES platform_connections(workspace_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE post_holds ADD CONSTRAINT post_holds_post_id_owner_fk FOREIGN KEY(workspace_id,post_id) REFERENCES planned_posts(workspace_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE post_holds ADD CONSTRAINT post_holds_dependency_id_owner_fk FOREIGN KEY(workspace_id,dependency_id) REFERENCES context_dependencies(workspace_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE connection_credentials ADD CONSTRAINT connection_credentials_connection_id_owner_fk FOREIGN KEY(workspace_id,connection_id) REFERENCES platform_connections(workspace_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE analysis_imports ADD CONSTRAINT analysis_imports_task_id_owner_fk FOREIGN KEY(workspace_id,task_id) REFERENCES tasks(workspace_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE analysis_imports ADD CONSTRAINT analysis_imports_conversation_id_owner_fk FOREIGN KEY(workspace_id,conversation_id) REFERENCES conversations(workspace_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE metric_observations ADD CONSTRAINT metric_observations_import_id_owner_fk FOREIGN KEY(workspace_id,import_id) REFERENCES analysis_imports(workspace_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;

CREATE UNIQUE INDEX one_active_roadmap ON roadmaps(workspace_id) WHERE status='active';
CREATE INDEX notification_unread ON notifications(workspace_id,created_at DESC) WHERE read_at IS NULL;
CREATE INDEX posts_schedule ON planned_posts(workspace_id,scheduled_for);
CREATE INDEX documents_page ON deliverables(workspace_id,created_at DESC,id);
INSERT INTO deliverable_versions(workspace_id,deliverable_id,version,title,content,provenance)
 SELECT workspace_id,id,1,title,content,'{"kind":"legacy"}'::jsonb FROM deliverables;
INSERT INTO brain_versions(workspace_id,node_id,version,snapshot,provenance)
 SELECT workspace_id,id,1,to_jsonb(brain_nodes),'{"kind":"legacy"}'::jsonb FROM brain_nodes;
INSERT INTO post_versions(workspace_id,post_id,revision,text,provenance)
 SELECT workspace_id,id,1,caption || CASE WHEN hashtags='' THEN '' ELSE E'\n' || hashtags END,
 jsonb_build_object('kind','legacy','original_scheduled_for',scheduled_for,'legacy_image_url',image_url)
 FROM planned_posts;
UPDATE planned_posts p SET current_version_id=v.id FROM post_versions v WHERE v.post_id=p.id AND v.revision=1;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('owner-media','owner-media',false,10485760,ARRAY['image/png','image/jpeg','image/webp']) ON CONFLICT(id) DO NOTHING;
CREATE POLICY "owner media read" ON storage.objects FOR SELECT TO authenticated USING(bucket_id='owner-media' AND (storage.foldername(name))[1]=auth.uid()::text);
CREATE POLICY "owner media insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='owner-media' AND (storage.foldername(name))[1]=auth.uid()::text);
CREATE POLICY "owner media delete" ON storage.objects FOR DELETE TO authenticated USING(bucket_id='owner-media' AND (storage.foldername(name))[1]=auth.uid()::text);
-- No UPDATE policy: media objects are immutable; replacements use a fresh path.

CREATE OR REPLACE FUNCTION bootstrap_workspace() RETURNS workspace_settings
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v workspace_settings; w uuid := auth.uid();
BEGIN
 IF w IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 INSERT INTO workspaces(id) VALUES(w) ON CONFLICT(id) DO NOTHING;
 INSERT INTO workspace_settings(workspace_id) VALUES(w) ON CONFLICT(workspace_id) DO NOTHING;
 SELECT * INTO v FROM workspace_settings WHERE workspace_id=w;
 RETURN v;
END $$;
REVOKE ALL ON FUNCTION bootstrap_workspace() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION bootstrap_workspace() TO authenticated;
