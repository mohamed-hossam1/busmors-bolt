import 'server-only'
import type { AiCallResult } from '../lib/agents'
import type { ExecutionTask, RouteDecision, TaskCheckpoint, TaskContext, TaskOutput } from '../features/tasks/types'

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
 if(!value||!['reply','clarify','task'].includes(value.mode)||typeof value.reply!=='string'||value.reply.length>12000||(value.mode==='reply'&&!value.reply.trim())||!intentNames.includes(value.intent)||!Number.isInteger(value.quantity)||value.quantity<1||value.quantity>12
  ||(value.mode==='clarify'&&(!value.question||typeof value.question.label!=='string'||!value.question.label.trim()||value.question.label.length>500||!Array.isArray(value.question.options)||value.question.options.length>8||value.question.options.some(option=>typeof option!=='string'||!option.trim()||option.length>200))))throw new TaskFailure('invalid_output','The Director returned an incomplete response. Retry this task.')
 return value
}
export function parsePosts(text:string,quantity:number):{title?:string;content?:string;posts:TaskOutput['posts']} {
 let value:Record<string,unknown>
 try{value=JSON.parse(text)}catch{throw new TaskFailure('invalid_output','The drafts could not be read. Retry to generate complete drafts.')}
 const posts=value.posts
 if(!Array.isArray(posts)||posts.length!==quantity||posts.some(post=>!post||typeof post.caption!=='string'||!post.caption.trim()||post.caption.length>6000||typeof post.hashtags!=='string'||post.hashtags.length>1000))throw new TaskFailure('invalid_output','The response did not contain the requested number of complete drafts. Nothing has been saved as a Post.')
 return {title:typeof value.title==='string'?value.title:undefined,content:typeof value.content==='string'?value.content:undefined,posts:posts.map(post=>({caption:post.caption,hashtags:post.hashtags,visualBrief:typeof post.visualBrief==='string'?post.visualBrief:'',platform:post.platform==='instagram'?'instagram':'facebook'}))}
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
    const route=await step('orchestrator','Route the request',async()=>parseRoute(await call('route',prompt()))) as RouteDecision
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
    if(['market_research','competitor_analysis'].includes(route.intent))throw new TaskFailure('research_unavailable','Public research is not configured yet. No sources have been retrieved. Your question is saved for retry after setup.')
    if(route.intent==='content_creation'||route.intent==='campaign_planning'){
     const campaign=route.intent==='campaign_planning'
     const draft=await step(campaign?'campaign_planner':'content_writer',campaign?'Create the campaign brief and drafts':'Write the requested Post drafts',async()=>parsePosts(await call(campaign?'campaign':'copy',prompt()),route.quantity)) as ReturnType<typeof parsePosts>
     if(campaign&&(!draft.title||!draft.content))throw new TaskFailure('invalid_output','The campaign brief was incomplete. Retry this task; no canned drafts were substituted.')
     output={reply:`${draft.posts.length} draft ${draft.posts.length===1?'Post is':'Posts are'} ready for your review in Scheduling. No publication or schedule has been approved.`,posts:draft.posts,...(campaign?{document:{title:draft.title!,content:draft.content!,type:'general' as const}}:{})}
    }else{
     const diagnosis=route.intent==='performance_diagnosis'
     const text=await step(diagnosis?'performance':'orchestrator',diagnosis?'Prepare a business diagnosis':'Answer the request',()=>call(diagnosis?'diagnose':'chat',prompt())) as string
     output={reply:diagnosis?'Your diagnosis is saved in Documents for review.':text,posts:[],...(diagnosis?{document:{title:task.user_request.slice(0,150),content:text,type:'performance_diagnosis' as const}}:{})}
    }
    await checkpoint({...task.checkpoint,phase:'persist',output})
   }
   if(task.checkpoint.phase==='persist'){
    check()
    await backend.rpc('save_task_result',{p_task_id:task.id,p_run_id:task.run_id,p_result:task.checkpoint.output,p_partial:!!task.checkpoint.partial})
   }
  }catch(error){
   if(signal.aborted)return
   const message=error instanceof TaskFailure?error.message:task.checkpoint.phase==='persist'?'Generated work is checkpointed, but saving the final result failed. Resume to save it without generating again.':'Execution stopped. Saved progress is available; resume to try again.'
   try{await backend.rpc('stop_task',{p_task_id:task.id,p_run_id:task.run_id,p_status:task.checkpoint.phase==='persist'?'interrupted':'failed',p_message:message})}catch{/* Persisted leases allow recovery on the next visit. */}
  }
 }
