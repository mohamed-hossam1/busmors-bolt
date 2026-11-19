// Deterministic orchestration checks; no provider or database network access.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createHarness } = require('./crawl-test-utils.cjs')

const copy = (value) => structuredClone(value)
const output = { reply: 'Saved answer', posts: [] }
const context = { facts: [], history: [], region: {} }
const task = (overrides = {}) => ({
  id: 'task', workspace_id: 'owner', conversation_id: 'chat', type: 'simple_answer',
  status: 'queued', version: 1, origin: { kind: 'direct', conversationId: 'chat' },
  user_request: 'Help with my business', checkpoint: { phase: 'route' },
  runner_id: null, run_id: null, allowance: { calls: 8 }, consumption: {},
  created_at: '2026-11-19T09:00:00Z', updated_at: '2026-11-19T09:00:00Z', ...overrides,
})
async function until(check) {
  for (let i = 0; i < 300; i++) {
    if (check()) return
    await new Promise(resolve => setTimeout(resolve, 2))
  }
  assert.fail('Timed out waiting for runner state')
}
function fixture(t, initial = task()) {
  const rows = [copy(initial)], calls = [], aiCalls = [], saved = []
  let run = 0
  const backend = {
    list: async () => copy(rows),
    context: async () => copy(context),
    ai: async (_task, operation, prompt) => {
      aiCalls.push({ operation, prompt: JSON.parse(prompt) })
      return { ok: true, text: JSON.stringify({ mode: 'reply', reply: 'Saved answer', intent: 'simple_answer', quantity: 1 }) }
    },
    async rpc(name, args) {
      calls.push({ name, args: copy(args) })
      const row = rows.find(item => item.id === args.p_task_id)
      if (name === 'recover_tasks') {
        for (const item of rows) {
          if (item.status === 'running' && (item.expired || item.runner_id === args.p_runner_id)) item.status = 'interrupted'
        }
        return 0
      }
      if (name === 'heartbeat_task') return null
      if (name === 'admit_task') {
        if (row.status !== 'queued') return null
        Object.assign(row, { status: 'running', runner_id: args.p_runner_id, run_id: `run-${++run}` })
        return copy(row)
      }
      if (name === 'record_task_step') return args.p_instance_id
      if (name === 'checkpoint_task') {
        row.checkpoint = copy(args.p_checkpoint)
        if (args.p_type) row.type = args.p_type
      } else if (name === 'stop_task') {
        row.status = args.p_status; row.result_summary = args.p_message
      } else if (name === 'resume_task') {
        row.status = 'queued'; row.run_id = null
      } else if (name === 'save_task_result') {
        saved.push(copy(args.p_result)); row.status = 'completed'
      } else throw Error(`Unexpected RPC ${name}`)
      return copy(row)
    },
  }
  const { BrowserTaskRunner } = createHarness({ extra: { setInterval, clearInterval } }).load('src/features/tasks/runner.ts')
  const runner = new BrowserTaskRunner(backend, 'this-tab')
  t.after(() => runner.stop())
  return { runner, backend, rows, calls, aiCalls, saved }
}

test('a stale foreign run is recovered during later refreshes, with explicit resume', async t => {
  const f = fixture(t, task({ status: 'running', runner_id: 'closed-tab', run_id: 'old-run' }))
  await f.runner.refresh()
  assert.equal(f.rows[0].status, 'running')
  f.rows[0].expired = true
  await f.runner.refresh()
  assert.equal(f.runner.tasks[0].status, 'interrupted')
  assert.equal(f.aiCalls.length, 0, 'Recovery must not regenerate work automatically')
  assert.deepEqual(f.calls.filter(c => c.name === 'recover_tasks').map(c => c.args.p_runner_id), ['this-tab', null])
})

test('temporary startup recovery failure is retried without a page reload', async t => {
  const f = fixture(t)
  const rpc = f.backend.rpc
  let fail = true
  f.backend.rpc = async (name, args) => {
    if (name === 'recover_tasks' && fail) { fail = false; throw Error('Offline') }
    return rpc(name, args)
  }
  await f.runner.start()
  assert.match(f.runner.error, /could not be refreshed/)
  await f.runner.refresh()
  await until(() => f.rows[0].status === 'completed')
  assert.equal(f.saved.length, 1)
})

