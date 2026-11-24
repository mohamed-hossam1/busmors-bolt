import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { callAi } from './call-ai'
import type { AiOperation } from '../lib/agents'
import type { BrainNode } from '../lib/types'
import type { TaskBackend } from './task-executor'
import type { ExecutionTask, TaskContext } from '../features/tasks/types'
import type { BusinessProfile } from '../features/research/contracts'
import { runMarketingResearch } from './research/runner'
import { profileBusinessWithAi } from './research/ai-profiler'

export function taskBackend(supabase: SupabaseClient, workspaceId:string, token:string):TaskBackend {
 const getContext=async(task:ExecutionTask):Promise<TaskContext>=>{
  const [facts,messages,settings]=await Promise.all([
   supabase.from('brain_nodes').select('*').eq('workspace_id',workspaceId).eq('status','approved').eq('approval_state','approved').eq('is_current',true).limit(100),
   supabase.from('messages').select('role,content').eq('conversation_id',task.conversation_id).order('created_at',{ascending:false}).limit(20),
   supabase.from('workspace_settings').select('country,currency,target_market,timezone').eq('workspace_id',workspaceId).single(),
  ])
  if(facts.error||messages.error||settings.error)throw new Error('Business context could not be loaded.')
  const allFacts = facts.data as BrainNode[]
  return {facts:allFacts.map(node=>({id:node.id,version:node.version,category:node.category,title:node.title,summary:node.summary.slice(0,2000),verification_state:node.verification_state,properties:Object.fromEntries(Object.entries(node.properties).filter(([key])=>['pricingModel','amount','currency','country','serviceArea','conversionRoute','tone','website','targetAudience','category','industry'].includes(key)))})),history:(messages.data??[]).reverse().map(message=>({...message,content:message.content.slice(0,1200)})),region:settings.data}
 }
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
  context:getContext,
  async research(task,signal,trace){
    const context=await getContext(task);
    const aiProfile = await profileBusinessWithAi({ task, context, signal, token });
    const company = context.facts.find(fact => fact.category === 'company_profile');
    const offerings = context.facts.filter(fact => fact.category === 'offering');
    const profile: BusinessProfile = {
      name: aiProfile.companyName,
      sector: aiProfile.sector,
      description: aiProfile.offeringsSummary || `${company?.summary ?? ''}`.trim() || task.user_request.slice(0, 500),
      governorates: aiProfile.governorates,
      channels: context.facts.filter(fact => fact.category === 'channel').map(fact => fact.title),
      website: typeof company?.properties?.website === 'string' ? company.properties.website : null,
      audience: aiProfile.targetAudience,
      offerings: offerings.map(o => o.title).filter(Boolean),
    };
    return runMarketingResearch({
      client: supabase,
      task,
      signal,
      trace,
      profile,
      aiQueries: aiProfile.searchQueries,
      knownCompetitors: aiProfile.knownCompetitors,
      category: { label: aiProfile.category, labelAr: aiProfile.categoryAr },
      mode: task.research_mode ?? undefined
    }).then(result => result.result);
  },
  ai(task,operation,prompt,signal){return callAi({operation:operation as AiOperation,taskId:task.id,runId:task.run_id!,userPrompt:prompt,signal,maxTokens:operation==='route'?800:operation==='campaign'?6000:3500}, token)},
 }
}
