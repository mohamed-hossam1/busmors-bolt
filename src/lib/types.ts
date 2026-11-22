import { supabase } from './supabase'

export type BrainCategory =
  | 'company_profile'
  | 'offering'
  | 'audience'
  | 'brand_rule'
  | 'positioning'
  | 'strategic_goal'
  | 'channel'
  | 'competitor'
  | 'company_fact'

export type BrainStatus = 'candidate' | 'approved' | 'rejected' | 'retired'
export type BrainSource = 'crawler' | 'conversation' | 'task' | 'manual'

export interface BrainNode {
  id: string
  workspace_id: string
  category: BrainCategory
  title: string
  summary: string
  properties: Record<string, unknown>
  status: BrainStatus
  source: BrainSource
  source_detail: string | null
  confidence: number
  created_at: string
  updated_at: string
  version: number
  epistemic_kind?: 'fact' | 'claim' | 'inference' | 'unknown'
  approval_state?: 'pending' | 'approved' | 'rejected' | 'legacy'
  verification_state?: 'unverified' | 'source_supported' | 'contradicted' | 'owner_reported'
  provenance?: Record<string, unknown>
  is_current?: boolean
}

export interface BrainProposal {
  id: string; node_id: string; base_version: number; status: 'pending'|'approved'|'rejected'
  diff: Pick<BrainNode,'title'|'summary'|'category'|'properties'> & { source_detail?: string }
  source_refs: string[]; created_at: string
}

export interface BrainEdge {
  id: string
  workspace_id: string
  source_node_id: string
  target_node_id: string
  relation_type: 'TARGETS' | 'COMPETES_WITH' | 'HAS_TONE' | 'SOLVES_PAIN_POINT' | 'RELATED_TO'
  status: BrainStatus
  weight: number
  created_at: string
  provenance?: Record<string, unknown>
}

export type MessageRole = 'user' | 'agent' | 'system'
export type MessageType =
  | 'text'
  | 'text_response'
  | 'structured_form'
  | 'budget_extension_request'
  | 'post_reference'
  | 'form'
  | 'task_status'
  | 'deliverable_card'
  | 'knowledge_notification'
  | 'error'

export interface ChatMessage {
  id: string
  conversation_id: string
  role: MessageRole
  type: MessageType
  content: string
  payload: Record<string, unknown> | null
  created_at: string
}

export interface Conversation {
  id: string
  workspace_id: string
  title: string
  created_at: string
}

export interface FormField {
  name: string
  label: string
  type: 'text' | 'single' | 'multi' | 'select' | 'number' | 'url'
  options?: string[]
  value?: string | string[]
}

export interface Task {
  id: string
  workspace_id: string
  conversation_id: string | null
  type: string
  status: 'pending' | 'running' | 'awaiting_input' | 'completed' | 'failed'
  user_request: string
  plan: { agent: string; label: string }[]
  result_summary: string | null
  created_at: string
  updated_at: string
}

export interface AgentEvent {
  id: string
  task_id: string
  instance_id?: string
  run_id?: string
  seq: number
  event_type: 'agent_started' | 'agent_tool_used' | 'agent_completed' | 'agent_error' | 'flow_connection'
  agent_id: string
  payload: Record<string, unknown>
  created_at: string
}

export interface Deliverable {
  id: string
  workspace_id: string
  task_id: string | null
  title: string
  type: 'research_report' | 'competitor_analysis' | 'content_posts' | 'content_calendar' | 'performance_diagnosis' | 'general'
  content: string
  version: number
  origin: Record<string, unknown>
  context_refs: unknown[]
  source_refs: unknown[]
  limitations: unknown[]
  stale_reason: string | null
  created_at: string
  updated_at: string
}

export interface DeliverableVersion {
  id: string
  workspace_id: string
  deliverable_id: string
  version: number
  title: string
  content: string
  provenance: Record<string, unknown>
  source_refs: unknown[]
  context_refs: unknown[]
  limitations: unknown[]
  created_at: string
}

export type Platform = 'facebook' | 'instagram'
export type PostStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'failed'

export interface PlannedPost {
  id: string
  workspace_id: string
  deliverable_id: string | null
  task_id: string | null
  platform: Platform
  caption: string
  hashtags: string
  image_url: string | null
  status: PostStatus
  scheduled_for: string
  idempotency_key: string
  publish_result: Record<string, unknown> | null
  created_at: string
}

export interface WorkspaceSettings {
  workspace_id: string
  country: string
  currency: string
  timezone: string
  ui_language: 'en' | 'ar'
  conversation_language: 'en' | 'ar'
  content_register: import('./contracts').ContentRegister
  target_market: string
  confirmed_intake_version: number | null
  company_url: string | null
  language: 'en' | 'ar'
  onboarding_state: 'awaiting_url' | 'crawling' | 'review_pending' | 'complete'
  crawl_status: { pages_read?: number; pages_total?: number; finished?: boolean }
  brand_colors: { primary: string; accent: string }
  plan: 'starter' | 'growth' | 'scale'
  updated_at: string
}

export interface PlatformConnection {
  id: string
  platform: Platform
  account_name: string
  status: 'connected' | 'expired' | 'disconnected'
  connected_at: string
}

export interface AuditEntry {
  id: string
  action: string
  entity_type: string
  entity_id: string | null
  details: Record<string, unknown>
  created_at: string
}

export async function getWorkspaceId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  const user = data.session?.user
  return user?.id ?? null
}
