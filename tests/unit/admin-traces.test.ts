import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildTraceSearchString,
  normalizeTraceFilters,
  normalizeTraceRow,
  parseTraceSearchParams,
  sanitizeSearch,
} from '../../src/features/admin/traceQuery'
import { buildTraceTree, traceNodeKind, traceNodeLabel } from '../../src/features/admin/traceTree'
import {
  formatDuration,
  formatTokens,
  snippet,
  traceDurationMs,
} from '../../src/features/admin/format'
import { checkIsAdminUser } from '../../src/server/admin/admin-identity'
import type { AdminTraceEventRow } from '../../src/features/admin/types'

const ADMIN_ENV = { ADMIN_USER_ID: 'admin-1', ADMIN_EMAIL: 'boss@busmora.ai' } as unknown as NodeJS.ProcessEnv

function event(overrides: Partial<AdminTraceEventRow>): AdminTraceEventRow {
  return {
    id: 'e',
    trace_id: 't1',
    parent_event_id: null,
    event_type: 'agent',
    seq: 0,
    agent_id: 'orchestrator',
    agent_role: 'orchestrator',
    parent_agent_id: null,
    run_id: null,
    attempt: null,
    instance_id: 'inst-orch',
    correlation_id: null,
    tool_name: null,
    operation: null,
    provider: null,
    model: null,
    call_id: null,
    status: 'completed',
    started_at: null,
    ended_at: null,
    duration_ms: null,
    input_payload: null,
    output_preview: null,
    output_truncated: false,
    output_original_bytes: null,
    llm_input_tokens: 0,
    llm_output_tokens: 0,
    llm_total_tokens: 0,
    cached_tokens: 0,
    reasoning_tokens: 0,
    retry_attempt: null,
    fallback_used: false,
    error: null,
    metadata: null,
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('sanitizeSearch', () => {
  it('strips PostgREST control characters and bounds length', () => {
    assert.equal(sanitizeSearch('a,b(c)%d\\e'), 'a b c  d e')
    assert.ok(!/[(),%\\]/.test(sanitizeSearch('a,b(c)%d\\e')))
    assert.equal(sanitizeSearch('   '), '')
    assert.ok(sanitizeSearch('x'.repeat(500)).length <= 120)
  })
})

describe('normalizeTraceFilters', () => {
  it('applies defaults and computes a 1-based page range', () => {
    const f = normalizeTraceFilters({})
    assert.equal(f.page, 1)
    assert.equal(f.pageSize, 20)
    assert.equal(f.from, 0)
    assert.equal(f.to, 19)
    assert.equal(f.q, '')
  })

  it('clamps page and pageSize to safe bounds', () => {
    const f = normalizeTraceFilters({ page: 0, pageSize: 1000 })
    assert.equal(f.page, 1)
    assert.equal(f.pageSize, 100)
  })

  it('computes the offset for the requested page', () => {
    const f = normalizeTraceFilters({ page: 3, pageSize: 10 })
    assert.equal(f.from, 20)
    assert.equal(f.to, 29)
  })

  it('sanitizes the search term and trims optional filters', () => {
    const f = normalizeTraceFilters({
      q: 'hello, world',
      status: '  completed ',
      workspaceId: '  ws-1 ',
      from: '2026-01-01',
      to: '2026-02-01',
    })
    assert.equal(f.q, 'hello  world')
    assert.equal(f.status, 'completed')
    assert.equal(f.workspaceId, 'ws-1')
    assert.equal(f.startedFrom, '2026-01-01')
    assert.equal(f.startedTo, '2026-02-01')
  })

  it('drops blank optional filters to undefined', () => {
    const f = normalizeTraceFilters({ status: '   ', route: '' })
    assert.equal(f.status, undefined)
    assert.equal(f.route, undefined)
  })
})

describe('normalizeTraceRow', () => {
  it('coerces numeric fields and defaults missing values', () => {
    const row = normalizeTraceRow({
      id: 'trace-1',
      request: 'Plan a launch',
      status: 'completed',
      llm_total_tokens: '1500',
      agent_count: null,
    })
    assert.equal(row.id, 'trace-1')
    assert.equal(row.request, 'Plan a launch')
    assert.equal(row.status, 'completed')
    assert.equal(row.llm_total_tokens, 1500)
    assert.equal(row.agent_count, 0)
    assert.equal(row.has_admin_trace, true)
    assert.equal(row.workspace_id, null)
  })

  it('preserves an explicit has_admin_trace=false flag', () => {
    const row = normalizeTraceRow({ id: 'x', has_admin_trace: false })
    assert.equal(row.has_admin_trace, false)
  })
})

describe('traceNodeKind / traceNodeLabel', () => {
  it('classifies event types into coarse kinds', () => {
    assert.equal(traceNodeKind('agent'), 'agent')
    assert.equal(traceNodeKind('agent_completed'), 'agent')
    assert.equal(traceNodeKind('model'), 'model')
    assert.equal(traceNodeKind('tool_call'), 'tool')
    assert.equal(traceNodeKind('skill_read'), 'skill')
    assert.equal(traceNodeKind('audit'), 'other')
  })

  it('prefers tool/model names for labels', () => {
    assert.equal(
      traceNodeLabel(event({ event_type: 'tool', tool_name: 'web_search' })),
      'web_search',
    )
    assert.equal(
      traceNodeLabel(event({ event_type: 'model', model: 'gpt-x', provider: 'openai' })),
      'gpt-x',
    )
  })
})

describe('buildTraceTree', () => {
  it('nests model/tool/skill events under their agent via parent_event_id', () => {
    const tree = buildTraceTree([
      event({ id: 'orch', seq: 0, instance_id: 'inst-orch', agent_role: 'orchestrator' }),
      event({ id: 'dir', seq: 1, event_type: 'agent', agent_id: 'director', agent_role: 'director', instance_id: 'inst-dir', parent_event_id: 'orch', parent_agent_id: 'inst-orch' }),
      event({ id: 'm1', seq: 2, event_type: 'model', agent_id: 'director', instance_id: 'inst-dir', parent_event_id: 'dir', model: 'gpt-x' }),
      event({ id: 'tool1', seq: 3, event_type: 'tool', agent_id: 'search', tool_name: 'web_search', instance_id: 'inst-dir', parent_event_id: 'dir' }),
    ])

    assert.equal(tree.roots.length, 1)
    assert.equal(tree.roots[0].event.id, 'orch')

    const orch = tree.byId.get('orch')!
    const dir = orch.children.find((n) => n.event.id === 'dir')!
    assert.ok(dir, 'director nests under orchestrator')

    const childIds = dir.children.map((n) => n.event.id).sort()
    assert.deepEqual(childIds, ['m1', 'tool1'])
  })

  it('falls back to instance ownership when parent_event_id is absent', () => {
    const tree = buildTraceTree([
      event({ id: 'orch', seq: 0, instance_id: 'inst-orch', agent_role: 'orchestrator' }),
      event({ id: 'tool1', seq: 1, event_type: 'tool', agent_id: 'search', tool_name: 'web_search', instance_id: 'inst-orch', parent_event_id: null }),
    ])
    const orch = tree.byId.get('orch')!
    assert.equal(orch.children[0]?.event.id, 'tool1')
    assert.equal(tree.roots.length, 1)
  })

  it('keeps repeated tool calls as distinct sibling entries', () => {
    const tree = buildTraceTree([
      event({ id: 'orch', seq: 0, instance_id: 'inst-orch' }),
      event({ id: 'tool1', seq: 1, event_type: 'tool', tool_name: 'search', instance_id: 'inst-orch', parent_event_id: 'orch', call_id: 'c1' }),
      event({ id: 'tool2', seq: 2, event_type: 'tool', tool_name: 'search', instance_id: 'inst-orch', parent_event_id: 'orch', call_id: 'c2' }),
    ])
    const orch = tree.byId.get('orch')!
    assert.equal(orch.children.length, 2)
    assert.notEqual(orch.children[0].event.id, orch.children[1].event.id)
  })

  it('returns empty roots for an empty event list', () => {
    const tree = buildTraceTree([])
    assert.equal(tree.roots.length, 0)
    assert.equal(tree.byId.size, 0)
  })
})

describe('format helpers', () => {
  it('formats durations across magnitudes', () => {
    assert.equal(formatDuration(null), '—')
    assert.equal(formatDuration(850), '850ms')
    assert.equal(formatDuration(1234), '1.23s')
    assert.equal(formatDuration(65_000), '1m 5s')
  })

  it('derives trace duration from timestamps', () => {
    assert.equal(
      traceDurationMs('2026-01-01T00:00:00.000Z', '2026-01-01T00:00:02.500Z'),
      2500,
    )
    assert.equal(traceDurationMs(null, '2026-01-01T00:00:02.500Z'), null)
    assert.equal(traceDurationMs('2026-01-01T00:00:05.000Z', '2026-01-01T00:00:02.000Z'), null)
  })

  it('formats tokens and snippets', () => {
    assert.equal(formatTokens(1500), '1,500')
    assert.equal(formatTokens(null), '0')
    assert.equal(snippet('   '), '—')
    assert.equal(snippet('a'.repeat(200), 10).length, 10)
  })
})

describe('admin access guard (session-derived identity)', () => {
  it('grants access to an allow-listed session user', async () => {
    const session = await checkIsAdminUser(async () => ({ user: { id: 'admin-1' } }), ADMIN_ENV)
    assert.equal(session?.user.id, 'admin-1')
  })

  it('denies a non-admin session even if forged ids are passed as extra args', async () => {
    const forged = { id: 'admin-1', email: 'boss@busmora.ai' }
    const session = await (checkIsAdminUser as unknown as (...args: unknown[]) => Promise<unknown>)(
      async () => ({ user: { id: 'attacker', email: 'attacker@evil.test' } }),
      ADMIN_ENV,
      forged,
    )
    assert.equal(session, null)
  })

  it('denies an unauthenticated request', async () => {
    const session = await checkIsAdminUser(async () => null, ADMIN_ENV)
    assert.equal(session, null)
  })

  it('fails closed when no operator is configured', async () => {
    const session = await checkIsAdminUser(
      async () => ({ user: { id: 'admin-1' } }),
      {} as unknown as NodeJS.ProcessEnv,
    )
    assert.equal(session, null)
  })
})

describe('parseTraceSearchParams and buildTraceSearchString', () => {
  it('reads workspaceId, email, filters, and page from URLSearchParams', () => {
    const sp = new URLSearchParams(
      'workspaceId=ws-123&email=user@example.com&q=hello&status=completed&from=2026-11-01&to=2026-11-28&page=3',
    )
    const parsed = parseTraceSearchParams(sp)
    assert.deepEqual(parsed.filters, {
      q: 'hello',
      status: 'completed',
      workspaceId: 'ws-123',
      from: '2026-11-01',
      to: '2026-11-28',
    })
    assert.equal(parsed.page, 3)
    assert.equal(parsed.accountEmail, 'user@example.com')
  })

  it('handles array searchParams and clamps invalid page to 1', () => {
    const parsed = parseTraceSearchParams({
      workspaceId: ['  ws-arr  ', 'ignored'],
      page: '-5',
    })
    assert.equal(parsed.filters.workspaceId, 'ws-arr')
    assert.equal(parsed.page, 1)
    assert.equal(parsed.accountEmail, '')
  })

  it('drops orphan email when workspaceId is empty', () => {
    const parsed = parseTraceSearchParams(new URLSearchParams('email=user@example.com'))
    assert.equal(parsed.filters.workspaceId, '')
    assert.equal(parsed.accountEmail, '')
  })

  it('serializes only active filters and round-trips cleanly', () => {
    const qs = buildTraceSearchString(
      { q: ' foo ', status: '', workspaceId: 'ws-1', from: '', to: '' },
      1,
      'owner@example.com',
    )
    assert.equal(qs, 'q=foo&workspaceId=ws-1&email=owner%40example.com')
    const roundTrip = parseTraceSearchParams(new URLSearchParams(qs))
    assert.equal(roundTrip.filters.workspaceId, 'ws-1')
    assert.equal(roundTrip.filters.q, 'foo')
    assert.equal(roundTrip.accountEmail, 'owner@example.com')
    assert.equal(roundTrip.page, 1)
  })

  it('returns an empty string when all filters are empty and page is 1', () => {
    assert.equal(
      buildTraceSearchString({ q: '', status: '', workspaceId: '', from: '', to: '' }, 1, 'ignored@example.com'),
      '',
    )
  })
})