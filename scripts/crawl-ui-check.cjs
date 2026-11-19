const { chromium, startTestApp } = require('./next-test-utils.cjs')
const { existsSync } = require('node:fs')
const assert = require('node:assert/strict')
const { installFixtures } = require('./ui-fixtures.cjs')

async function main() {
  const base = 'http://127.0.0.1:4182'
  const server = await startTestApp(4182, 'busmora-ui-preview')
  let browser
  try {
    for (let i = 0; i < 80; i++) {
      try { if ((await fetch(base)).ok) break } catch { /* Wait for isolated Next.js. */ }
      if (i === 79) throw new Error('Isolated Next.js did not start')
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : existsSync('/usr/bin/google-chrome') ? { executablePath: '/usr/bin/google-chrome' } : {}), args: ['--no-sandbox'] })
    const context = await browser.newContext()
    const tables = await installFixtures(context)
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))

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
