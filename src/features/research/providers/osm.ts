import { emptyUsage } from '../contracts'
import type { MapTransport, ProviderAdapter, ProviderContext, ProviderEstimate, ProviderOutcome } from './types'
import { toSourceRecord } from './normalize'

export interface OsmInput {
  query: string
  lat?: number
  lon?: number
  sector?: string | null
}

const VERSION = 'overpass-1'
const estimate: ProviderEstimate = { calls: 1, pages: 1, tokens: 0, credits: 1 }

/** Ticket 05: local presence and geographic coverage. No paid maps provider. */
export function createOsmProvider(transport: MapTransport, options: { version?: string } = {}): ProviderAdapter<OsmInput> {
  const version = options.version ?? VERSION
  return {
    name: 'osm',
    version,
    needsKey: false,
    estimate: () => ({ ...estimate }),
    async execute(input: OsmInput, context: ProviderContext): Promise<ProviderOutcome> {
      const usage = { ...emptyUsage(), calls: 1, pages: 1, credits: 1 }
      const result = await transport.nearby(input.query, { signal: context.signal })
      if (!result.ok) {
        return { ok: false, code: result.code, message: result.message, sources: [], candidates: [], usage, notes: [result.message] }
      }
      if (result.places.length === 0) {
        return {
          ok: false,
          code: 'unavailable',
          message: 'No OpenStreetMap places matched. Absence of evidence is not evidence of absence.',
          sources: [],
          candidates: [],
          usage,
          notes: ['No OSM matches: report as "no evidence found", never as "does not exist".'],
        }
      }
      const searchUrl = `https://www.openstreetmap.org/search?query=${encodeURIComponent(input.query)}`
      const excerpt = result.places
        .slice(0, 40)
        .map(place => `${place.name} (${place.kind}) — ${place.address} [${place.lat.toFixed(4)}, ${place.lon.toFixed(4)}]`)
        .join('\n')
      const source = toSourceRecord({
        id: `osm:${context.callId}`,
        url: searchUrl,
        title: `OpenStreetMap: ${input.query}`,
        provider: 'osm',
        toolAction: 'overpass_nearby',
        toolkitVersion: version,
        excerpt,
        availability: 'retrieved',
        usage,
        sector: input.sector ?? null,
        geography: input.lat !== undefined && input.lon !== undefined ? `${input.lat},${input.lon}` : 'Egypt',
        authority: 'OpenStreetMap contributors',
        authorityScore: 0.6,
        sourceType: 'map',
      })
      return {
        ok: true,
        sources: [source],
        candidates: [],
        usage,
        notes: [`${result.places.length} mapped places from OpenStreetMap/Overpass; community-maintained, so treat presence as a weak signal.`],
      }
    },
  }
}