import { supabase } from '../../lib/supabase'
import { callAi, type AiOperation } from '../../lib/agents'
import type { BrainNode } from '../../lib/types'
import type { TaskBackend } from './runner'
import type { ExecutionTask } from './types'

export function taskBackend(workspaceId:string):TaskBackend {
 return {
  async rpc<T>(name:string,args:Record<string,unknown>):Promise<T>{const {data,error}=await supabase.rpc(name,args);if(error)throw error;return data as T},
  async list(){
   // History is bounded; unfinished work cannot disappear behind that limit.
   const {data,error}=await supabase.from('tasks').select('*').eq('workspace_id',workspaceId).order('created_at',{ascending:false}).limit(100)
   if(error)throw error
   const tasks=new Map((data??[]).map(task=>[task.id,task as ExecutionTask]))
   for(let offset=0;;offset+=200){
    const page=await supabase.from('tasks').select('*').eq('workspace_id',workspaceId)
     .in('status',['queued','running','awaiting_input','awaiting_approval']).order('created_at').order('id').range(offset,offset+199)
    if(page.error)throw page.error
    for(const task of page.data??[])tasks.set(task.id,task as ExecutionTask)
    if((page.data?.length??0)<200)break
   }
   return [...tasks.values()].sort((a,b)=>b.created_at.localeCompare(a.created_at))
  },
  async context(task){
   const [facts,messages,settings]=await Promise.all([
    supabase.from('brain_nodes').select('*').eq('workspace_id',workspaceId).eq('status','approved').eq('approval_state','approved').eq('is_current',true).limit(100),
    supabase.from('messages').select('role,content').eq('conversation_id',task.conversation_id).order('created_at',{ascending:false}).limit(20),
    supabase.from('workspace_settings').select('country,currency,target_market,timezone').eq('workspace_id',workspaceId).single(),
   ])
   if(facts.error||messages.error||settings.error)throw new Error('Business context could not be loaded.')
   const words=task.user_request.toLowerCase().split(/\W+/).filter(word=>word.length>3)
   const score=(node:BrainNode)=>words.reduce((total,word)=>total+(`${node.title} ${node.summary}`.toLowerCase().includes(word)?1:0),['company_profile','brand_rule','offering'].includes(node.category)?1:0)
   const selected=(facts.data as BrainNode[]).sort((a,b)=>score(b)-score(a)).slice(0,12)
   return {facts:selected.map(node=>({id:node.id,version:node.version,category:node.category,title:node.title,summary:node.summary.slice(0,700),verification_state:node.verification_state,properties:Object.fromEntries(Object.entries(node.properties).filter(([key])=>['pricingModel','amount','currency','country','serviceArea','conversionRoute','tone','website'].includes(key)))})),history:(messages.data??[]).reverse().map(message=>({...message,content:message.content.slice(0,1200)})),region:settings.data}
  },
  ai(task,operation,prompt,signal){return callAi({operation:operation as AiOperation,taskId:task.id,runId:task.run_id!,userPrompt:prompt,signal,maxTokens:operation==='route'?800:operation==='campaign'?6000:3500})},
 }
}
