import type { OfferKind } from '../references/pricing'

/** Multi-industry golden evaluation pack. Synthetic labels, hand-corrected. */
export interface GoldenIndustry {
  key: string
  label: string
  sector: string
  sampleProfile: {
    name: string
    description: string
    governorates: string[]
    audience: string
    channels: string[]
  }
  queryConcepts: string[]
  goldenCompetitors: string[]
  notes: string
}

export const GOLDEN_INDUSTRIES: readonly GoldenIndustry[] = Object.freeze([
  {
    key: 'local_business', label: 'Local ceramic repair business', sector: 'construction',
    sampleProfile: { name: 'Orbit Ceramic Repairs', description: 'Kintsugi and ceramic repair studio in Cairo', governorates: ['Cairo', 'Giza'], audience: 'Owners of damaged ceramics and sentimental pieces', channels: ['facebook', 'instagram', 'whatsapp'] },
    queryConcepts: ['ceramic repair', 'kintsugi', 'waterproofing'],
    goldenCompetitors: ['Cairo Ceramic Studio', 'Restoration House Egypt', 'Kintsugi Cairo', 'Al Fath Ceramic Works', 'Giza Tile Repair'],
    notes: 'Local service; delivery and home visits matter more than national pricing.',
  },
  {
    key: 'ecommerce', label: 'E-commerce home goods', sector: 'retail',
    sampleProfile: { name: 'Bayt Home', description: 'Online homeware store shipping nationwide', governorates: ['Cairo', 'Alexandria'], audience: 'Urban households furnishing apartments', channels: ['facebook', 'instagram', 'tiktok', 'website'] },
    queryConcepts: ['price', 'delivery and payment', 'warranty'],
    goldenCompetitors: ['Home Box Egypt', 'El Sakakini Home', 'Marsam Home', 'Dekor Egypt', 'Souq Home'],
    notes: 'Cash on delivery and delivery fees change the landed price.',
  },
  {
    key: 'professional_service', label: 'Professional service (accounting)', sector: 'professional_service',
    sampleProfile: { name: 'Nile Ledger Advisory', description: 'Accounting and tax advisory for SMEs', governorates: ['Cairo'], audience: 'SME founders', channels: ['linkedin', 'website', 'referral'] },
    queryConcepts: ['price', 'warranty'],
    goldenCompetitors: ['Cairo Tax Partners', 'Mazars Egypt', 'KPMG Egypt', 'Baker Tilly Egypt', 'Nile Advisory'],
    notes: 'Retainers dominate; hourly quotes are rare.',
  },
  {
    key: 'b2b', label: 'B2B packaging supplier', sector: 'b2b',
    sampleProfile: { name: 'DeltaPack Solutions', description: 'Corrugated packaging for FMCG manufacturers', governorates: ['Giza', 'Alexandria'], audience: 'Procurement managers', channels: ['linkedin', 'website', 'trade fairs'] },
    queryConcepts: ['price', 'delivery and payment'],
    goldenCompetitors: ['Pack Egypt', 'Raya Packaging', 'Oriental Packaging', 'Delta Containers', 'Mena Pack'],
    notes: 'Minimum order quantities dominate; price per unit is meaningless below the MOQ.',
  },
  {
    key: 'education', label: 'Education and training', sector: 'education',
    sampleProfile: { name: 'Mishmish Learning', description: 'After-school science and coding classes', governorates: ['Cairo', 'Giza'], audience: 'Parents of school students', channels: ['facebook', 'instagram', 'whatsapp'] },
    queryConcepts: ['price', 'seasonal demand'],
    goldenCompetitors: ['Robokids Egypt', 'STEM Egypt', 'Nafham', 'Almentor', 'Bayt al Ilm'],
    notes: 'School calendar drives demand; summer is a different product.',
  },
  {
    key: 'health', label: 'Health and dental clinic', sector: 'health',
    sampleProfile: { name: 'Zamalek Dental Care', description: 'Dental clinic with cosmetic and restorative services', governorates: ['Cairo'], audience: 'Adults seeking cosmetic dentistry', channels: ['instagram', 'google_reviews', 'referral'] },
    queryConcepts: ['price', 'warranty'],
    goldenCompetitors: ['Cairo Dental Center', 'Bright Smile Egypt', 'Dental Care Egypt', 'Smile Studio', 'Al Azhar Dental'],
    notes: 'Prices are per procedure and rarely public; reviews are a weak proxy.',
  },
  {
    key: 'restaurants', label: 'Restaurants and food', sector: 'restaurants',
    sampleProfile: { name: 'Sofra Kitchen', description: 'Egyptian home-style restaurant in Maadi', governorates: ['Cairo'], audience: 'Families and office lunches', channels: ['instagram', 'tiktok', 'delivery'] },
    queryConcepts: ['price', 'seasonal demand'],
    goldenCompetitors: ['Zooba', 'Abou El Sid', 'Koshary Abou Tarek', 'Felfela', 'Maisa'],
    notes: 'Ramadan changes hours and menus; delivery platforms are the price reference.',
  },
  {
    key: 'real_estate', label: 'Real estate brokerage', sector: 'real_estate',
    sampleProfile: { name: 'Sakania Realty', description: 'Residential brokerage in New Cairo', governorates: ['Cairo'], audience: 'First-time buyers and investors', channels: ['facebook', 'instagram', 'website'] },
    queryConcepts: ['price', 'delivery and payment'],
    goldenCompetitors: ['Property Finder', 'AQAR Egypt', 'Nawy', 'Sakania', 'Pioneers Realty'],
    notes: 'Commission structures vary; listing prices are asking prices, not transaction prices.',
  },
  {
    key: 'saas', label: 'SaaS product', sector: 'saas',
    sampleProfile: { name: 'Foolook Analytics', description: 'Analytics for Egyptian retail chains', governorates: ['Cairo'], audience: 'Retail operations leads', channels: ['linkedin', 'website', 'content'] },
    queryConcepts: ['price', 'warranty'],
    goldenCompetitors: ['Wuzzuf', 'Paymob', 'Fawry', 'Instabug', 'Bosta'],
    notes: 'Public pricing pages are rare; annual contracts in USD are common.',
  },
  {
    key: 'fmcg', label: 'FMCG brand', sector: 'fmcg',
    sampleProfile: { name: 'Helm Snacks', description: 'Egyptian snack brand sold through retail', governorates: ['Cairo', 'Alexandria', 'Giza'], audience: 'Urban snack buyers', channels: ['instagram', 'tiktok', 'retail'] },
    queryConcepts: ['price', 'seasonal demand'],
    goldenCompetitors: ['Chipsy', 'Tiger Bites', 'Bisco Misr', 'Edita', 'Domty'],
    notes: 'Pack size and channel (kiosk vs supermarket) dominate the comparison.',
  },
])

