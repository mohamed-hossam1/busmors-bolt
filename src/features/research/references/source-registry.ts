/** Egyptian source registry and sector routing: official → first-party → community → press. */
export type SourceTier = 'official' | 'first_party' | 'community' | 'press'

export interface RegisteredSource {
  id: string
  name: string
  nameAr: string
  tier: SourceTier
  authority: number
  sectors: string[]
  url: string
  geography: 'egypt' | 'mena' | 'global'
  typicalLagDays: number
  notes: string
}

export const SOURCE_REGISTRY: readonly RegisteredSource[] = Object.freeze([
  { id: 'capmas', name: 'CAPMAS', nameAr: 'الجهاز المركزي للتعبئة والإحصاء', tier: 'official', authority: 0.95, sectors: ['macro', 'retail', 'construction', 'household'], url: 'https://www.capmas.gov.eg', geography: 'egypt', typicalLagDays: 45, notes: 'Official statistics. Always capture the reference period, not the publication date.' },
  { id: 'mcit', name: 'MCIT', nameAr: 'وزارة الاتصالات وتكنولوجيا المعلومات', tier: 'official', authority: 0.93, sectors: ['technology', 'saas', 'telecom'], url: 'https://www.mcit.gov.eg', geography: 'egypt', typicalLagDays: 60, notes: 'Sector policy and indicators.' },
  { id: 'ntra', name: 'NTRA', nameAr: 'الجهاز القومي لتنظيم الاتصالات', tier: 'official', authority: 0.92, sectors: ['telecom', 'technology', 'saas'], url: 'https://www.ntra.gov.eg', geography: 'egypt', typicalLagDays: 30, notes: 'Communications market data and reports.' },
  { id: 'itida', name: 'ITIDA', nameAr: 'هيئة تنمية صناعة تكنولوجيا المعلومات', tier: 'official', authority: 0.9, sectors: ['technology', 'saas', 'outsourcing'], url: 'https://www.itida.gov.eg', geography: 'egypt', typicalLagDays: 60, notes: 'IT industry and export indicators.' },
  { id: 'gafi', name: 'GAFI', nameAr: 'الهيئة العامة للاستثمار والمناطق الحرة', tier: 'official', authority: 0.9, sectors: ['investment', 'retail', 'real_estate', 'manufacturing'], url: 'https://www.gafi.gov.eg', geography: 'egypt', typicalLagDays: 45, notes: 'Investment climate and licensing signals.' },
  { id: 'cbe', name: 'Central Bank of Egypt', nameAr: 'البنك المركزي المصري', tier: 'official', authority: 0.95, sectors: ['macro', 'payments', 'fintech', 'retail'], url: 'https://www.cbe.org.eg', geography: 'egypt', typicalLagDays: 30, notes: 'Inflation, FX and payment statistics. Currency figures must be dated.' },
  { id: 'eca', name: 'Egyptian Customs Authority', nameAr: 'مصلحة الجمارك المصرية', tier: 'official', authority: 0.88, sectors: ['import', 'retail', 'manufacturing'], url: 'https://www.customs.gov.eg', geography: 'egypt', typicalLagDays: 90, notes: 'Tariffs and clearance rules; often a PDF notice.' },
  { id: 'cpa', name: 'Consumer Protection Agency', nameAr: 'جهاز حماية المستهلك', tier: 'official', authority: 0.86, sectors: ['retail', 'fmcg', 'restaurants', 'consumer_services'], url: 'https://www.cpa.gov.eg', geography: 'egypt', typicalLagDays: 60, notes: 'Consumer complaints and pricing notices.' },
])

const byId = new Map(SOURCE_REGISTRY.map(source => [source.id, source]))

export function registeredSource(id: string): RegisteredSource | undefined {
  return byId.get(id)
}

export const TIER_ORDER: readonly SourceTier[] = Object.freeze(['official', 'first_party', 'community', 'press'])

export interface SectorRoute {
  sector: string
  official: string[]
  firstParty: string[]
  community: string[]
  press: string[]
}

/** Sector → source routing. Official sources always lead when they exist. */
export const SECTOR_ROUTING: readonly SectorRoute[] = Object.freeze([
  { sector: 'technology', official: ['mcit', 'ntra', 'itida', 'capmas'], firstParty: ['vendor_pricing', 'vendor_docs'], community: ['reddit', 'github', 'facebook_groups'], press: ['enterprise_press', 'tech_press'] },
  { sector: 'saas', official: ['mcit', 'itida', 'cbe'], firstParty: ['vendor_pricing', 'vendor_docs'], community: ['reddit', 'g2', 'facebook_groups'], press: ['tech_press'] },
  { sector: 'retail', official: ['capmas', 'cbe', 'cpa', 'gafi'], firstParty: ['store_pages', 'marketplace_listings'], community: ['facebook_groups', 'instagram', 'tiktok'], press: ['business_press'] },
  { sector: 'fmcg', official: ['capmas', 'cpa', 'eca'], firstParty: ['brand_pages', 'marketplace_listings'], community: ['instagram', 'facebook_groups', 'tiktok'], press: ['business_press'] },
  { sector: 'construction', official: ['capmas', 'gafi'], firstParty: ['supplier_pages', 'store_pages'], community: ['facebook_groups', 'youtube'], press: ['business_press'] },
  { sector: 'restaurants', official: ['capmas', 'cpa'], firstParty: ['menu_pages', 'delivery_platforms'], community: ['instagram', 'tiktok', 'google_reviews'], press: ['food_press'] },
  { sector: 'real_estate', official: ['gafi', 'capmas'], firstParty: ['developer_pages', 'listing_portals'], community: ['facebook_groups', 'instagram'], press: ['business_press'] },
  { sector: 'education', official: ['capmas', 'mcit'], firstParty: ['institution_pages'], community: ['facebook_groups', 'youtube'], press: ['education_press'] },
  { sector: 'health', official: ['capmas', 'cpa'], firstParty: ['clinic_pages'], community: ['facebook_groups', 'google_reviews'], press: ['health_press'] },
  { sector: 'professional_service', official: ['capmas', 'gafi'], firstParty: ['vendor_pages', 'vendor_pricing'], community: ['linkedin', 'facebook_groups'], press: ['business_press'] },
  { sector: 'b2b', official: ['capmas', 'gafi', 'cbe'], firstParty: ['vendor_pricing', 'vendor_docs'], community: ['linkedin', 'reddit'], press: ['business_press'] },
  { sector: 'macro', official: ['capmas', 'cbe'], firstParty: [], community: [], press: ['business_press'] },
])

