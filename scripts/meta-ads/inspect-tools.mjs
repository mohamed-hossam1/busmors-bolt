// Phase 0 (docs/research/meta-ads-implementation-plan.md): READ-ONLY dump of the Composio
// 'metaads' tool schemas. Never calls tools.execute and never touches any ad account.
// Usage: node --env-file=.env scripts/meta-ads/inspect-tools.mjs
// Output: .scratch/meta-ads/metaads-tools.json (git-ignored) + a short summary on the console.
import { mkdirSync, writeFileSync } from 'node:fs'
import { Composio } from '@composio/core'

if (!process.env.COMPOSIO_API_KEY) {
  console.error('COMPOSIO_API_KEY is not set. Run with: node --env-file=.env scripts/meta-ads/inspect-tools.mjs')
  process.exit(2)
}

const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY })
const result = await composio.tools.getRawComposioTools({ toolkits: ['metaads'], limit: 500 })
const tools = Array.isArray(result) ? result : (result?.items ?? [])

const rows = tools.map((tool) => ({
  slug: tool.slug,
  version: tool.version,
  description: String(tool.description ?? '').slice(0, 300),
  input: tool.inputParameters,
}))

mkdirSync('.scratch/meta-ads', { recursive: true })
writeFileSync('.scratch/meta-ads/metaads-tools.json', JSON.stringify(rows, null, 2), 'utf8')

const FORBIDDEN = /CREATE|UPDATE|DELETE|SET_|PAUSE|UPLOAD|ARCHIVE|COPY/
const argNames = (tool) => Object.keys(tool.input?.properties ?? {}).join(', ')

console.log(`Saved ${rows.length} metaads tools to .scratch/meta-ads/metaads-tools.json\n`)

console.log('Candidates for "list ad accounts" (read-only, slug mentions ACCOUNT):')
for (const tool of rows.filter((t) => /ACCOUNT/.test(t.slug) && !FORBIDDEN.test(t.slug))) {
  console.log(`  ${tool.slug}  [version ${tool.version}]\n    args: ${argNames(tool)}\n    ${tool.description.slice(0, 160)}`)
}

const insights = rows.find((t) => t.slug === 'METAADS_GET_INSIGHTS')
console.log('\nMETAADS_GET_INSIGHTS:')
if (insights) {
  console.log(`  version: ${insights.version}\n  args: ${argNames(insights)}\n  required: ${(insights.input?.required ?? []).join(', ')}`)
} else {
  console.log('  NOT FOUND - stop and tell the team.')
}
