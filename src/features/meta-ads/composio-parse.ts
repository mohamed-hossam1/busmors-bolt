import type { AdAccount, InsightsQuery, MetaAdsErrorCode, RawRow } from './contracts'
import { num } from './contracts'

/**
 * Pure parsing helpers for Composio `metaads` responses. The Graph payload is
 * sometimes the tool result itself and sometimes wrapped in `response_data`, so
 * both shapes are handled here. No network, no throwing.
 */

function bodyOf(data: unknown): Record<string, unknown> | undefined {
  return ((data as Record<string, unknown> | undefined)?.response_data ?? data) as Record<string, unknown> | undefined
}

/** Returns the insights/account rows from either the `data` or `response_data.data` shape. */
export function unwrapRows(data: unknown): RawRow[] {
  const body = bodyOf(data)
  if (Array.isArray(body?.data)) return body.data as RawRow[]
  const nested = body?.data as Record<string, unknown> | undefined
  if (nested && Array.isArray(nested.data)) return nested.data as RawRow[]
  return []
}

/** Returns `paging.cursors.after` only when a `paging.next` link is present. */
export function nextCursor(data: unknown): string | undefined {
  const body = bodyOf(data)
  const paging = body?.paging as { next?: unknown; cursors?: { after?: unknown } } | undefined
  if (!paging?.next) return undefined
  const after = paging.cursors?.after
  return typeof after === 'string' ? after : undefined
}

/** Normalises Graph `me/adaccounts` rows into `AdAccount`s, dropping invalid ones. */
export function parseAdAccounts(rows: RawRow[]): AdAccount[] {
  const accounts: AdAccount[] = []
  for (const row of rows) {
    const rawId = row.id
    let id = typeof rawId === 'string' ? rawId : typeof rawId === 'number' ? String(rawId) : ''
    if (/^[0-9]+$/.test(id)) id = 'act_' + id
    if (!/^act_[0-9]{1,30}$/.test(id)) continue
    const currency = typeof row.currency === 'string' ? row.currency : ''
    if (!/^[A-Z]{3}$/.test(currency)) continue
    const timezoneName = typeof row.timezone_name === 'string' && row.timezone_name !== '' ? row.timezone_name : ''
    if (!timezoneName) continue
    const name = typeof row.name === 'string' && row.name !== '' ? row.name : id
    const active = num(row.account_status) === 1
    accounts.push({ id, name, currency, timezoneName, active })
  }
  return accounts
}

/** Maps a Meta/Composio error message to a stable error code. */
export function metaErrorCode(message: string): MetaAdsErrorCode {
  if (/expired|session has been invalidated|\b190\b|re-?authenticat|access token/i.test(message)) return 'auth_expired'
  if (/permission|not authori[sz]ed|\(#200\)|\(#10\)|\b(200|10)\b.*permission/i.test(message)) return 'permission_denied'
  if (/invalid|required|\(#100\)|parameter|too long/i.test(message)) return 'invalid_request'
  return 'provider_error'
}

/**
 * Builds the `METAADS_GET_INSIGHTS` arguments. `fields` is always sent as a single
 * comma-separated string. `action_attribution_windows` is deliberately omitted so the
 * tool default `[7d_click]` is used (see metaads-tools.md, note 3).
 */
export function insightsArguments(query: InsightsQuery, after?: string): Record<string, unknown> {
  const args: Record<string, unknown> = {
    object_id: query.adAccountId,
    level: query.level,
    date_preset: query.datePreset,
    fields: query.fields.join(','),
    limit: 100,
  }
  if (query.daily) args.time_increment = 1
  if (after) args.after = after
  return args
}

/**
 * Builds the `METAADS_GET_AD_ACCOUNTS` arguments. The tool has no paging cursor and
 * returns a single page, so this takes no parameters.
 */
export function listAccountsArguments(): Record<string, unknown> {
  return { fields: 'id,name,currency,timezone_name,account_status', limit: 100 }
}