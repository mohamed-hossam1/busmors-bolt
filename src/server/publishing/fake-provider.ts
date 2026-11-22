import 'server-only'
import type { PublishOutcome, PublishingProvider } from './provider'

/**
 * Development and tests only (PUBLISHING_PROVIDER=fake; refused in production by
 * getPublishingProvider). Its Page name always contains "(fake)", and its results
 * must never be cited as real publishing evidence.
 */
export const fakeProvider: PublishingProvider = {
  name: 'fake',

  async startConnection(_workspaceId, callbackUrl) {
    return { redirectUrl: callbackUrl + (callbackUrl.includes('?') ? '&' : '?') + 'fake_status=success' }
  },

  async completeConnection(workspaceId, callbackParams) {
    return callbackParams.get('fake_status') === 'success' ? { ok: true, connectionRef: 'fake:' + workspaceId } : { ok: false, reason: 'denied' }
  },

  async verifyConnection(workspaceId, connectionRef) {
    return connectionRef === 'fake:' + workspaceId
  },

  async listPages() {
    return [{ id: 'fake-page-1', name: 'Test Page (fake)' }]
  },

  async publishText(): Promise<PublishOutcome> {
    const outcome = (process.env.PUBLISHING_FAKE_OUTCOME ?? 'confirmed').trim()
    if (outcome === 'failed') return { kind: 'failed', code: 'invalid_request' }
    if (outcome === 'uncertain') return { kind: 'uncertain', code: 'unknown' }
    if (outcome === 'timeout') {
      await new Promise((resolve) => setTimeout(resolve, 21_000))
      return { kind: 'uncertain', code: 'timeout' }
    }
    return { kind: 'confirmed', providerPostId: 'fake_' + crypto.randomUUID(), permalink: null, evidence: { fake: true } }
  },

  async disconnect() {},
}