test('a superseded browser execution aborts and never heartbeats the new run', async t => {
  const f = fixture(t)
  let signal
  f.backend.ai = async (_task, _operation, _prompt, abortSignal) => {
    signal = abortSignal
    return new Promise(resolve => signal.addEventListener('abort', () => resolve({ ok: false, text: '' }), { once: true }))
  }
  await f.runner.refresh()
  await until(() => signal)
  const oldRun = f.rows[0].run_id
  Object.assign(f.rows[0], { run_id: 'replacement-run', runner_id: 'another-tab' })
  await f.runner.refresh()
  assert.equal(signal.aborted, true)
  assert(f.calls.filter(c => c.name === 'heartbeat_task').every(c => c.args.p_run_id === oldRun))
  assert.equal(f.saved.length, 0)
})

test('resumed generation reloads eligible context instead of a deleted fact snapshot', async t => {
  const f = fixture(t, task({ checkpoint: {
    phase: 'generate', route: { mode: 'task', intent: 'simple_answer', reply: '', quantity: 1 },
    context: { ...context, facts: [{ id: 'deleted-fact', summary: 'Obsolete price' }] },
    contextRefs: [{ nodeId: 'deleted-fact', version: 1 }],
  } }))
  await f.runner.refresh()
  await until(() => f.rows[0].status === 'completed')
  assert.deepEqual(f.aiCalls[0].prompt.context.facts, [])
  assert.deepEqual(f.rows[0].checkpoint.contextRefs, [])
})

test('failed result saving resumes the checkpoint without a second model call', async t => {
  const f = fixture(t)
  const rpc = f.backend.rpc
  let failSave = true
  f.backend.rpc = async (name, args) => {
    if (name === 'save_task_result' && failSave) { failSave = false; throw Error('Temporary database failure') }
    return rpc(name, args)
  }
  await f.runner.refresh()
  await until(() => f.rows[0].status === 'interrupted')
  assert.deepEqual(f.rows[0].checkpoint.output, output)
  const count = f.aiCalls.length
  await f.runner.resume(f.rows[0])
  await until(() => f.rows[0].status === 'completed')
  assert.equal(f.aiCalls.length, count)
  assert.deepEqual(f.saved, [output])
})

test('owner cancellation aborts the provider and cannot save a late result', async t => {
  const f = fixture(t)
  let signal
  f.backend.ai = async (_task, _operation, _prompt, abortSignal) => {
    signal = abortSignal
    return new Promise(resolve => signal.addEventListener('abort', () => resolve({ ok: true, text: JSON.stringify({ mode: 'reply', reply: 'Late answer', intent: 'simple_answer', quantity: 1 }) }), { once: true }))
  }
  await f.runner.refresh()
  await until(() => signal)
  await f.runner.cancel(f.rows[0])
  assert.equal(signal.aborted, true)
  assert.equal(f.rows[0].status, 'cancelled')
  assert.equal(f.saved.length, 0)
})

test('unfinished tasks are paged independently of the latest 100 history items', async () => {
  const rows = Array.from({ length: 110 }, (_, i) => task({ id: `done-${i}`, status: 'completed', created_at: `2026-11-19T10:${String(i % 60).padStart(2, '0')}:00Z` }))
  rows.push(...Array.from({ length: 250 }, (_, i) => task({ id: `queued-${i}` })))
  const db = { from: () => {
    let selected = [...rows]
    const q = {
      select: () => q, eq: () => q,
      order: (key, options) => { selected.sort((a, b) => a[key].localeCompare(b[key]) * (options?.ascending === false ? -1 : 1)); return q },
      in: (key, values) => { selected = selected.filter(row => values.includes(row[key])); return q },
      range: (start, end) => Promise.resolve({ data: selected.slice(start, end + 1), error: null }),
      limit: n => Promise.resolve({ data: selected.slice(0, n), error: null }),
    }
    return q
  } }
  const { taskBackend } = createHarness({ db }).load('src/features/tasks/backend.ts')
  const loaded = await taskBackend('owner').list()
  assert.equal(loaded.filter(row => row.status === 'queued').length, 250)
  assert.equal(loaded.filter(row => row.status === 'completed').length, 100)
  assert.equal(new Set(loaded.map(row => row.id)).size, loaded.length)
})
