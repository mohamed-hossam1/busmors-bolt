const { chromium } = require('playwright')
const { spawn } = require('node:child_process')
const { existsSync } = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { installFixtures } = require('./ui-fixtures.cjs')

async function main() {
  const root = path.resolve(__dirname, '..')
  const base = 'http://127.0.0.1:4182'
  const server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '4182', '--strictPort'], {
    cwd: root, stdio: 'ignore', env: { ...process.env, VITE_SUPABASE_URL: 'https://busmora-ui-preview.supabase.co', VITE_SUPABASE_ANON_KEY: 'fictional-preview-key' },
  })
  let browser
  try {
    for (let i = 0; i < 80; i++) {
      try { if ((await fetch(base)).ok) break } catch { /* Wait for isolated Vite. */ }
      if (i === 79) throw new Error('Isolated Vite did not start')
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : existsSync('/usr/bin/google-chrome') ? { executablePath: '/usr/bin/google-chrome' } : {}), args: ['--no-sandbox'] })
    const context = await browser.newContext()
    const tables = await installFixtures(context)
    let failSave = true, missingMigration = false, saves = 0, lastPayload, aiCalls = 0
    const requests = []
    await context.route('https://r.jina.ai/**', async (route) => {
      requests.push(route.request().url())
      const missing = route.request().url().endsWith('/missing')
      await route.fulfill({ status: 200, contentType: 'text/plain', body: missing
        ? 'Title: 404 - Page not found\nWarning: Target URL returned error 404: Not Found\nMarkdown Content:\n# Page not found\nThe page you are looking for does not exist. Return to the homepage to find more information.'
        : 'Title: Luma - Handmade ceramics\nMarkdown Content:\n# Luma Studio\n\nLuma makes handmade ceramics for small businesses and design studios. Our mission is to bring thoughtful objects into everyday life.\n\n[Missing page](/missing)' })
    })
    await context.route('https://busmora-ui-preview.supabase.co/functions/v1/ai-generate', async (route) => {
      aiCalls++
      assert.equal(route.request().postDataJSON().crawlOperation, 'extract')
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"shared_key_unavailable"}' })
    })
    await context.route('https://busmora-ui-preview.supabase.co/rest/v1/rpc/save_crawl_brain', async (route) => {
      saves++; lastPayload = route.request().postDataJSON()
      await route.fulfill({ status: missingMigration ? 404 : failSave ? 500 : 200, contentType: 'application/json', body: missingMigration
        ? '{"code":"PGRST202","message":"Could not find the function public.save_crawl_brain"}' : failSave
        ? '{"code":"XX000","message":"Simulated storage failure"}' : JSON.stringify({ nodes_count: lastPayload.p_candidates.length, edges_count: lastPayload.p_relations.length }) })
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(base + '/onboarding')
    await page.getByLabel('Company website').fill('luma.example')
    await page.getByRole('button', { name: 'Build my Business Brain' }).click()
    await page.getByRole('alert').filter({ hasText: 'Simulated storage failure' }).waitFor()
    assert.equal(await page.getByText('Your Business Brain is ready.', { exact: true }).count(), 0)
    assert.equal(tables.workspace_settings[0].onboarding_state, 'awaiting_url')
    console.log('PASS: failed storage is visible and never reports a ready Brain')
    failSave = false
    await page.getByRole('button', { name: 'Build my Business Brain' }).click()
    await page.getByText('Your Business Brain is ready.', { exact: true }).waitFor()
    await page.getByRole('status').filter({ hasText: 'suggestions were saved for your review' }).waitFor()
    assert.equal(saves, 2); assert.equal(lastPayload.p_pages_read, 1)
    assert(lastPayload.p_relations.length > 0)
    assert.equal(await page.getByText('Connections', { exact: true }).locator('..').locator('p').first().textContent(), String(lastPayload.p_relations.length))
    assert(lastPayload.p_relations.every((edge) => edge.relation_type === 'RELATED_TO' && edge.confidence <= 0.65))
    assert(lastPayload.p_candidates.every((c) => c.properties.extracted_by === 'heuristic'))
    assert.equal(requests.length, 2, 'Saving retries must reuse completed reading and analysis')
    assert.equal(aiCalls, 1, 'Saving retries must not repeat AI analysis')
    assert.equal(errors.length, 0)
    console.log('PASS: retry reuses completed analysis, 404 is excluded, and degraded extraction is explained')
    missingMigration = true
    const original = structuredClone(tables.brain_nodes)
    await page.goto(base + '/onboarding')
    await page.getByLabel('Company website').fill('legacy.example')
    await page.getByRole('button', { name: 'Build my Business Brain' }).click()
    await page.getByText('Your Business Brain is ready.', { exact: true }).waitFor()
    assert.equal(saves, 3)
    assert.equal(tables.workspace_settings[0].onboarding_state, 'complete')
    for (const node of original) assert.deepEqual(tables.brain_nodes.find((n) => n.id === node.id), node)
    assert.equal(errors.length, 0)
    assert.equal(await page.getByRole('alert').count(), 0)
    console.log('PASS: missing migration saves safely on the existing schema and preserves existing knowledge')
    // Display only stored edges, including suggestions, without inserting on a page read.
    tables.brain_nodes = tables.brain_nodes.slice(0, 3).map((node) => ({ ...node, status: 'candidate' }))
    tables.brain_edges = [{ id: 'stored-suggestion', workspace_id: tables.brain_nodes[0].workspace_id,
      source_node_id: tables.brain_nodes[0].id, target_node_id: tables.brain_nodes[1].id,
      relation_type: 'RELATED_TO', status: 'candidate', weight: 0.65 }]
    let graphWrites = 0
    context.on('request', (request) => {
      if (request.url().includes('/rest/v1/brain_edges') && request.method() !== 'GET') graphWrites++
    })
    await page.goto(base + '/app/brain')
    await page.getByRole('button', { name: 'Graph', exact: true }).click()
    await page.getByText('3 knowledge items · 1 connections', { exact: true }).waitFor()
    await page.locator('.react-flow__node').first().waitFor()
    assert.equal(await page.locator('.react-flow__node').count(), 3)
    assert.equal(await page.locator('.react-flow__edge').count(), 1)
    assert.equal(graphWrites, 0)
    await page.locator('.react-flow__node').first().click()
    await page.getByText('related to · Suggested', { exact: true }).waitFor()
    assert.equal(errors.length, 0)
    console.log('PASS: graph shows the saved suggestion count and never fabricates or writes connections on load')

  } finally {
    await browser?.close()
    server.kill('SIGTERM')
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
