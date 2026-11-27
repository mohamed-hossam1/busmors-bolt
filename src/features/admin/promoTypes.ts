/** Admin promo management types (safe for client components). */

export type AdminPromoStatus = 'active' | 'reserved' | 'redeemed' | 'revoked'

export interface AdminPromoItem {
  id: string
  code: string
  status: AdminPromoStatus
  heavyTasksLimit: number
  heavyTasksUsed: number
  remainingTasks: number
  batchLabel: string | null
  note: string | null
  expiresAt: string | null
  isExpired: boolean
  redeemedByWorkspaceId: string | null
  redeemedEmail: string | null
  phoneNumber: string | null
  redeemedAt: string | null
  createdAt: string
}

export interface AdminPromoSummary {
  total: number
  active: number
  reserved: number
  redeemed: number
  revoked: number
  totalHeavyUsed: number
  totalHeavyLimit: number
}

export interface AdminPromoListResult {
  data: AdminPromoItem[]
  page: number
  pageSize: number
  total: number
  summary: AdminPromoSummary
  batches: string[]
}

export interface CreatePromosInput {
  mode: 'auto' | 'custom'
  count?: number
  prefix?: string
  code?: string
  limit: number
  batchLabel?: string | null
  note?: string | null
  expiresDays?: number | null
}

export interface GrantHeavyTasksInput {
  workspaceId?: string
  phone?: string
  email?: string
  extra: number
}

export interface GrantHeavyTasksResult {
  workspaceId: string
  before: number
  after: number
  used: number
}