import 'server-only'
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

/**
 * Employee skill registry (spec §3.4, §4.3, §5.3, §6.3; plan §1C).
 *
 * Server-only. Discovers the owner-supplied SKILL.md files, validates their
 * frontmatter (name, description, version, owner), computes a pinned content
 * hash, and exposes a compact catalog (name + description only) plus a lazy
 * read_skill loader that returns the full body for a selected registered id.
 *
 * Rules enforced here:
 *  - No arbitrary filesystem reads; only registered skill ids resolve.
 *  - Distinct successful loads are counted; attempts/catalog-shown are not.
 *  - Version/hash are pinned per run; re-reads are deduplicated by the caller.
 *  - No Orchestrator skills exist.
 */

export type EmployeeRoleDir = 'director' | 'research' | 'content' | 'marketing-analyst'

const ROLE_DIRS: readonly EmployeeRoleDir[] = ['director', 'research', 'content', 'marketing-analyst']

/** Map an internal role dir to the runtime AgentRole name. */
export const ROLE_DIR_TO_AGENT: Record<EmployeeRoleDir, 'director' | 'research' | 'content' | 'marketing_analyst'> = {
  director: 'director',
  research: 'research',
  content: 'content',
  'marketing-analyst': 'marketing_analyst',
}

export interface SkillMeta {
  /** Registry-unique id (also the folder name). */
  id: string
  /** Role this skill belongs to. */
  role: 'director' | 'research' | 'content' | 'marketing_analyst'
  /** Human name from frontmatter. */
  name: string
  /** Short description shown in the initial catalog (never the full body). */
  description: string
  version: string
  owner: string
  /** SHA-256 of the raw SKILL.md bytes (pinned content hash). */
  contentHash: string
  /** Server-only absolute path (never exposed to the model or client). */
  path: string
}

export interface SkillCatalogEntry {
  id: string
  role: SkillMeta['role']
  name: string
  description: string
  version: string
}

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } | null {
  const match = FRONTMATTER_RE.exec(raw)
  if (!match) return null
  const meta: Record<string, string> = {}
  let inMetadata = false
  for (const line of match[1].split('\n')) {
    // Top-level key (no leading whitespace).
    const top = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(line)
    if (top) {
      const key = top[1]
      let value = top[2].trim()
      if (key === 'metadata' && value === '') {
        inMetadata = true
        continue
      }
      inMetadata = false
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      meta[key] = value
      continue
    }
    // Nested key under metadata (indented).
    const nested = /^\s+([A-Za-z0-9_]+):\s*(.*)$/.exec(line)
    if (nested && inMetadata) {
      const key = nested[1]
      let value = nested[2].trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      // Flatten metadata.version -> version, metadata.owner -> owner.
      if (!(key in meta)) meta[key] = value
    }
  }
  return { meta, body: match[2] }
}

/** Compute the SHA-256 of a SKILL.md file's raw bytes. */
export function hashSkillContent(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex')
}

function skillsRoot(): string {
  // src/server/employee/skills — resolved relative to this module at runtime.
  return path.join(process.cwd(), 'src', 'server', 'employee', 'skills')
}

/** Discover and parse every registered skill. Pure-ish; reads the server-only dir. */
export async function discoverSkills(rootDir: string = skillsRoot()): Promise<SkillMeta[]> {
  const out: SkillMeta[] = []
  for (const roleDir of ROLE_DIRS) {
    let entries: import('node:fs').Dirent[]
    try {
      entries = await readdir(path.join(rootDir, roleDir), { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const file = path.join(rootDir, roleDir, entry.name, 'SKILL.md')
      let raw: string
      try {
        raw = await readFile(file, 'utf8')
      } catch {
        continue
      }
      const parsed = parseFrontmatter(raw)
      if (!parsed) continue
      const { meta } = parsed
      if (!meta.name || !meta.version) continue
      out.push({
        id: entry.name,
        role: ROLE_DIR_TO_AGENT[roleDir],
        name: meta.name,
        description: meta.description ?? '',
        version: meta.version,
        owner: meta.owner ?? '',
        contentHash: hashSkillContent(raw),
        path: file,
      })
    }
  }
  return out
}

/**
 * In-memory registry with lazy loading and load counting.
 *
 * The caller injects the discovered skill list (or a mock in tests). The registry
 * never reads arbitrary paths: only ids present at construction resolve.
 */
export class SkillRegistry {
  private readonly byId = new Map<string, SkillMeta>()
  private readonly loadCounts = new Map<string, number>()
  /** Distinct ids successfully loaded at least once. */
  private readonly loadedDistinct = new Set<string>()

  constructor(skills: SkillMeta[]) {
    for (const s of skills) this.byId.set(s.id, s)
  }

  static async create(rootDir?: string): Promise<SkillRegistry> {
    return new SkillRegistry(await discoverSkills(rootDir))
  }

  /** Compact catalog for the initial context (name + description only). */
  catalog(): SkillCatalogEntry[] {
    return [...this.byId.values()].map((s) => ({
      id: s.id,
      role: s.role,
      name: s.name,
      description: s.description,
      version: s.version,
    }))
  }

  /** Catalog filtered to a role (Director sees only Director skills, etc.). */
  catalogForRole(role: SkillMeta['role']): SkillCatalogEntry[] {
    return this.catalog().filter((c) => c.role === role)
  }

  has(id: string): boolean {
    return this.byId.has(id)
  }

  meta(id: string): SkillMeta | null {
    return this.byId.get(id) ?? null
  }

  /** Distinct successful loads (spec: count actual distinct usage, not attempts). */
  get distinctLoadCount(): number {
    return this.loadedDistinct.size
  }

  /** Total load events (including repeated reads), for trace accounting. */
  loadCount(id: string): number {
    return this.loadCounts.get(id) ?? 0
  }

  /**
   * Lazy load a registered skill body. Returns null for unknown ids (never an
   * arbitrary path read). Records a load event on success.
   */
  async readSkill(id: string): Promise<{ meta: SkillMeta; body: string } | null> {
    const meta = this.byId.get(id)
    if (!meta) return null
    let raw: string
    try {
      raw = await readFile(meta.path, 'utf8')
    } catch {
      return null
    }
    const parsed = parseFrontmatter(raw)
    if (!parsed) return null
    // Pin the hash: if the file changed since discovery, refuse the stale load.
    if (hashSkillContent(raw) !== meta.contentHash) return null
    this.loadCounts.set(id, (this.loadCounts.get(id) ?? 0) + 1)
    this.loadedDistinct.add(id)
    return { meta, body: parsed.body.trim() }
  }
}

/** Expected role → skill count (spec §3.4/4.3/5.3/6.3). */
export const EXPECTED_SKILL_COUNTS: Record<SkillMeta['role'], number> = {
  director: 7,
  research: 5,
  content: 7,
  marketing_analyst: 7,
}

export const EXPECTED_TOTAL_SKILLS = 26