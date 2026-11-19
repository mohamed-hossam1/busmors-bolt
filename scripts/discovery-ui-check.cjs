// C18 local UI behavior only. Supabase is intercepted in memory; no live
// auth, provider, workspace data or Roadmap generation is used.
const { chromium, startTestApp } = require('./next-test-utils.cjs')
const { existsSync, mkdirSync } = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')

const workspace = '11111111-1111-4111-8111-111111111111'
const date = '2026-11-19T09:00:00Z'

async function main() {
  const root = path.resolve(__dirname, '..')
  const base = 'http://127.0.0.1:4187'
  const server = await startTestApp(4187, 'busmora-discovery-preview')

  const settings = {
    workspace_id: workspace,
    company_url: null,
    onboarding_state: 'complete',
    country: 'Egypt',
    currency: 'EGP',
    timezone: 'Africa/Cairo',
    target_market: 'Local households',
    ui_language: 'en',
  }
  const facts = [
    { id: '22222222-2222-4222-8222-222222222222', workspace_id: workspace, category: 'audience', title: 'Local households', summary: 'People nearby who buy considered everyday objects.', properties: {}, version: 3, status: 'approved', approval_state: 'approved', verification_state: 'owner_reported', is_current: true, created_at: date, updated_at: date },
    { id: '33333333-3333-4333-8333-333333333333', workspace_id: workspace, category: 'offering', title: 'The Everyday Collection', summary: 'Hand-finished tableware for daily rituals.', properties: { amount: '45', currency: 'EGP' }, version: 2, status: 'approved', approval_state: 'approved', verification_state: 'owner_reported', is_current: true, created_at: date, updated_at: date },
    { id: '44444444-4444-4444-8444-444444444444', workspace_id: workspace, category: 'audience', title: 'Secret candidate segment', summary: 'This unapproved candidate must never be reused.', properties: {}, version: 1, status: 'candidate', approval_state: 'pending', verification_state: 'unverified', is_current: true, created_at: date, updated_at: date },
    { id: '55555555-5555-4555-8555-555555555555', workspace_id: workspace, category: 'audience', title: 'Contradicted segment', summary: 'A contradicted fact must not be reused.', properties: {}, version: 1, status: 'approved', approval_state: 'approved', verification_state: 'contradicted', is_current: true, created_at: date, updated_at: date },
  ]

  let draft = null
  const questions = []
  const roadmaps = []

  const now = () => new Date().toISOString()
  const matching = (rows, url) => rows.filter((row) => [...url.searchParams].every(([key, value]) => {
    if (!value.startsWith('eq.')) return true
    const expected = value.slice(3)
    if (expected === 'true') return row[key] === true
    if (expected === 'false') return row[key] === false
    return String(row[key]) === expected
  }))
  const questionList = () => questions
    .filter((question) => !draft || question.draft_id === draft.id)
    .sort((a, b) => a.position - b.position)

  async function rpc(name, body) {
    if (name === 'bootstrap_workspace') return settings
    if (name === 'recover_tasks') return 0
    if (name === 'load_discovery') return { draft, questions: questionList() }
    if (name === 'save_discovery_draft') {
      if (!draft) {
        if (body.p_expected_version !== 0) throw new Error('STALE_VERSION')
        draft = { id: randomUUID(), workspace_id: workspace, version: 1, goal: body.p_goal, status: 'draft', context_refs: body.p_context_refs ?? [], created_at: now(), updated_at: now() }
        return draft
      }
      if (draft.version !== body.p_expected_version) throw new Error('STALE_VERSION')
      if (draft.goal !== body.p_goal) draft.status = 'draft'
      draft.goal = body.p_goal
      draft.context_refs = body.p_context_refs ?? draft.context_refs
      draft.version += 1
      draft.updated_at = now()
      return draft
    }
    if (name === 'sync_discovery_questions') {
      if (!draft || draft.id !== body.p_draft_id) throw new Error('NOT_FOUND')
      if (draft.version !== body.p_expected_version) throw new Error('STALE_VERSION')
      const keys = new Set()
      for (const item of body.p_questions ?? []) {
        keys.add(item.question_key)
        const existing = questions.find((question) => question.draft_id === draft.id && question.question_key === item.question_key)
        if (existing) {
          existing.position = item.position
          existing.schema = item.schema
          existing.branch = item.branch
          existing.active = true
          existing.updated_at = now()
        } else {
          const prefill = body.p_prefill?.[item.question_key]
          questions.push({
            id: randomUUID(),
            workspace_id: workspace,
            draft_id: draft.id,
            question_key: item.question_key,
            position: item.position,
            schema: item.schema,
            status: prefill?.status ?? 'unanswered',
            value: prefill?.value ?? null,
            provenance: prefill?.provenance ?? {},
            branch: item.branch,
            active: true,
            version: 1,
            created_at: now(),
            updated_at: now(),
          })
        }
      }
      for (const question of questions) {
        if (question.draft_id === draft.id && !keys.has(question.question_key)) question.active = false
      }
      draft.version += 1
      draft.updated_at = now()
      return { draft, questions: questionList() }
    }
    if (name === 'save_discovery_answer') {
      const question = questions.find((row) => row.id === body.p_question_id)
      if (!question) throw new Error('NOT_FOUND')
      if (question.version !== body.p_expected_version) throw new Error('STALE_VERSION')
      if (!question.active) throw new Error('INACTIVE_QUESTION')
      if (question.question_key === 'success_signal' && body.p_value?.text === 'Force a conflict') throw new Error('STALE_VERSION')
      const positive = ['answered', 'confirmed'].includes(body.p_status)
      if (positive && !(body.p_value?.text?.trim() || body.p_value?.choice)) throw new Error('INVALID_ANSWER')
      if (!positive && body.p_value != null && Object.keys(body.p_value ?? {}).length > 0) throw new Error('INVALID_ANSWER')
      question.status = body.p_status
      question.value = positive ? body.p_value : null
      question.provenance = body.p_provenance ?? {}
      question.version += 1
      question.updated_at = now()
      return question
    }
    if (name === 'plan_discovery_draft') {
      if (!draft || draft.id !== body.p_draft_id) throw new Error('NOT_FOUND')
      if (draft.version !== body.p_expected_version) throw new Error('STALE_VERSION')
      draft.status = 'planned'
      draft.context_refs = [...(draft.context_refs ?? []), { kind: 'preliminary_plan', openQuestionKeys: body.p_open_question_keys ?? [], at: now() }]
      draft.version += 1
      draft.updated_at = now()
      return draft
    }
    throw new Error(`Unhandled RPC ${name}`)
  }

  let browser
  try {
    const context = await browserContext()
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    mkdirSync(path.join(root, 'artifacts/competition'), { recursive: true })

    await page.goto(base + '/roadmap')
    await page.getByRole('button', { name: /Win my first customers/ }).waitFor()
    assert.equal(await page.getByText(/weekly hours/i).count(), 0, 'Discovery must not ask a standard weekly-hours question')

    await page.getByRole('button', { name: /Win my first customers/ }).click()
    await page.getByRole('heading', { name: 'Who is the priority customer for this goal?' }).waitFor()
    await page.getByRole('heading', { name: 'With no website connected, where should a ready buyer go next?' }).waitFor()
    await page.getByText('Already known from your Brain').first().waitFor()
    const audienceCard = page.locator('article').filter({ hasText: 'Who is the priority customer for this goal?' })
    await audienceCard.getByText('Local households', { exact: true }).waitFor()
    await audienceCard.getByText(/Source: Local households/).waitFor()
    assert.equal(await page.getByText('Secret candidate segment').count(), 0, 'Unapproved Brain candidates must not be reused')
    assert.equal(await page.getByText('Contradicted segment').count(), 0, 'Contradicted Brain facts must not be reused')
    assert.equal(await page.getByText('The Everyday Collection', { exact: true }).count() > 0, true, 'Approved offering should be visibly reusable')

    // Close/reopen restores the selected goal, branch and reused answer.
    await page.reload()
    await page.getByText(/Goal:/).waitFor()
    await page.getByRole('heading', { name: 'Who is the priority customer for this goal?' }).waitFor()
    await page.getByRole('heading', { name: 'With no website connected, where should a ready buyer go next?' }).waitFor()
    await page.locator('article').filter({ hasText: 'Who is the priority customer for this goal?' }).getByText('Already known from your Brain').waitFor()

    // The no-website route is a real branch answer.
    await page.getByRole('radio', { name: /Direct messages or WhatsApp/ }).click()
    await page.waitForFunction(() => document.body.innerText.includes('All answers saved'))

    // Changing the goal adapts questions but keeps earlier saved context.
    await page.getByRole('button', { name: 'Change goal' }).click()
    await page.getByRole('button', { name: /Turn more inquiries into customers/ }).click()
    await page.getByRole('heading', { name: 'Where does the inquiry path break most often?' }).waitFor()
    await page.getByText(/earlier answer is kept under Saved earlier answers/i).waitFor()
    assert.equal(await page.getByRole('heading', { name: 'With no website connected, where should a ready buyer go next?' }).count(), 0, 'Incompatible question must leave the active plan')
    await page.getByRole('button', { name: /Saved earlier answers/ }).click()
    await page.getByText('Direct messages or WhatsApp', { exact: true }).waitFor()
    await page.getByText(/This answer was not deleted/).waitFor()
    await page.getByRole('radio', { name: /Slow replies/ }).click()

    // Returning to the earlier goal restores the exact branch and answer.
    await page.getByRole('button', { name: 'Change goal' }).click()
    await page.getByRole('button', { name: /Win my first customers/ }).click()
    const restored = page.getByRole('radio', { name: /Direct messages or WhatsApp/ })
    await restored.waitFor()
    assert.equal(await restored.getAttribute('aria-checked'), 'true', 'Returning to a goal must restore its saved branch answer')

    // A stale save is visible and never silently overwrites the newer answer.
    const successCard = page.locator('article').filter({ hasText: 'What would count as progress in the next 8 weeks?' })
    await successCard.getByLabel('Your answer').fill('Force a conflict')
    await successCard.getByRole('button', { name: 'Save answer' }).click()
    await successCard.getByText('This answer changed elsewhere').waitFor()
    assert.equal(await successCard.getByLabel('Your answer').inputValue(), 'Force a conflict', 'Conflicting text must stay in the editor')
    await successCard.getByRole('button', { name: 'Load latest' }).click()
    await page.waitForFunction(() => !document.body.innerText.includes('This answer changed elsewhere'))

    // Explicit save before navigation flushes the current answer.
    await successCard.getByLabel('Your answer').fill('Five qualified conversations and two paid pilots')
    await page.getByRole('button', { name: 'Save answers', exact: true }).click()
    await page.waitForFunction(() => document.body.innerText.includes('All answers saved'))
    const successQuestion = questions.find((question) => question.question_key === 'success_signal')
    assert.equal(successQuestion.value.text, 'Five qualified conversations and two paid pilots')

    // A preliminary plan is allowed with disclosed open unknowns and does not
    // generate or activate a Roadmap.
    await page.getByRole('button', { name: 'Continue with a preliminary plan' }).click()
    await page.getByText('Preliminary plan saved — not activated').waitFor()
    await page.getByText(/mark .* open unknown/i).waitFor()
    assert.equal(roadmaps.length, 0, 'Preliminary plan must not create an active Roadmap')
    assert.equal(draft.status, 'planned')
    const preliminaryContext = draft.context_refs.find((item) => item.kind === 'preliminary_plan')
    assert(preliminaryContext.openQuestionKeys.includes('truthful_proof'), 'Open unknowns must be recorded')

    await page.reload()
    await page.getByText('Preliminary plan saved — not activated').waitFor()
    await page.getByRole('heading', { name: 'Who is the priority customer for this goal?' }).waitFor()
    await page.getByRole('radio', { name: /Direct messages or WhatsApp/ }).waitFor()
    assert.equal(await page.getByRole('radio', { name: /Direct messages or WhatsApp/ }).getAttribute('aria-checked'), 'true')

    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForTimeout(200)
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Roadmap Discovery must not overflow at 390px')
    await page.screenshot({ path: path.join(root, 'artifacts/competition/discovery-mobile.png'), fullPage: true })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.screenshot({ path: path.join(root, 'artifacts/competition/discovery-desktop.png'), fullPage: true })
    assert.deepEqual(errors, [])

    console.log('PASS: Discovery goal picker, no-website branch, visible Brain reuse, reload restore, goal adaptation without deletion, branch restore, stale conflict recovery, explicit save, preliminary-plan disclosure, mobile layout')
  } finally {
    await browser?.close()
    server.kill('SIGTERM')
  }

  async function browserContext() {
    browser = await chromium.launch({
      headless: true,
      ...(existsSync('/usr/bin/google-chrome') ? { executablePath: '/usr/bin/google-chrome' } : {}),
      args: ['--no-sandbox'],
    })
    const context = await browser.newContext()
    await context.addInitScript(({ workspace }) => {
      localStorage.setItem('sb-busmora-discovery-preview-auth-token', JSON.stringify({ access_token: 'fictional-discovery-token', refresh_token: 'fictional-discovery-refresh', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer', user: { id: workspace, aud: 'authenticated', role: 'authenticated', email: 'hello@luma.example', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } }))
    }, { workspace })
    await context.route('https://busmora-discovery-preview.supabase.co/**', async (route) => {
      const request = route.request()
      const url = new URL(request.url())
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
        : table === 'brain_nodes' ? facts
        : table === 'discovery_questions' ? questions
        : []
      if (request.method() === 'POST') {
        return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify([]) })
      }
      rows = matching(rows, url)
      if (url.searchParams.has('limit')) rows = rows.slice(0, Number(url.searchParams.get('limit')))
      const wantsObject = (request.headers().accept ?? '').includes('object') || url.pathname.endsWith('.single')
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(wantsObject ? rows[0] ?? null : rows) })
    })
    return context
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
