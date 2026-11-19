// Local UI behavior only. Supabase and the AI gateway are intercepted in memory.
// No live provider, auth, publishing, or workspace data is used.
const { chromium, startTestApp } = require('./next-test-utils.cjs')
const { existsSync, mkdirSync } = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')

const workspace = '11111111-1111-4111-8111-111111111111'
const date = '2026-11-18T09:00:00Z'
const id = () => require('node:crypto').randomUUID()

function conversation(title) {
  return { id: id('conversation'), workspace_id: workspace, title, created_at: date }
}

async function main() {
  const root = path.resolve(__dirname, '..')
  const base = 'http://127.0.0.1:4186'
  const server = await startTestApp(4186, 'busmora-task-preview')

  const conversations = [conversation('First conversation'), conversation('Second conversation'), conversation('Third conversation')]
  const messages = []
  const tasks = []
  const inputs = []
  const steps = []
  const events = []
  const posts = []
  const deliverables = []
  const deliverableVersions = []
  const results = []
  const settings = { workspace_id: workspace, company_url: 'https://luma.example', onboarding_state: 'complete', country: 'Egypt', currency: 'EGP', timezone: 'Africa/Cairo', target_market: 'Local households', ui_language: 'en' }
  const facts = [
    { id: 'fact-1', workspace_id: workspace, category: 'company_profile', title: 'Luma Studio', summary: 'A fictional independent ceramics studio.', properties: {}, version: 1, status: 'approved', approval_state: 'approved', verification_state: 'owner_reported', is_current: true, created_at: date, updated_at: date },
    { id: 'fact-2', workspace_id: workspace, category: 'brand_rule', title: 'Warm, considered, human', summary: 'Speak simply.', properties: {}, version: 1, status: 'approved', approval_state: 'approved', verification_state: 'owner_reported', is_current: true, created_at: date, updated_at: date },
  ]

  // The fake gateway answers with deterministic text after a short delay so the
  // test can observe a Task while navigating and while another Task is running.
  async function gateway(body) {
    let payload = {}
    try { payload = JSON.parse(body.userPrompt) } catch { /* fixed prompt fallback */ }
    const request = String(payload.request ?? body.userPrompt ?? '')
    const answers = Array.isArray(payload.answers) ? payload.answers : []
    const requested = /(\d+)\s+social posts?/i.exec(request)?.[1]
    const quantity = Number(payload.quantity ?? requested ?? 2) || 1
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
    if (request.includes('break the model')) {
      await wait(150)
      return { text: 'this is not json' }
    }
    if (request.includes('Which audience')) {
      await wait(150)
      if (!answers.length) return { text: JSON.stringify({ mode: 'clarify', reply: 'One quick question.', intent: 'content_creation', quantity: 1, question: { label: 'Which audience should this speak to?', options: ['Local households', 'Independent shops'] } }) }
      return { text: JSON.stringify({ mode: 'reply', reply: 'Thanks — I will write for Local households.', intent: 'simple_answer', quantity: 1 }) }
    }
    if (request.includes('hello')) {
      await wait(100)
      return { text: JSON.stringify({ mode: 'reply', reply: 'Hello. What would you like to work on?', intent: 'simple_answer', quantity: 1 }) }
    }
    if (/social posts?/i.test(request)) {
      await wait(250)
      return { text: JSON.stringify({ mode: 'task', reply: 'I will prepare the drafts.', intent: 'content_creation', quantity }) }
    }
    await wait(150)
    return { text: JSON.stringify({ mode: 'reply', reply: 'Here is a useful answer from your saved context.', intent: 'simple_answer', quantity: 1 }) }
  }

  async function copyOutput(quantity) {
    await new Promise((resolve) => setTimeout(resolve, 8000))
    return { text: JSON.stringify({ posts: Array.from({ length: quantity }, (_, index) => ({ caption: `Owner-reviewed draft ${index + 1} for the fictional studio.`, hashtags: '#Example', visualBrief: 'Owner supplies a real product photo.', platform: index % 2 ? 'facebook' : 'instagram' })) }) }
  }

  function taskView(task) {
    return { ...task }
  }
  function pendingInput(taskId) { return inputs.find((input) => input.task_id === taskId && input.status === 'pending') }
  function runningCount() { return tasks.filter((task) => task.status === 'running').length }
  function touch(task) { task.updated_at = new Date().toISOString(); task.version += 1 }

  async function rpc(name, body) {
    if (['reserve_task_call','finish_task_call'].includes(name)) return null
    const now = new Date().toISOString()
    if (name === 'list_deliverables') {
      const search = String(body.p_search ?? '').trim().toLowerCase()
      let rows = deliverables.filter((item) => {
        if (body.p_type && item.type !== body.p_type) return false
        if (body.p_from && Date.parse(item.created_at) < Date.parse(body.p_from)) return false
        if (body.p_to && Date.parse(item.created_at) >= Date.parse(body.p_to)) return false
        if (search && !`${item.title} ${item.content}`.toLowerCase().includes(search)) return false
        if (body.p_before && !(Date.parse(item.created_at) < Date.parse(body.p_before) || Date.parse(item.created_at) === Date.parse(body.p_before) && item.id < body.p_before_id)) return false
        return true
      })
      rows = rows.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id.localeCompare(a.id))
      return rows.slice(0, Math.min(Number(body.p_limit ?? 20), 50))
    }
    if (name === 'update_deliverable') {
      const item = deliverables.find((row) => row.id === body.p_deliverable_id)
      if (!item) throw new Error('NOT_FOUND')
      if (item.version !== body.p_expected_version) throw new Error('STALE_VERSION')
      if (!String(body.p_title ?? '').trim() || !String(body.p_content ?? '')) throw new Error('INVALID_DOCUMENT')
      item.version += 1
      item.title = String(body.p_title).trim()
      item.content = String(body.p_content)
      item.updated_at = now
      deliverableVersions.push({ id: id('version'), workspace_id: workspace, deliverable_id: item.id, version: item.version, title: item.title, content: item.content, provenance: { editedBy: 'owner' }, source_refs: item.source_refs, context_refs: item.context_refs, limitations: item.limitations, created_at: now })
      return item
    }
    if (name === 'delete_deliverable') {
      const index = deliverables.findIndex((row) => row.id === body.p_deliverable_id)
      if (index < 0) throw new Error('NOT_FOUND')
      if (deliverables[index].version !== body.p_expected_version) throw new Error('STALE_VERSION')
      deliverables.splice(index, 1)
      for (let i = deliverableVersions.length - 1; i >= 0; i--) if (deliverableVersions[i].deliverable_id === body.p_deliverable_id) deliverableVersions.splice(i, 1)
      return null
    }
    if (name === 'bootstrap_workspace') return settings
    if (name === 'recover_tasks') {
      const changed = tasks.filter((task) => task.status === 'running' && (task.runner_id === body.p_runner_id || !task.heartbeat_at || Date.parse(task.heartbeat_at) < Date.now() - 120000))
      for (const task of changed) { task.status = 'interrupted'; task.result_summary = 'Browser execution interrupted'; touch(task) }
      return changed.length
    }
    if (name === 'enqueue_task') {
      const existing = tasks.find((task) => task.idempotency_key === body.p_idempotency_key)
      if (existing) return taskView(existing)
      const task = {
        id: id('task'), workspace_id: workspace, conversation_id: body.p_conversation_id, type: 'simple_answer', status: 'queued',
        user_request: body.p_request, origin: body.p_origin, idempotency_key: body.p_idempotency_key, request_hash: 'fictional',
        checkpoint: { phase: 'route' }, version: 1, run_id: null, runner_id: null, heartbeat_at: null, cancel_requested: false,
        allowance: { calls: 8, pages: 12, tokens: 16000, seconds: 240 }, consumption: {}, result_summary: null, created_at: now, updated_at: now,
      }
      tasks.push(task)
      messages.push({ id: id('message'), workspace_id: workspace, conversation_id: task.conversation_id, role: 'user', type: 'text', content: body.p_request, payload: { taskId: task.id }, created_at: now })
      return taskView(task)
    }
    if (name === 'admit_task') {
      const task = tasks.find((item) => item.id === body.p_task_id)
      if (!task || task.status !== 'queued' || task.cancel_requested) return null
      if (runningCount() >= 2) return null
      task.status = 'running'; task.run_id = id('run'); task.runner_id = body.p_runner_id; task.heartbeat_at = now
      touch(task)
      return taskView(task)
    }
    if (name === 'heartbeat_task') {
      const task = tasks.find((item) => item.id === body.p_task_id && item.status === 'running' && item.run_id === body.p_run_id)
      if (task) task.heartbeat_at = now
      return null
    }
    if (name === 'checkpoint_task') {
      const task = tasks.find((item) => item.id === body.p_task_id && item.status === 'running' && item.run_id === body.p_run_id)
      if (!task) throw new Error('RUN_NOT_ACTIVE')
      task.checkpoint = body.p_checkpoint
      if (body.p_type) task.type = body.p_type
      task.heartbeat_at = now
      touch(task)
      return taskView(task)
    }
    if (name === 'record_task_step') {
      const task = tasks.find((item) => item.id === body.p_task_id && item.status === 'running' && item.run_id === body.p_run_id)
      if (!task) throw new Error('RUN_NOT_ACTIVE')
      let step = steps.find((item) => item.id === body.p_instance_id)
      if (!step) {
        step = { id: body.p_instance_id, task_id: task.id, run_id: body.p_run_id, agent: body.p_agent, label: body.p_label, status: 'running', output: {}, position: steps.filter((item) => item.task_id === task.id).length, created_at: now }
        steps.push(step)
        events.push({ id: id('event'), workspace_id: workspace, task_id: task.id, run_id: task.run_id, instance_id: step.id, seq: events.length + 1, event_type: 'agent_started', agent_id: body.p_agent, payload: { task_summary: body.p_label }, created_at: now })
      } else {
        step.status = body.p_status
        step.output = body.p_output
        events.push({ id: id('event'), workspace_id: workspace, task_id: task.id, run_id: task.run_id, instance_id: step.id, seq: events.length + 1, event_type: body.p_status === 'completed' ? 'agent_completed' : 'agent_error', agent_id: body.p_agent, payload: { task_summary: body.p_label, result_summary: body.p_output?.summary }, created_at: now })
      }
      task.heartbeat_at = now
      return step.id
    }
    if (name === 'await_task_input') {
      const task = tasks.find((item) => item.id === body.p_task_id && item.status === 'running' && item.run_id === body.p_run_id)
      if (!task) throw new Error('RUN_NOT_ACTIVE')
      const existing = pendingInput(task.id)
      if (existing) return existing
      const input = { id: id('input'), workspace_id: workspace, task_id: task.id, version: 1, status: 'pending', schema: { fields: [{ name: 'answer', label: body.p_label, type: 'single', options: body.p_options }] }, answers: null, created_at: now }
      inputs.push(input)
      messages.push({ id: id('message'), workspace_id: workspace, conversation_id: task.conversation_id, role: 'agent', type: 'structured_form', content: body.p_label, payload: { ...input.schema, taskId: task.id, inputId: input.id, inputVersion: input.version, submitted: false }, created_at: now })
      task.status = 'awaiting_input'; task.run_id = null; touch(task)
      return input
    }
    if (name === 'answer_task_input') {
      const input = inputs.find((item) => item.id === body.p_input_id)
      if (!input) throw new Error('NOT_FOUND')
      const task = tasks.find((item) => item.id === input.task_id)
      if (!task || input.version !== body.p_expected_version || input.status !== 'pending' || task.status !== 'awaiting_input') throw new Error('STALE_VERSION')
      input.status = body.p_answer.status === 'skipped' ? 'skipped' : 'answered'
      input.answers = body.p_answer
      input.version += 1
      const form = messages.find((item) => item.payload?.inputId === input.id)
      if (form) form.payload = { ...form.payload, submitted: true, answer: body.p_answer }
      messages.push({ id: id('message'), workspace_id: workspace, conversation_id: task.conversation_id, role: 'user', type: 'text', content: body.p_answer.value || body.p_answer.status, payload: { taskId: task.id, inputId: input.id }, created_at: new Date().toISOString() })
      task.status = 'queued'; task.run_id = null; task.runner_id = null
      task.checkpoint = { ...task.checkpoint, answers: [...(task.checkpoint.answers ?? []), { question: input.schema, answer: body.p_answer }] }
      touch(task)
      return taskView(task)
    }
    if (name === 'save_task_result') {
      const task = tasks.find((item) => item.id === body.p_task_id && item.status === 'running' && item.run_id === body.p_run_id)
      const existing = results.find((item) => item.task_id === body.p_task_id)
      if (existing) return existing.output
      if (!task) throw new Error('RUN_NOT_ACTIVE')
      const output = { taskId: task.id, documentId: null, postIds: [] }
      if (body.p_result.document) {
        const document = { id: id('deliverable'), workspace_id: workspace, task_id: task.id, title: body.p_result.document.title, type: body.p_result.document.type, content: body.p_result.document.content, version: 1, origin: task.origin ?? { kind: 'direct' }, context_refs: [], source_refs: [], limitations: [], stale_reason: null, created_at: now, updated_at: now }
        deliverables.push(document)
        deliverableVersions.push({ id: id('version'), workspace_id: workspace, deliverable_id: document.id, version: 1, title: document.title, content: document.content, provenance: {}, source_refs: [], context_refs: [], limitations: [], created_at: now })
        output.documentId = document.id
        messages.push({ id: id('message'), workspace_id: workspace, conversation_id: task.conversation_id, role: 'agent', type: 'deliverable_card', content: document.title, payload: { deliverable_id: document.id, title: document.title, type: document.type, content: document.content, taskId: task.id }, created_at: now })
      }
      for (const item of body.p_result.posts ?? []) {
        const post = { id: id('post'), workspace_id: workspace, task_id: task.id, platform: item.platform, caption: item.caption, hashtags: item.hashtags, status: 'draft', execution_state: 'idle', approval_state: 'unapproved', created_at: now }
        posts.push(post); output.postIds.push(post.id)
        messages.push({ id: id('message'), workspace_id: workspace, conversation_id: task.conversation_id, role: 'agent', type: 'post_reference', content: 'Draft Post ready for review', payload: { postId: post.id, taskId: task.id, caption: post.caption, platform: post.platform }, created_at: now })
      }
      messages.push({ id: id('message'), workspace_id: workspace, conversation_id: task.conversation_id, role: 'agent', type: 'text_response', content: body.p_result.reply, payload: { taskId: task.id }, created_at: now })
      results.push({ task_id: task.id, output })
      task.status = body.p_partial ? 'partial' : 'completed'
      task.result_summary = body.p_result.reply.slice(0, 500)
      task.checkpoint = { ...task.checkpoint, phase: 'done', outputRefs: output }
      touch(task)
      return output
    }
    if (name === 'stop_task') {
      const task = tasks.find((item) => item.id === body.p_task_id)
      if (!task) throw new Error('NOT_FOUND')
      if (['completed', 'cancelled', 'partial'].includes(task.status)) return taskView(task)
      task.status = body.p_status
      task.result_summary = body.p_message
      task.cancel_requested = body.p_status === 'cancelled'
      messages.push({ id: id('message'), workspace_id: workspace, conversation_id: task.conversation_id, role: 'system', type: body.p_status === 'failed' ? 'error' : 'task_status', content: body.p_message, payload: { taskId: task.id, status: body.p_status }, created_at: now })
      touch(task)
      return taskView(task)
    }
    if (name === 'resume_task') {
      const task = tasks.find((item) => item.id === body.p_task_id)
      if (!task || task.version !== body.p_expected_version || !['failed', 'interrupted'].includes(task.status)) throw new Error('STALE_VERSION')
      task.status = 'queued'; task.run_id = null; task.runner_id = null; task.cancel_requested = false
      touch(task)
      return taskView(task)
    }
    throw new Error(`Unhandled RPC ${name}`)
  }

  function filterRows(rows, url) {
    return rows.filter((row) => [...url.searchParams].every(([key, value]) => {
      if (!value.startsWith('eq.')) return true
      return String(row[key]) === value.slice(3)
    }))
  }

  function sortRows(rows, url) {
    const order = url.searchParams.get('order')
    if (!order) return rows
    const [column, direction] = order.split('.')
    return [...rows].sort((a, b) => String(a[column] ?? '').localeCompare(String(b[column] ?? '')) * (direction === 'desc' ? -1 : 1))
  }

  const serverUrls = new Set()
  let browser
  try {
    for (let i = 0; i < 80; i++) { try { if ((await fetch(base)).ok) break } catch { /* starting */ } if (i === 79) throw Error('Next.js did not start'); await new Promise((resolve) => setTimeout(resolve, 250)) }
    browser = await chromium.launch({ headless: true, ...(existsSync('/usr/bin/google-chrome') ? { executablePath: '/usr/bin/google-chrome' } : {}), args: ['--no-sandbox'] })
    const context = await browser.newContext()
    await context.addInitScript(({ workspace }) => {
      localStorage.setItem('sb-busmora-task-preview-auth-token', JSON.stringify({ access_token: 'fictional-task-token', refresh_token: 'fictional-task-refresh', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer', user: { id: workspace, aud: 'authenticated', role: 'authenticated', email: 'hello@luma.example', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } }))
    }, { workspace })

    const { OPERATIONS } = require('./crawl-test-utils.cjs').createHarness().load('src/server/ai/operations.ts')
    await context.route('https://api.openai.com/v1/chat/completions', async route => {
      const provider = route.request().postDataJSON()
      const operation = Object.keys(OPERATIONS).find(key => OPERATIONS[key] === provider.messages[0].content)
      const body = { operation, userPrompt: provider.messages[1].content }
      const result = operation === 'copy' || operation === 'campaign'
        ? await copyOutput(JSON.parse(body.userPrompt).quantity || 1) : await gateway(body)
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: result.text }, finish_reason: 'stop' }], usage: { prompt_tokens: 30, completion_tokens: 30 } }) })
    })
    await context.route('https://busmora-task-preview.supabase.co/**', async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      serverUrls.add(url.pathname)
      const rpcName = url.pathname.includes('/rest/v1/rpc/') ? url.pathname.split('/').pop() : null
      if (rpcName) {
        try {
          const data = await rpc(rpcName, request.postDataJSON() ?? {})
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data ?? null) })
        } catch (error) {
          return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'P0001', message: error.message }) })
        }
      }
      const table = url.pathname.split('/').pop()
      let rows = table === 'workspace_settings' ? [settings]
        : table === 'conversations' ? conversations
        : table === 'messages' ? messages
        : table === 'tasks' ? tasks.map(taskView)
        : table === 'brain_nodes' ? facts
        : table === 'agent_events' ? events
        : table === 'deliverables' ? deliverables
        : table === 'deliverable_versions' ? deliverableVersions
        : []
      if (request.method() === 'POST') {
        const payload = request.postDataJSON()
        const values = Array.isArray(payload) ? payload : [payload]
        const inserted = values.map((row) => ({ id: id(table), workspace_id: workspace, created_at: date, ...row }))
        if (table === 'conversations') conversations.push(...inserted)
        else if (table === 'messages') messages.push(...inserted)
        return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(Array.isArray(payload) ? inserted : inserted[0]) })
      }
      if (request.method() === 'DELETE') {
        const remove = new Set(filterRows(rows, url).map((row) => row.id))
        if (table === 'conversations') for (let i = conversations.length - 1; i >= 0; i--) if (remove.has(conversations[i].id)) conversations.splice(i, 1)
        return route.fulfill({ status: 204, body: '' })
      }
      rows = sortRows(filterRows(rows, url), url)
      if (url.searchParams.has('limit')) rows = rows.slice(0, Number(url.searchParams.get('limit')))
      const wantsObject = (request.headers().accept ?? '').includes('object') || url.pathname.endsWith('.single')
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(wantsObject ? rows[0] ?? null : rows) })
    })

    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    mkdirSync(path.join(root, 'artifacts/next-migration'), { recursive: true })
    await page.goto(base + '/employee', { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(1000)
    await page.getByLabel('Message your Marketing Director').waitFor()

    const input = page.getByLabel('Message your Marketing Director')
    const send = page.getByRole('button', { name: 'Send message' })
    async function submit(text) {
      await input.fill(text)
      if ((await input.inputValue()) !== text) {
        await page.waitForTimeout(200)
        await input.fill(text)
      }
      await send.click()
    }
    async function selectConversation(title) {
      await page.getByRole('button', { name: 'Chat History' }).click()
      await page.getByText(title, { exact: true }).click()
      await input.waitFor()
    }

    // One Task can start, keep running while the user opens Brain, and finish
    // after returning. The runner is mounted above route pages.
    await submit('Write 3 social posts for my main product')
    await page.getByText('In Progress').waitFor()
    await page.getByRole('link', { name: 'Brain' }).click()
    await page.getByRole('button', { name: 'Delete', exact: true }).first().waitFor()
    await page.waitForTimeout(500)
    await page.getByRole('link', { name: 'Marketing Director' }).click()
    await page.getByText('3 draft Posts are ready for your review in Scheduling.').waitFor({ timeout: 15000 })
    assert.equal(posts.length, 3, 'Completion must persist every requested Post')
    assert(tasks[0].status === 'completed', 'Task must finish while its route was unmounted')
    assert(steps.filter((step) => step.task_id === tasks[0].id).every((step) => ['orchestrator', 'content_writer'].includes(step.agent)), 'No fabricated specialist may run for a copy task')
    // The graph and its chronological detail panel show exactly the persisted
    // step instances: no planned or invented nodes.
    const recordedInstances = new Set(steps.filter((step) => step.task_id === tasks[0].id).map((step) => step.id))
    const recordedButton = page.getByRole('button', { name: /Recorded steps/ })
    await recordedButton.waitFor()
    assert.equal(await page.locator('.react-flow__node').count(), recordedInstances.size, 'Canvas shows one node per recorded step instance')
    assert((await recordedButton.innerText()).includes(String(recordedInstances.size)), 'Timeline count matches recorded events')

    // Start three NEW tasks while the copy gateway is still running. The first
    // navigation scenario has completed already and cannot fill an active slot.
    await selectConversation('Second conversation')
    await submit('Write 2 social posts for my main product')
    await page.getByText('In Progress').waitFor()
    await selectConversation('Third conversation')
    await submit('Write 1 social post for my main product')
    await selectConversation('First conversation')
    await submit('Write 1 social post for my main product')
    await page.waitForTimeout(400)
    assert.equal(tasks.filter((task) => task.status === 'running').length, 2, 'Only two Tasks may run at once')
    assert.equal(tasks.filter((task) => task.status === 'queued').length, 1, 'The third Task must queue')

    await page.waitForTimeout(3000)
    await page.reload()
    await page.getByLabel('Message your Marketing Director').waitFor()
    const eventually = async (check, timeout = 35000) => { const start = Date.now(); while (Date.now() - start < timeout) { if (check()) return; await page.waitForTimeout(150) } throw new Error('Timed out waiting for condition') }
    await eventually(() => tasks.every((task) => task.status === 'completed'))
    assert.equal(tasks.filter(task => task.status === 'interrupted').length, 0, 'Reload must not interrupt server work')
    assert.equal(posts.length, 7, 'Queued work must run after a slot frees')
    assert.equal(new Set(posts.map((post) => post.id)).size, 7, 'Duplicate result saves must not duplicate outputs')

    // A structured answer survives reload and resumes the same Task.
    await input.fill('Which audience should this speak to?')
    await send.click()
    await page.getByRole('button', { name: 'Local households' }).waitFor()
    const taskId = tasks[tasks.length - 1].id
    await page.reload()
    await page.getByRole('button', { name: 'Local households' }).waitFor()
    assert.equal(tasks.find((task) => task.id === taskId).status, 'awaiting_input')
    await page.getByRole('button', { name: 'Local households' }).click()
    await page.getByRole('button', { name: 'Save answer and continue' }).click()
    await page.getByText('Thanks — I will write for Local households.').waitFor({ timeout: 15000 })
    const answered = tasks.find((task) => task.id === taskId)
    assert.equal(answered.status, 'completed')
    assert.equal(answered.checkpoint.answers.length, 1)

    // Invalid provider output stops with truthful recovery instead of canned work.
    const before = posts.length
    await input.fill('break the model')
    await send.click()
    await page.getByText('The model request failed. Saved progress is kept; retry when the connection is available.').waitFor({ timeout: 15000 })
    const failedTask = tasks[tasks.length - 1]
    const failVersion = failedTask.version
    await page.getByRole('button', { name: 'Resume task' }).click()
    await eventually(() => failedTask.version > failVersion && failedTask.status === 'failed')
    await page.getByText('The model request failed. Saved progress is kept; retry when the connection is available.').last().waitFor({ timeout: 15000 })
    assert.equal(posts.length, before, 'A failed model response must not create Posts')
    assert.equal(deliverables.length, 0, 'A failed model response must not create a document')

    // A simple greeting is answered directly without any specialist steps.
    const stepCount = steps.length
    await input.fill('hello there')
    await send.click()
    await page.getByText('Hello. What would you like to work on?').waitFor({ timeout: 15000 })
    assert.equal(steps.length, stepCount + 2, 'A greeting runs only context loading and routing, not a specialist')
    assert.deepEqual([...new Set(steps.slice(stepCount).map((step) => step.agent))].sort(), ['orchestrator'])

    // Exact task links select an older task even in the current conversation,
    // then let the owner navigate normally instead of forcing them back.
    await page.goto(base + `/employee?task=${tasks[0].id}`)
    await page.waitForFunction(id => document.querySelector('select[aria-label="Selected task"]')?.value === id, tasks[0].id)
    await selectConversation('Third conversation')
    await page.waitForTimeout(3000)
    assert(await page.getByLabel('Selected task').evaluate((element, id) => ![...element.options].some(option => option.value === id), tasks[0].id), 'Task navigation remains conversation-scoped')
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 })
      await page.waitForTimeout(150)
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `No overflow at ${width}px`)
      await page.screenshot({ path: path.join(root, `artifacts/next-migration/task-runner-${width}.png`) })
    }

    // C12: the budget-extension message kind renders truthfully and links to
    // the exact saved Task. A document card opens the exact saved document.
    await page.setViewportSize({ width: 1440, height: 900 })
    const budgetTask = tasks[0]
    messages.push({ id: id('message'), workspace_id: workspace, conversation_id: budgetTask.conversation_id, role: 'agent', type: 'budget_extension_request', content: 'This task reached its saved model allowance.', payload: { taskId: budgetTask.id, used: 8, limit: 8 }, created_at: new Date().toISOString() })
    await page.goto(base + `/employee?task=${budgetTask.id}`)
    await page.getByText('Model allowance reached').waitFor({ timeout: 15000 })
    await page.getByText('8 of 8 model calls used.').waitFor()
    await page.getByRole('link', { name: 'Answer in Chat' }).waitFor()

    const document = { id: id('deliverable'), workspace_id: workspace, task_id: budgetTask.id, title: 'Exact linked report', type: 'general', content: 'Saved deep-link document body.', version: 1, origin: { kind: 'direct' }, context_refs: [], source_refs: [], limitations: [], stale_reason: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    deliverables.push(document)
    deliverableVersions.push({ id: id('version'), workspace_id: workspace, deliverable_id: document.id, version: 1, title: document.title, content: document.content, provenance: {}, source_refs: [], context_refs: [], limitations: [], created_at: document.created_at })
    messages.push({ id: id('message'), workspace_id: workspace, conversation_id: budgetTask.conversation_id, role: 'agent', type: 'deliverable_card', content: document.title, payload: { deliverable_id: document.id, title: document.title, type: document.type, content: document.content, taskId: budgetTask.id }, created_at: new Date().toISOString() })
    await page.getByRole('link', { name: 'Documents' }).waitFor({ timeout: 15000 })
    await page.getByRole('link', { name: 'Documents' }).click()
    const documentDialog = page.getByRole('dialog', { name: document.title })
    await documentDialog.waitFor()
    await documentDialog.getByText('Saved deep-link document body.').waitFor()

    // C16: bounded search/type/date filters, cursor pagination, immutable edit
    // versions, retry that keeps editor text, and exact continuation lineage.
    deliverables.length = 0
    deliverableVersions.length = 0
    const addDocument = (index, type, day) => {
      const doc = {
        id: `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        workspace_id: workspace, task_id: null, title: `Saved note ${index}`, type,
        content: `Original body ${index}.`, version: 1, origin: { kind: 'direct' },
        context_refs: [], source_refs: [], limitations: [], stale_reason: null,
        created_at: `2026-11-${day}T10:${String(index).padStart(2, '0')}:00.000Z`,
        updated_at: `2026-11-${day}T10:${String(index).padStart(2, '0')}:00.000Z`,
      }
      deliverables.push(doc)
      deliverableVersions.push({ id: `20000000-0000-4000-8000-${String(index).padStart(12, '0')}`, workspace_id: workspace, deliverable_id: doc.id, version: 1, title: doc.title, content: doc.content, provenance: {}, source_refs: [], context_refs: [], limitations: [], created_at: doc.created_at })
      return doc
    }
    for (let i = 1; i <= 10; i++) addDocument(i, [4, 5, 6, 7].includes(i) ? 'research_report' : 'general', i <= 5 ? '10' : '11')
    await page.goto(base + '/deliverables')
    await page.getByText('8 saved documents loaded so far', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Load more documents' }).click()
    await page.getByText('10 saved documents', { exact: true }).waitFor()

    const searchBox = page.getByLabel('Search saved documents')
    await searchBox.fill('Saved note 3')
    await page.getByText('1 saved document', { exact: true }).waitFor()
    await page.getByRole('heading', { name: 'Saved note 3' }).waitFor()
    await searchBox.fill('')
    await page.getByText('8 saved documents loaded so far', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Research Report' }).click()
    await page.getByText('4 saved documents in Research Report', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Deliverables', exact: true }).click()
    await page.getByLabel('From date').fill('2026-11-11')
    await page.getByText('5 saved documents', { exact: true }).waitFor()
    await page.getByLabel('From date').fill('')
    await page.getByText('8 saved documents loaded so far', { exact: true }).waitFor()

    await searchBox.fill('Saved note 3')
    await page.getByText('1 saved document', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'View', exact: true }).click()
    let noteDialog = page.getByRole('dialog', { name: 'Saved note 3' })
    await noteDialog.getByText('Original body 3.').waitFor()
    await noteDialog.getByRole('button', { name: 'Edit' }).click()
    await noteDialog.getByLabel('Title').fill('Saved note 3 revised')
    await noteDialog.getByLabel('Content').fill('Revised body 3.')
    // A concurrent version change makes the save fail without clearing the editor.
    const edited = deliverables.find((item) => item.title === 'Saved note 3')
    edited.version = 2
    await noteDialog.getByRole('button', { name: 'Save new version' }).click()
    await noteDialog.getByRole('alert').waitFor()
    assert.equal(await noteDialog.getByLabel('Content').inputValue(), 'Revised body 3.', 'Failed save must retain the editor text')
    edited.version = 1
    await noteDialog.getByRole('button', { name: 'Save new version' }).click()
    noteDialog = page.getByRole('dialog', { name: 'Saved note 3 revised' })
    await noteDialog.getByText('Version 2 saved. Version 1 remains available.').waitFor()
    await noteDialog.getByLabel('Document version').waitFor()
    await noteDialog.getByLabel('Document version').selectOption('1')
    await noteDialog.getByText('Original body 3.').waitFor()
    await noteDialog.getByLabel('Document version').selectOption('2')
    await noteDialog.getByText('Revised body 3.').waitFor()

    await noteDialog.getByRole('button', { name: /Continue with Director/ }).click()
    await page.waitForFunction(() => document.querySelector('input[aria-label="Message your Marketing Director"]')?.value.includes('Continue from the saved document'))
    await page.getByRole('button', { name: 'Send message' }).click()
    await eventually(() => tasks.some((task) => task.origin?.kind === 'document'))
    const continuation = tasks.find((task) => task.origin?.kind === 'document')
    assert.equal(continuation.origin.deliverableId, edited.id, 'Continuation must retain the exact document id')
    assert.equal(continuation.origin.version, 2, 'Continuation must retain the exact edited version')

    assert(errors.length === 0, errors.join('; '))
    assert(serverUrls.has('/rest/v1/rpc/enqueue_task'), 'The browser must use the checked Task command')
    assert(!serverUrls.has('/rest/v1/rpc/read_ai_key'), 'The browser must never read provider secrets')
    console.log('PASS: Tasks continue across route navigation; two conversations run and a third queues; reload leaves server work running and preserves checkpoints; structured answers survive reload; invalid output creates no canned Posts; greetings run no specialists; exact task, budget-extension and document links navigate; document search/filter/pagination, immutable versions, failed-save retry and exact continuation lineage work; 1440/390/320 layouts; browser never reads provider keys')
  } catch (error) {
    console.error(server.log().slice(-6000))
    const page=browser?.contexts()[0]?.pages()[0]; if(page) console.error((await page.locator('body').innerText()).slice(-2500))
    throw error
  } finally {
    await browser?.close()
    server.kill('SIGTERM')
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
