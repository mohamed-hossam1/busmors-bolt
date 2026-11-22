import { Plus, Trash2 } from 'lucide-react'
import { newOffering, type BusinessFormData, type Offering } from './types'
import { useCopy } from '@/hooks/useCopy'

export default function BusinessForm({ value, onChange }: { value: BusinessFormData; onChange: (next: BusinessFormData) => void }) {
  const { t } = useCopy()
  const set = <K extends keyof BusinessFormData>(key: K, field: BusinessFormData[K]) => onChange({ ...value, [key]: field })
  const offer = (id: string, patch: Partial<Offering>) => set('offerings', value.offerings.map(o => o.id === id ? { ...o, ...patch } : o))
  const field = (key: 'name'|'description'|'country'|'serviceArea', label: string, multiline = false) => <label className="block space-y-2"><span className="text-sm font-medium">{label} <span aria-hidden="true">*</span></span>{multiline ? <textarea className="input-field min-h-24" value={value[key]} maxLength={3000} onChange={e => set(key,e.target.value)} required /> : <input className="input-field" value={value[key]} maxLength={key === 'name' ? 150 : 300} onChange={e => set(key,e.target.value)} required />}</label>

  const routeLabels: Record<string, string> = {
    website: t('routeWebsite'),
    whatsapp: t('routeWhatsApp'),
    phone: t('routePhone'),
    social: t('routeSocial'),
    booking: t('routeBooking'),
    marketplace: t('routeMarketplace'),
    other: t('routeOther'),
  }

  return <div className="space-y-7">
    <section className="space-y-4"><h2 className="text-lg font-semibold">{t('businessBasics')}</h2>{field('name', t('businessName'))}{field('description', t('whatDoYouDo'), true)}</section>
    <section className="space-y-4"><h2 className="text-lg font-semibold">{t('yourOfferings')}</h2><p className="text-sm text-ink-600">{t('offeringsHelp')}</p>
      {value.offerings.map((o,index) => <div key={o.id} className="rounded-2xl border border-ink-200 bg-white p-4 space-y-3">
        <div className="flex items-center justify-between"><span className="text-xs font-semibold text-primary-700">{t('offeringNumber')} {index+1}</span>{value.offerings.length>1 && <button type="button" className="min-h-11 min-w-11 rounded-xl text-red-600" aria-label={t('removeOffering')} onClick={() => set('offerings',value.offerings.filter(x=>x.id!==o.id))}><Trash2 size={16} className="mx-auto" /></button>}</div>
        <label className="block text-sm">{t('offeringName')}<input className="input-field mt-2" value={o.name} maxLength={150} onChange={e=>offer(o.id,{name:e.target.value})} required /></label>
        <label className="block text-sm">{t('descriptionOptional')}<textarea className="input-field mt-2" value={o.description} onChange={e=>offer(o.id,{description:e.target.value})} /></label>
        <label className="block text-sm">{t('pricingModel')}<select className="input-field mt-2" value={o.pricingModel} onChange={e=>offer(o.id,{pricingModel:e.target.value as Offering['pricingModel'],amount:null,currency:null})}><option value="unknown">{t('priceUnknown')}</option><option value="fixed">{t('priceFixed')}</option><option value="starting_from">{t('priceStartingFrom')}</option><option value="quote_required">{t('priceQuoteRequired')}</option></select></label>
        {['fixed','starting_from'].includes(o.pricingModel) && <div className="grid grid-cols-2 gap-3"><label className="text-sm">{t('amountOptional')}<input dir="ltr" className="input-field mt-2" inputMode="decimal" value={o.amount ?? ''} onChange={e=>offer(o.id,{amount:e.target.value || null})} /></label><label className="text-sm">{t('currency')}<input dir="ltr" className="input-field mt-2" placeholder="EGP" maxLength={3} value={o.currency ?? ''} onChange={e=>offer(o.id,{currency:e.target.value.toUpperCase() || null})} required={!!o.amount} /></label></div>}
      </div>)}<button type="button" className="btn-secondary" disabled={value.offerings.length>=20} onClick={()=>set('offerings',[...value.offerings,newOffering()])}><Plus size={16} />{t('addAnotherOffering')}</button>
    </section>
    <section className="space-y-4"><h2 className="text-lg font-semibold">{t('whereYouServe')}</h2>{field('country', t('country'))}{field('serviceArea', t('serviceArea'))}</section>
    <section className="space-y-4"><h2 className="text-lg font-semibold">{t('howCustomersContact')}</h2><label className="block text-sm">{t('contactRoute')}<select className="input-field mt-2" value={value.conversionRoute.state} onChange={e=>set('conversionRoute',{...value.conversionRoute,state:e.target.value as 'ready'|'not_ready'})}><option value="not_ready">{t('notReadyYet')}</option><option value="ready">{t('haveWorkingRoute')}</option></select></label>
    {value.conversionRoute.state==='ready' && <><label className="block text-sm">{t('routeType')}<select className="input-field mt-2" value={value.conversionRoute.type ?? ''} onChange={e=>set('conversionRoute',{...value.conversionRoute,type:e.target.value as BusinessFormData['conversionRoute']['type']})} required><option value="">{t('selectRoute')}</option>{(['website','whatsapp','phone','social','booking','marketplace','other'] as const).map((type)=><option key={type} value={type}>{routeLabels[type] ?? type}</option>)}</select></label><label className="block text-sm">{t('linkOrContactDetails')}<input dir="ltr" className="input-field mt-2" value={value.conversionRoute.value ?? ''} onChange={e=>set('conversionRoute',{...value.conversionRoute,value:e.target.value})} required /></label></>}
    </section>
    <details className="rounded-xl border border-ink-200 p-4"><summary className="cursor-pointer text-sm font-medium">{t('brandDetailsOptional')}</summary><div className="mt-4 space-y-4"><label className="block text-sm">{t('toneOfVoice')}<input className="input-field mt-2" value={value.tone??''} onChange={e=>set('tone',e.target.value)} /></label><label className="block text-sm">{t('brandColor')}<input className="input-field mt-2" placeholder="#6437fc" dir="ltr" value={value.brandColor??''} onChange={e=>set('brandColor',e.target.value)} /></label></div></details>
  </div>
}
