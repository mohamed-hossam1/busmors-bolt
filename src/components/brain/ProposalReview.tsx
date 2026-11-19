import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { brainError } from '../../lib/brainApi'
import type { BrainNode, BrainProposal } from '../../lib/types'
import NodeEditor from './NodeEditor'

export default function ProposalReview({proposals,nodes,onChanged}:{proposals:BrainProposal[];nodes:BrainNode[];onChanged:()=>Promise<void>}) {
 const [busy,setBusy]=useState<string|null>(null),[error,setError]=useState(''),[editing,setEditing]=useState<BrainProposal|null>(null)
 const decide=async(proposal:BrainProposal,decision:'approved'|'rejected',edit?:BrainProposal['diff'])=>{
  setBusy(proposal.id);setError('')
  try{
   const {error}=await supabase.rpc('decide_brain_proposal',{p_proposal_id:proposal.id,p_expected_version:proposal.base_version,p_decision:decision,p_edit:edit??null})
   if(error)throw brainError(error)
   setEditing(null);await onChanged()
  }catch(error){setError(error instanceof Error?error.message:'Could not save this decision.');if(edit)throw error}finally{setBusy(null)}
 }
 if(!proposals.length)return null
 return <section className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/40 p-4 sm:p-5"><h2 className="font-semibold">Proposed knowledge changes <span className="badge ms-2">{proposals.length}</span></h2><p className="mt-2 text-sm leading-6 text-ink-600">Review source claims before allowing your Director to use them. Approval does not independently verify a claim.</p>
 {error&&<p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
 <div className="mt-4 grid gap-3 md:grid-cols-2">{proposals.map(proposal=>{
  const current=nodes.find(node=>node.id===proposal.node_id)
  return <article key={proposal.id} className="card p-4"><h3 className="font-semibold">{proposal.diff.title}</h3>{current?.approval_state==='approved'&&<p className="mt-2 text-xs text-ink-500">Current: {current.summary}</p>}<p className="mt-2 text-sm leading-6 text-ink-700">{proposal.diff.summary}</p>
   {typeof proposal.diff.properties.evidence_quote==='string'&&<details className="mt-3 text-xs text-ink-600"><summary className="cursor-pointer">Source excerpt</summary><blockquote className="mt-2 leading-6">{proposal.diff.properties.evidence_quote}</blockquote><p className="mt-2 break-all">{proposal.diff.source_detail}</p></details>}
   <p className="mt-3 text-xs text-ink-500">Based on version {proposal.base_version}</p><div className="mt-4 flex flex-wrap gap-2"><button disabled={!!busy} className="btn-primary text-xs" onClick={()=>void decide(proposal,'approved')}>Approve for use</button><button disabled={!!busy} className="btn-secondary text-xs" onClick={()=>setEditing(proposal)}>Edit and approve</button><button disabled={!!busy} className="btn-secondary text-xs" onClick={()=>void decide(proposal,'rejected')}>Reject</button></div>
  </article>
 })}</div>
 {editing&&<NodeEditor node={{...nodes.find(n=>n.id===editing.node_id)!,...editing.diff}} onCancel={()=>setEditing(null)} onSave={(title,summary,category,properties)=>decide(editing,'approved',{title,summary,category,properties})}/>}
 </section>
}
