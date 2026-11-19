import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle2, Globe, PenLine, Share2, Brain, MessageSquare, Route, Loader2 } from 'lucide-react'
import AuthLayout from '../components/auth/AuthLayout'
import LoadingState from '../components/LoadingState'
import { supabase } from '../lib/supabase'
import { useCopy } from '../hooks/useCopy'
import { useAuth } from '../context/AuthContext'
import { extractKnowledgeFromSite, prepareSiteKnowledge, analyzeSiteKnowledge, DEFAULT_CRAWL_PAGES } from '../lib/crawl'
import BusinessForm from '../features/onboarding/BusinessForm'
import { emptyBusiness, mergeWebsiteFields, newOffering, validateBusiness, type BusinessDraftRow, type BusinessFormData } from '../features/onboarding/types'

export default function Onboarding() {
 const { t } = useCopy(); const { session, refreshSettings } = useAuth()
 const [form,setForm] = useState<BusinessFormData>(emptyBusiness)
 const [mode,setMode] = useState<'choose'|'website'|'form'|'review'|'done'>('choose')
 const [initializing,setInitializing] = useState(true)
 const [loadFailed,setLoadFailed] = useState(false)
 const [url,setUrl] = useState('')
 const [saving,setSaving] = useState(false)
 const [savedLabel,setSavedLabel] = useState(false)
 const [error,setError] = useState<string|null>(null)
 const [reading,setReading] = useState(false)
 const [pagesRead,setPagesRead] = useState(0)
 const [readStage,setReadStage] = useState<'read'|'extract'>('read')
 const [notice,setNotice] = useState('')
 const [review,setReview] = useState<BusinessDraftRow|null>(null)
 const current = useRef(form)
 const stored = useRef<BusinessDraftRow|null>(null)
 const sources = useRef<BusinessDraftRow['field_sources']>({})
 const path = useRef<'manual'|'website'>('manual')
 const queue = useRef<Promise<BusinessDraftRow|null>>(Promise.resolve(null))
 const abort = useRef<AbortController|null>(null)
 const userId = session?.user.id
 useEffect(() => () => abort.current?.abort(), [])
 const load = useCallback(async () => {
  if (!userId) return
  setInitializing(true); setError(null);setLoadFailed(false)
  const { data,error } = await supabase.from('business_drafts').select('*').eq('workspace_id',userId).maybeSingle()
  if (error) { setLoadFailed(true);setError('Unable to load your draft. Retry before editing.') }
  else if (data) { stored.current=data; sources.current=data.field_sources; path.current=data.path; setForm(data.form); current.current=data.form; setUrl(data.form.website??''); setMode(data.status==='confirmed'?'done':'form'); setSavedLabel(true) }
  setInitializing(false)
 },[userId])
 useEffect(() => { void load() }, [load])
 const save = useCallback((): Promise<BusinessDraftRow|null> => {
  const operation = queue.current.catch(()=>null).then(async()=>{
   const snapshot = structuredClone(current.current)
   if (stored.current && JSON.stringify(snapshot)===JSON.stringify(stored.current.form) && JSON.stringify(sources.current)===JSON.stringify(stored.current.field_sources)) return stored.current
   setSaving(true);setError(null)
   const { data,error } = await supabase.rpc('save_business_draft',{p_form:snapshot,p_expected_version:stored.current?.version??0,p_path:path.current,p_field_sources:sources.current})
   setSaving(false)
   if(error){setError(error.message.includes('STALE_VERSION')?('A newer draft exists. Your edits are kept here. Load the saved version or copy your changes before reloading.'):('Draft could not be saved. Your edits are still here; try again.'));throw error}
   stored.current=data;setSavedLabel(JSON.stringify(current.current)===JSON.stringify(snapshot));return data
  })
  queue.current=operation
  return operation
 },[])
 useEffect(()=>{
  if(initializing || loadFailed || mode!=='form')return
  const timer=setTimeout(()=>{void save().catch(()=>{})},800)
  return ()=>clearTimeout(timer)
 },[form,mode,initializing,loadFailed,save])
 const change=(next:BusinessFormData)=>{current.current=next;setForm(next);setSavedLabel(false)}
 const readWebsite=async()=>{
  if(reading)return
  setReading(true);setError(null);setNotice('');setPagesRead(0);setReadStage('read');path.current='website'
  const baseline=structuredClone(current.current);abort.current=new AbortController();setMode('form')
  try {
   const normalized = new URL(/^https?:\/\//i.test(url)?url:`https://${url}`).toString()
   const result=await extractKnowledgeFromSite(normalized,(count)=>setPagesRead(count),DEFAULT_CRAWL_PAGES,{signal:abort.current.signal,forceRefresh:true})
   if(!result.pages_read)throw new Error('NO_PAGES')
   setReadStage('extract')
   const analysis=await analyzeSiteKnowledge(result.pages)
   if(abort.current.signal.aborted)return
   const prepared=prepareSiteKnowledge(result.pages,result.candidates,analysis)
   const profile=prepared.candidates.find(c=>c.category==='company_profile')
   const offers=prepared.candidates.filter(c=>c.category==='offering')
   const incoming:Partial<BusinessFormData>={website:normalized}
   if(profile){incoming.name=profile.title;incoming.description=profile.summary}
   if(offers.length)incoming.offerings=offers.map(c=>({...newOffering(),name:c.title,description:c.summary}))
   const merged=mergeWebsiteFields(current.current,baseline,incoming)
   for(const [key,value] of Object.entries(incoming)){
    if(JSON.stringify(merged[key as keyof BusinessFormData])===JSON.stringify(value)){
     const candidate=key==='offerings'?offers[0]:profile
     if(candidate)sources.current[key]={url:candidate.source_url??normalized,excerpt:String(candidate.properties.evidence_quote??candidate.summary)}
    }
   }
   change(merged);await save()
   setNotice(('Website suggestions are saved. Check each field, add missing details, and confirm. Nothing is active in your Brain yet.'))
  }catch{
   setError(('The website could not be fully read or saved. Your current fields are kept; continue manually or retry.'))
  }finally{setReading(false)}
 }
 const reviewBusiness=async()=>{
  if(validateBusiness(current.current).length){setError(('Complete the required basics, one offering, service area, and contact route. An amount needs a three-letter currency.'));return}
  try{const row=await save();if(row){setReview(row);setMode('review')}}catch{/* Save shows recoverable error. */}
 }
 const confirmBusiness=async()=>{
  if(!review || saving)return
  setSaving(true);setError(null)
  const {error}=await supabase.rpc('confirm_business_draft',{p_draft_id:review.id,p_expected_version:review.version})
  setSaving(false)
  if(error){setError(error.message.includes('STALE_VERSION')?('This summary is outdated. Load the latest draft and review it again.'):('Confirmation failed. Your draft is safe; try again.'));return}
  setMode('done');await refreshSettings()
 }
 if(initializing)return <LoadingState fullScreen label={t('loading')} />
 if(loadFailed)return <AuthLayout title="Your draft could not be loaded" subtitle="Your saved business information is safe. Retry to continue editing."><p role="alert" className="mb-4 text-sm text-red-700">{error}</p><button className="btn-primary" onClick={()=>void load()}>Retry loading draft</button></AuthLayout>
 return <AuthLayout title={mode==='done'?('Your business context is ready.'):mode==='review'?('Make it yours. Then confirm.'):('Let’s get to know your business.')} subtitle={mode==='done'?('Choose where to start. Your confirmed context is saved in your Business Brain.'):('A little context helps your Director do useful work. You stay in control of what is confirmed.')}
 eyebrow={<span className="flex items-center gap-2 text-xs font-semibold text-primary-700"><CheckCircle2 size={16}/>{('Your business')}</span>}>
 {error&&<div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><p>{error}</p><button type="button" className="mt-3 underline" onClick={()=>void load()}>{('Load saved version')}</button></div>}
 {notice&&<p role="status" className="mb-5 rounded-xl border border-primary-200 bg-primary-50 p-4 text-sm text-primary-800">{notice}</p>}
 {mode==='choose'&&<div className="space-y-3">{[{icon:Globe,title:('Import your website'),description:('Read public pages, then edit and confirm.'),mode:'website'},{icon:PenLine,title:('Set up manually'),description:('No website needed. Start with the essentials.'),mode:'form'},{icon:Share2,title:('Social profile import'),description:('Coming soon · Phase 3'),mode:'disabled'}].map(item=><button key={item.mode} disabled={item.mode==='disabled'} className="flex w-full items-center gap-4 rounded-2xl border border-ink-200 bg-white p-5 text-start transition hover:border-primary-400 disabled:opacity-50" onClick={()=>setMode(item.mode as 'website'|'form')}><item.icon size={22} className="shrink-0 text-primary-600"/><span className="flex-1"><span className="block font-semibold">{item.title}</span><span className="mt-1 block text-sm text-ink-600">{item.description}</span></span><ArrowRight size={17}/></button>)}</div>}
 {mode==='website'&&<form className="space-y-4" onSubmit={e=>{e.preventDefault();void readWebsite()}}><label className="block text-sm">{t('websiteUrl')}<input type="text" inputMode="url" dir="ltr" value={url} onChange={e=>setUrl(e.target.value)} placeholder="example.com" className="input-field mt-2" required/></label><button className="btn-primary w-full">{t('startCrawl')}<ArrowRight size={16}/></button><button type="button" className="btn-secondary w-full" onClick={()=>setMode('form')}>{('Continue manually')}</button></form>}
 {mode==='form'&&<>
  {reading&&<div role="status" className="mb-5 flex items-center gap-3 rounded-xl bg-primary-50 p-4 text-sm text-primary-700"><Loader2 className="animate-spin shrink-0" size={18}/><div>{readStage==='read'?('Reading public pages'):('Extracting supported suggestions')}<p>{pagesRead} {t('crawlPagesRead')}</p><p className="mt-1 text-xs">{('Keep this browser open during reading. You can edit while it runs.')}</p></div><button className="ms-auto underline" onClick={()=>abort.current?.abort()}>{t('cancel')}</button></div>}
  <form onSubmit={e=>{e.preventDefault();void reviewBusiness()}}><BusinessForm value={form} onChange={change}/><div className="sticky bottom-0 mt-6 flex flex-wrap items-center gap-3 border-t border-ink-200 bg-ink-50/95 py-4"><span role="status" className="me-auto text-xs text-ink-600">{saving?t('saving'):savedLabel?t('saved'):('Unsaved changes')}</span><button type="button" className="btn-secondary" disabled={saving} onClick={()=>void save().catch(()=>{})}>{('Save draft')}</button><button className="btn-primary" disabled={saving||reading}>{('Review business')}<ArrowRight size={16}/></button></div></form>
 </>}
 {mode==='review'&&review&&<div className="space-y-5"><div className="card space-y-4 p-5"><div><h2 className="text-xl font-semibold">{review.form.name}</h2><p className="mt-2 text-sm leading-7 text-ink-600">{review.form.description}</p></div><p className="text-sm">{review.form.country} · {review.form.serviceArea}</p><div className="space-y-3">{review.form.offerings.map(o=><div key={o.id} className="rounded-xl bg-ink-50 p-3"><p className="font-medium">{o.name}</p><p className="text-sm text-ink-600">{o.description}</p><p className="mt-1 text-xs text-primary-700">{o.amount!==null?`${o.amount} ${o.currency??''}`:o.pricingModel==='quote_required'?('Quote required'):('Price not provided')}</p></div>)}</div><p className="text-sm">{review.form.conversionRoute.state==='not_ready'?('Contact route: not ready yet'):<bdi>{review.form.conversionRoute.type}: {review.form.conversionRoute.value}</bdi>}</p><span className="badge">{('Draft version')} {review.version}</span></div>
 {Object.entries(review.field_sources).map(([key,source])=><details key={key} className="rounded-xl border border-ink-200 p-3 text-sm"><summary>{('Website source')} · {key}</summary><blockquote className="mt-3 text-ink-600">{source.excerpt}</blockquote><a className="mt-2 block break-all text-primary-700" href={source.url} target="_blank" rel="noopener noreferrer"><bdi>{source.url}</bdi></a></details>)}
 <p className="text-xs leading-6 text-ink-600">{('Confirming allows your Director to use these facts. Imported claims are not independently verified.')}</p><div className="flex flex-wrap gap-3"><button className="btn-secondary" onClick={()=>setMode('form')} disabled={saving}>{t('edit')}</button><button className="btn-primary flex-1" disabled={saving} onClick={()=>void confirmBusiness()}>{saving?t('saving'):('Confirm business context')}</button></div></div>}
 {mode==='done'&&<div className="space-y-3"><Link to="/employee" className="card flex items-center gap-4 p-5 hover:border-primary-400"><MessageSquare className="text-primary-600"/><div><h2 className="font-semibold">{('Chat with my Director')}</h2><p className="mt-1 text-sm text-ink-600">{('Ask a question or create something useful.')}</p></div></Link><Link to="/roadmap" className="card flex items-center gap-4 p-5 hover:border-primary-400"><Route className="text-primary-600"/><div><h2 className="font-semibold">{('Create my Roadmap')}</h2><p className="mt-1 text-sm text-ink-600">{('Turn a goal into clear, actionable steps.')}</p></div></Link><Link to="/brain" className="btn-secondary w-full"><Brain size={17}/>{t('navBrain')}</Link></div>}
 </AuthLayout>
}
