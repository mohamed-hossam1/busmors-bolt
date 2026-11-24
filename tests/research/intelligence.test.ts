import test from 'node:test'
import assert from 'node:assert/strict'
import { inferSector } from '../../src/features/research/references/source-registry'
import { inferCategory, buildBrief, buildResearchQueries } from '../../src/features/research/director/brief'
import { scopeFromGovernorates, geographyLabelAr } from '../../src/features/research/references/geography'

test('inferSector correctly classifies Arabic and English SaaS / MarTech', () => {
  assert.equal(inferSector('منصة تسويق ذكية - Busmora'), 'saas')
  assert.equal(inferSector('برمجيات إدارة الحملات بالذكاء الاصطناعي'), 'saas')
  assert.equal(inferSector('أداة تسويق وأتمتة السوشيال ميديا'), 'saas')
  assert.equal(inferSector('AI Marketing Platform with automation'), 'saas')
  assert.equal(inferSector('متجر ملابس وأحذية'), 'retail')
  assert.equal(inferSector('مطعم ومقهى للمأكولات الشرقية'), 'restaurants')
})

test('inferCategory extracts accurate marketing platform category', () => {
  const cat = inferCategory('منصة تسويق ذكية - Busmora', 'saas')
  assert.equal(cat.label, 'ai marketing platform')
  assert.equal(cat.labelAr, 'منصة تسويق ذكية')
})

test('scopeFromGovernorates eliminates unverified scope for Egyptian profiles', () => {
  const geo1 = scopeFromGovernorates([], 'منصة تسويق ذكية في مصر')
  assert.equal(geo1.egyptWide, true)
  assert.ok(!geo1.label.includes('unverified'))
  assert.equal(geographyLabelAr(geo1.label), 'مصر (نطاق عام)')

  const geo2 = scopeFromGovernorates(['Cairo', 'Giza'], 'شركة في القاهرة والجيزة')
  assert.ok(!geo2.label.includes('unverified'))
})

test('buildResearchQueries produces targeted Arabic and English queries for Busmora', () => {
  const brief = buildBrief({
    request: 'Analyze my competitors',
    mode: 'standard',
    profile: {
      name: 'منصة تسويق ذكية - Busmora',
      sector: 'saas',
      description: 'منصة تسويق ذكية تقدم حلول إدارة الحملات وأدوات الذكاء الاصطناعي وصناعة المحتوى للشركات في مصر والشرق الأوسط',
      governorates: ['Cairo', 'Giza', 'Alexandria'],
      channels: ['website'],
      website: 'https://www.busmora.com',
      audience: 'أصحاب المشاريع والشركات الناشئة في مصر',
    },
  })

  assert.equal(brief.stopRules.maxQueryRounds, 2)
  const queries = buildResearchQueries(brief, 10)
  assert.ok(queries.length >= 4)
  // Queries must NEVER include the startup brand name (Busmora)
  for (const q of queries) {
    assert.ok(!q.toLowerCase().includes('busmora'), `Query should not contain brand name: ${q}`)
    assert.ok(!q.includes('unverified scope'))
  }
  // Queries must focus on category, pricing, and services
  assert.ok(queries.some(q => q.includes('أسعار باقات') || q.includes('pricing plans')))
  assert.ok(queries.some(q => q.includes('منصة تسويق ذكية') || q.includes('ai marketing platform')))
})

test('buildResearchQueries strictly prioritizes aiQueries when provided', () => {
  const customAiQueries = [
    'منصات تسويق رقمي في مصر',
    'أدوات الذكاء الاصطناعي لإدارة الحملات مصر',
    'أسعار باقات التسويق الإلكتروني في مصر',
    'marketing automation tools pricing Egypt',
  ]
  const brief = buildBrief({
    request: 'Analyze my competitors',
    mode: 'standard',
    profile: {
      name: 'Busmora',
      sector: 'saas',
      description: 'AI marketing platform',
      governorates: ['Cairo'],
      channels: ['website'],
      website: null,
      audience: 'Startups',
    },
    aiQueries: customAiQueries,
    knownCompetitors: ['Convertedin', 'WideBot'],
  })

  const queries = buildResearchQueries(brief, 10)
  assert.deepEqual(queries, customAiQueries)
  assert.deepEqual(brief.knownCompetitors, ['Convertedin', 'WideBot'])
})

