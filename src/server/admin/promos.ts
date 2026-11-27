import 'server-only'
import { randomInt } from 'node:crypto'
import { z } from 'zod'
import { createAdminClient } from '@/server/supabase-admin'
import { normalizePhone } from '@/lib/phone'
import {
  PROMO_PREFIX_RE,
  formatRandomPromoCode,
  isValidPromoCode,
  normalizePromoCodeInput,
  normalizePromoPrefix,
} from '@/lib/promo'
import type {
  AdminPromoItem,
  AdminPromoListResult,
  AdminPromoStatus,
  AdminPromoSummary,
  GrantHeavyTasksResult,
} from '@/features/admin/promoTypes'

interface PromoRow {
  id: string
  code: string
  status: AdminPromoStatus
  heavy_tasks_limit: number
  batch_label: string | null
  note: string | null
  expires_at: string | null
  redeemed_by_workspace_id: string | null
  redeemed_phone: string | null
  redeemed_email: string | null
  redeemed_at: string | null
  created_at: string
}

interface WorkspaceAccessRow {
  workspace_id: string
  promo_code_id?: string | null
  phone_number: string | null
  heavy_tasks_limit: number
  heavy_tasks_used: number
}

const PROMO_COLUMNS =
  'id, code, status, heavy_tasks_limit, batch_label, note, expires_at, redeemed_by_workspace_id, redeemed_phone, redeemed_email, redeemed_at, created_at'

const ACCESS_COLUMNS = 'workspace_id, promo_code_id, phone_number, heavy_tasks_limit, heavy_tasks_used'

function fail(status: number, code: string, error: string): never {
  throw Response.json({ error, code }, { status })
}

function toItem(row: PromoRow, workspace?: WorkspaceAccessRow): AdminPromoItem {
  const heavyTasksLimit = workspace?.heavy_tasks_limit ?? row.heavy_tasks_limit
  const heavyTasksUsed = workspace?.heavy_tasks_used ?? 0
  const remainingTasks = Math.max(0, heavyTasksLimit - heavyTasksUsed)
  const phoneNumber = workspace?.phone_number ?? row.redeemed_phone ?? null
  const isExpired =
    Boolean(row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) && row.status === 'active'
  return {
    id: row.id,
    code: row.code,
    status: row.status,
    heavyTasksLimit,
    heavyTasksUsed,
    remainingTasks,
    batchLabel: row.batch_label,
    note: row.note,
    expiresAt: row.expires_at,
    isExpired,
    redeemedByWorkspaceId: row.redeemed_by_workspace_id,
    redeemedEmail: row.redeemed_email,
    phoneNumber,
    redeemedAt: row.redeemed_at,
    createdAt: row.created_at,
  }
}

export async function listAdminPromos(filters: {
  page?: number
  pageSize?: number
  status?: string
  batch?: string
  q?: string
}): Promise<AdminPromoListResult> {
  const admin = createAdminClient()
  const page = Math.max(1, filters.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20))

  const { data, error } = await admin
    .from('promo_codes')
    .select(PROMO_COLUMNS)
    .order('created_at', { ascending: false })
  if (error) throw error

  const rows = (data ?? []) as unknown as PromoRow[]

  const workspaceIds = Array.from(
    new Set(rows.map((row) => row.redeemed_by_workspace_id).filter((id): id is string => Boolean(id))),
  )

  const workspaceMap = new Map<string, WorkspaceAccessRow>()
  if (workspaceIds.length > 0) {
    const { data: accessRows, error: accessError } = await admin
      .from('workspace_access')
      .select(ACCESS_COLUMNS)
      .in('workspace_id', workspaceIds)
    if (accessError) throw accessError
    for (const row of (accessRows ?? []) as unknown as WorkspaceAccessRow[]) {
      workspaceMap.set(row.workspace_id, row)
    }
  }

  const allItems = rows.map((row) =>
    toItem(row, row.redeemed_by_workspace_id ? workspaceMap.get(row.redeemed_by_workspace_id) : undefined),
  )

  const summary: AdminPromoSummary = {
    total: allItems.length,
    active: 0,
    reserved: 0,
    redeemed: 0,
    revoked: 0,
    totalHeavyUsed: 0,
    totalHeavyLimit: 0,
  }
  for (const item of allItems) {
    if (item.status === 'active') summary.active += 1
    else if (item.status === 'reserved') summary.reserved += 1
    else if (item.status === 'redeemed') summary.redeemed += 1
    else if (item.status === 'revoked') summary.revoked += 1
    summary.totalHeavyUsed += item.heavyTasksUsed
    summary.totalHeavyLimit += item.heavyTasksLimit
  }

  const batches = Array.from(
    new Set(allItems.map((item) => item.batchLabel).filter((label): label is string => Boolean(label))),
  ).sort((a, b) => a.localeCompare(b))

  const statusFilter = filters.status && filters.status !== 'all' ? filters.status : null
  const batchFilter = filters.batch && filters.batch !== 'all' ? filters.batch : null
  const q = filters.q?.trim().toLowerCase() ?? ''

  const filtered = allItems.filter((item) => {
    if (statusFilter && item.status !== statusFilter) return false
    if (batchFilter && item.batchLabel !== batchFilter) return false
    if (q) {
      const haystack = [item.code, item.redeemedEmail, item.phoneNumber, item.batchLabel, item.note]
        .filter((value): value is string => Boolean(value))
        .join('\n')
        .toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  })

  const total = filtered.length
  const offset = (page - 1) * pageSize

  return { data: filtered.slice(offset, offset + pageSize), page, pageSize, total, summary, batches }
}

const createSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('auto'),
    count: z.number().int().min(1).max(100).default(1),
    prefix: z.string().default('BUSM'),
    limit: z.number().int().min(1).max(1000).default(6),
    batchLabel: z.string().trim().max(64).nullish(),
    note: z.string().trim().max(240).nullish(),
    expiresDays: z.number().int().min(1).max(3650).nullish(),
  }),
  z.object({
    mode: z.literal('custom'),
    code: z.string(),
    limit: z.number().int().min(1).max(1000).default(6),
    batchLabel: z.string().trim().max(64).nullish(),
    note: z.string().trim().max(240).nullish(),
    expiresDays: z.number().int().min(1).max(3650).nullish(),
  }),
])

export async function createAdminPromos(rawInput: unknown): Promise<AdminPromoItem[]> {
  const admin = createAdminClient()

  const parsed = createSchema.safeParse(rawInput)
  if (!parsed.success) fail(400, 'INVALID_INPUT', 'Invalid input.')
  const input = parsed.data

  const batchLabel = input.batchLabel?.trim() || null
  const note = input.note?.trim() || null

  const expiresAt = input.expiresDays
    ? new Date(Date.now() + input.expiresDays * 86400000).toISOString()
    : null

  if (input.mode === 'custom') {
    const code = normalizePromoCodeInput(input.code)
    if (!isValidPromoCode(code)) fail(400, 'INVALID_INPUT', 'Invalid input.')

    const { data: existing, error: existingError } = await admin
      .from('promo_codes')
      .select('id')
      .eq('code', code)
      .maybeSingle()
    if (existingError) throw existingError
    if (existing) fail(409, 'PROMO_EXISTS', 'This promo code already exists.')

    const { data: inserted, error: insertError } = await admin
      .from('promo_codes')
      .insert({
        code,
        heavy_tasks_limit: input.limit,
        batch_label: batchLabel,
        note,
        expires_at: expiresAt,
      })
      .select(PROMO_COLUMNS)
      .single()
    if (insertError) {
      if ((insertError as { code?: string }).code === '23505') {
        fail(409, 'PROMO_EXISTS', 'This promo code already exists.')
      }
      throw insertError
    }
    return [toItem(inserted as unknown as PromoRow)]
  }

  const prefix = normalizePromoPrefix(input.prefix ?? 'BUSM')
  if (!PROMO_PREFIX_RE.test(prefix)) fail(400, 'INVALID_INPUT', 'Invalid input.')

  const generateCandidates = (): string[] => {
    const candidates = new Set<string>()
    while (candidates.size < input.count) {
      candidates.add(formatRandomPromoCode(prefix, randomInt))
    }
    return Array.from(candidates)
  }

  let insertedRows: PromoRow[] | null = null
  let candidateList: string[] = []
  for (let attempt = 0; attempt < 3 && !insertedRows; attempt++) {
    candidateList = generateCandidates()

    const { data: existing, error: existingError } = await admin
      .from('promo_codes')
      .select('code')
      .in('code', candidateList)
    if (existingError) throw existingError
    const taken = new Set(((existing ?? []) as unknown as { code: string }[]).map((row) => row.code))
    if (taken.size > 0) continue

    const rows = candidateList.map((code) => ({
      code,
      heavy_tasks_limit: input.limit,
      batch_label: batchLabel,
      note,
      expires_at: expiresAt,
    }))

    const { data, error } = await admin
      .from('promo_codes')
      .insert(rows)
      .select(PROMO_COLUMNS)
    if (error) {
      if ((error as { code?: string }).code === '23505') continue
      throw error
    }
    insertedRows = (data ?? []) as unknown as PromoRow[]
  }
  if (!insertedRows) fail(409, 'PROMO_EXISTS', 'This promo code already exists.')

  const byCode = new Map(insertedRows.map((row) => [row.code, row]))
  return candidateList
    .map((code) => byCode.get(code))
    .filter((row): row is PromoRow => Boolean(row))
    .map((row) => toItem(row))
}

