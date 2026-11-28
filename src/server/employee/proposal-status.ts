import type { EmployeeMessage } from './conversation-store'
import type { ProposalDecisionStatus } from '../../components/chat/employeeCards'

export interface ProposalStatusSupabase {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: unknown): {
        in(column: string, values: string[]): PromiseLike<{ data: unknown; error: unknown }>
      }
    }
  }
}

function asProposalStatus(value: unknown): ProposalDecisionStatus | null {
  if (value === 'pending' || value === 'approved' || value === 'rejected') return value
  return null
}

/**
 * Hydrate live `brain_proposals.status` onto `metadata.brainProposals` when
 * loading persisted conversation messages so already-decided approval cards
 * render locked on initial load without flashing Approve/Reject buttons.
 */
export async function hydrateMessageProposalStatuses(
  supabase: ProposalStatusSupabase,
  workspaceId: string,
  messages: EmployeeMessage[],
): Promise<EmployeeMessage[]> {
  const proposalIds = new Set<string>()
  for (const msg of messages) {
    const raw = msg.metadata?.brainProposals
    if (!Array.isArray(raw)) continue
    for (const item of raw) {
      if (item && typeof item === 'object' && typeof (item as { proposalId?: unknown }).proposalId === 'string') {
        const id = (item as { proposalId: string }).proposalId
        if (id) proposalIds.add(id)
      }
    }
  }
  if (proposalIds.size === 0) return messages

  try {
    const { data, error } = await supabase
      .from('brain_proposals')
      .select('id,status')
      .eq('workspace_id', workspaceId)
      .in('id', Array.from(proposalIds))
    if (error || !Array.isArray(data)) return messages

    const statusById = new Map<string, ProposalDecisionStatus>()
    for (const row of data) {
      if (!row || typeof row !== 'object') continue
      const r = row as { id?: unknown; status?: unknown }
      const status = asProposalStatus(r.status)
      if (typeof r.id === 'string' && status) {
        statusById.set(r.id, status)
      }
    }
    if (statusById.size === 0) return messages

    return messages.map((msg) => {
      const raw = msg.metadata?.brainProposals
      if (!Array.isArray(raw)) return msg
      const hydrated = raw.map((item) => {
        if (!item || typeof item !== 'object') return item
        const record = item as Record<string, unknown>
        const id = typeof record.proposalId === 'string' ? record.proposalId : ''
        const status = id ? statusById.get(id) : undefined
        return status ? { ...record, status } : item
      })
      return {
        ...msg,
        metadata: {
          ...msg.metadata,
          brainProposals: hydrated,
        },
      }
    })
  } catch {
    return messages
  }
}
