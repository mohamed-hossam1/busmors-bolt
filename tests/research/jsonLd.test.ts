import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractJsonLdBlocks, parseSchemaObjects, schemaToBrainCandidates } from '../../src/server/jsonLd'
import { discoverSitemapLinks } from '../../src/server/siteReader'

test('jsonLd: extracts JSON-LD blocks from single, array, and @graph scripts', () => {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "Organization",
            "name": "Cilantro Cafe",
            "description": "Specialty coffee roasters and cafe chain in Egypt.",
            "telephone": "+201201200061",
            "email": "customerservice@cilantrocafe.net",
            "sameAs": [
              "https://www.facebook.com/cilantrocafee",
              "https://www.instagram.com/cilantro.cafe"
            ]
          }
        </script>
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "Product",
                "name": "Platinum Coffee Beans 250g",
                "description": "Premium whole roasted coffee beans",
                "offers": {
                  "@type": "Offer",
                  "price": 550,
                  "priceCurrency": "EGP",
                  "availability": "https://schema.org/InStock"
                }
              },
              {
                "@type": "FAQPage",
                "mainEntity": [
                  {
                    "@type": "Question",
                    "name": "Do you deliver across Egypt?",
                    "acceptedAnswer": {
                      "@type": "Answer",
                      "text": "Yes, delivery takes 2 to 3 business days across Greater Cairo and Alexandria."
                    }
                  }
                ]
              }
            ]
          }
        </script>
      </head>
      <body><h1>Welcome</h1></body>
    </html>
  `

  const blocks = extractJsonLdBlocks(html)
  assert.equal(blocks.length, 3, 'Should extract 1 org block + 2 blocks from @graph')

  const parsed = parseSchemaObjects(blocks, 'https://cilantro.cafe/')
  assert.equal(parsed.companyName, 'Cilantro Cafe')
  assert.equal(parsed.telephone, '+201201200061')
  assert.equal(parsed.email, 'customerservice@cilantrocafe.net')
  assert.equal(parsed.socialLinks.length, 2)
  assert.equal(parsed.products.length, 1)
  assert.equal(parsed.products[0].name, 'Platinum Coffee Beans 250g')
  assert.equal(parsed.products[0].price, 550)
  assert.equal(parsed.products[0].currency, 'EGP')
  assert.equal(parsed.faqs.length, 1)
  assert.equal(parsed.faqs[0].question, 'Do you deliver across Egypt?')
})

test('jsonLd: converts parsed schema into verified Brain candidates with evidence quotes', () => {
  const blocks = [
    {
      '@type': 'Restaurant',
      name: 'Gourmet Cairo',
      description: 'Artisanal bakery and organic food supplier in Zamalek.',
      telephone: '+20227351111',
      address: {
        streetAddress: '21 Brazil St',
        addressLocality: 'Zamalek',
        addressRegion: 'Cairo',
      },
      sameAs: ['https://instagram.com/gourmetcairo'],
    },
    {
      '@type': 'Product',
      name: 'Organic Sourdough Bread',
      description: 'Freshly baked sourdough loaf with natural fermentation.',
      offers: {
        price: '120.00',
        priceCurrency: 'EGP',
        availability: 'InStock',
      },
    },
  ]

  const parsed = parseSchemaObjects(blocks, 'https://gourmet.example/')
  const candidates = schemaToBrainCandidates(parsed, 'https://gourmet.example/')

  const profile = candidates.find((c) => c.category === 'company_profile')
  assert.ok(profile, 'Should create company_profile candidate')
  assert.equal(profile?.title, 'Gourmet Cairo')
  assert.equal(profile?.confidence, 0.95)
  assert.equal(profile?.properties.extracted_by, 'json_ld')
  assert.ok(profile?.properties.evidence_quote, 'Must have evidence quote')

  const product = candidates.find((c) => c.category === 'offering')
  assert.ok(product, 'Should create offering candidate')
  assert.equal(product?.title, 'Organic Sourdough Bread')
  assert.equal(product?.properties.price, 120)
  assert.equal(product?.properties.currency, 'EGP')

  const phone = candidates.find((c) => c.title === 'Official Telephone')
  assert.ok(phone, 'Should extract official telephone')
  assert.equal(phone?.properties.phone, '+20227351111')

  const location = candidates.find((c) => c.title === 'Business Location')
  assert.ok(location, 'Should extract location address')
  assert.ok(String(location?.summary).includes('Zamalek'))

  const channel = candidates.find((c) => c.category === 'channel')
  assert.ok(channel, 'Should extract social media channel')
})

test('sitemap: discovers and prioritizes product and about pages', async () => {
  // Mock fetch for sitemap.xml
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/sitemap.xml')) {
        return new Response(`
          <?xml version="1.0" encoding="UTF-8"?>
          <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
            <url><loc>https://example.com/privacy-policy</loc></url>
            <url><loc>https://example.com/about-us</loc></url>
            <url><loc>https://example.com/products/fresh-coffee</loc></url>
            <url><loc>https://example.com/pricing</loc></url>
          </urlset>
        `, { status: 200, headers: { 'Content-Type': 'application/xml' } })
      }
      return new Response('Not found', { status: 404 })
    }

    const links = await discoverSitemapLinks('https://example.com')
    assert.ok(links.length >= 3, 'Should extract high-value sitemap URLs')
    // Top prioritized links should be about, products, or pricing
    assert.ok(/about|product|pricing/i.test(links[0]), 'First link should have high link priority')
    // Privacy policy should be excluded or ranked lower
    assert.ok(!links.includes('https://example.com/privacy-policy'), 'Privacy policy should be excluded')
  } finally {
    globalThis.fetch = originalFetch
  }
})
