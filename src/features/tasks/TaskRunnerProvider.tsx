import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../../context/AuthContext'
import { BrowserTaskRunner } from './runner'
import { taskBackend } from './backend'
import type { ExecutionTask } from './types'

const RunnerContext=createContext<{runner:BrowserTaskRunner|null;tasks:ExecutionTask[];error:string}>({runner:null,tasks:[],error:''})
function tabId(workspaceId:string){
 const key=`busmora:task-runner:${workspaceId}`
 try{const saved=sessionStorage.getItem(key);if(saved)return saved;const id=crypto.randomUUID();sessionStorage.setItem(key,id);return id}catch{return crypto.randomUUID()}
}
export function TaskRunnerProvider({children}:{children:ReactNode}){
 const {session}=useAuth(),id=session?.user.id
 const instance=useRef<BrowserTaskRunner|null>(null)
 const [state,setState]=useState<{runner:BrowserTaskRunner|null;tasks:ExecutionTask[];error:string}>({runner:null,tasks:[],error:''})
 useEffect(()=>{
  if(!id)return
  const runner=new BrowserTaskRunner(taskBackend(id),tabId(id));instance.current=runner
  const unsubscribe=runner.subscribe(()=>setState({runner,tasks:runner.tasks,error:runner.error}))
  void runner.start()
  return ()=>{unsubscribe();runner.stop();if(instance.current===runner)instance.current=null}
 },[id])
 return <RunnerContext.Provider value={state}>{children}</RunnerContext.Provider>
}
export const useTaskRunner=()=>useContext(RunnerContext)