export interface GoldenPrice {
  id: string
  industry: string
  competitor: string
  product: string
  packSize: string | null
  rawText: string
  expected: {
    amount: number
    currency: string
    vatIncluded: boolean
    deliveryFee: number
    landedTotal: number
    offers: OfferKind[]
  }
}

/** Hand-corrected price fixtures: the labels live here, never in the model. */
export const GOLDEN_PRICES: readonly GoldenPrice[] = Object.freeze([
  { id: 'p1', industry: 'ecommerce', competitor: 'Home Box Egypt', product: 'Ceramic dinner plate set', packSize: '12 pcs', rawText: '1,450 جنيه', expected: { amount: 1450, currency: 'EGP', vatIncluded: true, deliveryFee: 60, landedTotal: 1510, offers: [] } },
  { id: 'p2', industry: 'ecommerce', competitor: 'Bayt Home', product: 'Handmade ceramic mug', packSize: '1 pc', rawText: 'EGP 320 including VAT', expected: { amount: 320, currency: 'EGP', vatIncluded: true, deliveryFee: 50, landedTotal: 370, offers: ['guarantee'] } },
  { id: 'p3', industry: 'local_business', competitor: 'Cairo Ceramic Studio', product: 'Kintsugi repair per piece', packSize: null, rawText: '85 دولار', expected: { amount: 85, currency: 'USD', vatIncluded: false, deliveryFee: 0, landedTotal: 85, offers: [] } },
  { id: 'p4', industry: 'restaurants', competitor: 'Zooba', product: 'Hawawshi sandwich', packSize: '1 pc', rawText: '95 EGP', expected: { amount: 95, currency: 'EGP', vatIncluded: true, deliveryFee: 0, landedTotal: 95, offers: ['discount'] } },
  { id: 'p5', industry: 'b2b', competitor: 'Pack Egypt', product: 'Corrugated box 40x30', packSize: '500 pcs', rawText: 'EGP 1,200 per 500', expected: { amount: 1200, currency: 'EGP', vatIncluded: false, deliveryFee: 250, landedTotal: 1618, offers: [] } },
  { id: 'p6', industry: 'fmcg', competitor: 'Chipsy', product: 'Family snack pack', packSize: '150g', rawText: '1.5k جنيه', expected: { amount: 1500, currency: 'EGP', vatIncluded: true, deliveryFee: 0, landedTotal: 1500, offers: ['bundle'] } },
  { id: 'p7', industry: 'professional_service', competitor: 'Cairo Tax Partners', product: 'Monthly retainer', packSize: null, rawText: '4,500 EGP شهريا', expected: { amount: 4500, currency: 'EGP', vatIncluded: false, deliveryFee: 0, landedTotal: 5130, offers: [] } },
  { id: 'p8', industry: 'health', competitor: 'Zamalek Dental Care', product: 'Teeth whitening session', packSize: null, rawText: '3,000 جنيه', expected: { amount: 3000, currency: 'EGP', vatIncluded: true, deliveryFee: 0, landedTotal: 3000, offers: ['installment'] } },
])

