import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isClarificationAnswered } from '../../src/components/chat/employeeCards'
import {
  hydrateMessageProposalStatuses,
  type ProposalStatusSupabase,
} from '../../src/server/employee/proposal-status'
import type { EmployeeMessage } from '../../src/server/employee/conversation-store'

describe('isClarificationAnswered', () => {
  it('returns false when the clarification message is the latest message', () => {
    const messages = [
      { role: 'user' },
      { role: 'assistant' },
    ]
    assert.equal(isClarificationAnswered(messages, 1), false)
  })

  it('returns false when only assistant messages follow', () => {
    const messages = [
      { role: 'user' },
      { role: 'assistant' },
      { role: 'assistant' },
    ]
    assert.equal(isClarificationAnswered(messages, 1), false)
  })

  it('returns true when any user message follows the clarification message', () => {
    const messages = [
      { role: 'user' },
      { role: 'assistant' },
      { role: 'user' },
      { role: 'assistant' },
    ]
    assert.equal(isClarificationAnswered(messages, 1), true)
  })

  it('handles out-of-range indices safely', () => {
    assert.equal(isClarificationAnswered([], 0), false)
    assert.equal(isClarificationAnswered([{ role: 'assistant' }], -1), false)
  })
})

describe('hydrateMessageProposalStatuses', () => {
  const makeMsg = (id: string, proposals?: Array<Record<string, unknown>>): EmployeeMessage => ({
    id,
    conversation_id: 'conv-1',
    role: 'assistant',
    content: 'hi',
    metadata: proposals ? { brainProposals: proposals } : {},
    created_at: '2026-11-28T00:00:00Z',
  })

  it('skips database query when no messages carry brainProposals', async () => {
    let queried = false
    const supabase: ProposalStatusSupabase = {
      from() {
        queried = true
        throw new Error('should not query')
      },
    }
    const msgs = [makeMsg('m1')]
    const result = await hydrateMessageProposalStatuses(supabase, 'ws-1', msgs)
    assert.equal(queried, false)
    assert.deepEqual(result, msgs)
  })

  it('hydrates live approved/rejected/pending status onto proposal cards scoped by workspace', async () => {
    const filters: Array<[string, unknown]> = []
    let inCall: [string, string[]] | null = null
    const supabase: ProposalStatusSupabase = {
      from() {
        return {
          select() {
            return {
              eq(col: string, val: unknown) {
                filters.push([col, val])
                return {
                  async in(inCol: string, values: string[]) {
                    inCall = [inCol, values]
                    return {
                      data: [
                        { id: 'p-1', status: 'approved' },
                        { id: 'p-2', status: 'rejected' },
                      ],
                      error: null,
                    }
                  },
                }
              },
            }
          },
        }
      },
    }

    const msgs = [
      makeMsg('m1', [
        { proposalId: 'p-1', title: 'Fact 1' },
        { proposalId: 'p-2', title: 'Fact 2' },
        { proposalId: 'p-3', title: 'Fact 3' },
      ]),
    ]

    const result = await hydrateMessageProposalStatuses(supabase, 'ws-1', msgs)
    assert.deepEqual(filters, [['workspace_id', 'ws-1']])
    assert.deepEqual(inCall, ['id', ['p-1', 'p-2', 'p-3']])

    const hydrated = result[0].metadata.brainProposals as Array<Record<string, unknown>>
    assert.equal(hydrated[0].status, 'approved')
    assert.equal(hydrated[1].status, 'rejected')
    assert.equal(hydrated[2].status, undefined)
  })

  it('falls back to original messages on query error', async () => {
    const supabase: ProposalStatusSupabase = {
      from() {
        return {
          select() {
            return {
              eq() {
                return {
                  async in() {
                    return { data: null, error: { message: 'boom' } }
                  },
                }
              },
            }
          },
        }
      },
    }
    const msgs = [makeMsg('m1', [{ proposalId: 'p-1', title: 'Fact 1' }])]
    const result = await hydrateMessageProposalStatuses(supabase, 'ws-1', msgs)
    assert.deepEqual(result, msgs)
  })
})
