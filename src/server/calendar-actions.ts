'use server'
import { getIdentity } from './auth'
import { createHash } from 'node:crypto'
import type { PlannedPost } from '../lib/types'

export async function loadPosts(): Promise<PlannedPost[]> {
 const identity = await getIdentity()
 if (!identity) throw new Error('Sign in again.')
 const { data, error } = await identity.supabase.from('planned_posts').select('*').order('scheduled_for', { ascending: true })
 if (error) throw new Error('Posts could not be loaded.')
 return (data ?? []) as PlannedPost[]
}

export async function recoverPosts(): Promise<PlannedPost[]> {
 const identity = await getIdentity()
 if (!identity) throw new Error('Sign in again.')
 const userId = identity.user.id

 const { data } = await identity.supabase
   .from('planned_posts')
   .select('id')
   .limit(1)

 if (data && data.length > 0) return loadPosts()

 // Recovery is limited to explicitly linked deliverable cards; it creates drafts
 // through the RPC (never a direct table write).
 const { data: messages } = await identity.supabase
   .from('messages')
   .select('id, payload, created_at')
   .eq('type', 'deliverable_card')
   .order('created_at', { ascending: false })
   .limit(20)

 for (const msg of messages ?? []) {
   const payload = msg.payload as { posts?: PlannedPost[]; deliverable_id?: string } | null
   if (Array.isArray(payload?.posts) && payload.posts.length > 0) {
     for (const p of payload.posts) {
       const platform = (['instagram', 'facebook'].includes(p.platform) ? p.platform : 'facebook')
       const hex = createHash('sha256').update(userId + ':' + msg.id + ':' + p.caption).digest('hex')
       const idempotencyKey = hex.slice(0,8) + '-' + hex.slice(8,12) + '-4' + hex.slice(13,16) + '-a' + hex.slice(17,20) + '-' + hex.slice(20,32)
       const { error: recErr } = await identity.supabase.rpc('create_post', {
         p_platform: platform,
         p_caption: (p.caption || '').slice(0, 6000) || 'Recovered draft',
         p_hashtags: p.hashtags || '',
         p_scheduled_for: null,
         p_idempotency_key: idempotencyKey,
       })
       if (recErr) return loadPosts()
     }
     break
   }
 }
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

export async function deletePosts(ids: string[]): Promise<{ error: string | null }> {
 const identity = await getIdentity()
 if (!identity) return { error: 'Sign in again.' }
 if (!Array.isArray(ids) || !ids.length || ids.length > 500 || ids.some(id => typeof id !== 'string')) return { error: 'Invalid post selection.' }
 const { error } = await identity.supabase.rpc('delete_post', { p_ids: ids })
 if (error) return { error: 'The posts could not be deleted. Please retry.' }
 return { error: null }
}