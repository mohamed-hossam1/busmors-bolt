export interface SyncConfig { staleMs: number; cooldownMs: number }
export const DEFAULT_SYNC_CONFIG: SyncConfig = { staleMs: 5 * 3600_000, cooldownMs: 30 * 60_000 }
export interface SyncState { manual: boolean; fetchedAt: Date | null; lastManualSyncAt: Date | null }
export type SyncDecision = { action: 'sync' } | { action: 'skip'; reason: 'fresh' | 'cooldown'; retryAt?: string }

export function decideSync(state: SyncState, now: Date, config: SyncConfig = DEFAULT_SYNC_CONFIG): SyncDecision {
  if (state.manual) {
    if (state.lastManualSyncAt && now.getTime() - state.lastManualSyncAt.getTime() < config.cooldownMs) {
      return { action: 'skip', reason: 'cooldown', retryAt: new Date(state.lastManualSyncAt.getTime() + config.cooldownMs).toISOString() }
    }
    return { action: 'sync' }
  }
  if (state.fetchedAt && now.getTime() - state.fetchedAt.getTime() < config.staleMs) {
    return { action: 'skip', reason: 'fresh' }
  }
  return { action: 'sync' }
}