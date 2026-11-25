import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { normalizeBullets } from '../../src/components/chat/MarkdownContent'

describe('normalizeBullets', () => {
  it('normalizes bullets with no trailing space into standard markdown bullets', () => {
    assert.equal(normalizeBullets('*المنصات'), '* المنصات')
    assert.equal(normalizeBullets('-مشروع'), '- مشروع')
    assert.equal(normalizeBullets('•تيك توك'), '- تيك توك')
  })

  it('preserves valid markdown syntax such as bold and horizontal rules', () => {
    assert.equal(normalizeBullets('**كلمة مهمة**'), '**كلمة مهمة**')
    assert.equal(normalizeBullets('---'), '---')
    assert.equal(normalizeBullets('* already formatted'), '* already formatted')
    assert.equal(normalizeBullets('- already formatted'), '- already formatted')
  })

  it('handles multi-line input correctly', () => {
    const raw = '*الهدف الأول\n*الهدف الثاني\n**ملاحظة**'
    const expected = '* الهدف الأول\n* الهدف الثاني\n**ملاحظة**'
    assert.equal(normalizeBullets(raw), expected)
  })
})

