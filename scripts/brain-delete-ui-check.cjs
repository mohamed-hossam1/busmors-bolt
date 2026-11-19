const { chromium } = require('playwright')
const { spawn } = require('node:child_process')
const { existsSync } = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { installFixtures } = require('./ui-fixtures.cjs')

async function main() {
  const root = path.resolve(__dirname, '..'), base = 'http://127.0.0.1:4183'
  const server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '4183', '--strictPort'], {
    cwd: root, stdio: 'ignore', env: { ...process.env, VITE_SUPABASE_URL: 'https://busmora-ui-preview.supabase.co', VITE_SUPABASE_ANON_KEY: 'fictional-preview-key' },
  })
  let browser
  try {
    for (let i = 0; i < 80; i++) {
      try { if ((await fetch(base)).ok) break } catch { /* Wait for local Vite. */ }
      if (i === 79) throw new Error('Isolated Vite did not start')
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : existsSync('/usr/bin/google-chrome') ? { executablePath: '/usr/bin/google-chrome' } : {}), args: ['--no-sandbox'] })
    const context = await browser.newContext()
    const tables = await installFixtures(context)
    tables.brain_nodes = tables.brain_nodes.slice(0, 3)
    const page = await context.newPage(), errors = [], nativeDialogs = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('dialog', async (dialog) => { nativeDialogs.push(dialog.message()); await dialog.dismiss() })
    const openBrain = async () => {
      await page.goto(base + '/app/brain')
      await page.getByRole('button', { name: 'Delete', exact: true }).first().waitFor()
    }
    const dialog = page.getByRole('dialog', { name: 'Delete knowledge card?' })
    const preferenceKey = `busmora:skip-knowledge-delete-confirmation:${tables.brain_nodes[0].workspace_id}`
    await openBrain()
    await page.getByRole('button', { name: 'Delete', exact: true }).first().click()
    await dialog.waitFor()
    await dialog.getByRole('checkbox', { name: "Don't ask me again" }).check()
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).last().click()
    assert.equal(tables.brain_nodes.length, 3)
    assert.equal(await page.evaluate((key) => localStorage.getItem(key), preferenceKey), null)
    console.log('PASS: cancelling keeps the card and does not save the checked preference')

    await page.getByRole('button', { name: 'Delete', exact: true }).first().click()
    assert.equal(await dialog.getByRole('checkbox').isChecked(), false)
    await page.screenshot({ path: '/tmp/busmora-delete-card.png', fullPage: true })
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
    await dialog.waitFor({ state: 'detached' })
    assert.equal(tables.brain_nodes.length, 2)
    await openBrain()
    await page.getByRole('button', { name: 'Delete', exact: true }).first().click()
    await dialog.waitFor()
    console.log('PASS: unchecked confirmation still appears after reloading')

    await dialog.getByRole('checkbox', { name: "Don't ask me again" }).check()
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
    await dialog.waitFor({ state: 'detached' })
    assert.equal(tables.brain_nodes.length, 1)
    assert.equal(await page.evaluate((key) => localStorage.getItem(key), preferenceKey), 'true')
    await openBrain()
    await page.getByRole('button', { name: 'Delete', exact: true }).first().click()
    await page.getByRole('button', { name: 'Delete', exact: true }).waitFor({ state: 'detached' })
    assert.equal(tables.brain_nodes.length, 0)
    assert.equal(await dialog.count(), 0)
    assert.deepEqual(nativeDialogs, [])
    assert.deepEqual(errors, [])
    console.log('PASS: confirmed opt-out survives reload and the next deletion asks no question')
  } finally {
    await browser?.close()
    server.kill('SIGTERM')
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
