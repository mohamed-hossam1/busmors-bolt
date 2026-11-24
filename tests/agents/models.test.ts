import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CURRENT_AI_MODE,
  TEST_MODE_ALLOWLIST,
  getEmployeeRoleRoute,
  isProviderModelAllowed,
  type EmployeeRole,
} from '../../src/config/ai-models.ts'

test('test mode is active in this environment', () => {
  // The local .env sets AI_MODE=test; the gateway must never silently be production.
  assert.equal(CURRENT_AI_MODE, 'test')
})

test('test allowlist contains exactly the two approved pairs', () => {
  assert.equal(TEST_MODE_ALLOWLIST.length, 2)
  const pairs = TEST_MODE_ALLOWLIST.map((p) => `${p.provider}/${p.model}`)
  assert.deepEqual(pairs.sort(), [
    'dahl/deepseek-ai/DeepSeek-V4-Flash-0731',
    'groq/openai/gpt-oss-120b',
  ])
})

test('only allowlisted pairs are permitted in test mode', () => {
  assert.equal(isProviderModelAllowed('groq', 'openai/gpt-oss-120b'), true)
  assert.equal(isProviderModelAllowed('dahl', 'deepseek-ai/DeepSeek-V4-Flash-0731'), true)
  // Forbidden in test mode:
  assert.equal(isProviderModelAllowed('groq', 'openai/gpt-oss-20b'), false)
  assert.equal(isProviderModelAllowed('sovereigneg', 'gpt-6-luna'), false)
  assert.equal(isProviderModelAllowed('sovereigneg', 'claude-haiku-5.5'), false)
  assert.equal(isProviderModelAllowed('sovereigneg', 'SovereignEG/Qwen3.8-27B-FP8'), false)
})

test('every test-mode role route resolves to an allowlisted primary', () => {
  const roles: EmployeeRole[] = ['orchestrator', 'director', 'research', 'content', 'marketing_analyst']
  for (const role of roles) {
    const route = getEmployeeRoleRoute(role)
    assert.equal(
      isProviderModelAllowed(route.primary.provider, route.primary.model),
      true,
      `${role} primary must be allowlisted in test mode`,
    )
    for (const fb of route.fallbacks) {
      assert.equal(isProviderModelAllowed(fb.provider, fb.model), true, `${role} fallback must be allowlisted`)
    }
  }
})

test('orchestrator uses the tight Groq envelope; director the Dahl envelope', () => {
  const orch = getEmployeeRoleRoute('orchestrator')
  assert.equal(orch.inputCap, 3000)
  assert.equal(orch.completionCap, 700)
  const dir = getEmployeeRoleRoute('director')
  assert.equal(dir.inputCap, 12000)
  assert.equal(dir.completionCap, 2500)
  const content = getEmployeeRoleRoute('content')
  assert.equal(content.inputCap, 4000)
  assert.equal(content.completionCap, 2000)
})