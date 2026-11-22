'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useDialog } from '../../hooks/useDialog'
import { useCopy } from '../../hooks/useCopy'
import type { BrainNode,BrainEdge } from '../../lib/types'

export default function RelationshipEditor({nodes,edges,onClose,onChanged}:{nodes:BrainNode[];edges:BrainEdge[];onClose:()=>void;onChanged:()=>Promise<void>}) {
 const { t } = useCopy()
 const eligible=nodes.filter(n=>!['rejected','retired'].includes(n.status))
 const [source,setSource]=useState(eligible[0]?.id??''),[target,setTarget]=useState(eligible[1]?.id??'')
 const [type,setType]=useState('RELATED_TO'),[note,setNote]=useState(''),[edgeId,setEdgeId]=useState<string|null>(null)
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 const close=()=>{if(!busy)onClose()};useDialog(true,close)
 const save=async(e:React.FormEvent)=>{
  e.preventDefault();setBusy(true);setError('')
  try{const {error}=await supabase.rpc('save_brain_relationship',{p_source:source,p_target:target,p_type:type,p_source_note:note,p_edge_id:edgeId});if(error)throw error;await onChanged();setEdgeId(null);setNote('')}
  catch{setError(t('relationshipSaveError'))}
  finally{setBusy(false)}
 }
  return <div className="fixed inset-0 z-50 grid place-items-center bg-ink-900/40 p-4" onClick={close}><section role="dialog" aria-modal="true" aria-label={t('knowledgeRelationships')} className="card modal-panel max-h-[90dvh] w-full max-w-xl overflow-y-auto p-5 sm:p-7" onClick={e=>e.stopPropagation()}>
  <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">{t('knowledgeRelationships')}</h2><button aria-label={t('closeRelationships')} className="btn-icon" disabled={busy} onClick={close}><X size={20}/></button></div>
  <p className="mt-2 text-sm text-ink-600">{t('relationshipsDesc')}</p>
  <form className="mt-5 space-y-4" onSubmit={save}>
   <label className="block text-sm">{t('fromItem')}<select className="input-field mt-2" value={source} onChange={e=>setSource(e.target.value)}>{eligible.map(n=><option key={n.id} value={n.id}>{n.title}</option>)}</select></label>
   <label className="block text-sm">{t('relationship')}<select className="input-field mt-2" value={type} onChange={e=>setType(e.target.value)}>{['TARGETS','COMPETES_WITH','HAS_TONE','SOLVES_PAIN_POINT','RELATED_TO'].map(rel=><option key={rel} value={rel}>{rel.toLowerCase().replaceAll('_',' ')}</option>)}</select></label>
   <label className="block text-sm">{t('toItem')}<select className="input-field mt-2" value={target} onChange={e=>setTarget(e.target.value)}>{eligible.map(n=><option key={n.id} value={n.id}>{n.title}</option>)}</select></label>
   <label className="block text-sm">{t('sourceOrExplanation')}<input className="input-field mt-2" maxLength={1000} value={note} onChange={e=>setNote(e.target.value)} required/></label>
   {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}<button className="btn-primary" disabled={busy||!source||!target||source===target}>{busy?t('saving'):edgeId?t('approveRelationshipChange'):t('addRelationship')}</button>
  </form>
  <div className="mt-6 space-y-2">{edges.map(edge=><button disabled={busy} key={edge.id} className="w-full rounded-xl border border-ink-200 p-3 text-start text-xs" onClick={()=>{setEdgeId(edge.id);setSource(edge.source_node_id);setTarget(edge.target_node_id);setType(edge.relation_type);setNote(String(edge.provenance?.source??edge.provenance?.excerpt??''))}}><span className="font-medium">{nodes.find(n=>n.id===edge.source_node_id)?.title??t('unavailableItem')}</span> · {edge.relation_type.toLowerCase().replaceAll('_',' ')} · {nodes.find(n=>n.id===edge.target_node_id)?.title??t('unavailableItem')}<span className="mt-1 block text-ink-500">{edge.status==='candidate'?t('suggestedClickToReview'):t('ownerApprovedClickToEdit')}</span></button>)}</div>
 </section></div>
}
