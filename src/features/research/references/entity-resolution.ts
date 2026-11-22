import { normalizeText } from './lexicon'

/** Entity resolution: legal entity → brand → branch → marketplace seller. */
export type EntityLevel = 'legal_entity' | 'brand' | 'branch' | 'marketplace_seller'

export interface EntityEvidence {
  legalName?: string | null
  brand?: string | null
  branch?: string | null
  seller?: string | null
  website?: string | null
  governorate?: string | null
  platform?: string | null
  taxId?: string | null
}

export interface ResolvedEntity {
  key: string
  level: EntityLevel
  name: string
  aliases: string[]
  governorate: string | null
  platform: string | null
  parentKey: string | null
}

const SUFFIXES = [/\b(?:s\.?a\.?e\.?|sae|llc|l\.l\.c|co\.?|company|corporation|inc\.?|ltd\.?|limited)\b/gi, /\b(?:for|&|and)\b/gi]

export function normalizeEntityName(name: string): string {
  return SUFFIXES.reduce((value, pattern) => value.replace(pattern, ' '), name)
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function domainKey(website: string | null | undefined): string | null {
  if (!website) return null
  try {
    const url = new URL(website.startsWith('http') ? website : `https://${website}`)
    return url.hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

/**
 * Resolve one candidate to a stable key. A branch is distinct from its brand but
 * carries the brand key as parent; a marketplace seller is keyed by platform.
 */
export function resolveEntity(evidence: EntityEvidence): ResolvedEntity {
  const domain = domainKey(evidence.website)
  const brand = evidence.brand?.trim() || null
  const branch = evidence.branch?.trim() || null
  const seller = evidence.seller?.trim() || null
  const legal = evidence.legalName?.trim() || null

  if (seller && evidence.platform) {
    const key = `seller:${evidence.platform}:${normalizeEntityName(seller)}`
    return { key, level: 'marketplace_seller', name: seller, aliases: [brand, legal].filter((alias): alias is string => !!alias), governorate: evidence.governorate ?? null, platform: evidence.platform, parentKey: brand ? `brand:${domain ?? normalizeEntityName(brand)}` : null }
  }
  if (branch) {
    const brandKey = brand ? `brand:${domain ?? normalizeEntityName(brand)}` : legal ? `brand:${normalizeEntityName(legal)}` : null
    const key = `branch:${brandKey ?? 'unknown'}:${normalizeEntityName(branch)}:${evidence.governorate ?? ''}`
    return { key, level: 'branch', name: branch, aliases: [brand, legal].filter((alias): alias is string => !!alias), governorate: evidence.governorate ?? null, platform: null, parentKey: brandKey }
  }
  if (brand || domain) {
    const key = `brand:${domain ?? normalizeEntityName(brand!)}`
    return { key, level: 'brand', name: brand ?? domain!, aliases: [legal].filter((alias): alias is string => !!alias), governorate: evidence.governorate ?? null, platform: null, parentKey: legal ? `legal:${normalizeEntityName(legal)}` : null }
  }
  if (legal) {
    const key = `legal:${evidence.taxId ?? normalizeEntityName(legal)}`
    return { key, level: 'legal_entity', name: legal, aliases: [], governorate: evidence.governorate ?? null, platform: null, parentKey: null }
  }
  return { key: `unknown:${normalizeText(String(evidence.brand ?? evidence.legalName ?? 'unknown'))}`, level: 'legal_entity', name: 'Unknown', aliases: [], governorate: evidence.governorate ?? null, platform: null, parentKey: null }
}

export interface EntityDedupeResult {
  unique: ResolvedEntity[]
  duplicates: { key: string; name: string; level: EntityLevel }[]
  duplicateRate: number
}

/** Deduplicate a discovered list by resolved key; report the duplicate rate. */
export function dedupeEntities(candidates: EntityEvidence[]): EntityDedupeResult {
  const unique = new Map<string, ResolvedEntity>()
  const duplicates: { key: string; name: string; level: EntityLevel }[] = []
  for (const candidate of candidates) {
    const resolved = resolveEntity(candidate)
    if (resolved.key.startsWith('unknown:')) continue
    const existing = unique.get(resolved.key)
    if (existing) {
      existing.aliases = [...new Set([...existing.aliases, resolved.name, ...resolved.aliases])]
      duplicates.push({ key: resolved.key, name: resolved.name, level: resolved.level })
    } else {
      unique.set(resolved.key, { ...resolved })
    }
  }
  const total = unique.size + duplicates.length
  return { unique: [...unique.values()], duplicates, duplicateRate: total === 0 ? 0 : duplicates.length / total }
}

/** Entities are grouped by level so reports never flatten a branch into a brand. */
export function groupEntitiesByLevel(entities: ResolvedEntity[]): Record<EntityLevel, ResolvedEntity[]> {
  const groups: Record<EntityLevel, ResolvedEntity[]> = { legal_entity: [], brand: [], branch: [], marketplace_seller: [] }
  for (const entity of entities) groups[entity.level].push(entity)
  return groups
}