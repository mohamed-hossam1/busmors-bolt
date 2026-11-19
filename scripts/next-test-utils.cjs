const http = require('node:http')
const path = require('node:path')
const vm = require('node:vm')
const { spawn } = require('node:child_process')
const { chromium: actualChromium } = require('playwright')
let active
const handlers = []
const sessions = new Map()
function matches(pattern, url) {
 if (pattern instanceof RegExp) return pattern.test(url)
 const escaped = pattern.replace(/[.+?^$()|[\]\\]/g, '\\$&').replaceAll('**', '.*').replace(/(?<!\.)\*/g, '[^/]*')
 return new RegExp('^' + escaped + '$').test(url)
}
async function startTestApp(port, project = 'busmora-ui-preview') {
 const root = path.resolve(__dirname, '..')
 const fixture = http.createServer(async (req, res) => {
  const chunks = []; for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString()
  const url = req.headers['x-fixture-url'] || 'https://' + project + '.supabase.co' + req.url
  const request = { url: () => url, method: () => req.method, headers: () => req.headers, postData: () => raw, postDataJSON: () => raw ? JSON.parse(raw) : null }
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (new URL(url).pathname === '/auth/v1/user') {
   const session = sessions.get(token)
   res.writeHead(session ? 200 : 401, { 'Content-Type': 'application/json' })
   res.end(JSON.stringify(session?.user ?? { message: 'Invalid test session' })); return
  }
  let index = handlers.length - 1, finished = false
  const dispatch = async () => {
   while (index >= 0) {
    const current = handlers[index--]
    if (!matches(current.pattern, url)) continue
    return current.handler({
     request: () => request,
     fulfill: async ({ status = 200, contentType = 'application/json', body = '', headers = {} }) => { if (finished) return; finished = true; res.writeHead(status, { 'Content-Type': contentType, ...headers }); res.end(body) },
     fallback: dispatch, continue: dispatch, abort: async () => { finished = true; res.destroy() },
    })
   }
   finished = true
   res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Unmocked fixture request: ' + url }))
  }
  try { await dispatch() } catch (error) { console.error('Fixture error:', error); if (!finished) { res.writeHead(500); res.end('{}') } }
 })
 await new Promise(resolve => fixture.listen(port + 100, '127.0.0.1', resolve))
 const child = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', String(port)], {
  cwd: root, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', NEXT_TEST_OUTPUT: '.next-test-' + port,
   NEXT_PUBLIC_SUPABASE_URL: 'https://' + project + '.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fictional-preview-key',
   SUPABASE_URL: 'http://127.0.0.1:' + (port + 100), SUPABASE_SERVICE_ROLE_KEY: 'fictional-service-key',
   AI_PROVIDER: 'openai', AI_MODEL: 'fixture-model', AI_API_KEY: 'fictional-provider-key',
   BUSMORA_TEST_PROXY: 'http://127.0.0.1:' + (port + 100), NODE_OPTIONS: '--require ' + path.join(root, 'scripts/next-test-preload.cjs'),
  },
 })
 const terminate = () => {
  try { if (child.pid) process.kill(-child.pid, 'SIGKILL') } catch {}
  try { child.kill('SIGKILL') } catch {}
  try { fixture.closeAllConnections(); fixture.close() } catch {}
 }
 let log = ''
 child.stdout.on('data', data => { log += data }); child.stderr.on('data', data => { log += data })
 active = { port, project, fixture, child }
 for (let i = 0; i < 120; i++) {
  try { if ((await fetch('http://127.0.0.1:' + port)).ok) return { kill: terminate, log: () => log } } catch {}
  if (child.exitCode !== null) throw new Error(log)
  await new Promise(resolve => setTimeout(resolve, 250))
 }
 terminate(); throw new Error('Next test server failed: ' + log)
}
const chromium = { launch: async options => {
 const browser = await actualChromium.launch(options)
 const createContext = browser.newContext.bind(browser)
 browser.newContext = async options => {
  const context = await createContext(options)
  const init = context.addInitScript.bind(context)
  context.addInitScript = async (fn, arg) => {
   if (typeof fn === 'function' && fn.toString().includes('-auth-token')) {
    const stored = []
    vm.runInNewContext('(' + fn.toString() + ')(arg)', { arg, localStorage: { setItem: (name, value) => stored.push({ name, value }) } })
    for (const { name, value } of stored) {
     const session = JSON.parse(value); sessions.set(session.access_token, session)
     await context.addCookies([{ name, value: 'base64-' + Buffer.from(value).toString('base64url'), url: 'http://127.0.0.1:' + active.port, sameSite: 'Lax' }])
    }
    return
   }
   return init(fn, arg)
  }
  const route = context.route.bind(context)
  context.route = async (pattern, handler, options) => { handlers.push({ pattern, handler }); return route(pattern, handler, options) }
  return context
 }
 return browser
} }
module.exports = { chromium, startTestApp }
