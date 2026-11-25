import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ensureNonEmptyReply, isArabicText } from '../../src/server/employee/reply'
import { createEmployeeRunState } from '../../src/server/employee/run-state'

describe('isArabicText', () => {
  it('detects Arabic script and rejects non-Arabic', () => {
    assert.equal(isArabicText('احفظ عندك اننا شغالين في مصر'), true)
    assert.equal(isArabicText('Save this fact'), false)
    assert.equal(isArabicText(''), false)
    assert.equal(isArabicText(null), false)
  })
})

describe('ensureNonEmptyReply', () => {
  it('preserves a non-empty model reply verbatim (trimmed)', () => {
    const state = createEmployeeRunState()
    assert.equal(ensureNonEmptyReply('  hello there  ', state, false), 'hello there')
  })

  it('synthesizes an Arabic clarification message when the turn only asked a question', () => {
    const state = createEmployeeRunState()
    state.clarification = {
      questions: [
        { id: 'q1', question: 'أي فرع؟', type: 'single', options: ['القاهرة'], allowCustom: true, notSure: true },
      ],
    }
    const reply = ensureNonEmptyReply('', state, true)
    assert.ok(reply.trim().length > 0)
    assert.equal(isArabicText(reply), true)
  })

  it('synthesizes a Brain proposal confirmation (English) for a tool-only turn', () => {
    const state = createEmployeeRunState()
    state.brainProposals.push({
      proposalId: 'p1',
      action: 'add',
      title: 'Offices',
      summary: 'We operate in Egypt and Saudi Arabia.',
      category: 'company_fact',
      oldValues: null,
      newValues: null,
      properties: null,
      source: 'conversation',
      rationale: 'Owner stated it.',
      baseVersion: 0,
      duplicate: false,
      conflict: false,
    })
    const reply = ensureNonEmptyReply('   ', state, false)
    assert.ok(reply.trim().length > 0)
    assert.equal(isArabicText(reply), false)
  })

  it('synthesizes a deliverable/draft confirmation when something was saved', () => {
    const state = createEmployeeRunState()
    state.drafts.push({ postId: 'post-1', version: 1, created: true, proposedFor: null })
    const reply = ensureNonEmptyReply(undefined, state, true)
    assert.ok(reply.trim().length > 0)
    assert.equal(isArabicText(reply), true)
  })

  it('surfaces Director reply verbatim when orchestrator produces no prose', () => {
    const state = createEmployeeRunState()
    state.directorReply = 'دي خطة التسويق للشهر القادم...'
    const reply = ensureNonEmptyReply('', state, true)
    assert.equal(reply, 'دي خطة التسويق للشهر القادم...')
  })

  it('falls back to a generic non-empty prompt when nothing was produced', () => {
    const state = createEmployeeRunState()
    const en = ensureNonEmptyReply('', state, false)
    const ar = ensureNonEmptyReply(null, state, true)
    assert.ok(en.trim().length > 0)
    assert.ok(ar.trim().length > 0)
    assert.notEqual(en, ar)
  })
})