import type { SourceRecord } from '../contracts'
import type { ResolvedEntity } from '../references/entity-resolution'

/** Shared across every subagent: one entity registry and one content cache. */
export class EntityRegistry {
  private readonly entities = new Map<string, ResolvedEntity>()

  add(entity: ResolvedEntity): ResolvedEntity {
    const existing = this.entities.get(entity.key)
    if (existing) {
      existing.aliases = [...new Set([...existing.aliases, entity.name, ...entity.aliases])]
      return existing
    }
    this.entities.set(entity.key, entity)
    return entity
  }

  addAll(entities: ResolvedEntity[]): ResolvedEntity[] {
    return entities.map(entity => this.add(entity))
  }

  get(key: string): ResolvedEntity | undefined {
    return this.entities.get(key)
  }

  list(): ResolvedEntity[] {
    return [...this.entities.values()]
  }

  get size(): number {
    return this.entities.size
  }
}

/** URL canonicalization + visited set: no agent retrieves the same page twice. */
export class ContentCache {
  private readonly sources = new Map<string, SourceRecord>()
  private readonly visited = new Set<string>()

  constructor(private readonly canonicalize: (url: string) => string) {}

  has(url: string): boolean {
    return this.visited.has(this.canonicalize(url))
  }

  get(url: string): SourceRecord | undefined {
    return this.sources.get(this.canonicalize(url))
  }

  /** Returns the cached source when present; otherwise records the new one. */
  store(source: SourceRecord): { source: SourceRecord; duplicate: boolean } {
    const key = this.canonicalize(source.url)
    this.visited.add(key)
    const existing = this.sources.get(key)
    if (existing) return { source: existing, duplicate: true }
    this.sources.set(key, source)
    return { source, duplicate: false }
  }

  markVisited(url: string): void {
    this.visited.add(this.canonicalize(url))
  }

  list(): SourceRecord[] {
    return [...this.sources.values()]
  }

  get size(): number {
    return this.sources.size
  }
}