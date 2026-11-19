import { supabase } from './supabase'
import { normalizedEvidence, type ExtractedCandidate } from './crawlContent'
import { normalizeSiteUrl } from './siteReader'
import type { ExtractedRelation } from './crawl'

export interface SavedCrawl {
  nodesCount: number
  edgesCount: number
  warning?: string
}

async function stableId(parts: string[]): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(parts))))
  bytes[6] = (bytes[6] & 0x0f) | 0x80
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes.slice(0, 16)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function storageError(message: string): Error {
  return new Error(`Could not save website knowledge: ${message}. Existing knowledge has been kept.`)
}

/** Add-only compatibility for projects that have not deployed the transactional RPC yet.
 * Stable IDs make retrying safe; this path never edits or removes an existing row.
 */
async function saveCompatible(url: string, candidates: ExtractedCandidate[], relations: ExtractedRelation[], pagesRead: number): Promise<SavedCrawl> {
  const { data: sessionData } = await supabase.auth.getSession()
  const workspace = sessionData.session?.user.id
  if (!workspace) throw storageError('Please sign in again')
  const titles = candidates.map((c) => c.title)
  const { data: existing, error: readError } = await supabase.from('brain_nodes')
    .select('id, category, title, status').eq('workspace_id', workspace).in('title', titles)
    .abortSignal(AbortSignal.timeout(8000))
  if (readError) throw storageError(readError.message)
  const key = (c: { category: string; title: string }) => `${c.category}:${normalizedEvidence(c.title)}`
  const byKey = new Map((existing || []).map((node) => [key(node), node]))
  const rows = await Promise.all(candidates.filter((c) => !byKey.has(key(c))).map(async (c) => ({
    id: await stableId(['crawl-node', workspace, key(c)]), workspace_id: workspace,
    category: c.category, title: c.title, summary: c.summary, properties: c.properties,
    source: 'crawler', source_detail: c.source_url, confidence: c.confidence,
    status: 'candidate',
  })))
  if (rows.length) {
    const { error } = await supabase.from('brain_nodes').upsert(rows, { onConflict: 'id', ignoreDuplicates: true })
      .abortSignal(AbortSignal.timeout(8000))
    if (error) throw storageError(error.message)
  }
  // Read committed rows, including an identical concurrent retry's inserts.
  const { data: saved, error: savedError } = await supabase.from('brain_nodes')
    .select('id, category, title, status').eq('workspace_id', workspace).in('title', titles)
    .abortSignal(AbortSignal.timeout(8000))
  if (savedError) throw storageError(savedError.message)
  for (const node of saved || []) if (!byKey.has(key(node))) byKey.set(key(node), node)
  const nodes = candidates.map((c) => byKey.get(key(c)))
  if (nodes.some((node) => !node)) throw storageError('Some items were not confirmed saved. Please retry')

  let edgesCount = 0
  if (relations.length) {
    const nodeIds = nodes.map((node) => node!.id)
    const { data: existingEdges, error } = await supabase.from('brain_edges')
      .select('source_node_id, target_node_id, relation_type').eq('workspace_id', workspace)
      .in('source_node_id', nodeIds).in('target_node_id', nodeIds).abortSignal(AbortSignal.timeout(8000))
    if (error) throw storageError('Knowledge items were saved, but connections could not be checked. Please retry')
    const edgeKey = (edge: { source_node_id: string; target_node_id: string; relation_type: string }) => `${edge.source_node_id}:${edge.target_node_id}:${edge.relation_type}`
    const seen = new Set((existingEdges || []).map(edgeKey))
    const edgeRows = []
    const counted = new Set<string>()
    for (const relation of relations) {
      const source = nodes[relation.source_index], target = nodes[relation.target_index]
      if (!source || !target || source.id === target.id) continue
      const row = { workspace_id: workspace, source_node_id: source.id, target_node_id: target.id,
        relation_type: relation.relation_type, status: 'candidate', weight: relation.confidence }
      const fingerprint = edgeKey(row)
      counted.add(fingerprint)
      if (seen.has(fingerprint)) continue
      seen.add(fingerprint)
      edgeRows.push({ ...row, id: await stableId(['crawl-edge', workspace, fingerprint]) })
    }
    if (edgeRows.length) {
      const { error } = await supabase.from('brain_edges').upsert(edgeRows, { onConflict: 'id', ignoreDuplicates: true })
        .abortSignal(AbortSignal.timeout(8000))
      if (error) throw storageError('Knowledge items were saved, but connections could not be saved. Please retry')
    }
    edgesCount = counted.size
  }
  const nodesCount = new Set(nodes.map((node) => node!.id)).size
  const { data: completedSettings, error: settingsError } = await supabase.from('workspace_settings')
    .update({ company_url: url, crawl_status: { pages_read: pagesRead, nodes_count: nodesCount, edges_count: edgesCount, finished: true } })
    .eq('workspace_id', workspace).select('workspace_id').abortSignal(AbortSignal.timeout(8000))
  if (settingsError || !completedSettings?.length) throw storageError('Knowledge items were saved, but completion could not be confirmed. Please retry')
  const { error: auditError } = await supabase.from('audit_log').insert({ workspace_id: workspace, actor_id: workspace,
    action: 'crawler_knowledge_saved', entity_type: 'brain_nodes', details: { count: nodesCount, edges: edgesCount, url, mode: 'add_only' } })
    .abortSignal(AbortSignal.timeout(8000))
  return { nodesCount, edgesCount, warning: auditError ? 'Your knowledge was saved, but its activity record could not be recorded.' : undefined }
}

export async function saveCrawlKnowledge(websiteUrl: string, candidates: ExtractedCandidate[], relations: ExtractedRelation[], pagesRead: number, replace = false): Promise<SavedCrawl> {
  if (!candidates.length) throw new Error('No supported business information was found. Try another page on your website.')
  const url = normalizeSiteUrl(websiteUrl)
  const { data, error } = await supabase.rpc('save_crawl_brain', {
    p_url: url, p_candidates: candidates, p_relations: relations, p_pages_read: pagesRead, p_replace: replace,
  }).abortSignal(AbortSignal.timeout(8000))
  if (error?.code === 'PGRST202') return saveCompatible(url, candidates, relations, pagesRead)
  if (error) throw storageError(error.message)
  if (!data || !Number.isInteger(data.nodes_count) || !Number.isInteger(data.edges_count)) throw storageError('Saving returned an invalid result')
  return { nodesCount: data.nodes_count, edgesCount: data.edges_count }
}
