import 'server-only'
import type { AiCallResult } from '../lib/agents'
import type { ExecutionTask, RouteDecision, TaskCheckpoint, TaskContext, TaskOutput } from '../features/tasks/types'
import { isSubstantialReply, replyTitle, sectionForTask } from '../lib/deliverableRouting'
import { postsMarkdown, scheduleTable } from '../lib/deliverableMarkdown'
import { localToInstant } from '../lib/calendar'

export interface TaskBackend {
 rpc<T>(name:string,args:Record<string,unknown>):Promise<T>
 list():Promise<ExecutionTask[]>
 context(task:ExecutionTask):Promise<TaskContext>
 ai(task:ExecutionTask,operation:string,prompt:string,signal:AbortSignal):Promise<AiCallResult>
}
export class TaskFailure extends Error {
 code:string;retryable:boolean
 constructor(code:string,message:string,retryable=false){super(message);this.code=code;this.retryable=retryable}
}
const intentNames=['simple_answer','market_research','competitor_analysis','content_creation','campaign_planning','performance_diagnosis']
export function parseRoute(text:string):RouteDecision {
 let value:RouteDecision
 try{value=JSON.parse(text)}catch{throw new TaskFailure('invalid_output','The Director returned an unreadable response. Retry this task.')}
 // Normalize recoverable details before validating: a quantity outside 1-12
 // (e.g. 14 for "2 weeks") is clamped, and clarification options are limited
 // to the first 8 usable ones.
 if(value&&typeof value==='object'){
  const quantity=Math.round(Number(value.quantity??1))
  if(Number.isFinite(quantity))value.quantity=Math.min(12,Math.max(1,quantity))
  if(value.question&&Array.isArray(value.question.options))value.question.options=value.question.options.filter(option=>typeof option==='string'&&option.trim()&&option.length<=200).slice(0,8)
 }
 if(!value||!['reply','clarify','task'].includes(value.mode)||typeof value.reply!=='string'||value.reply.length>12000||(value.mode==='reply'&&!value.reply.trim())||!intentNames.includes(value.intent)||!Number.isInteger(value.quantity)||value.quantity<1||value.quantity>12
  ||(value.mode==='clarify'&&(!value.question||typeof value.question.label!=='string'||!value.question.label.trim()||value.question.label.length>500||!Array.isArray(value.question.options)||value.question.options.length>8||value.question.options.some(option=>typeof option!=='string'||!option.trim()||option.length>200))))throw new TaskFailure('invalid_output','The Director returned an incomplete response. Retry this task.')
 return value
}
// The router model sometimes answers a drafting or diagnosis request inline
// (mode 'reply') while labelling the correct intent. Inline answers create no
// draft Posts and skip the diagnosis step, so these intents always run as a
// task. Research intents stay as routed: research is not implemented yet.
// A request gets at most one clarification: once the owner has answered (or
// skipped) a question, the router must proceed instead of asking again, which
// otherwise loops and spends the task allowance on routing alone.
const generatedIntents=['content_creation','campaign_planning','performance_diagnosis']
// The router tends to set quantity 1 for campaigns. A campaign gets the number of
// posts the user asked for (max 12), otherwise at least 3.
export function campaignQuantity(request:string,quantity:number):number {
 const asked=/\b(\d{1,2})\s+(?:[a-z-]+\s+){0,2}(?:posts?|drafts?)\b/i.exec(request)
 if(asked)return Math.min(12,Math.max(1,Number(asked[1])))
 return Math.min(12,Math.max(3,quantity))
}
export function promoteTaskIntent(route:RouteDecision,answered=0,request=''):RouteDecision {
 // The router sometimes labels an explicit campaign request as plain post copy;
 // a request that says "campaign" gets the campaign brief and quantity rule.
 if(route.intent==='content_creation'&&/\bcampaigns?\b/i.test(request))route={...route,intent:'campaign_planning'}
 if(route.mode==='reply'&&generatedIntents.includes(route.intent))return {...route,mode:'task'}
 if(route.mode==='clarify'&&answered>0){const {question:_question,...rest}=route;return {...rest,mode:'task'}}
 return route
}
const HOUR_MS=3_600_000
export function parsePosts(text:string,quantity:number,timeZone:string,now:Date):{title?:string;content?:string;posts:TaskOutput['posts'];partial:boolean} {
 let value:Record<string,unknown>
 try{value=JSON.parse(text)}catch{throw new TaskFailure('invalid_output','The drafts could not be read. Retry to generate complete drafts.')}
 const raw=value.posts
 const posts:TaskOutput['posts']=[]
 let dropped=0
 if(Array.isArray(raw)){
  for(const post of raw){
   if(post&&typeof post.caption==='string'&&post.caption.trim()&&post.caption.length<=6000&&typeof post.hashtags==='string'&&post.hashtags.length<=1000){
    // A proposed time is a suggestion only. Keep it when it parses in the
    // workspace timezone and falls between 1 hour and 60 days from now.
    // The model often adds seconds and a "Z" although it was asked for local
    // wall-clock time; keep the YYYY-MM-DDTHH:mm part and read it as local time.
    const local=typeof post.proposedLocalTime==='string'?/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/.exec(post.proposedLocalTime.trim())?.[1]:undefined
    const instant=local?localToInstant(local,timeZone):null
    const at=instant?Date.parse(instant):NaN
    const proposedAt=instant&&at>=now.getTime()+HOUR_MS&&at<=now.getTime()+60*24*HOUR_MS?instant:null
    posts.push({caption:post.caption,hashtags:post.hashtags,visualBrief:typeof post.visualBrief==='string'?post.visualBrief:'',platform:'facebook',proposedAt})
   }else dropped++
  }
 }
 // Keep the valid subset instead of discarding everything. No usable draft at all
 // is still a hard failure; some valid drafts but fewer than requested is a partial
 // result the caller persists with checkpoint.partial set.
 if(!posts.length)throw new TaskFailure('invalid_output','The response did not contain any complete drafts. Nothing has been saved as a Post.')
 // save_task_result accepts at most 12 posts, a 1-200 character title and an 80000 character brief.
 if(posts.length>12){dropped+=posts.length-12;posts.length=12}
 // Partial means work is missing: fewer drafts than requested or invalid ones
 // dropped. More drafts than the minimum (e.g. a campaign's "at least 3") is not.
 const partial=dropped>0||posts.length<quantity
 const title=typeof value.title==='string'&&value.title.trim()?value.title.trim().slice(0,200):undefined
 const content=typeof value.content==='string'&&value.content.trim()?value.content.slice(0,80000):undefined
 return {title,content,posts,partial}
}
const RATE_LIMIT_RETRY_MS=15000
// Routing only decides reply/clarify/task, the intent and clarification options,
// so it gets a compact view: short fact summaries without properties and the
// last few messages. Generation keeps the full context. contextRefs (used for
// dependency tracking) are unchanged because they come from the full context.
export function routeContext(context:TaskContext|undefined){
 if(!context)return undefined
 return {
  facts:context.facts.map(fact=>({category:fact.category,title:fact.title,summary:fact.summary.slice(0,240)})),
  history:context.history.slice(-6).map(message=>({role:message.role,content:message.content.slice(0,400)})),
  region:context.region,
 }
}
export function aiFailure(result:AiCallResult):TaskFailure {
 const code=result.reason??result.error??'provider_error'
 const message=code==='no_active_key'?'The Director has no configured model. Configure the managed model or add an optional key in Settings.':code==='invalid_key'?'The model credential was rejected. Check the AI settings.':code==='budget_exhausted'?'This task reached its model allowance. Saved progress is available for review.':result.error==='unauthorized'?'Your session expired. Sign in again to resume this task.':code==='provider_error_429'?'The AI provider\'s per-minute limit was reached. Saved progress is kept; retry in a minute.':'The model request failed. Saved progress is kept; retry when the connection is available.'
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
    // A per-minute token limit (429) does not clear in 700 ms; wait long enough
    // for part of the window to reset before the single retry.
    const delay=result.reason==='provider_error_429'?RATE_LIMIT_RETRY_MS:700
    await new Promise<void>(resolve=>{const timer=setTimeout(resolve,delay);signal.addEventListener('abort',()=>{clearTimeout(timer);resolve()},{once:true})})
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
   const prompt=()=>JSON.stringify({request:task.user_request,now:new Date().toISOString(),context:task.checkpoint.context,answers:task.checkpoint.answers??[],quantity:task.checkpoint.route?.quantity})
   const routePrompt=()=>JSON.stringify({request:task.user_request,context:routeContext(task.checkpoint.context),answers:task.checkpoint.answers??[],quantity:task.checkpoint.route?.quantity})
   const timezone=()=>task.checkpoint.context?.region?.timezone||'UTC'
   if(task.checkpoint.phase==='route'){
    const route=promoteTaskIntent(await step('orchestrator','Route the request',async()=>parseRoute(await call('route',routePrompt()))) as RouteDecision,task.checkpoint.answers?.length??0,task.user_request)
    if(route.mode==='clarify'){
     await checkpoint({...task.checkpoint,route})
     await backend.rpc('await_task_input',{p_task_id:task.id,p_run_id:task.run_id,p_label:route.question!.label,p_options:route.question!.options.slice(0,6)})
     return
    }
    if(route.mode==='reply'){
     const document=isSubstantialReply(route.reply)?{document:{title:replyTitle(route.reply,task.user_request),content:route.reply,type:'general' as const}}:{}
     await checkpoint({...task.checkpoint,route,phase:'persist',output:{reply:route.reply,posts:[],...document}})
    }else{
     const planned=route.intent==='campaign_planning'?{...route,quantity:campaignQuantity(task.user_request,route.quantity)}:route
     await checkpoint({...task.checkpoint,route:planned,phase:'generate'},route.intent)
    }
   }
   if(task.checkpoint.phase==='generate'){
    const route=task.checkpoint.route!
    let output:TaskOutput
    let partial=false
    if(['market_research','competitor_analysis'].includes(route.intent))throw new TaskFailure('research_unavailable','Public research is not configured yet. No sources have been retrieved. Your question is saved for retry after setup.')
    if(route.intent==='content_creation'||route.intent==='campaign_planning'){
     const campaign=route.intent==='campaign_planning'
     const draft=await step(campaign?'campaign_planner':'content_writer',campaign?'Create the campaign brief and drafts':'Write the requested Post drafts',async()=>parsePosts(await call(campaign?'campaign':'copy',prompt()),route.quantity,timezone(),new Date())) as ReturnType<typeof parsePosts>
     // A complete brief is required only to persist a document. A missing brief or
     // a short draft set is a partial result: keep the valid drafts and mark it,
     // rather than discarding the work and recording a hard failure.
     const hasBrief=!!(draft.title&&draft.content)
     partial=draft.partial||(campaign&&!hasBrief)
     const timed=draft.posts.filter(post=>post.proposedAt).length
     const document=!campaign
      ?{document:{title:('Post drafts: '+task.user_request.trim().slice(0,80)).slice(0,200),content:postsMarkdown(draft.posts,timezone()),type:'content_posts' as const}}
      :hasBrief?{document:{title:draft.title!,content:draft.content!+(timed?'\n\n'+scheduleTable(draft.posts,timezone()):''),type:sectionForTask('campaign_planning',timed)}}:{}
     output={reply:`${draft.posts.length} draft ${draft.posts.length===1?'Post is':'Posts are'} ready for your review in Calendar & Publishing. Nothing has been approved or published.`,posts:draft.posts,...document}
    }else{
     const diagnosis=route.intent==='performance_diagnosis'
     const text=await step(diagnosis?'performance':'orchestrator',diagnosis?'Prepare a business diagnosis':'Answer the request',()=>call(diagnosis?'diagnose':'chat',prompt())) as string
     const document=diagnosis
      ?{document:{title:task.user_request.slice(0,150),content:text,type:sectionForTask('performance_diagnosis',0)}}
      :isSubstantialReply(text)?{document:{title:replyTitle(text,task.user_request),content:text,type:'general' as const}}:{}
     output={reply:diagnosis?'Your diagnosis is ready. Choose whether to save it to Deliverables.':text,posts:[],...document}
    }
    await checkpoint({...task.checkpoint,phase:'persist',output,...(partial?{partial:true}:{})})
   }
    if(task.checkpoint.phase==='persist'){
     check()
     const saved=await backend.rpc<{taskId:string;documentId:string|null;offerId:string|null;postIds:string[];messageIds:string[]}>('save_task_result',{p_task_id:task.id,p_run_id:task.run_id,p_result:task.checkpoint.output,p_partial:!!task.checkpoint.partial})
     if(saved)task.checkpoint={...task.checkpoint,outputRefs:saved}
    }
   }catch(error){
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
