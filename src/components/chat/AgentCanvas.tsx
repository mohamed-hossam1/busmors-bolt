'use client'

import { useMemo, useState } from 'react'
import { buildAgentCanvas, type CanvasAgentEvent, type CanvasAgentNode } from '@/features/agents/canvas'

/**
 * Customer Agent Canvas (spec §10). Renders ONLY actual participants from real
 * execution events: Orchestrator → Director → actually-invoked specialists, with
 * one Skills circle (left) and one Tools circle (right) per agent that actually
 * used them. Clicking a circle shows names only. No model/internal-step nodes.
 */

function Circle({ label, names }: { label: string; names: string[] }) {
  const [open, setOpen] = useState(false)
  if (names.length === 0) return null
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-ink-200 bg-white text-[10px] font-bold text-ink-700 hover:border-primary-300"
        aria-label={`${label}: ${names.length}`}
      >
        {names.length}
      </button>
      <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[9px] uppercase tracking-wide text-ink-400">{label}</span>
      {open && (
        <ul className="absolute left-1/2 top-10 z-10 w-40 -translate-x-1/2 rounded-lg border border-ink-200 bg-white p-2 text-[11px] text-ink-700 shadow-lg">
          {names.map((n) => <li key={n} className="truncate py-0.5">{n}</li>)}
        </ul>
      )}
    </div>
  )
}

function StatusDot({ status }: { status: string }) {
  const color = status === 'completed' ? 'bg-emerald-500' : status === 'partial' ? 'bg-amber-500' : status === 'failed' ? 'bg-red-500' : status === 'running' ? 'bg-primary-500' : 'bg-ink-300'
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
}

function AgentNode({ node }: { node: CanvasAgentNode }) {
  return (
    <li className="flex flex-col items-center">
      <div className="flex items-center gap-3 rounded-2xl border border-ink-200 bg-white px-4 py-2">
        <Circle label="Skills" names={node.skills} />
        <div className="flex flex-col items-center">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-ink-900"><StatusDot status={node.status} />{node.label}</span>
          <span className="text-[10px] uppercase tracking-wide text-ink-400">{node.role}</span>
        </div>
        <Circle label="Tools" names={node.tools} />
      </div>
      {node.children.length > 0 && (
        <>
          <div className="h-5 w-px bg-ink-200" />
          <ul className="flex flex-col items-center gap-5">
            {node.children.map((child) => <AgentNode key={child.instanceId} node={child} />)}
          </ul>
        </>
      )}
    </li>
  )
}

export default function AgentCanvas({ events }: { events: CanvasAgentEvent[] }) {
  const roots = useMemo(() => buildAgentCanvas(events), [events])
  if (roots.length === 0) return null
  return (
    <div className="rounded-2xl border border-ink-200 bg-ink-50/50 p-4">
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-ink-400">Agent activity</div>
      <ul className="flex flex-col items-center gap-5">
        {roots.map((root) => <AgentNode key={root.instanceId} node={root} />)}
      </ul>
    </div>
  )
}