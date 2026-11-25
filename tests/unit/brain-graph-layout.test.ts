import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { calculateBrainPositions } from '../../src/lib/brainGraphLayout'
import type { BrainNode } from '../../src/lib/types'

function makeNode(overrides: Partial<BrainNode> & Pick<BrainNode, 'id' | 'category' | 'title' | 'created_at'>): BrainNode {
  return {
    workspace_id: 'ws-1',
    summary: '',
    properties: {},
    status: 'approved',
    source: 'manual',
    source_detail: null,
    confidence: 1,
    version: 1,
    updated_at: overrides.created_at,
    ...overrides,
  }
}

describe('calculateBrainPositions', () => {
  it('keeps the earliest approved company_profile as center hub and places extra company_profile nodes in a branch', () => {
    // BrainPage loads nodes ordered by created_at DESC (newest first).
    const newestExtra = makeNode({
      id: 'new-extra',
      category: 'company_profile',
      title: 'المناطق الجغرافية وعرض التجربة المجانية',
      created_at: '2026-11-25T14:10:48.000Z',
    })
    const originalCompany = makeNode({
      id: 'orig-company',
      category: 'company_profile',
      title: 'BusMora - منصة تسويق ذكية للمشاريع',
      created_at: '2026-11-25T14:07:29.000Z',
    })
    const offering = makeNode({
      id: 'off-1',
      category: 'offering',
      title: 'خطط الاشتراك',
      created_at: '2026-11-25T14:07:29.000Z',
    })

    const layout = calculateBrainPositions([newestExtra, offering, originalCompany])

    assert.equal(layout.hubId, originalCompany.id)
    assert.equal(layout.hubNode?.id, originalCompany.id)
    assert.ok(layout.positions.has(originalCompany.id), 'hub must have a position')
    assert.ok(layout.positions.has(newestExtra.id), 'extra company_profile must have a position, never orphaned')
    const allCats = [...layout.rightCategories, ...layout.leftCategories]
    assert.ok(allCats.includes('company_profile'), 'extra company_profile needs a branch category pill')
  })

  it('prefers an approved company_profile over an older candidate company_profile', () => {
    const candidateOld = makeNode({
      id: 'cand-old',
      category: 'company_profile',
      title: 'Draft profile',
      status: 'candidate',
      created_at: '2026-11-25T10:00:00.000Z',
    })
    const approvedNewer = makeNode({
      id: 'app-new',
      category: 'company_profile',
      title: 'BusMora',
      status: 'approved',
      created_at: '2026-11-25T12:00:00.000Z',
    })

    const layout = calculateBrainPositions([candidateOld, approvedNewer])
    assert.equal(layout.hubId, approvedNewer.id)
    assert.ok(layout.positions.has(candidateOld.id))
  })
})
