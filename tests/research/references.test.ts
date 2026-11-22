import { test } from 'node:test'
import assert from 'node:assert/strict'
import { arabiziToArabic, buildQueryPack, detectLanguage, isArabizi, normalizeText } from '../../src/features/research/references/lexicon'
import { dedupeEntities, resolveEntity } from '../../src/features/research/references/entity-resolution'
import { compareLandedPrices, landedPrice, normalizePriceObservation, parsePackSize, parsePriceText, vatAmount } from '../../src/features/research/references/pricing'
import { GREATER_CAIRO, checkGeographyGeneralization, geographyCoverage, normalizeGovernorate, scopeFromGovernorates } from '../../src/features/research/references/geography'
import { confidenceFromScore, evaluateClaim, recencyScore, scoreClaim } from '../../src/features/research/references/rubric'
import { routeForSector, routeSources } from '../../src/features/research/references/source-registry'

test('lexicon: Arabic, Egyptian, Arabizi and misspellings all become queries', () => {
  const pack = buildQueryPack('ceramic repair')
  const queries = pack.map(item => item.query)
  assert.ok(queries.includes('تصليح سيراميك'))
  assert.ok(queries.includes('ceramic repair'))
  assert.ok(queries.includes('tsle7 sramic'))
  assert.ok(queries.includes('seramic repair'))
  assert.ok(pack.some(item => item.script === 'arabizi'))
  assert.equal(detectLanguage('تصليح سيراميك'), 'ar-EG')
  assert.equal(isArabizi('tsle7 sramic'), true)
  const arabiziArabic = arabiziToArabic('tsle7 sramic')
  assert.match(arabiziArabic, /[\u0600-\u06FF]/)
  assert.match(arabiziArabic, /سرام/)
  assert.equal(normalizeText('أحمد   أحمد'), 'احمد احمد')
})

test('entity resolution: brand, branch and seller stay distinct', () => {
  const brand = resolveEntity({ brand: 'Cairo Ceramic Studio', website: 'https://www.caioceramic.com' })
  assert.equal(brand.level, 'brand')
  const branch = resolveEntity({ brand: 'Cairo Ceramic Studio', website: 'https://caioceramic.com', branch: 'Maadi', governorate: 'Cairo' })
  assert.equal(branch.level, 'branch')
  assert.equal(branch.parentKey, brand.key)
  const seller = resolveEntity({ brand: 'Kitchenware Co', seller: 'Home Box', platform: 'facebook', governorate: 'Cairo' })
  assert.equal(seller.level, 'marketplace_seller')
  const dedupe = dedupeEntities([
    { brand: 'Home Box', website: 'https://homebox.com' },
    { brand: 'Home Box Egypt', website: 'https://www.homebox.com/prices' },
  ])
  assert.equal(dedupe.unique.length, 1)
  assert.equal(dedupe.duplicates.length, 1)
  assert.ok(dedupe.duplicateRate > 0 && dedupe.duplicateRate <= 0.5)
})

test('pricing: Egyptian prices, VAT, landed totals and offers', () => {
  assert.deepEqual(parsePriceText('1,450 جنيه'), { amount: 1450, currency: 'EGP' })
  assert.deepEqual(parsePriceText('EGP 320'), { amount: 320, currency: 'EGP' })
  assert.deepEqual(parsePriceText('1.5k جنيه'), { amount: 1500, currency: 'EGP' })
  assert.equal(parsePackSize('12 pcs ceramic set')?.label, '12 unit')
  assert.equal(vatAmount(1200, 0.14, false), 168)
  assert.equal(vatAmount(1200, 0.14, true), 0)
  const observation = normalizePriceObservation({ competitor: 'Pack Egypt', product: 'Box 40x30', packSize: '500 pcs', listPrice: 1200, vatIncluded: false, deliveryFee: 250, capturedAt: '2026-10-01' })
  const landed = landedPrice(observation, { size: 500, unit: 'unit' })
  assert.equal(landed.vatAdded, 168)
  assert.equal(landed.total, 1618)
  assert.match(landed.basis, /VAT 14% added/)
  const withVat = normalizePriceObservation({ competitor: 'Home Box', product: 'Plate set', packSize: '12 pcs', listPrice: 1450, vatIncluded: true, deliveryFee: 60, capturedAt: '2026-10-01' })
  const comparison = compareLandedPrices([withVat, observation])
  assert.equal(comparison.length, 2)
  assert.equal(comparison[0].observation.competitor, 'Pack Egypt')
  assert.ok(comparison.every(row => row.landed.total > 0))
  assert.match(comparison[0].landed.basis, /VAT 14% added/)
})

test('geography: Greater Cairo is never all Egypt', () => {
  assert.equal(normalizeGovernorate('القاهرة'), 'Cairo')
  assert.equal(normalizeGovernorate('6 اكتوبر'), 'Giza')
  assert.ok(GREATER_CAIRO.includes('Giza'))
  const scope = scopeFromGovernorates(['Cairo', 'Giza'])
  assert.equal(scope.egyptWide, false)
  assert.match(scope.label, /Cairo, Giza/)
  const nationwide = checkGeographyGeneralization('all Egypt', 'Cairo, Giza')
  assert.equal(nationwide.ok, false)
  assert.match(nationwide.reason ?? '', /Greater Cairo/)
  const coverage = geographyCoverage(scope, ['Cairo'])
  assert.ok(coverage.gaps.some(gap => gap.includes('Giza')))
})

test('rubric: scores, recency and confidence levels', () => {
  assert.equal(recencyScore(30), 1)
  assert.ok(recencyScore(400) < 0.6)
  const strong = scoreClaim({ authority: 0.95, directness: 1, relevance: 0.9, recencyDays: 20, corroborationCount: 3 })
  assert.ok(strong.score >= 0.82)
  assert.equal(strong.coverage, 'full')
  const weak = scoreClaim({ authority: 0.2, directness: 0.2, relevance: 0.2, recencyDays: 1000, corroborationCount: 0 })
  assert.ok(weak.score < 0.5)
  assert.equal(confidenceFromScore(strong.score, 3, 0.95), 'strong')
  assert.equal(confidenceFromScore(weak.score, 0, 0.2), 'hypothesis')
})

test('rubric: a claim without evidence is missing, not zero', () => {
  const quality = evaluateClaim({ statement: 'No source', geography: 'Cairo' }, [], [])
  assert.equal(quality.coverage, 'none')
  assert.match(quality.reasons.join(' '), /Missing is not zero/)
})

test('source registry: official sources route first per sector', () => {
  const route = routeForSector('construction')
  assert.equal(route.sector, 'construction')
  assert.deepEqual(route.official, ['capmas', 'gafi'])
  const sources = routeSources('saas')
  assert.equal(sources[0].tier, 'official')
  assert.ok(sources.some(source => source.id === 'mcit'))
  assert.ok(sources.every(source => source.authority > 0))
})