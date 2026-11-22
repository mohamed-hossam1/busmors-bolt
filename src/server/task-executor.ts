import 'server-only'
import type { AiCallResult } from '../lib/agents'
import type { ExecutionTask, ResearchRunResult, RouteDecision, TaskCheckpoint, TaskContext, TaskOutput } from '../features/tasks/types'
import { isResearchMode, type ResearchMode } from '../features/research/contracts'
import { explicitResearchRequest, inferResearchMode, routeRequest } from '../features/research/orchestrator/orchestrator'

export interface TaskBackend {
 rpc<T>(name:string,args:Record<string,unknown>):Promise<T>
 list():Promise<ExecutionTask[]>
 context(task:ExecutionTask):Promise<TaskContext>
 ai(task:ExecutionTask,operation:string,prompt:string,signal:AbortSignal):Promise<AiCallResult>
 /** Marketing research runs the Director and persists cited sources, claims and the PDF report. */
 research?(task:ExecutionTask,signal:AbortSignal):Promise<ResearchRunResult>
}
export class TaskFailure extends Error {
 code:string;retryable:boolean
 constructor(code:string,message:string,retryable=false){super(message);this.code=code;this.retryable=retryable}
}
const intentNames=['simple_answer','marketing_research','content_creation','campaign_planning','performance_diagnosis']
export function parseRoute(text:string):RouteDecision {
 let value:RouteDecision
 try{value=JSON.parse(text)}catch{throw new TaskFailure('invalid_output','The Director returned an unreadable response. Retry this task.')}
 const researchMode=value&&typeof value==='object'&&isResearchMode((value as unknown as Record<string,unknown>).researchMode)?(value.researchMode as ResearchMode):'standard'
 if(!value||!['reply','clarify','task'].includes(value.mode)||typeof value.reply!=='string'||value.reply.length>12000||(value.mode==='reply'&&!value.reply.trim())||!intentNames.includes(value.intent)||!Number.isInteger(value.quantity)||value.quantity<1||value.quantity>12
  ||(value.mode==='clarify'&&(!value.question||typeof value.question.label!=='string'||!value.question.label.trim()||value.question.label.length>500||!Array.isArray(value.question.options)||value.question.options.length>8||value.question.options.some(option=>typeof option!=='string'||!option.trim()||option.length>200))))throw new TaskFailure('invalid_output','The Director returned an incomplete response. Retry this task.')
 return value.intent==='marketing_research'?{...value,researchMode}:value
}
export function parsePosts(text:string,quantity:number):{title?:string;content?:string;posts:TaskOutput['posts'];partial:boolean} {
 let value:Record<string,unknown>
 try{value=JSON.parse(text)}catch{throw new TaskFailure('invalid_output','The drafts could not be read. Retry to generate complete drafts.')}
 const raw=value.posts
 const posts:TaskOutput['posts']=[]
 let dropped=0
 if(Array.isArray(raw)){
  for(const post of raw){
   if(post&&typeof post.caption==='string'&&post.caption.trim()&&post.caption.length<=6000&&typeof post.hashtags==='string'&&post.hashtags.length<=1000)posts.push({caption:post.caption,hashtags:post.hashtags,visualBrief:typeof post.visualBrief==='string'?post.visualBrief:'',platform:post.platform==='instagram'?'instagram':'facebook'})
   else dropped++
  }
 }
 // Keep the valid subset instead of discarding everything. No usable draft at all
 // is still a hard failure; some valid drafts but fewer than requested is a partial
 // result the caller persists with checkpoint.partial set.
 if(!posts.length)throw new TaskFailure('invalid_output','The response did not contain any complete drafts. Nothing has been saved as a Post.')
 const partial=dropped>0||posts.length!==quantity
 return {title:typeof value.title==='string'?value.title:undefined,content:typeof value.content==='string'?value.content:undefined,posts,partial}
}
export function aiFailure(result:AiCallResult):TaskFailure {
 const code=result.reason??result.error??'provider_error'
 const message=code==='no_active_key'?'The Director has no configured model. Configure the managed model or add an optional key in Settings.':code==='invalid_key'?'The model credential was rejected. Check the AI settings.':code==='budget_exhausted'?'This task reached its model allowance. Saved progress is available for review.':result.error==='unauthorized'?'Your session expired. Sign in again to resume this task.':'The model request failed. Saved progress is kept; retry when the connection is available.'
 return new TaskFailure(code,message,!!result.retryable)
}

