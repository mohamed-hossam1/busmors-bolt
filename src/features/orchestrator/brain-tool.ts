// Read-only Brain retrieval tool for the Orchestrator.
//
// The tool is deliberately narrow: it can only READ approved, current Brain
// nodes for the authenticated workspace. Tenant isolation is enforced by the
// injected reader (the server implementation filters on workspace_id = auth.uid()
// through RLS) and the tool never accepts or executes SQL. Retrieved content is
// returned as DATA for the model to read, never as instructions.

import type { BrainFact, BrainRetrieval } from './contracts'

/** Minimal row the tool needs; the server maps brain_nodes rows onto this. */
export interface BrainRow {
  id: string
  category: string
  title: string
  summary: string
  verificationState: string | null
}

/** Read boundary. The ONLY operation is a tenant-scoped approved-fact search. */
export interface BrainReader {
  searchApproved(params: { workspaceId: string; limit: number; signal?: AbortSignal }): Promise<BrainRow[]>
}

export interface RetrieveOptions {
  limit?: number
  candidateLimit?: number
  summaryChars?: number
  signal?: AbortSignal
  now?: () => number
}

const CATEGORY_BOOST = new Set(['company_profile', 'brand_rule', 'offering', 'positioning', 'audience'])
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'our', 'you', 'your', 'what', 'which', 'who', 'how', 'are', 'does', 'this', 'that', 'with', 'about', 'can', '告诉我', '就是', '什么', '我们', '的', '吗', 'এর',
])

function tokenize(query: string): string[] {
  return Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((word) => word.length > 1 && !STOP_WORDS.has(word)),
    ),
  )
}

function score(row: BrainRow, tokens: string[]): number {
  const haystack = `${row.title} ${row.summary}`.toLowerCase()
  const words = haystack.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  let total = CATEGORY_BOOST.has(row.category) ? 1 : 0
  for (const token of tokens) {
    if (haystack.includes(token)) { total += 1; continue }
    // Cheap 4-character stem match so "prices" matches "pricing".
    if (token.length >= 4 && words.some((word) => word.length >= 4 && word.slice(0, 4) === token.slice(0, 4))) total += 0.5
  }
  // Prefer explicitly verified facts slightly so supported data outranks guesses.
  if (row.verificationState === 'source_supported' || row.verificationState === 'owner_reported') total += 0.25
  return total
}

/** Retrieve the most relevant approved company facts. Read-only, scored, bounded. */
export async function retrieveBrain(
  reader: BrainReader,
  workspaceId: string,
  query: string,
  options: RetrieveOptions = {},
): Promise<BrainRetrieval> {
  const startedAt = (options.now ?? Date.now)()
  const limit = Math.max(1, Math.min(options.limit ?? 8, 20))
  const candidateLimit = Math.max(limit, Math.min(options.candidateLimit ?? 60, 200))
  const summaryChars = Math.max(120, Math.min(options.summaryChars ?? 700, 1200))
  const trimmed = query.trim()
  const tokens = tokenize(trimmed)
  try {
    const rows = await reader.searchApproved({ workspaceId, limit: candidateLimit, signal: options.signal })
    const ranked = rows
      .map((row) => ({ row, score: score(row, tokens) }))
      .sort((a, b) => b.score - a.score || a.row.title.localeCompare(b.row.title))
      .slice(0, limit)
    const facts: BrainFact[] = ranked.map(({ row, score: rowScore }) => ({
      id: row.id,
      category: row.category,
      title: row.title,
      summary: row.summary.slice(0, summaryChars),
      verificationState: row.verificationState ?? null,
      score: Number(rowScore.toFixed(3)),
    }))
    return {
      ok: true,
      query: trimmed,
      facts,
      retrievedCount: facts.length,
      elapsedMs: (options.now ?? Date.now)() - startedAt,
    }
  } catch (error) {
    return {
      ok: false,
      query: trimmed,
      facts: [],
      retrievedCount: 0,
      reason: error instanceof Error ? error.message : 'brain_unavailable',
      elapsedMs: (options.now ?? Date.now)() - startedAt,
    }
  }
}