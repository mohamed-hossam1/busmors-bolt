import 'server-only'
import { getIdentity } from './auth'
import type { AuditEntry, BrainEdge, BrainNode, BrainProposal } from '../lib/types'
export async function loadBrain() {
 const identity = await getIdentity()
 if (!identity) throw new Error('Sign in again.')
 const db = identity.supabase
 const results = await Promise.all([
  db.from('brain_nodes').select('*').order('created_at', { ascending: false }),
  db.from('brain_edges').select('*'),
  db.from('audit_log').select('*').order('created_at', { ascending: false }).limit(50),
  db.from('brain_proposals').select('*').eq('status', 'pending').order('created_at', { ascending: false }),
 ])
 if (results.some(result => result.error)) throw new Error('Brain records could not be loaded.')
  return { nodes: (results[0].data ?? []) as BrainNode[], edges: (results[1].data ?? []) as BrainEdge[], audit: (results[2].data ?? []) as AuditEntry[], proposals: (results[3].data ?? []) as BrainProposal[] }
}