export function routeForSector(sector: string): SectorRoute {
  const key = sector.trim().toLowerCase().replace(/\s+/g, '_')
  const exact = SECTOR_ROUTING.find(route => route.sector === key)
  if (exact) return exact
  const partial = SECTOR_ROUTING.find(route => key.includes(route.sector) || route.sector.includes(key))
  return partial ?? { sector: key || 'general', official: ['capmas'], firstParty: ['vendor_pages'], community: ['facebook_groups'], press: ['business_press'] }
}

/** Ordered candidate sources for a sector, official first, deduplicated. */
export function routeSources(sector: string, options: { egyptOnly?: boolean } = {}): RegisteredSource[] {
  const route = routeForSector(sector)
  const field: Record<SourceTier, 'official' | 'firstParty' | 'community' | 'press'> = { official: 'official', first_party: 'firstParty', community: 'community', press: 'press' }
  const ordered = TIER_ORDER.flatMap(tier => route[field[tier]].map(id => registeredSource(id)).filter((source): source is RegisteredSource => !!source))
  const seen = new Set<string>()
  const unique = ordered.filter(source => (seen.has(source.id) ? false : (seen.add(source.id), true)))
  return options.egyptOnly === false ? unique : unique.filter(source => source.geography === 'egypt' || source.geography === 'mena' || source.geography === 'global')
}

/** Infer a routing sector from free text so a request can route without a dropdown. */
export function inferSector(text: string): string {
  const lower = text.toLowerCase()
  const rules: readonly [string, RegExp][] = [
    ['saas', /\b(?:saas|software|app|platform|analytics|crm|martech|automation|marketing\s+platform|ai\s+platform|dashboard|b2b\s+saas)\b|منصة|برمجيات|برنامج|تطبيق|أداة|اداة|تسويق\s*ذكي|تسويق\s*رقمي|ذكاء\s*اصطناعي|أتمتة|اتمتة|سوشيال\s*ميديا|تحليلات|ماركتنج|شات\s*بوت/i],
    ['retail', /\b(?:shop|store|retail|products|goods|ecommerce|e-commerce|marketplace)\b|متجر|محل|تجارة\s*إلكترونية|تجارة\s*الكترونية|تسوق|سوق/i],
    ['restaurants', /\b(?:restaurant|cafe|food|menu|kitchen|catering)\b|مطعم|كافيه|مقهى|أكل|وجبات|مطبخ|حلويات/i],
    ['health', /\b(?:clinic|dental|doctor|health|pharmacy|medical|hospital)\b|عيادة|طبيب|دكتور|صيدلية|أسنان|مستشفى|مركز\s*طبي/i],
    ['education', /\b(?:school|course|training|academy|education|edtech|tutor)\b|مدرسة|دورة|كورس|تدريب|أكاديمية|تعليم|منصة\s*تعليمية/i],
    ['real_estate', /\b(?:property|apartment|villa|real\s*estate|broker|realtor)\b|عقار|عقارات|شقة|فيلا|وسيط\s*عقاري|سمسار|تطوير\s*عقاري/i],
    ['construction', /\b(?:ceramic|tile|repair|contractor|construction|tuckpointing|waterproofing|finishing)\b|سيراميك|بناء|مقاولات|تشطيب|ترميم|عزل|سباكة|نجارة/i],
    ['fmcg', /\b(?:snack|beverage|fmcg|consumer\s*goods|food\s*products)\b|سلع\s*استهلاكية|أغذية|مشروبات|منتجات\s*غذائية/i],
    ['b2b', /\b(?:b2b|supplier|packaging|manufacturer|wholesale|distributor)\b|توريد|مورد|موزع|جملة|مصنع|تغليف|شركات/i],
    ['professional_service', /\b(?:consultant|consulting|accountant|lawyer|agency|advisory|freelance|marketing\s+agency)\b|استشارات|مستشار|محاسب|محامي|وكالة|أيجنسي|ايجنسي|خدمات\s*مهنية|خدمات\s*قانونية/i],
  ]
  const match = rules.find(([, pattern]) => pattern.test(lower))
  if (match) return match[0]
  if (/(?:digital|online|platform|ai|ذكاء|رقمي|تقنية|tech)/i.test(lower)) return 'saas'
  return 'professional_service'
}

export function authorityOf(sourceId: string): number {
  return registeredSource(sourceId)?.authority ?? 0.5
}

/** A discovery result is never evidence; this label travels with every source. */
export const DISCOVERY_NOT_EVIDENCE = 'Discovery result only: the underlying page must be opened before this can support a claim.'