import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeDecision, DIRECT_DEFAULT_REPLY } from '../../src/features/orchestrator/decision'

test('normalize: valid direct decision is preserved', () => {
  const d = normalizeDecision(JSON.stringify({ path: 'direct', reply: 'Hello there' }))
  assert.equal(d.path, 'direct')
  assert.equal(d.reply, 'Hello there')
})

test('normalize: valid brain decision is preserved', () => {
  const d = normalizeDecision(JSON.stringify({ path: 'brain', brainQuery: 'prices' }))
  assert.equal(d.path, 'brain')
  assert.equal(d.brainQuery, 'prices')
})

test('normalize: valid task decision keeps intent and quantity', () => {
  const d = normalizeDecision(JSON.stringify({ path: 'task', intent: 'content_creation', quantity: 5 }))
  assert.equal(d.path, 'task')
  assert.equal(d.intent, 'content_creation')
  assert.equal(d.quantity, 5)
})

test('normalize: unknown path falls back to direct', () => {
  const d = normalizeDecision(JSON.stringify({ path: 'nonsense', reply: 'x' }))
  assert.equal(d.path, 'direct')
})

test('normalize: unknown intent falls back to simple_answer', () => {
  const d = normalizeDecision(JSON.stringify({ path: 'task', intent: 'hack_the_planet', quantity: 1 }))
  assert.equal(d.intent, 'simple_answer')
})

test('normalize: quantity is clamped to 1..12', () => {
  assert.equal(normalizeDecision(JSON.stringify({ path: 'task', intent: 'content_creation', quantity: 99 })).quantity, 12)
  assert.equal(normalizeDecision(JSON.stringify({ path: 'task', intent: 'content_creation', quantity: 0 })).quantity, 1)
})

test('normalize: non-JSON prose is answered as direct text', () => {
  const d = normalizeDecision('Sure, I can help with that.')
  assert.equal(d.path, 'direct')
  assert.equal(d.reply, 'Sure, I can help with that.')
})

test('normalize: non-JSON braces fall back to the safe default reply', () => {
  const d = normalizeDecision('{ broken json')
  assert.equal(d.path, 'direct')
  assert.equal(d.reply, DIRECT_DEFAULT_REPLY)
})