import test from 'node:test'
import assert from 'node:assert/strict'
import { publishPost, type PublishBackend } from '../../src/server/publishing/publish-core.ts'
import { fakeProvider } from '../../src/server/publishing/fake-provider.ts'

function setEnv(key: string, value: string | undefined): void {
  ;(process.env as Record<string, string | undefined>)[key] = value
}

function makeBackend(): { db: PublishBackend; calls: { name: string; args: Record<string, unknown> }[] } {
  const calls: { name: string; args: Record<string, unknown> }[] = []
  const db: PublishBackend = {
    async rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
      calls.push({ name, args })
      if (name === 'claim_post_publish') {
        return {
          state: 'claimed',
          attemptId: 'attempt-1',
          workspaceId: 'workspace-1',
          pageId: 'page-1',
          connectionRef: 'connection-1',
          message: 'A test post',
          scheduleAt: null,
        } as T
      }
      return undefined as T
    },
  }
  return { db, calls }
}

test('publishing uses the isolated fake provider and records the result without real network', async () => {
  const previousProvider = process.env.PUBLISHING_PROVIDER
  const previousNodeEnv = process.env.NODE_ENV
  setEnv('PUBLISHING_PROVIDER', 'fake')
  setEnv('NODE_ENV', 'test')
  try {
    const { db, calls } = makeBackend()
    const result = await publishPost({ db, provider: fakeProvider }, 'post-1', 'now')

    assert.equal(result.state, 'confirmed')
    if (result.state === 'confirmed') assert.ok(result.permalink === null || typeof result.permalink === 'string')
    assert.ok(calls.some((call) => call.name === 'claim_post_publish'))
    const record = calls.find((call) => call.name === 'record_publish_result')
    assert.ok(record)
    assert.equal(record!.args.p_state, 'confirmed')
    assert.ok(String(record!.args.p_provider_id).startsWith('fake_'))
    assert.equal(record!.args.p_evidence && typeof record!.args.p_evidence === 'object', true)
    assert.equal((record!.args.p_evidence as { fake?: boolean }).fake, true)
  } finally {
    setEnv('PUBLISHING_PROVIDER', previousProvider)
    setEnv('NODE_ENV', previousNodeEnv)
  }
})

test('the fake publishing provider is refused in production', async () => {
  const previousProvider = process.env.PUBLISHING_PROVIDER
  const previousNodeEnv = process.env.NODE_ENV
  setEnv('PUBLISHING_PROVIDER', 'fake')
  setEnv('NODE_ENV', 'production')
  try {
    const { getPublishingProvider } = await import('../../src/server/publishing/provider.ts')
    assert.equal(getPublishingProvider(), null)
  } finally {
    setEnv('PUBLISHING_PROVIDER', previousProvider)
    setEnv('NODE_ENV', previousNodeEnv)
  }
})