export async function executeTask(backend: TaskBackend, initial:ExecutionTask,signal:AbortSignal){
  let task=initial,stepId:string|undefined
  const check=()=>{if(signal.aborted)throw new DOMException('Execution interrupted','AbortError')}
  const checkpoint=async(next:TaskCheckpoint,type?:string)=>{
   check();task=await backend.rpc<ExecutionTask>('checkpoint_task',{p_task_id:task.id,p_run_id:task.run_id,p_checkpoint:next,p_type:type??null,p_plan:null})
  }
  const step=async(agent:string,label:string,operation:()=>Promise<unknown>)=>{
   check();stepId=crypto.randomUUID()
   await backend.rpc('record_task_step',{p_task_id:task.id,p_run_id:task.run_id,p_instance_id:stepId,p_agent:agent,p_label:label,p_status:'running'})
   const value=await operation();check()
   await backend.rpc('record_task_step',{p_task_id:task.id,p_run_id:task.run_id,p_instance_id:stepId,p_agent:agent,p_label:label,p_status:'completed',p_output:{summary:label+' completed'}})
   stepId=undefined;return value
  }
  const call=async(operation:string,prompt:string)=>{
   let result:AiCallResult={ok:false,text:''}
   for(let attempt=0;attempt<2;attempt++){
    check();result=await backend.ai(task,operation,prompt,signal);check()
    if(result.ok)return result.text
    if(!result.retryable||attempt===1)throw aiFailure(result)
    await new Promise<void>(resolve=>{const timer=setTimeout(resolve,700);signal.addEventListener('abort',()=>{clearTimeout(timer);resolve()},{once:true})})
   }
   throw aiFailure(result)
  }
  try{
   // Input waits and interruptions can outlive a Brain edit or deletion. Read
   // eligible context again before another model call, retaining output-only
   // checkpoints so a save retry never regenerates finished work.
   if(task.checkpoint.phase!=='persist'){
    const context=await step('orchestrator','Load confirmed business context',()=>backend.context(task)) as TaskContext
    await checkpoint({...task.checkpoint,context,contextRefs:context.facts.map(fact=>({nodeId:fact.id,version:fact.version}))})
   }
   const prompt=()=>JSON.stringify({request:task.user_request,context:task.checkpoint.context,answers:task.checkpoint.answers??[],quantity:task.checkpoint.route?.quantity})
   if(task.checkpoint.phase==='route'){
    // Route A/B and the scope guardrails run first, and the decision is observable.
    const facts=task.checkpoint.context?.facts??[]
    const guard=await step('orchestrator','Route the request',async()=>routeRequest({
     request:task.user_request,
     hasBrainContext:facts.length>0,
     brainFacts:facts.map(fact=>fact.summary),
    })) as ReturnType<typeof routeRequest>
    if(guard.route==='refuse'||guard.route==='out_of_scope'){
     await checkpoint({...task.checkpoint,route:{mode:'reply',reply:guard.message,intent:'simple_answer',quantity:1},phase:'persist',output:{reply:guard.message,posts:[]}})
     return
    }
    // An explicit research request must not depend on a small model choosing a task.
    const forced=guard.route==='research'&&explicitResearchRequest(task.user_request)
    const route:RouteDecision=forced
     ?{mode:'task',reply:'',intent:'marketing_research',quantity:1,researchMode:inferResearchMode(task.user_request)}
     :await step('orchestrator','Route the request',async()=>parseRoute(await call('route',prompt()))) as RouteDecision
    if(route.mode==='clarify'){
     await checkpoint({...task.checkpoint,route})
     await backend.rpc('await_task_input',{p_task_id:task.id,p_run_id:task.run_id,p_label:route.question!.label,p_options:route.question!.options.slice(0,6)})
     return
    }
    if(route.mode==='reply')await checkpoint({...task.checkpoint,route,phase:'persist',output:{reply:route.reply,posts:[]}})
    else await checkpoint({...task.checkpoint,route,phase:'generate'},route.intent)
   }
   if(task.checkpoint.phase==='generate'){
    const route=task.checkpoint.route!
    let output:TaskOutput
    let partial=false
     if(route.intent==='marketing_research'){
      const runner=backend.research
      if(!runner)throw new TaskFailure('research_unavailable','Public research is not configured on this server. No sources have been retrieved.')
      // The Director owns its own subagent budget; the runner records a visible step
      // per specialist so the Canvas and the task trace show the real sequence.
      const result=await runner(task,signal) as ResearchRunResult
      output={reply:result.reply,posts:[],document:result.document,sourceRefs:result.research.sourceIds,limitations:result.research.coverageGaps,research:result.research}
      partial=result.partial
     }else if(route.intent==='content_creation'||route.intent==='campaign_planning'){
     const campaign=route.intent==='campaign_planning'
     const draft=await step(campaign?'campaign_planner':'content_writer',campaign?'Create the campaign brief and drafts':'Write the requested Post drafts',async()=>parsePosts(await call(campaign?'campaign':'copy',prompt()),route.quantity)) as ReturnType<typeof parsePosts>
     // A complete brief is required only to persist a document. A missing brief or
     // a short draft set is a partial result: keep the valid drafts and mark it,
     // rather than discarding the work and recording a hard failure.
     const hasBrief=!!(draft.title&&draft.content)
     partial=draft.partial||(campaign&&!hasBrief)
     const document=campaign&&hasBrief?{document:{title:draft.title!,content:draft.content!,type:'general' as const}}:{}
     output={reply:`${draft.posts.length} draft ${draft.posts.length===1?'Post is':'Posts are'} ready for your review in Scheduling. No publication or schedule has been approved.`,posts:draft.posts,...document}
    }else{
     const diagnosis=route.intent==='performance_diagnosis'
     const text=await step(diagnosis?'performance':'orchestrator',diagnosis?'Prepare a business diagnosis':'Answer the request',()=>call(diagnosis?'diagnose':'chat',prompt())) as string
     output={reply:diagnosis?'Your diagnosis is saved in Documents for review.':text,posts:[],...(diagnosis?{document:{title:task.user_request.slice(0,150),content:text,type:'performance_diagnosis' as const}}:{})}
    }
    await checkpoint({...task.checkpoint,phase:'persist',output,...(partial?{partial:true}:{})})
   }
    if(task.checkpoint.phase==='persist'){
     check()
     const saved=await backend.rpc<{taskId:string;documentId:string|null;postIds:string[];messageIds:string[]}>('save_task_result',{p_task_id:task.id,p_run_id:task.run_id,p_result:task.checkpoint.output,p_partial:!!task.checkpoint.partial})
     if(saved)task.checkpoint={...task.checkpoint,outputRefs:saved}
    }
   }catch(error){
    // Server-side detail for operators; the owner sees the stable message below.
    console.error('[task-executor]', task.id, task.checkpoint.phase, error)
    if(signal.aborted){
     // Abort must release the lease now; otherwise the task looks "running" until
     // recover_tasks reaps it ~120s later. Persist the same interrupted state the
     // non-abort path uses so the owner can resume from saved progress.
     try{await backend.rpc('stop_task',{p_task_id:task.id,p_run_id:task.run_id,p_status:'interrupted',p_message:'Execution was interrupted. Saved progress is available; resume to continue.'})}catch{/* Persisted leases allow recovery on the next visit. */}
     return
    }
    const message=error instanceof TaskFailure?error.message:task.checkpoint.phase==='persist'?'Generated work is checkpointed, but saving the final result failed. Resume to save it without generating again.':'Execution stopped. Saved progress is available; resume to try again.'
    try{await backend.rpc('stop_task',{p_task_id:task.id,p_run_id:task.run_id,p_status:task.checkpoint.phase==='persist'?'interrupted':'failed',p_message:message})}catch{/* Persisted leases allow recovery on the next visit. */}
   }
 }