export async function revokeAdminPromo(
  rawCode: string,
): Promise<{ id: string; code: string; status: string }> {
  const admin = createAdminClient()

  const code = normalizePromoCodeInput(rawCode)
  if (!code) fail(400, 'INVALID_INPUT', 'Invalid input.')

  const { data: row, error: fetchError } = await admin
    .from('promo_codes')
    .select('id, code, status')
    .eq('code', code)
    .maybeSingle()
  if (fetchError) throw fetchError
  if (!row) fail(404, 'NOT_FOUND', 'Promo code not found.')

  const promo = row as unknown as { id: string; code: string; status: string }
  if (promo.status !== 'active') fail(409, 'CANNOT_REVOKE', 'Only active promo codes can be revoked.')

  const { data: updated, error: updateError } = await admin
    .from('promo_codes')
    .update({ status: 'revoked' })
    .eq('id', promo.id)
    .eq('status', 'active')
    .select('id')
    .maybeSingle()
  if (updateError) throw updateError
  if (!updated) fail(409, 'CANNOT_REVOKE', 'Only active promo codes can be revoked.')

  return { id: promo.id, code: promo.code, status: 'revoked' }
}

const grantSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  extra: z.number().int().min(1).max(1000),
})

export async function grantAdminHeavyTasks(rawInput: unknown): Promise<GrantHeavyTasksResult> {
  const admin = createAdminClient()

  const parsed = grantSchema.safeParse(rawInput)
  if (!parsed.success) fail(400, 'INVALID_INPUT', 'Invalid input.')
  const input = parsed.data
  if (!input.workspaceId && !input.phone && !input.email) {
    fail(400, 'INVALID_INPUT', 'Invalid input.')
  }

  const fetchAccess = async (id: string): Promise<WorkspaceAccessRow | null> => {
    const { data, error } = await admin
      .from('workspace_access')
      .select(ACCESS_COLUMNS)
      .eq('workspace_id', id)
      .maybeSingle()
    if (error) throw error
    return (data ?? null) as unknown as WorkspaceAccessRow | null
  }

  let current: WorkspaceAccessRow | null = null

  if (input.workspaceId) {
    current = await fetchAccess(input.workspaceId)
  } else if (input.phone) {
    const normalized = normalizePhone(input.phone)
    if (!normalized.ok) fail(400, 'INVALID_PHONE', 'Invalid phone number.')
    const { data, error } = await admin
      .from('workspace_access')
      .select(ACCESS_COLUMNS)
      .eq('phone_number', normalized.normalized)
      .maybeSingle()
    if (error) throw error
    current = (data ?? null) as unknown as WorkspaceAccessRow | null
  } else {
    const normalizedEmail = (input.email ?? '').trim().toLowerCase()
    const { data, error } = await admin
      .from('promo_codes')
      .select('redeemed_by_workspace_id')
      .eq('redeemed_email', normalizedEmail)
      .not('redeemed_by_workspace_id', 'is', null)
      .maybeSingle()
    if (error) throw error
    const workspaceId = (data as unknown as { redeemed_by_workspace_id: string | null } | null)
      ?.redeemed_by_workspace_id
    if (!workspaceId) fail(404, 'NOT_FOUND', 'Workspace access record not found.')
    current = await fetchAccess(workspaceId)
  }

  if (!current) fail(404, 'NOT_FOUND', 'Workspace access record not found.')

  const id = current.workspace_id
  const used = current.heavy_tasks_used ?? 0
  let before = current.heavy_tasks_limit

  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await admin
      .from('workspace_access')
      .update({ heavy_tasks_limit: before + input.extra, updated_at: new Date().toISOString() })
      .eq('workspace_id', id)
      .eq('heavy_tasks_limit', before)
      .select('workspace_id, heavy_tasks_limit, heavy_tasks_used')
      .maybeSingle()
    if (error) throw error
    if (data) {
      return { workspaceId: id, before, after: before + input.extra, used }
    }
    const refreshed = await fetchAccess(id)
    if (!refreshed) fail(404, 'NOT_FOUND', 'Workspace access record not found.')
    before = refreshed.heavy_tasks_limit
  }

  fail(409, 'CONFLICT', 'Concurrent update conflict, retry.')
}