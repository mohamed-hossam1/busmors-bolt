const { chromium, startTestApp } = require('./next-test-utils.cjs')
const { execFileSync } = require('node:child_process')
const { mkdirSync, writeFileSync, existsSync } = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { installFixtures, workspace } = require('./ui-fixtures.cjs')

const root = path.resolve(__dirname, '..')
const output = path.join(root, 'artifacts/next-migration')
const base = process.env.UI_BASE_URL || 'http://127.0.0.1:4179'
const results = []
const captureProducts = process.argv.includes('--capture-products')
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const check = (label) => { results.push(label); console.log('PASS:', label) }

async function main() {
  mkdirSync(output, { recursive: true })
  const server = process.env.UI_BASE_URL ? null : await startTestApp(4179, 'busmora-ui-preview')
  let browser
  try {
    for (let i = 0; i < 80; i++) {
      try { if ((await fetch(base)).ok) break } catch { /* Wait for isolated Next.js. */ }
      if (i === 79) throw new Error('The isolated Next.js server did not start.')
      await delay(250)
    }
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : existsSync('/usr/bin/google-chrome') ? { executablePath: '/usr/bin/google-chrome' } : {}), args: ['--no-sandbox'] })
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' })
    const tables = await installFixtures(context)
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    const settle = async () => { await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(400) }
    const noOverflow = async (label) => {
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, label + ' horizontal overflow')
    }
    const shot = async (name, target = page) => { await settle(); await target.screenshot({ path: path.join(output, name + '.png') }) }

    for (const area of ['employee', 'brain', 'calendar', 'deliverables', 'settings']) {
      await page.goto(base + '/app/' + area)
      await page.locator('.dashboard-theme').waitFor()
      await settle()
      await noOverflow('desktop ' + area)
      assert.equal(await page.locator('aside a[aria-current="page"]').count(), 1)
      if (area === 'employee') { await page.locator('.react-flow__node').first().waitFor(); await page.locator('.employee-chat > .overflow-y-auto').evaluate((el) => { el.scrollTop = 0 }) }
      await shot(area + '-desktop')
      if (area === 'employee') await shot('canvas', page.locator('.employee-canvas'))
      if (area === 'brain') {
        await page.getByRole('button', { name: 'Graph', exact: true }).click()
        await page.locator('.brain-map-node').first().waitFor()
        await settle()
        await shot('brain-graph-desktop')
        const allNodes = page.locator('.brain-map .react-flow__node')
        const count = await allNodes.count()
        const originalPositions = await allNodes.evaluateAll((elements) => Object.fromEntries(elements.map((el) => [el.dataset.id, el.style.transform])))
        const originalViewport = await page.locator('.brain-map .react-flow__viewport').evaluate((el) => el.style.transform)
        const target = allNodes.first()
        const box = await target.boundingBox()
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
        await page.mouse.down()
        await page.mouse.move(box.x + box.width / 2 + 70, box.y + box.height / 2 + 35, { steps: 12 })
        await page.mouse.up()
        await settle()
        assert.equal(await allNodes.count(), count, 'Dragging must retain every Brain node')
        assert.equal(await allNodes.evaluateAll((elements) => elements.every((element) => getComputedStyle(element).visibility !== 'hidden' && getComputedStyle(element).opacity !== '0')), true)
        const movedPositions = await allNodes.evaluateAll((elements) => Object.fromEntries(elements.map((el) => [el.dataset.id, el.style.transform])))
        const movedId = await target.getAttribute('data-id')
        assert.notEqual(movedPositions[movedId], originalPositions[movedId])
        for (const [id, position] of Object.entries(originalPositions)) if (id !== movedId) assert.equal(movedPositions[id], position)
        assert.equal(await page.locator('.brain-map .react-flow__viewport').evaluate((el) => el.style.transform), originalViewport)
        await target.focus()
        await page.keyboard.press('Enter')
        await page.getByRole('complementary', { name: 'Knowledge details' }).waitFor()
        await page.keyboard.press('Escape')
        check('Brain drag retains all measured nodes and viewport; keyboard opens details')
        await page.getByRole('button', { name: 'Add knowledge', exact: true }).click()
        const dialog = page.getByRole('dialog', { name: 'Add knowledge' })
        await dialog.waitFor()
        assert.equal(await dialog.evaluate((element) => getComputedStyle(element).backgroundColor), 'rgb(255, 255, 255)')
        await shot('knowledge-dialog')
        await page.keyboard.press('Escape')
        assert.equal(await page.getByRole('dialog').count(), 0)
        check('Knowledge editor is opaque, keyboard dismissible, and restores focus')
      }
      check('Desktop ' + area + ' navigation and layout')
    }

    await page.goto(base + '/app/deliverables')
    await page.getByRole('button', { name: 'View', exact: true }).first().click()
    const report = page.getByRole('dialog')
    await report.waitFor()
    assert.equal(await report.evaluate((element) => getComputedStyle(element).backgroundColor), 'rgb(255, 255, 255)')
    await shot('report-dialog')
    // Focus wraps inside the report and returns to its trigger after closing.
    const buttons = report.getByRole('button')
    await buttons.last().focus()
    await page.keyboard.press('Tab')
    assert.equal(await buttons.first().evaluate((element) => element === document.activeElement), true)
    await page.keyboard.press('Escape')
    const downloadEvent = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download', exact: true }).first().click()
    assert.match((await downloadEvent).suggestedFilename(), /\.md$/)
    check('Report focus trap, opaque surface, Escape, and Markdown download')

    // Each conversation restores its own recorded graph, moved nodes, and viewport.
    await page.goto(base + '/app/employee')
    const canvasNode = page.locator('.employee-canvas .react-flow__node[data-id="orchestrator"]')
    await canvasNode.waitFor()
    await settle()
    const box = await canvasNode.boundingBox()
    await page.mouse.move(box.x + 40, box.y + 28)
    await page.mouse.down()
    await page.mouse.move(box.x + 105, box.y + 70, { steps: 12 })
    await page.mouse.up()
    await page.locator('.employee-canvas .react-flow__controls-zoomin').click()
    await settle()
    const canvasKey = await page.evaluate(() => Object.keys(localStorage).find(k => k.startsWith('busmora:chat-canvas:')) || 'busmora:chat-canvas:task-launch')
    const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), canvasKey)
    assert.ok(saved?.positions?.orchestrator, 'orchestrator position must be saved in ' + canvasKey)
    assert.ok(saved.viewport?.zoom > 0)
    const transform = await canvasNode.evaluate((element) => element.style.transform)
    await page.getByRole('button', { name: /History/ }).first().click()
    await page.getByText('Understanding our audience', { exact: true }).click()
    await page.locator('.employee-canvas .react-flow__node[data-id="competitor_analysis"]').waitFor()
    assert.equal(await page.locator('.employee-canvas .react-flow__node[data-id="content_writer"]').count(), 0)
    await page.getByRole('button', { name: /History/ }).first().click()
    await page.getByText('A thoughtful launch for Luma Studio', { exact: true }).click()
    await canvasNode.waitFor()
    await settle()
    assert.equal(await canvasNode.evaluate((element) => element.style.transform), transform)
    await page.reload()
    await canvasNode.waitFor()
    await settle()
    assert.equal(await canvasNode.evaluate((element) => element.style.transform), transform)
    const restored = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), canvasKey)
    assert.deepEqual(restored, saved)
    assert.equal(await page.evaluate((id) => localStorage.getItem('busmora:active-conversation:' + id), workspace), 'conversation-launch')
    check('Conversation isolation, node positions, viewport, and refresh restoration')

    for (const viewport of [{ width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
      await page.setViewportSize(viewport)
      for (const area of ['employee', 'brain', 'calendar', 'deliverables', 'settings']) {
        await page.goto(base + '/app/' + area)
        await page.locator('.dashboard-theme').waitFor()
        await settle()
        await noOverflow(viewport.width + ' ' + area)
        if (viewport.width === 390) { if (area === 'employee') await page.locator('.employee-chat > .overflow-y-auto').evaluate((el) => { el.scrollTop = 0 }); await shot(area + '-mobile') }
      }
      check(viewport.width + 'px: all workspace routes without page overflow')
    }
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(base + '/app/employee')
    await page.getByRole('button', { name: 'Open navigation menu' }).click()
    await shot('mobile-navigation')
    await page.keyboard.press('Escape')
    assert.equal(await page.getByRole('dialog').count(), 0)
    await page.getByRole('button', { name: 'Agent Canvas', exact: true }).click()
    await page.locator('.employee-canvas .react-flow__node').first().waitFor()
    await noOverflow('mobile Agent Canvas')
    await shot('canvas-mobile')
    check('Mobile menu and Chat/Agent Canvas switch')

    await page.goto(base + '/app/calendar')
    await page.getByRole('button', { name: 'Edit', exact: true }).first().click()
    await page.getByRole('dialog', { name: 'Edit post' }).waitFor()
    await page.getByLabel('Post caption').fill('A revised fictional caption, ready for review.')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.getByText('A revised fictional caption, ready for review.', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Approve', exact: true }).first().click()
    for (let i = 0; i < 50; i++) {
      if (tables.planned_posts[0].status === 'approved') break
      await delay(100)
    }
    assert.equal(tables.planned_posts[0].status, 'approved')
    check('Calendar post editing and approval keep the existing data operations')

    await page.goto(base + '/app/brain')
    await page.getByRole('button', { name: 'Add knowledge', exact: true }).click()
    await page.getByLabel('Title', { exact: true }).fill('A new sample business detail')
    await page.getByLabel('Summary', { exact: true }).fill('A fictional detail added through the actual knowledge editor.')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.getByRole('heading', { name: 'A new sample business detail', exact: true }).waitFor()
    assert.ok(tables.brain_nodes.some((node) => node.title === 'A new sample business detail'))
    check('Knowledge creation submits through the existing Supabase path')

    if (captureProducts) {
      execFileSync('python3', ['-c', `from PIL import Image\nfrom pathlib import Path\np=Path('artifacts/redesign')\nout=Path('public/marketing/product')\nout.mkdir(parents=True,exist_ok=True)\nfor source,name in [('employee-desktop','employee'),('brain-graph-desktop','brain'),('canvas','canvas'),('calendar-desktop','calendar'),('deliverables-desktop','deliverables'),('employee-mobile','employee-mobile'),('calendar-mobile','calendar-mobile')]:\n im=Image.open(p/(source+'.png')).convert('RGB')\n im.save(out/(name+'.webp'),'WEBP',quality=88,method=6)\n`], { cwd: root })
      check('Optimized real product captures with fictional fixtures')
    }

    for (const viewport of [{ width: 1440, height: 960 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
      await page.setViewportSize(viewport)
      for (const route of ['/', '/signin', '/signup', '/reset', '/onboarding']) {
        try { await page.goto(base + route, { waitUntil: 'domcontentloaded' }) } catch { await page.goto(base + route, { waitUntil: 'domcontentloaded' }) }
        await settle()
        await noOverflow(viewport.width + ' ' + route)
        if (route === '/') assert.equal(await page.locator('.marketing-testimonials article').evaluateAll((cards) => cards.every((card) => { const box = card.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth; })), true, 'Use-case cards fit their columns')
        if ([1440, 390].includes(viewport.width)) await shot((route === '/' ? 'landing' : route.slice(1)) + (viewport.width === 1440 ? '-desktop' : '-mobile'))
      }
      check(viewport.width + 'px: landing, auth, and onboarding layouts')
    }
    await page.setViewportSize({ width: 1440, height: 960 })
    await page.goto(base)
    await page.locator('#product-demo').scrollIntoViewIfNeeded()
    await page.getByRole('tab', { name: 'Business Brain', exact: true }).click()
    await page.keyboard.press('ArrowRight')
    assert.equal(await page.getByRole('tab', { name: 'Calendar' }).getAttribute('aria-selected'), 'true')
    await shot('landing-product-tour', page.locator('#product-demo'))
    await page.locator('#features').scrollIntoViewIfNeeded()
    await shot('landing-features', page.locator('#features'))
    await page.locator('#faq').scrollIntoViewIfNeeded()
    await page.locator('#faq summary').first().click()
    assert.equal(await page.locator('#faq details').first().getAttribute('open'), '')
    const broken = await page.locator('img').evaluateAll((images) => images.filter((image) => image.complete && image.naturalWidth === 0).map((image) => image.src))
    assert.deepEqual(broken, [], 'No broken marketing images')
    await page.evaluate(async () => {
      const images = [...document.querySelectorAll('img')]
      images.forEach((image) => { image.loading = 'eager' })
      await Promise.all(images.map((image) => image.decode().catch(() => {})))
    })
    await page.screenshot({ path: path.join(output, 'landing-full.png'), fullPage: true, style: '[data-reveal-pending] { opacity: 1 !important; transform: none !important; } .navbar-floating, .navbar-mobile-floating { visibility: hidden; }' })
    check('Product tabs with arrow keys, FAQ, and local marketing assets')

    assert.equal(await page.locator('#demo').count(), 0)
    assert.equal(await page.getByRole('button', { name: 'Run sample task' }).count(), 0)
    await page.getByRole('heading', { name: 'Your work. Real questions.', exact: true }).waitFor()
    assert.equal(await page.locator('a[href="#demo"]').count(), 0)
    check('Guest demo section removed; use-case heading and product tour links retained')

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(base)
    await page.getByRole('button', { name: 'Toggle navigation menu' }).click()
    await page.getByRole('dialog').waitFor()
    await page.keyboard.press('Escape')
    assert.equal(await page.getByRole('dialog').count(), 0)
    assert.equal(await page.evaluate(() => document.body.style.overflow), '')
    check('Landing mobile navigation traps focus and restores scrolling')

    tables.deliverables = []
    tables.planned_posts = []
    for (const area of ['calendar', 'deliverables']) {
      await page.goto(base + '/app/' + area)
      await page.getByRole('link', { name: 'Talk to your Director' }).waitFor()
      await noOverflow('empty ' + area)
    }
    check('Empty workspaces retain useful, functional navigation')

    const motionContext = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: 'no-preference' })
    const motionPage = await motionContext.newPage()
    await motionPage.goto(base)
    await motionPage.locator('.marketing-hero').waitFor()
    await motionPage.evaluate(() => document.fonts.ready)
    await motionPage.evaluate(() => window.scrollTo({ top: 700, behavior: 'instant' }))
    await motionPage.waitForTimeout(350)
    assert.match(await motionPage.locator('.marketing-hero-copy').getAttribute('style'), /translate3d/)
    await motionPage.screenshot({ path: path.join(output, 'landing-scroll-scene.png') })
    await motionPage.locator('#workflow').scrollIntoViewIfNeeded()
    await motionPage.waitForTimeout(350)
    assert.equal(await motionPage.locator('#workflow').getAttribute('data-process-enhanced'), '')
    assert.equal(await motionPage.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    assert.equal((await motionPage.locator('#workflow').textContent()).includes('{step'), false)
    await motionPage.screenshot({ path: path.join(output, 'landing-workflow-scene.png') })
    await motionContext.close()
    check('Desktop hero and pinned workflow animations enhance with normal motion')

    const anonymous = await browser.newContext()
    const authPage = await anonymous.newPage()
    await authPage.goto(base + '/app/brain')
    await authPage.waitForURL('**/signin**')
    await authPage.route('https://busmora-ui-preview.supabase.co/**', (route) => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'invalid_grant', error_description: 'Example authentication error' }) }))
    await authPage.getByLabel('Email').fill('sample@example.com')
    await authPage.getByLabel(/Password/).fill('fictional-password')
    await authPage.getByRole('button', { name: 'Sign in', exact: true }).click()
    await authPage.getByText('Example authentication error', { exact: true }).waitFor()
    await anonymous.close()
    check('Protected routes redirect; authentication failures remain readable')
    assert.deepEqual(errors, [], 'No uncaught browser errors')
    writeFileSync(path.join(output, 'results.json'), JSON.stringify({ checkedAt: new Date().toISOString(), fixtures: 'Fictional Luma Studio; no live backend access', results }, null, 2))
    console.log(`Completed ${results.length} checks. Screenshots: ${output}`)
  } finally {
    if (browser) await browser.close()
    if (server) server.kill()
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
