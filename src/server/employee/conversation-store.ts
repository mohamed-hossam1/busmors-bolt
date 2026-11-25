/**
 * Workspace-scoped persistence helpers for Employee chat history (Phase 3.5).
 *
 * Thin, framework-free adapters over the authenticated Supabase client so the
 * chat route and the conversation API routes share one implementation and the
 * logic stays unit-testable with a fake client (no `server-only`, no next/headers
 * — the caller always passes a session-scoped client). Authorization is enforced
 * by RLS (auth.uid() = workspace_id) plus the explicit workspace filter here as
 * defence-in-depth; model/client-supplied ids are never trusted for scoping.
 */

export interface EmployeeConversation {
  id: string
  title: string
  created_at: string
  updated_at: string
}

export type EmployeeMessageRole = 'user' | 'assistant'

export interface EmployeeMessage {
  id: string
  conversation_id: string
  role: EmployeeMessageRole
  content: string
  metadata: Record<string, unknown>
  created_at: string
}

interface Builder {
  eq(column: string, value: unknown): Builder
  order(column: string, options?: { ascending?: boolean }): Builder
  limit(count: number): Builder
  then<TResult1 = { data: unknown; error: unknown }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2>
}

interface Table {
  select(columns: string): Builder
  insert(row: unknown): Builder
  update(row: unknown): Builder
  delete(): Builder
}

export interface ConversationSupabase {
  from(table: string): Table
}

export interface NewConversation {
  id: string
  workspace_id: string
  user_id: string
  title: string
}

export interface NewMessage {
  id: string
  conversation_id: string
  role: EmployeeMessageRole
  content: string
  metadata: Record<string, unknown>
}

const DEFAULT_LIST_LIMIT = 50
const MAX_LIST_LIMIT = 100
const DEFAULT_MESSAGE_LIMIT = 200
const MAX_MESSAGE_LIMIT = 500
export const DEFAULT_CONVERSATION_TITLE = 'محادثة جديدة'
export const MAX_TITLE_LENGTH = 60

function errorText(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return String(error)
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function clamp(value: number | undefined, def: number, max: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return def
  return Math.min(max, Math.max(1, Math.trunc(value)))
}

/** Derive a short, human chat title from the first user message. */
export function titleFromMessage(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return DEFAULT_CONVERSATION_TITLE
  const chars = Array.from(clean)
  return chars.length > MAX_TITLE_LENGTH
    ? `${chars.slice(0, MAX_TITLE_LENGTH).join('').trim()}…`
    : clean
}

export async function listConversations(
  supabase: ConversationSupabase,
  workspaceId: string,
  limit?: number,
): Promise<EmployeeConversation[]> {
  const take = clamp(limit, DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT)
  const { data, error } = await supabase
    .from('employee_conversations')
    .select('id,title,created_at,updated_at')
    .eq('workspace_id', workspaceId)
    .order('updated_at', { ascending: false })
    .limit(take)
  if (error) throw new Error(`Chat history could not be loaded: ${errorText(error)}`)
  return ((data as unknown[]) ?? []).map((row) => {
    const r = asRecord(row)
    return {
      id: String(r.id ?? ''),
      title: typeof r.title === 'string' && r.title.trim() ? r.title : DEFAULT_CONVERSATION_TITLE,
      created_at: typeof r.created_at === 'string' ? r.created_at : '',
      updated_at: typeof r.updated_at === 'string' ? r.updated_at : '',
    }
  })
}

export async function createConversation(
  supabase: ConversationSupabase,
  input: NewConversation,
): Promise<EmployeeConversation> {
  const now = new Date().toISOString()
  const { error } = await supabase.from('employee_conversations').insert({
    id: input.id,
    workspace_id: input.workspace_id,
    user_id: input.user_id,
    title: input.title || DEFAULT_CONVERSATION_TITLE,
  })
  if (error) throw new Error(`Chat could not be started: ${errorText(error)}`)
  return {
    id: input.id,
    title: input.title || DEFAULT_CONVERSATION_TITLE,
    created_at: now,
    updated_at: now,
  }
}

export async function loadMessages(
  supabase: ConversationSupabase,
  conversationId: string,
  limit?: number,
): Promise<EmployeeMessage[]> {
  const take = clamp(limit, DEFAULT_MESSAGE_LIMIT, MAX_MESSAGE_LIMIT)
  const { data, error } = await supabase
    .from('employee_messages')
    .select('id,conversation_id,role,content,metadata,created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(take)
  if (error) throw new Error(`Conversation messages could not be loaded: ${errorText(error)}`)
  return ((data as unknown[]) ?? []).map((row) => {
    const r = asRecord(row)
    return {
      id: String(r.id ?? ''),
      conversation_id: String(r.conversation_id ?? conversationId),
      role: (r.role === 'assistant' ? 'assistant' : 'user') as EmployeeMessageRole,
      content: typeof r.content === 'string' ? r.content : '',
      metadata: asRecord(r.metadata),
      created_at: typeof r.created_at === 'string' ? r.created_at : '',
    }
  })
}

export async function appendMessage(
  supabase: ConversationSupabase,
  message: NewMessage,
): Promise<void> {
  const { error } = await supabase.from('employee_messages').insert({
    id: message.id,
    conversation_id: message.conversation_id,
    role: message.role,
    content: message.content,
    metadata: message.metadata ?? {},
  })
  if (error) throw new Error(`Message could not be saved: ${errorText(error)}`)
}

export async function renameConversation(
  supabase: ConversationSupabase,
  conversationId: string,
  title: string,
): Promise<void> {
  const clean = title.replace(/\s+/g, ' ').trim().slice(0, 150)
  const { error } = await supabase
    .from('employee_conversations')
    .update({ title: clean || DEFAULT_CONVERSATION_TITLE })
    .eq('id', conversationId)
  if (error) throw new Error(`Conversation could not be renamed: ${errorText(error)}`)
}

export async function deleteConversation(
  supabase: ConversationSupabase,
  conversationId: string,
  workspaceId: string,
): Promise<void> {
  const { error } = await supabase
    .from('employee_conversations')
    .delete()
    .eq('id', conversationId)
    .eq('workspace_id', workspaceId)
  if (error) throw new Error(`Conversation could not be deleted: ${errorText(error)}`)
}

export async function conversationExists(
  supabase: ConversationSupabase,
  conversationId: string,
  workspaceId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('employee_conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('workspace_id', workspaceId)
    .limit(1)
  if (error) throw new Error(`Conversation could not be verified: ${errorText(error)}`)
  return Array.isArray(data) && data.length > 0
}