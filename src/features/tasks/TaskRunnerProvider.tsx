'use client'

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../../context/AuthContext'
import { TaskClient } from './runner'
import type { ExecutionTask } from './types'

const RunnerContext=createContext<{runner:TaskClient|null;tasks:ExecutionTask[];error:string}>({runner:null,tasks:[],error:''})
export function TaskRunnerProvider({children}:{children:ReactNode}){
 const {session}=useAuth(),id=session?.user.id
 const instance=useRef<TaskClient|null>(null)
 const [state,setState]=useState<{runner:TaskClient|null;tasks:ExecutionTask[];error:string}>({runner:null,tasks:[],error:''})
 useEffect(()=>{
  if(!id)return
  const runner=new TaskClient();instance.current=runner
  setState({runner,tasks:[],error:''})
  const unsubscribe=runner.subscribe(()=>setState({runner,tasks:runner.tasks,error:runner.error}))
  void runner.start()
  return ()=>{unsubscribe();runner.stop();if(instance.current===runner)instance.current=null}
 },[id])
 return <RunnerContext.Provider value={state}>{children}</RunnerContext.Provider>
}
export const useTaskRunner=()=>useContext(RunnerContext)
