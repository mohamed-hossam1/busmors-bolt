import type { AdAccount, InsightsQuery, MetaAdsErrorCode, MetaAdsTransport, RawRow, TransportResult } from '../../../src/features/meta-ads/contracts'
import { ACCOUNT, PERIOD_ROW, DAILY_ROWS, AD_ROWS } from './fixtures'

export interface FakeTransportOptions {
  failOn?: { level: 'account' | 'ad'; daily: boolean; code: MetaAdsErrorCode }
  rejectVideoFields?: boolean
}

const VIDEO_FIELD_A = 'video_play_curve_actions'
const VIDEO_FIELD_B = 'video_thruplay_watched_actions'

/**
 * A strict read-only MetaAdsTransport. It records every getInsights query in order,
 * and its Proxy throws on any property access beyond the two transport methods so a
 * test fails loudly if runSync reaches for anything it should not touch.
 */
export function fakeTransport(options: FakeTransportOptions = {}): { transport: MetaAdsTransport; calls: InsightsQuery[] } {
  const { failOn, rejectVideoFields } = options
  const calls: InsightsQuery[] = []

  async function getInsights(_workspaceId: string, _connectionRef: string, query: InsightsQuery): Promise<TransportResult<RawRow[]>> {
    calls.push(query)

    if (failOn && failOn.level === query.level && failOn.daily === query.daily) {
      return { ok: false, code: failOn.code }
    }

    const asksForVideo = query.fields.includes(VIDEO_FIELD_A) || query.fields.includes(VIDEO_FIELD_B)
    if (rejectVideoFields && asksForVideo) {
      return { ok: false, code: 'invalid_request' }
    }

    if (query.level === 'ad') {
      const rows: RawRow[] = AD_ROWS.map((row) => ({ ...row }))
      if (!asksForVideo) {
        for (const row of rows) {
          delete row[VIDEO_FIELD_A]
          delete row[VIDEO_FIELD_B]
        }
      }
      return { ok: true, value: rows }
    }

    if (query.daily) return { ok: true, value: [...DAILY_ROWS] }
    return { ok: true, value: [{ ...PERIOD_ROW }] }
  }

  async function listAdAccounts(): Promise<TransportResult<AdAccount[]>> {
    return { ok: true, value: [{ ...ACCOUNT }] }
  }

  const base: MetaAdsTransport = { listAdAccounts, getInsights }
  const transport = new Proxy(base, {
    get(target, key) {
      if (key === 'then') return undefined
      if (key === 'listAdAccounts' || key === 'getInsights') return target[key]
      throw new Error('unexpected property ' + String(key))
    },
  })

  return { transport, calls }
}