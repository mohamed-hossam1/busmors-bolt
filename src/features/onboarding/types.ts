export interface Offering {
  id: string; name: string; description: string
  pricingModel: 'fixed' | 'starting_from' | 'quote_required' | 'unknown'
  amount: string | null; currency: string | null
}
export interface BusinessFormData {
  name: string; description: string; offerings: Offering[]; country: string; serviceArea: string
  conversionRoute: { state: 'ready' | 'not_ready'; type?: 'website' | 'whatsapp' | 'phone' | 'social' | 'booking' | 'marketplace' | 'other'; value?: string }
  website?: string; tone?: string; brandColor?: string; logoUrl?: string
}
export interface BusinessDraftRow {
  id: string; version: number; form: BusinessFormData; status: 'draft' | 'confirmed'; path: 'manual' | 'website'
  field_sources: Record<string, { url: string; excerpt: string }>
}
export function newOffering(): Offering { return { id: crypto.randomUUID(), name: '', description: '', pricingModel: 'unknown', amount: null, currency: null } }
export function emptyBusiness(): BusinessFormData { return { name: '', description: '', country: '', serviceArea: '', offerings: [newOffering()], conversionRoute: { state: 'not_ready' } } }
export function validateBusiness(form: BusinessFormData): string[] {
  const errors: string[] = []
  for (const key of ['name','description','country','serviceArea'] as const) if (!form[key].trim()) errors.push(key)
  if (!form.offerings.length || form.offerings.some(o => !o.name.trim() || (o.amount !== null && o.amount !== '' && (!/^\d+(\.\d{1,2})?$/.test(o.amount) || !/^[A-Z]{3}$/.test(o.currency ?? ''))))) errors.push('offerings')
  if (form.conversionRoute.state === 'ready' && (!form.conversionRoute.type || !form.conversionRoute.value?.trim())) errors.push('conversionRoute')
  return errors
}
// A source arriving late can only fill fields unchanged since reading began.
export function mergeWebsiteFields(current: BusinessFormData, baseline: BusinessFormData, incoming: Partial<BusinessFormData>): BusinessFormData {
  const merged = { ...current }
  for (const key of Object.keys(incoming) as (keyof BusinessFormData)[]) {
    if (JSON.stringify(current[key]) === JSON.stringify(baseline[key])) Object.assign(merged, { [key]: incoming[key] })
  }
  return merged
}
