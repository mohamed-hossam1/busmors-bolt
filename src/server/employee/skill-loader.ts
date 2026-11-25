import { createHash } from 'node:crypto'
import type { Dirent } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'
import type { AgentRole } from '../../config/ai-models'

/**
 * Employee skill loader.
 *
 * Skills are original Busmora marketing skill files stored under
 * `<baseDir>/<agent-role>/<skill-id>/SKILL.md` with `name` / `description`
 * frontmatter and version metadata. The loader:
 *   - registers the on-disk catalog per role (id, name, description, version),
 *   - returns only that compact catalog to the model (never full bodies),
 *   - loads a full skill body only after validating the id against the registry
 *     for that role (no arbitrary filesystem reads, no path traversal),
 *   - computes a content hash and deduplicates repeated reads within a run.
 */

export type SkillRole = AgentRole

export interface SkillSummary {
  id: string
  name: string
  description: string
  version: string
}

export interface LoadedSkill extends SkillSummary {
  /** Full markdown body (frontmatter stripped). */
  content: string
  /** SHA-256 content hash (hex, truncated) for pinning/resume. */
  hash: string
  /** True when this is the first successful load of this skill in the run. */
  newlyLoaded: boolean
}

/** A tracker that deduplicates skill loads within a single run. */
export interface SkillLoadTracker {
  /** Record a load; return true if newly loaded, false if already seen. */
  recordSkillLoad(skillId: string): boolean
}

interface SkillEntry extends SkillSummary {
  filePath: string
  hash: string
}

const DEFAULT_VERSION = '0.0.0'
const HASH_LENGTH = 16

function moduleBaseDir(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), 'skills')
}

function resolveBaseDir(baseDir?: string): string {
  return baseDir ?? process.env.EMPLOYEE_SKILLS_DIR ?? moduleBaseDir()
}

function isValidSkillId(skillId: string): boolean {
  return (
    typeof skillId === 'string' &&
    skillId.length > 0 &&
    skillId.length <= 128 &&
    !skillId.includes('/') &&
    !skillId.includes('\\') &&
    !skillId.includes('..')
  )
}

function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex').slice(0, HASH_LENGTH)
}

function readVersion(data: Record<string, unknown>, fallback: string): string {
  const direct = data.version
  if (typeof direct === 'string' && direct.trim()) return direct.trim()
  const metadata = data.metadata
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const v = (metadata as Record<string, unknown>).version
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return fallback
}

export class SkillLoader {
  private readonly baseDir: string
  private readonly cache = new Map<string, Promise<SkillEntry[]>>()

  constructor(baseDir?: string) {
    this.baseDir = resolveBaseDir(baseDir)
  }

  private async readSkillFile(filePath: string, id: string): Promise<SkillEntry | null> {
    let raw: string
    try {
      raw = await readFile(filePath, 'utf8')
    } catch {
      return null
    }
    let parsed: ReturnType<typeof matter>
    try {
      parsed = matter(raw)
    } catch {
      return null
    }
    const data = (parsed.data ?? {}) as Record<string, unknown>
    const name = typeof data.name === 'string' && data.name.trim() ? data.name.trim() : id
    const description =
      typeof data.description === 'string' && data.description.trim() ? data.description.trim() : ''
    const version = readVersion(data, DEFAULT_VERSION)
    return {
      id,
      name,
      description,
      version,
      filePath,
      hash: hashContent(parsed.content),
    }
  }

  private async loadRoleEntries(role: string): Promise<SkillEntry[]> {
    const roleDir = path.join(this.baseDir, role)
    let entries: Dirent[]
    try {
      entries = await readdir(roleDir, { withFileTypes: true })
    } catch {
      return []
    }
    const skills: SkillEntry[] = []
    for (const entry of entries) {
      if (!entry.isDirectory() || !isValidSkillId(entry.name)) continue
      const filePath = path.join(roleDir, entry.name, 'SKILL.md')
      const skill = await this.readSkillFile(filePath, entry.name)
      if (skill) skills.push(skill)
    }
    skills.sort((a, b) => a.id.localeCompare(b.id))
    return skills
  }

  private entriesFor(role: string): Promise<SkillEntry[]> {
    let pending = this.cache.get(role)
    if (!pending) {
      pending = this.loadRoleEntries(role)
      this.cache.set(role, pending)
    }
    return pending
  }

  /** Compact catalog for a role. Never includes skill bodies. */
  async getSkillCatalog(role: string): Promise<SkillSummary[]> {
    const entries = await this.entriesFor(role)
    return entries.map(({ id, name, description, version }) => ({ id, name, description, version }))
  }

  /**
   * Load a full skill body for a role. Validates the id against the registered
   * catalog first, so only known skills can be read (blocks traversal and
   * unregistered ids). Deduplicates repeated reads via the optional tracker.
   */
  async loadSkill(
    role: string,
    skillId: string,
    tracker?: SkillLoadTracker,
  ): Promise<LoadedSkill> {
    if (!isValidSkillId(skillId)) {
      throw new SkillLoadError(`Invalid skill id.`, skillId, 'rejected')
    }
    const entries = await this.entriesFor(role)
    const entry = entries.find((candidate) => candidate.id === skillId)
    if (!entry) {
      throw new SkillLoadError(
        `Skill "${skillId}" is not registered for role "${role}".`,
        skillId,
        'rejected',
      )
    }

    let raw: string
    try {
      raw = await readFile(entry.filePath, 'utf8')
    } catch (error) {
      throw new SkillLoadError(
        `Skill "${skillId}" could not be read.`,
        skillId,
        'error',
        error instanceof Error ? error.message : String(error),
      )
    }

    let body: string
    try {
      body = matter(raw).content
    } catch (error) {
      throw new SkillLoadError(
        `Skill "${skillId}" has invalid frontmatter.`,
        skillId,
        'error',
        error instanceof Error ? error.message : String(error),
      )
    }

    const newlyLoaded = tracker ? tracker.recordSkillLoad(skillId) : true
    return {
      id: entry.id,
      name: entry.name,
      description: entry.description,
      version: entry.version,
      content: body,
      hash: entry.hash,
      newlyLoaded,
    }
  }
}

export class SkillLoadError extends Error {
  readonly skillId: string
  readonly outcome: 'rejected' | 'error'
  readonly causeMessage?: string

  constructor(message: string, skillId: string, outcome: 'rejected' | 'error', causeMessage?: string) {
    super(message)
    this.name = 'SkillLoadError'
    this.skillId = skillId
    this.outcome = outcome
    this.causeMessage = causeMessage
  }
}

const defaultLoader = new SkillLoader()

export function getSkillCatalog(role: string): Promise<SkillSummary[]> {
  return defaultLoader.getSkillCatalog(role)
}

export function loadSkill(role: string, skillId: string, tracker?: SkillLoadTracker): Promise<LoadedSkill> {
  return defaultLoader.loadSkill(role, skillId, tracker)
}