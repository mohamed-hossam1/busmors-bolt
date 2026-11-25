import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import { SkillLoader, SkillLoadError } from '../../src/server/employee/skill-loader'

let baseDir: string

async function writeSkill(role: string, id: string, frontmatter: string, body: string): Promise<void> {
  const dir = path.join(baseDir, role, id)
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, 'SKILL.md'), `---\n${frontmatter}\n---\n\n${body}\n`, 'utf8')
}

before(async () => {
  baseDir = await mkdtemp(path.join(tmpdir(), 'busmora-skills-'))
  await writeSkill(
    'director',
    'marketing-strategy',
    'name: marketing-strategy\ndescription: "Strategy skill."\nmetadata:\n  version: "1.2.0"',
    '# Marketing Strategy\n\nBody content here.',
  )
  await writeSkill(
    'content',
    'video-scriptwriting',
    'name: video-scriptwriting\ndescription: "Script skill."\nversion: "2.0.0"',
    '# Video Scriptwriting\n\nScript body.',
  )
})

after(async () => {
  await rm(baseDir, { recursive: true, force: true })
})

describe('SkillLoader catalog', () => {
  it('parses frontmatter (name, description, version) into a compact catalog', async () => {
    const loader = new SkillLoader(baseDir)
    const catalog = await loader.getSkillCatalog('director')
    assert.equal(catalog.length, 1)
    const entry = catalog[0]
    assert.deepEqual(entry, {
      id: 'marketing-strategy',
      name: 'marketing-strategy',
      description: 'Strategy skill.',
      version: '1.2.0',
    })
  })

  it('never returns skill bodies in the catalog', async () => {
    const loader = new SkillLoader(baseDir)
    const catalog = await loader.getSkillCatalog('content')
    const keys = Object.keys(catalog[0]).sort()
    assert.deepEqual(keys, ['description', 'id', 'name', 'version'])
    assert.equal('content' in catalog[0], false)
  })

  it('reads a top-level version field when metadata.version is absent', async () => {
    const loader = new SkillLoader(baseDir)
    const catalog = await loader.getSkillCatalog('content')
    assert.equal(catalog[0].version, '2.0.0')
  })
})

describe('SkillLoader loadSkill', () => {
  it('returns full content, version, and hash for a registered skill', async () => {
    const loader = new SkillLoader(baseDir)
    const skill = await loader.loadSkill('director', 'marketing-strategy')
    assert.equal(skill.id, 'marketing-strategy')
    assert.equal(skill.version, '1.2.0')
    assert.match(skill.content, /Marketing Strategy/)
    assert.equal(skill.newlyLoaded, true)
    assert.match(skill.hash, /^[0-9a-f]{16}$/)
  })

  it('deduplicates repeated reads within a run via the tracker', async () => {
    const loader = new SkillLoader(baseDir)
    const loaded = new Set<string>()
    const tracker = { recordSkillLoad: (id: string) => (loaded.has(id) ? false : (loaded.add(id), true)) }

    const first = await loader.loadSkill('director', 'marketing-strategy', tracker)
    const second = await loader.loadSkill('director', 'marketing-strategy', tracker)
    assert.equal(first.newlyLoaded, true)
    assert.equal(second.newlyLoaded, false)
    assert.equal(loaded.size, 1)
  })

  it('rejects path traversal attempts', async () => {
    const loader = new SkillLoader(baseDir)
    await assert.rejects(
      () => loader.loadSkill('director', '../../etc/passwd'),
      (error: unknown) => error instanceof SkillLoadError && error.outcome === 'rejected',
    )
  })

  it('rejects unregistered skills for the role', async () => {
    const loader = new SkillLoader(baseDir)
    await assert.rejects(
      () => loader.loadSkill('director', 'video-scriptwriting'),
      (error: unknown) => error instanceof SkillLoadError && error.outcome === 'rejected',
    )
  })
})