import test from 'node:test'
import assert from 'node:assert/strict'
import { ORCHESTRATOR_V2_SYSTEM_PROMPT } from '../../src/features/orchestrator/prompt.ts'
import { ORCHESTRATOR_CAPABILITIES } from '../../src/features/orchestrator/contracts.ts'

test('canonical Orchestrator V2 prompt is present and non-trivial', () => {
  assert.equal(typeof ORCHESTRATOR_V2_SYSTEM_PROMPT, 'string')
  assert.ok(ORCHESTRATOR_V2_SYSTEM_PROMPT.length > 500)
  // Key sections from spec §2.3 must be present.
  assert.match(ORCHESTRATOR_V2_SYSTEM_PROMPT, /## Language and Tone/)
  assert.match(ORCHESTRATOR_V2_SYSTEM_PROMPT, /## Business Brain/)
  assert.match(ORCHESTRATOR_V2_SYSTEM_PROMPT, /## Director Delegation/)
  assert.match(ORCHESTRATOR_V2_SYSTEM_PROMPT, /## Security/)
})

test('exactly five Orchestrator logical capabilities with boundaries', () => {
  const names = ORCHESTRATOR_CAPABILITIES.map((c) => c.name)
  assert.deepEqual(names, [
    'read_business_brain',
    'propose_brain_change',
    'delegate_to_director',
    'get_task_status',
    'get_product_knowledge',
  ])
  for (const cap of ORCHESTRATOR_CAPABILITIES) {
    assert.ok(cap.responsibility.length > 0)
    assert.ok(cap.boundary.length > 0)
  }
})

test('the V2 prompt does not promise unavailable capabilities as working', () => {
  // It must route substantive work to the Director, not execute it.
  assert.match(ORCHESTRATOR_V2_SYSTEM_PROMPT, /Delegate/)
  assert.match(ORCHESTRATOR_V2_SYSTEM_PROMPT, /Never invent/)
})