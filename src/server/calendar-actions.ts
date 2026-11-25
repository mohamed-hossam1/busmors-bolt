'use server'
import { getIdentity } from './auth'
import { createAdminClient } from './supabase-admin'
import type { PlannedPost } from '../lib/types'

export async function loadPosts(): Promise<PlannedPost[]> {
 const identity = await getIdentity()
 if (!identity) throw new Error('Sign in again.')
 // Sends whose result was never recorded become Needs review after 10 minutes. This
 // only updates state; it never sends or retries anything.
 try { await createAdminClient().rpc('mark_stale_publish_attempts') } catch { /* best effort */ }
 const { data, error } = await identity.supabase.from('planned_posts').select('*').order('scheduled_for', { ascending: true })
 if (error) throw new Error('Posts could not be loaded.')
 const posts = (data ?? []) as PlannedPost[]
 // Unresolved holds explain why a post is On hold (owner RLS allows reading them).
 const { data: holds } = await identity.supabase.from('post_holds').select('post_id, reason, kind').is('resolved_at', null)
 const byPost = new Map<string, { reason: string; kind: string }[]>()
 for (const hold of (holds ?? []) as { post_id: string; reason: string; kind: string }[]) {
  const list = byPost.get(hold.post_id) ?? []
  list.push({ reason: hold.reason, kind: hold.kind })
  byPost.set(hold.post_id, list)
 }
 return posts.map(post => ({ ...post, holds: byPost.get(post.id) ?? [] }))
}

export async function recoverPosts(): Promise<PlannedPost[]> {
 return loadPosts()
}

export async function updatePosts(ids: string[], change: { status?: PlannedPost['status']; caption?: string }): Promise<{ error: string | null }> {
 const identity = await getIdentity()
 if (!identity) return { error: 'Sign in again.' }
 if (!Array.isArray(ids) || !ids.length || ids.length > 500 || ids.some(id => typeof id !== 'string')) return { error: 'Invalid post update.' }
 if (change.caption !== undefined && (typeof change.caption !== 'string' || change.caption.length < 1 || change.caption.length > 6000)) return { error: 'Invalid post caption.' }
 if (change.status !== undefined && !['approved', 'rejected', 'published'].includes(change.status)) return { error: 'Invalid post status.' }

 const { data, error } = await identity.supabase.rpc('update_post', {
   p_ids: ids,
   p_expected_version: null,
   p_caption: change.caption ?? null,
   p_status: change.status ?? null,
 })
 if (error) {
   const code = error.message || ''
   if (code.includes('LOCKED')) return { error: 'This post was already sent to Facebook and cannot be edited here.' }
   if (code.includes('VERSION_CONFLICT')) return { error: 'This post changed since you opened it. Refresh and retry.' }
   if (code.includes('NOT_APPROVED')) return { error: 'Only an approved post can be marked published.' }
   if (code.includes('INVALID_TRANSITION')) return { error: 'That status change is not allowed from the current state.' }
   if (code.includes('NOT_FOUND')) return { error: 'One of these posts no longer exists. Refresh and retry.' }
   return { error: 'The posts could not be saved. Please retry.' }
 }
 const changed = typeof data === 'number' ? data : 0
 if (change.status && changed > 0) {
   const { error: auditError } = await identity.supabase.from('audit_log').insert({ workspace_id: identity.user.id, actor_id: identity.user.id, action: 'post_' + change.status, entity_type: 'planned_post', details: { ids, count: changed } })
   if (auditError) return { error: 'The posts were updated, but their activity record could not be saved. Refresh before retrying.' }
 }
  return { error: null }
}