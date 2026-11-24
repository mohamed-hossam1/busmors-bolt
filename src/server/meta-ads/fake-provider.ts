import 'server-only'
import type { AdAccount, InsightsQuery, RawRow, TransportResult } from '../../features/meta-ads/contracts'
import type { MetaAdsProvider } from './provider'

/*
 * Development and tests only (META_ADS_PROVIDER=fake; refused in production by
 * getMetaAdsProvider). One fixed dataset, no env options. Imports are relative only,
 * and this file must never import composio-provider.ts or @composio/core.
 */

const M = 'onsite_conversion.messaging_conversation_started_7d'
const CURVE = [100, 72, 58, 49, 43, 39, 36, 33, 31, 29, 27, 26, 25, 24, 23, 22, 19, 17, 15, 12, 10, 8]

const PERIOD_ROW: RawRow = { spend: '700.00', impressions: '20000', reach: '9000', frequency: '2.22', clicks: '300', ctr: '1.5', cpc: '2.33', cpm: '35', actions: [{ action_type: M, value: '38' }] }

const DAILY_ROWS: RawRow[] = [
  { date_start: '2026-11-03', spend: '300', impressions: '8000', clicks: '120', reach: '5000', actions: [{ action_type: M, value: '15' }] },
  { date_start: '2026-11-01', spend: '200', impressions: '6000', clicks: '90', reach: '5000', actions: [{ action_type: M, value: '10' }] },
  { date_start: '2026-11-02', spend: '200', impressions: '6000', clicks: '90', reach: '5000', actions: [{ action_type: M, value: '13' }] },
]

const AD_ROWS: RawRow[] = [
  { ad_id: '1', ad_name: 'Reel A', campaign_name: 'Camp 1', objective: 'OUTCOME_ENGAGEMENT', spend: '400', impressions: '12000', clicks: '150', ctr: '1.25',
    actions: [{ action_type: M, value: '25' }, { action_type: 'video_view', value: '3000' }],
    video_thruplay_watched_actions: [{ action_type: 'video_view', value: '600' }],
    video_play_curve_actions: [{ action_type: 'video_view', value: CURVE }] },
  { ad_id: '2', ad_name: 'Post B', campaign_name: 'Camp 1', objective: 'OUTCOME_ENGAGEMENT', spend: '250', impressions: '7000', clicks: '100', ctr: '1.4',
    actions: [{ action_type: M, value: '10' }] },
  { ad_id: '3', ad_name: 'Traffic C', campaign_name: 'Camp 2', objective: 'OUTCOME_TRAFFIC', spend: '50', impressions: '900', clicks: '40', ctr: '4.44' },
  { ad_id: '4', ad_name: 'Tiny D', campaign_name: 'Camp 2', objective: null, spend: '0', impressions: '100', clicks: '0', ctr: '0' },
]

const ACCOUNTS: AdAccount[] = [
  { id: 'act_1001', name: 'Demo Shop', currency: 'EGP', timezoneName: 'Africa/Cairo', active: true },
  { id: 'act_1002', name: 'Demo Clinic', currency: 'EGP', timezoneName: 'Africa/Cairo', active: true },
]

function fakeAccountId(workspaceId: string): string {
  return 'fake_' + workspaceId.replace(/-/g, '').slice(0, 20)
}

export const fakeMetaAdsProvider: MetaAdsProvider = {
  name: 'fake',

  async startConnection(workspaceId, callbackUrl) {
    return { redirectUrl: callbackUrl + (callbackUrl.includes('?') ? '&' : '?') + 'status=success&connected_account_id=' + fakeAccountId(workspaceId) }
  },

  async completeConnection(workspaceId, callbackParams) {
    if (callbackParams.get('status') !== 'success') return { ok: false, reason: 'denied' }
    if (callbackParams.get('connected_account_id') === fakeAccountId(workspaceId)) return { ok: true, connectionRef: 'fake:' + workspaceId }
    return { ok: false, reason: 'invalid' }
  },

  async verifyConnection(workspaceId, connectionRef) {
    return connectionRef === 'fake:' + workspaceId
  },

  async listAdAccounts(): Promise<TransportResult<AdAccount[]>> {
    return { ok: true, value: ACCOUNTS.map((account) => ({ ...account })) }
  },

  async getInsights(_workspaceId, _connectionRef, query: InsightsQuery): Promise<TransportResult<RawRow[]>> {
    if (query.level === 'ad') return { ok: true, value: AD_ROWS }
    return { ok: true, value: query.daily ? DAILY_ROWS : [PERIOD_ROW] }
  },

  async disconnect() {},
}