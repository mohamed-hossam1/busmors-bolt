const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const { webcrypto } = require('node:crypto')
const root = path.resolve(__dirname, '..')

function createHarness({ fetch = async () => new Response('missing', { status: 404 }), ai = async () => ({ ok: false, text: '' }), db, extra = {} } = {}) {
  const modules = new Map()
  const defaultDb = {
    auth: { getSession: async () => ({ data: { session: { user: { id: '11111111-1111-4111-8111-111111111111' }, access_token: 'test-token' } } }) },
    rpc: async () => ({ data: { nodes_count: 1, edges_count: 0 }, error: null }),
    from: () => { throw new Error('Unexpected non-atomic database write') },
  }
  const database = db || defaultDb
  function load(relative) {
    const file = path.resolve(root, relative)
    if (modules.has(file)) return modules.get(file)
    const exports = {}
    modules.set(file, exports)
    let source = fs.readFileSync(file, 'utf8').replaceAll('import.meta.env.VITE_SUPABASE_URL', '"https://test.supabase.invalid"')
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    const requireStub = (name) => {
      if (name === './agents') return { callAi: ai }
      if (name.endsWith('/supabase') || name === './supabase') return { supabase: {
        auth: database.auth, from: (...args) => database.from(...args), rpc: (...args) => {
          const request = Promise.resolve(database.rpc(...args))
          request.abortSignal = () => request
          return request
        },
      } }
      if (name === 'npm:@supabase/supabase-js@2') return { createClient: () => database }
      const dependency = path.resolve(path.dirname(file), name)
      return load(dependency.endsWith('.ts') ? dependency : dependency + '.ts')
    }
    vm.runInNewContext(code, { exports, require: requireStub, console, URL, Response, Request, AbortController, AbortSignal, DOMException, crypto: webcrypto, TextEncoder,
      setTimeout, clearTimeout, fetch, ...extra }, { filename: file })
    return exports
  }
  return { load, db: database }
}

module.exports = { createHarness, root }
