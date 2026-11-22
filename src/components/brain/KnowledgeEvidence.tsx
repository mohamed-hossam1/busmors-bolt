'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useDialog } from '../../hooks/useDialog'
import { useCopy } from '../../hooks/useCopy'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { formatWorkspaceTime } from '../../lib/region'
import type { BrainNode } from '../../lib/types'

export function KnowledgeLabels({node}:{node:BrainNode}) {
  const { t } = useCopy()
  return <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
    <span className="badge">{node.approval_state==='approved'?t('approvedForUse'):node.approval_state==='legacy'?t('legacyApproval'):node.approval_state==='rejected'?t('status_rejected'):t('awaitingApproval')}</span>
    <span className="badge">{(node.verification_state??'unverified').replaceAll('_',' ')}</span>
    <span className="badge">{t('versionLabel', { version: node.version??1 })}</span>
  </div>
}
export default function KnowledgeEvidence({node,onClose}:{node:BrainNode;onClose:()=>void}) {
  const [versions,setVersions]=useState<{id:string;version:number;snapshot:BrainNode;created_at:string}[]>([])
  const { settings } = useAuth()
  const { t } = useCopy()
  const tz = settings?.timezone ?? 'UTC'
  const [error,setError]=useState(''),[loading,setLoading]=useState(true)
  useDialog(true,onClose)
  useEffect(()=>{
    let active=true
    void supabase.from('brain_versions').select('*').eq('node_id',node.id).order('version',{ascending:false}).then(({data,error})=>{
      if(!active)return
      if(error)setError(t('versionHistoryLoadError'));else setVersions(data??[])
      setLoading(false)
    })
    return ()=>{active=false}
  },[node.id])
  const sourceUrl=(()=>{try{const u=new URL(node.source_detail??'');return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null}catch{return null}})()
  return <div className="fixed inset-0 z-50 grid place-items-center bg-ink-900/40 p-4" onClick={onClose}><section role="dialog" aria-modal="true" aria-label={t('knowledgeEvidenceAndHistory')} className="card modal-panel max-h-[90dvh] w-full max-w-xl overflow-y-auto p-5 sm:p-7" onClick={e=>e.stopPropagation()}>
    <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-primary-600">{t('evidenceAndHistory')}</p><h2 className="mt-2 text-xl font-semibold">{node.title}</h2></div><button className="btn-icon" aria-label={t('closeEvidence')} onClick={onClose}><X size={20}/></button></div>
    <KnowledgeLabels node={node}/>
    <dl className="mt-5 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-ink-500">{t('origin')}</dt><dd className="mt-1 capitalize">{node.source}</dd></div><div><dt className="text-ink-500">{t('statementType')}</dt><dd className="mt-1 capitalize">{node.epistemic_kind??'claim'}</dd></div><div><dt className="text-ink-500">{t('updated')}</dt><dd className="mt-1">{formatWorkspaceTime(node.updated_at, tz, { dateStyle: 'medium', timeStyle: undefined })}</dd></div><div><dt className="text-ink-500">{t('extractionConfidence')}</dt><dd className="mt-1">{Math.round(node.confidence*100)}%</dd></div></dl>
    <p className="mt-3 text-xs leading-6 text-ink-500">{typeof node.properties.confidence_reason==='string'?node.properties.confidence_reason:t('confidenceDisclaimer')}</p>
    {sourceUrl?<a className="mt-3 block break-all text-sm text-primary-700 underline" href={sourceUrl} target="_blank" rel="noopener noreferrer">{sourceUrl}</a>:node.source_detail&&<p className="mt-3 text-sm text-ink-600">{node.source_detail}</p>}
    {typeof node.properties.evidence_quote==='string'&&<blockquote className="mt-4 border-s-2 border-primary-300 ps-4 text-sm leading-7 text-ink-600">{node.properties.evidence_quote}</blockquote>}
    <h3 className="mt-7 text-sm font-semibold">{t('savedVersions')}</h3>
    {loading?<p role="status" className="mt-3 text-sm">{t('loadingHistory')}</p>:error?<p role="alert" className="mt-3 text-sm text-red-700">{error}</p>:versions.length===0?<p className="mt-3 text-sm text-ink-500">{t('noVersionHistory')}</p>:<ol className="mt-3 space-y-3">{versions.map(version=><li key={version.id} className="rounded-xl border border-ink-200 p-4"><div className="flex flex-wrap justify-between gap-2 text-xs text-ink-500"><b>{t('versionLabel', { version: version.version })}</b><span>{formatWorkspaceTime(version.created_at, tz)}</span></div><p className="mt-2 text-sm font-medium">{version.snapshot.title}</p><p className="mt-1 whitespace-pre-line text-sm leading-6 text-ink-600">{version.snapshot.summary}</p>{version.snapshot.category==='offering'&&<p className="mt-2 text-xs text-primary-700">{version.snapshot.properties?.pricingModel?String(version.snapshot.properties.pricingModel).replaceAll('_',' '):t('priceNotSet')}{version.snapshot.properties?.amount!=null?` · ${version.snapshot.properties.amount} ${version.snapshot.properties.currency??''}`:''}</p>}</li>)}</ol>}
  </section></div>
}
