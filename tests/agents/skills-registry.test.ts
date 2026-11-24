import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  SkillRegistry,
  discoverSkills,
  EXPECTED_SKILL_COUNTS,
  EXPECTED_TOTAL_SKILLS,
} from '../../src/server/employee/skills-registry.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..', '..')
const skillsDir = path.join(repoRoot, 'src', 'server', 'employee', 'skills')

test('discovers exactly 26 owner-supplied skills with valid frontmatter', async () => {
  const skills = await discoverSkills(skillsDir)
  assert.equal(skills.length, EXPECTED_TOTAL_SKILLS)
  for (const s of skills) {
    assert.ok(s.name.length > 0, `skill ${s.id} has a name`)
    assert.ok(s.description.length > 0, `skill ${s.id} has a description`)
    assert.equal(s.version, '1.0.0')
    assert.equal(s.owner, 'busmora')
    assert.match(s.contentHash, /^[0-9a-f]{64}$/)
  }
})

test('role counts match the spec exactly (7/5/7/7)', async () => {
  const skills = await discoverSkills(skillsDir)
  const counts: Record<string, number> = {}
  for (const s of skills) counts[s.role] = (counts[s.role] ?? 0) + 1
  for (const [role, expected] of Object.entries(EXPECTED_SKILL_COUNTS)) {
    assert.equal(counts[role] ?? 0, expected, `${role} skill count`)
  }
})

test('no Orchestrator skills exist', async () => {
  const skills = await discoverSkills(skillsDir)
  // The skill role union is director|research|content|marketing_analyst only.
  const roles = new Set(skills.map((s) => s.role as string))
  assert.equal(roles.has('orchestrator'), false)
  assert.deepEqual([...roles].sort(), ['content', 'director', 'marketing_analyst', 'research'])
})

test('catalog exposes only id/name/description/version, never the body or path', async () => {
  const registry = await SkillRegistry.create(skillsDir)
  const catalog = registry.catalog()
  assert.equal(catalog.length, EXPECTED_TOTAL_SKILLS)
  for (const entry of catalog) {
    const keys = Object.keys(entry).sort()
    assert.deepEqual(keys, ['description', 'id', 'name', 'role', 'version'])
    assert.equal('path' in entry, false)
    assert.equal('contentHash' in entry, false)
    assert.equal('body' in entry, false)
  }
})

test('read_skill lazy-loads a registered body and counts distinct usage', async () => {
  const registry = await SkillRegistry.create(skillsDir)
  assert.equal(registry.distinctLoadCount, 0)
  const loaded = await registry.readSkill('kpi-evaluation')
  assert.ok(loaded)
  assert.equal(loaded!.meta.id, 'kpi-evaluation')
  assert.ok(loaded!.body.length > 100)
  // Body excludes frontmatter.
  assert.equal(loaded!.body.startsWith('---'), false)
  assert.equal(registry.distinctLoadCount, 1)
  // Re-read increments load count but not distinct count.
  await registry.readSkill('kpi-evaluation')
  assert.equal(registry.loadCount('kpi-evaluation'), 2)
  assert.equal(registry.distinctLoadCount, 1)
})

test('read_skill rejects unknown ids without reading any file', async () => {
  const registry = await SkillRegistry.create(skillsDir)
  const result = await registry.readSkill('../../etc/passwd')
  assert.equal(result, null)
  const missing = await registry.readSkill('does-not-exist')
  assert.equal(missing, null)
  assert.equal(registry.distinctLoadCount, 0)
})

test('catalogForRole filters to one role', async () => {
  const registry = await SkillRegistry.create(skillsDir)
  const director = registry.catalogForRole('director')
  assert.equal(director.length, 7)
  assert.ok(director.every((d) => d.role === 'director'))
})