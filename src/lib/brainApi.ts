import { supabase } from './supabase'
import type { BrainCategory, BrainNode } from './types'

export function brainError(error: unknown): Error {
  const message = (error as { message?: string })?.message ?? ''
  return new Error(message.includes('STALE_VERSION') ? 'This item changed since you opened it. Close this panel, reload the Brain, and review the latest version.' : 'This change could not be saved. Your edits are kept here; try again.')
}
export async function saveBrainItem(node: BrainNode | null,title: string,summary: string,category: BrainCategory,properties?: Record<string,unknown>,status='approved') {
  const { data,error } = await supabase.rpc('update_brain_item', { p_node_id:node?.id??null,p_expected_version:node ? (node.version??1) : 0,p_title:title,p_summary:summary,p_category:category,p_properties:properties??node?.properties??{},p_status:status })
  if(error)throw brainError(error)
  return data as BrainNode
}