export interface GoldenQuote {
  id: string
  industry: string
  quote: string
  quoteLanguage: 'ar-EG' | 'en'
  translation: string
  sourceUrl: string
  geography: string
}

/** Hand-corrected Voice-of-Customer quotes. The translation is stored separately. */
export const GOLDEN_QUOTES: readonly GoldenQuote[] = Object.freeze([
  { id: 'q1', industry: 'local_business', quote: 'عندي كوباية مكسورة من والدتي وعايز أصلحها بشكل محترم', quoteLanguage: 'ar-EG', translation: 'I have a broken cup from my mother and I want it repaired respectfully.', sourceUrl: 'https://example.com/community/ceramic-repair', geography: 'Cairo' },
  { id: 'q2', industry: 'ecommerce', quote: 'الدفع عند الاستلام متاح ولا لأ؟', quoteLanguage: 'ar-EG', translation: 'Is cash on delivery available or not?', sourceUrl: 'https://example.com/store/home-box', geography: 'Alexandria' },
  { id: 'q3', industry: 'saas', quote: 'We need Arabic invoices before we can sign anything.', quoteLanguage: 'en', translation: '', sourceUrl: 'https://example.com/reviews/saas-arabic-invoices', geography: 'Cairo' },
  { id: 'q4', industry: 'restaurants', quote: 'في رمضان الأسعار بتتغير والمنيو بيصغر', quoteLanguage: 'ar-EG', translation: 'In Ramadan the prices change and the menu shrinks.', sourceUrl: 'https://example.com/ramadan-menu', geography: 'Giza' },
])

export function goldenIndustry(key: string): GoldenIndustry | undefined {
  return GOLDEN_INDUSTRIES.find(industry => industry.key === key)
}

/** Competitor recall@20 is measured against this list, not against the model. */
export function goldenCompetitors(key: string): string[] {
  return [...(goldenIndustry(key)?.goldenCompetitors ?? [])]
}