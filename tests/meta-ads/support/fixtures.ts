export const M = 'onsite_conversion.messaging_conversation_started_7d'
export const ACCOUNT = { id: 'act_111', name: 'Zekra', currency: 'EGP', timezoneName: 'Africa/Cairo', active: true }
export const CURVE = [100, 72, 58, 49, 43, 39, 36, 33, 31, 29, 27, 26, 25, 24, 23, 22, 19, 17, 15, 12, 10, 8]

// Account-level, whole period. Results = 38 (period actions), deliberately different from
// the per-ad sum (35) to prove summary.results comes from the period row, not from ads.
export const PERIOD_ROW = { spend: '700.00', impressions: '20000', reach: '9000', frequency: '2.22', clicks: '300', ctr: '1.5', cpc: '2.33', cpm: '35', actions: [{ action_type: M, value: '38' }] }

// Account-level daily rows, deliberately out of order; each carries reach that must NOT be used.
export const DAILY_ROWS = [
  { date_start: '2026-11-03', spend: '300', impressions: '8000', clicks: '120', reach: '5000', actions: [{ action_type: M, value: '15' }] },
  { date_start: '2026-11-01', spend: '200', impressions: '6000', clicks: '90',  reach: '5000', actions: [{ action_type: M, value: '10' }] },
  { date_start: '2026-11-02', spend: '200', impressions: '6000', clicks: '90',  reach: '5000', actions: [{ action_type: M, value: '13' }] },
]

export const AD_ROWS = [
  { ad_id: '1', ad_name: 'Reel A', campaign_name: 'Camp 1', objective: 'OUTCOME_ENGAGEMENT', spend: '400', impressions: '12000', clicks: '150', ctr: '1.25',
    actions: [{ action_type: M, value: '25' }, { action_type: 'video_view', value: '3000' }],
    video_thruplay_watched_actions: [{ action_type: 'video_view', value: '600' }],
    video_play_curve_actions: [{ action_type: 'video_view', value: CURVE }] },
  { ad_id: '2', ad_name: 'Post B', campaign_name: 'Camp 1', objective: 'OUTCOME_ENGAGEMENT', spend: '250', impressions: '7000', clicks: '100', ctr: '1.4',
    actions: [{ action_type: M, value: '10' }] },
  { ad_id: '3', ad_name: 'Traffic C', campaign_name: 'Camp 2', objective: 'OUTCOME_TRAFFIC', spend: '50', impressions: '900', clicks: '40', ctr: '4.44' },
  { ad_id: '4', ad_name: 'Tiny D', campaign_name: 'Camp 2', objective: null, spend: '0', impressions: '100', clicks: '0', ctr: '0' },
]