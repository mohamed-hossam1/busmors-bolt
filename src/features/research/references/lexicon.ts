import type { ResearchLanguage } from '../contracts'

/** One concept expressed the way Egyptians actually search for it. */
export interface LexiconEntry {
  concept: string
  msa: string
  egyptian: string
  english: string
  arabizi: string
  misspellings: string[]
  codeSwitched: string[]
}

/** Common Egyptian search spellings that must resolve to the same concept. */
export const COMMON_MISSPELLINGS: readonly string[] = Object.freeze([
  'seramic',
  'sramic',
  'kint sugi',
  'kintsugui',
  'counter top',
  'water proofing',
  'waranty',
  'tuck pointing',
])

export const QUERY_LEXICON: readonly LexiconEntry[] = Object.freeze([
  {
    concept: 'ceramic repair',
    msa: 'إصلاح السيراميك',
    egyptian: 'تصليح سيراميك',
    english: 'ceramic repair',
    arabizi: 'tsle7 sramic',
    misspellings: ['seramic repair', 'sramic repair', 'ceramic fix', 'sramic fix'],
    codeSwitched: ['تصليح سيراميك ceramic repair', 'ceramic repair في القاهرة'],
  },
  {
    concept: 'kintsugi',
    msa: 'الترميم بالذهب',
    egyptian: 'ترميم بالكоте',
    english: 'kintsugi repair',
    arabizi: 'kintsugi repair',
    misspellings: ['kint sugi', 'kintsugui', 'kintsugi fix'],
    codeSwitched: ['kintsugi ترميم', 'ترميم kintsugi'],
  },
  {
    concept: 'countertop installation',
    msa: 'تركيب أسطح العمل',
    egyptian: 'تركيب رخام و سيراميك',
    english: 'countertop installation',
    arabizi: 'trkeeb rokhama',
    misspellings: ['counter top installation', 'rock installation'],
    codeSwitched: ['تركيب رخام countertop', 'رخام طبيعي في مصر'],
  },
  {
    concept: 'tuckpointing',
    msa: 'إعادة تعبئة الفواصل',
    egyptian: 'تلييس الفواصل',
    english: 'tuckpointing',
    arabizi: 'tlesees el fasel',
    misspellings: ['tuck pointing', 'pointing repair'],
    codeSwitched: ['تلييس فواصل tuckpointing'],
  },
  {
    concept: 'waterproofing',
    msa: 'العزل المائي',
    egyptian: 'عزل مائي',
    english: 'waterproofing',
    arabizi: 'azl maa2i',
    misspellings: ['water proofing', 'waterproofing'],
    codeSwitched: ['عزل مائي waterproofing', 'عزل الحمامات في مصر'],
  },
  {
    concept: 'price',
    msa: 'السعر',
    egyptian: 'الأسعار / بكام',
    english: 'price',
    arabizi: 'bekam / el as3ar',
    misspellings: ['price', 'pricing', 'cost', 'prix'],
    codeSwitched: ['سعر المتر', 'بكام المتر'],
  },
  {
    concept: 'delivery and payment',
    msa: 'التوصيل و الدفع',
    egyptian: 'التوصيل والدفع عند الاستلام',
    english: 'delivery and cash on delivery',
    arabizi: 'el tawseel w el dafe3 3and el istilam',
    misspellings: ['delivery', 'cod', 'cash on delivery'],
    codeSwitched: ['الدفع عند الاستلام', 'COD متاح؟'],
  },
  {
    concept: 'warranty',
    msa: 'الضمان',
    egyptian: 'الضمان',
    english: 'warranty',
    arabizi: 'el daman',
    misspellings: ['warranty', 'guarantee', 'waranty'],
    codeSwitched: ['ضمان كام سنة؟'],
  },
  {
    concept: 'seasonal demand',
    msa: 'الموسمية',
    egyptian: 'الموسمية و رمضان و العيد',
    english: 'seasonality Ramadan Eid',
    arabizi: 'el mawsimeya w ramadan w eid',
    misspellings: ['seasonality', 'ramadan', 'eid'],
    codeSwitched: ['رمضان 2026', 'موسم الصيف'],
  },
])

const byConcept = new Map(QUERY_LEXICON.map(entry => [entry.concept, entry]))

export function lexiconEntry(concept: string): LexiconEntry | undefined {
  return byConcept.get(concept)
}

export function normalizeText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

export function detectLanguage(value: string): ResearchLanguage | 'mixed' {
  const arabic = (value.match(/[\u0600-\u06FF]/g) ?? []).length
  const latin = (value.match(/[A-Za-z]/g) ?? []).length
  if (arabic > 0 && latin > 0) return 'mixed'
  return arabic > latin ? 'ar-EG' : 'en'
}

/** Arabizi is Egyptian Arabic written in Latin letters; treat it as ar-EG. */
export function isArabizi(value: string): boolean {
  return /[a-z0-9]/i.test(value) && (/(?:7|3|2|5|9)/.test(value) || /\b(?:bekam|azl|tawseel|dafe3|asl)\b/i.test(value))
}

/** The Egyptian query lexicon in use, one entry per concept, deduplicated. */
export function buildQueryPack(concept: string, options: { includeMisspellings?: boolean; extra?: string[] } = {}): { language: ResearchLanguage; query: string; script: 'arabic' | 'arabizi' | 'latin' }[] {
  const entry = lexiconEntry(concept)
  const terms = entry ? [entry.msa, entry.egyptian, entry.english, entry.arabizi, ...entry.codeSwitched, ...(options.includeMisspellings === false ? [] : entry.misspellings)] : [concept]
  const extra = (options.extra ?? []).filter(term => term.trim().length > 1)
  const queries: { language: ResearchLanguage; query: string; script: 'arabic' | 'arabizi' | 'latin' }[] = []
  const seen = new Set<string>()
  for (const term of [...terms, ...extra]) {
    const key = normalizeText(term)
    if (!key || seen.has(key)) continue
    seen.add(key)
    const language: ResearchLanguage = /[\u0600-\u06FF]/.test(term) ? 'ar-EG' : isArabizi(term) ? 'ar-EG' : 'en'
    queries.push({ language, query: term, script: /[\u0600-\u06FF]/.test(term) ? 'arabic' : isArabizi(term) ? 'arabizi' : 'latin' })
  }
  return queries
}