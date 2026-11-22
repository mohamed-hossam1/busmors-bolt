import type { TaskOrigin, TaskStatus } from '../../lib/contracts'
import type { BrainNode, Deliverable } from '../../lib/types'
export type TaskIntent='simple_answer'|'market_research'|'competitor_analysis'|'content_creation'|'campaign_planning'|'performance_diagnosis'
/** Run cap before a failed or interrupted Task can no longer be resumed. */
export const MAX_TASK_ATTEMPTS=5
export interface RouteDecision {
 mode:'reply'|'clarify'|'task';reply:string;intent:TaskIntent;quantity:number
 question?:{label:string;options:string[]}
}
export interface TaskOutput {
 reply:string;document?:{title:string;type:Deliverable['type'];content:string}
 posts:{caption:string;hashtags:string;visualBrief?:string;platform:'facebook'|'instagram';proposedAt?:string|null}[]
 sourceRefs?:string[];limitations?:string[]
}
export interface TaskContext {facts:Pick<BrainNode,'id'|'version'|'category'|'title'|'summary'|'properties'|'verification_state'>[];history:{role:string;content:string}[];region:{country?:string;currency?:string;target_market?:string;timezone?:string}}
export interface TaskOutputRefs {taskId:string;documentId:string|null;offerId?:string|null;postIds:string[];messageIds?:string[]}
export interface TaskCheckpoint {
 phase:'route'|'generate'|'persist'|'done';context?:TaskContext;contextRefs?:{nodeId:string;version:number}[]
 route?:RouteDecision;output?:TaskOutput;answers?:unknown[];partial?:boolean;outputRefs?:TaskOutputRefs
}
export interface ExecutionTask {
 id:string;workspace_id:string;conversation_id:string;type:TaskIntent;status:TaskStatus;version:number;origin:TaskOrigin
 user_request:string;checkpoint:TaskCheckpoint;run_id:string|null;runner_id:string|null;result_summary:string|null;attempts:number
 allowance:{calls:number;pages:number;tokens:number;seconds:number};consumption:{calls?:number;tokensAccounted?:number}
 created_at:string;updated_at:string
}
