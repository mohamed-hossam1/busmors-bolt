'use client'

import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { brainError } from '../../lib/brainApi'
import type { BrainNode, BrainProposal } from '../../lib/types'
import NodeEditor from './NodeEditor'
import { useCopy } from '../../hooks/useCopy'

export default function ProposalReview({proposals,nodes,onChanged}:{proposals:BrainProposal[];nodes:BrainNode[];onChanged:()=>Promise<void>}) {
 const { t } = useCopy()
 const [busy,setBusy]=useState<string|null>(null),[error,setError]=useState(''),[editing,setEditing]=useState<BrainProposal|null>(null)
 const decide=async(proposal:BrainProposal,decision:'approved'|'rejected',edit?:BrainProposal['diff'])=>{
  setBusy(proposal.id);setError('')
  try{
   const {error}=await supabase.rpc('decide_brain_proposal',{p_proposal_id:proposal.id,p_expected_version:proposal.base_version,p_decision:decision,p_edit:edit??null})
   if(error)throw brainError(error)
   setEditing(null);await onChanged()
   }catch(error){setError(error instanceof Error?error.message:t('couldNotSaveDecision'));if(edit)throw error}finally{setBusy(null)}
 }
 if(!proposals.length)return null
  return <section className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/40 p-4 sm:p-5"><h2 className="font-semibold">{t('proposedKnowledgeChanges')} <span className="badge ms-2">{proposals.length}</span></h2><p className="mt-2 text-sm leading-6 text-ink-600">{t('proposedKnowledgeDesc')}</p>
 {error&&<p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
 <div className="mt-4 grid gap-3 md:grid-cols-2">{proposals.map(proposal=>{
  const current=nodes.find(node=>node.id===proposal.node_id)
  return <article key={proposal.id} className="card p-4 flex flex-col justify-between h-full">
    <div className="flex-1 min-w-0">
      <h3 className="font-semibold text-ink-900 line-clamp-2 min-h-[44px] leading-snug" title={proposal.diff.title}>{proposal.diff.title}</h3>
      {current?.approval_state==='approved'&&<p className="mt-1.5 text-xs text-ink-500 line-clamp-1 truncate">{t('currentLabel', { summary: current.summary })}</p>}
      <p className="mt-2 text-sm leading-5 text-ink-700 line-clamp-2 min-h-[40px]" title={proposal.diff.summary}>{proposal.diff.summary}</p>
      {typeof proposal.diff.properties.evidence_quote==='string'&&<details className="mt-2.5 text-xs text-ink-600"><summary className="cursor-pointer select-none">{t('sourceExcerpt')}</summary><blockquote className="mt-2 max-h-24 overflow-y-auto leading-5 text-ink-600 italic border-l-2 border-amber-400 pl-2">{proposal.diff.properties.evidence_quote}</blockquote><p className="mt-1.5 truncate text-[11px] text-ink-400 font-mono" dir="ltr">{proposal.diff.source_detail}</p></details>}
    </div>
    <div className="mt-auto pt-3 border-t border-ink-100/60">
      <p className="text-xs text-ink-500">{t('basedOnVersion', { version: proposal.base_version })}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button disabled={!!busy} className="btn-primary text-xs" onClick={()=>void decide(proposal,'approved')}>{t('approveForUse')}</button>
        <button disabled={!!busy} className="btn-secondary text-xs" onClick={()=>setEditing(proposal)}>{t('editAndApprove')}</button>
        <button disabled={!!busy} className="btn-secondary text-xs" onClick={()=>void decide(proposal,'rejected')}>{t('reject')}</button>
      </div>
    </div>
  </article>
 })}</div>
 {editing&&<NodeEditor node={{...nodes.find(n=>n.id===editing.node_id)!,...editing.diff}} onCancel={()=>setEditing(null)} onSave={(title,summary,category,properties)=>decide(editing,'approved',{title,summary,category,properties})}/>}
 </section>
}
