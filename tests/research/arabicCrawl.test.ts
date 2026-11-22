import test from 'node:test'
import assert from 'node:assert/strict'
import { detectLanguageFromCorpus } from '../../src/server/crawl'
import { cleanCrawlText } from '../../src/lib/crawlContent'
import { CRAWL_PROMPTS } from '../../src/server/ai/crawl-prompts'

test('detectLanguageFromCorpus detects Arabic strictly from text content regardless of URL', () => {
  const arabicTextWithoutUrl = 'بي تك | أفضل عروض وتخفيضات على الأجهزة الكهربائية والإلكترونية في مصر'
  // Plain domain with no /ar in URL
  assert.equal(detectLanguageFromCorpus(arabicTextWithoutUrl, 'https://btech.com'), 'ar')
  assert.equal(detectLanguageFromCorpus(arabicTextWithoutUrl), 'ar')

  // English text even if URL happens to contain /ar or something similar
  const englishText = 'Cilantro is a premier specialty coffee store providing whole beans, ground coffee, and accessories.'
  assert.equal(detectLanguageFromCorpus(englishText, 'https://cilantro.cafe/article'), 'en')
  assert.equal(detectLanguageFromCorpus('About our company and services', 'https://example.com/ar'), 'en')
})

test('cleanCrawlText strips markdown images and link targets while preserving text', () => {
  const raw = '## عروض بلاك فرايداي\n\n![Image 1: ابل ايفون 16](https://img.com/pic.jpg)\n\n[عرض الكل](https://btech.com/ar/collection/LIVE)\n\nخصم 6000 ج.م'
  const cleaned = cleanCrawlText(raw)
  assert.ok(!cleaned.includes('https://img.com/pic.jpg'))
  assert.ok(!cleaned.includes('https://btech.com/ar/collection/LIVE'))
  assert.ok(cleaned.includes('عروض بلاك فرايداي'))
  assert.ok(cleaned.includes('عرض الكل'))
  assert.ok(cleaned.includes('خصم 6000 ج.م'))
})

test('DEFAULT_CRAWL_PAGES is capped at 5', async () => {
  const { DEFAULT_CRAWL_PAGES } = await import('../../src/server/siteReader')
  assert.equal(DEFAULT_CRAWL_PAGES, 5)
})

