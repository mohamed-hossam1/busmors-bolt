import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactFlow, {
  Background,
  Controls,
  applyNodeChanges,
  Handle,
  Position,
  MarkerType,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
  type Viewport,
} from 'reactflow'
import 'reactflow/dist/style.css'
import {
  User,
  Sparkles,
  Compass,
  Target,
  PenTool,
  Calendar,
  BarChart3,
  Bot,
  Check,
  AlertCircle,
  Loader2,
  Network,
} from 'lucide-react'
import type { AgentEvent } from '../../lib/types'
import { PostPreviewCard, type PostPreviewData } from './PostPreview'
import { readCanvasLayout, saveCanvasLayout } from '../../lib/chatCanvasStorage'

export type CanvasPreviewPost = PostPreviewData
const EMPTY_PREVIEWS: CanvasPreviewPost[] = []

function PreviewNode({ data }: { data: { posts: CanvasPreviewPost[] } }) {
  return (
    <div className="w-64 sm:w-72 space-y-2 cursor-grab">
      {data.posts.map((p, i) => (
        <PostPreviewCard key={i} post={p} compact />
      ))}
    </div>
  )
}

interface AgentNodeData {
  id: string
  label: string
  isActive: boolean
  isDone: boolean
  isError: boolean
  toolLabel?: string
}

function getAgentIcon(id: string) {
  switch (id) {
    case 'user':
      return <User size={15} className="text-primary-700" />
    case 'orchestrator':
      return <Sparkles size={15} className="text-primary-600" />
    case 'market_research':
      return <Compass size={15} className="text-cyan-600" />
    case 'competitor_analysis':
      return <Target size={15} className="text-amber-600" />
    case 'content_writer':
      return <PenTool size={15} className="text-purple-600" />
    case 'campaign_planner':
      return <Calendar size={15} className="text-indigo-600" />
    case 'performance':
      return <BarChart3 size={15} className="text-rose-600" />
    default:
      return <Bot size={15} className="text-ink-600" />
  }
}

function CustomAgentNode({ data }: NodeProps<AgentNodeData>) {
  const { id, label, isActive, isDone, isError, toolLabel } = data

  const borderClass = isError
    ? 'border-red-400 bg-red-50/70 shadow-sm'
    : isActive
      ? 'border-primary-500 bg-white ring-2 ring-primary-400/30 shadow-md shadow-primary-500/15'
      : isDone
        ? 'border-emerald-400/90 bg-white shadow-sm'
        : 'border-ink-200 bg-white shadow-xs'

  return (
    <div className={`relative min-w-[170px] max-w-[220px] rounded-xl border p-2.5 transition-all cursor-grab ${borderClass}`}>
      {/* ReactFlow Connection Handles */}
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2 !w-2 !rounded-full !border-2 !border-white !bg-primary-500"
      />

      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-ink-100/70">
            {getAgentIcon(id)}
          </div>
          <span className="text-xs font-bold text-ink-900 tracking-tight leading-none">
            {label}
          </span>
        </div>

        {/* Status Pill Badge */}
        {isActive && (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary-100 px-1.5 py-0.5 text-[10px] font-semibold text-primary-800 animate-pulse">
            <Loader2 size={10} className="animate-spin" />
            Active
          </span>
        )}
        {isDone && !isActive && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
            <Check size={10} />
            Done
          </span>
        )}
        {isError && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
            <AlertCircle size={10} />
            Error
          </span>
        )}
      </div>

      {/* Active Sub-Action Pill */}
      {isActive && toolLabel && (
        <div className="mt-1.5 flex items-center gap-1.5 rounded-md bg-primary-50/80 px-2 py-1 text-[11px] text-primary-900 border border-primary-200/50">
          <span className="h-1.5 w-1.5 rounded-full bg-primary-600 animate-ping shrink-0" />
          <span className="truncate">{toolLabel}</span>
        </div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-2 !w-2 !rounded-full !border-2 !border-white !bg-primary-500"
      />
    </div>
  )
}

const nodeTypes = {
  agentNode: CustomAgentNode,
  postPreview: PreviewNode,
}

// Clean vertical & horizontal layout
const AGENT_LAYOUT: Record<string, { x: number; y: number; label: string }> = {
  user: { x: 250, y: 30, label: 'User' },
  orchestrator: { x: 250, y: 140, label: 'Orchestrator' },
  market_research: { x: 70, y: 260, label: 'Market Research' },
  competitor_analysis: { x: 250, y: 260, label: 'Competitor Analysis' },
  content_writer: { x: 430, y: 260, label: 'Content Writer' },
  campaign_planner: { x: 130, y: 380, label: 'Campaign Planner' },
  performance: { x: 370, y: 380, label: 'Performance' },
}

export default function AgentCanvas({
  conversationId,
  events,
  running,
  previewPosts = EMPTY_PREVIEWS,
}: {
  conversationId: string | null
  events: AgentEvent[]
  running: boolean
  previewPosts?: CanvasPreviewPost[]
}) {
  const [flowNodes, setFlowNodes] = useState<Node[]>([])
  const [savedLayout] = useState(() => readCanvasLayout(conversationId))
  const userPositionsRef = useRef({ ...savedLayout.positions })
  const viewportRef = useRef<Viewport | undefined>(savedLayout.viewport)
  const persistLayout = useCallback(() => {
    saveCanvasLayout(conversationId, { positions: userPositionsRef.current, viewport: viewportRef.current })
  }, [conversationId])

  const { activeAgents, doneAgents, errorAgents, toolLabels, connections } = useMemo(() => {
    const active = new Set<string>()
    const done = new Set<string>()
    const failed = new Set<string>()
    const tools = new Map<string, string>()
    const conns: { from: string; to: string }[] = []

    for (const e of events) {
      if (e.event_type === 'agent_started') {
        active.add(e.agent_id)
        done.delete(e.agent_id)
      }
      if (e.event_type === 'agent_tool_used') {
        tools.set(e.agent_id, String(e.payload.tool_label ?? ''))
      }
      if (e.event_type === 'agent_completed') {
        active.delete(e.agent_id)
        if (!failed.has(e.agent_id)) {
          done.add(e.agent_id)
        }
      }
      if (e.event_type === 'agent_error') {
        active.delete(e.agent_id)
        done.delete(e.agent_id)
        failed.add(e.agent_id)
      }
      if (e.event_type === 'flow_connection') {
        conns.push({ from: String(e.payload.from ?? ''), to: String(e.payload.to ?? '') })
      }
    }
    return { activeAgents: active, doneAgents: done, errorAgents: failed, toolLabels: tools, connections: conns }
  }, [events])

  useEffect(() => {
    const present = new Set<string>()
    for (const e of events) {
      if (e.agent_id) present.add(e.agent_id)
      if (e.event_type === 'flow_connection') {
        const from = String(e.payload.from ?? '')
        const to = String(e.payload.to ?? '')
        if (from) present.add(from)
        if (to) present.add(to)
      }
    }
    if (present.size === 0 && running) present.add('orchestrator')

    const newNodes: Node[] = [...present].map((id) => {
      const layout = AGENT_LAYOUT[id] ?? { x: 250, y: 300, label: id }
      const isFailed = errorAgents.has(id)
      const isActive = activeAgents.has(id) && !isFailed
      const isDone = doneAgents.has(id) && !isFailed
      const position = userPositionsRef.current[id] ?? { x: layout.x, y: layout.y }

      return {
        id,
        type: 'agentNode',
        position,
        data: {
          id,
          label: layout.label,
          isActive,
          isDone,
          isError: isFailed,
          toolLabel: toolLabels.get(id),
        },
      }
    })

    if (previewPosts.length > 0) {
      const previewPos = userPositionsRef.current['post-previews'] ?? { x: 250, y: 440 }
      newNodes.push({
        id: 'post-previews',
        position: previewPos,
        type: 'postPreview',
        data: { posts: previewPosts.slice(0, 4) },
      })
    }

    setFlowNodes((previous) => {
      const measured = new Map(previous.map((node) => [node.id, node]))
      return newNodes.map((node) => ({ ...measured.get(node.id), ...node }))
    })
  }, [events, running, activeAgents, doneAgents, errorAgents, toolLabels, previewPosts])

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    for (const c of changes) {
      if (c.type === 'position' && c.position && c.id) {
        userPositionsRef.current[c.id] = c.position
      }
    }
    setFlowNodes((nds) => applyNodeChanges(changes, nds))
  }, [])

  // Clean, deduplicated edges with smooth rounded step routing
  const edges: Edge[] = useMemo(() => {
    const list: Edge[] = []
    const seenPair = new Set<string>()

    for (const c of connections) {
      if (!c.from || !c.to) continue
      // Deduplicate bidirectional edges to stop pretzel loops
      const pairKey = [c.from, c.to].sort().join(':::')
      if (seenPair.has(pairKey)) continue
      seenPair.add(pairKey)

      const isConnectedToActive = activeAgents.has(c.to) || activeAgents.has(c.from)
      const isError = errorAgents.has(c.to) || errorAgents.has(c.from)
      const isDone = doneAgents.has(c.to) || doneAgents.has(c.from)

      const stroke = isError
        ? '#ef4444'
        : isConnectedToActive
          ? '#6535ef'
          : isDone
            ? '#10b981'
            : '#cbd5e1'

      list.push({
        id: `edge-${c.from}-${c.to}`,
        source: c.from,
        target: c.to,
        type: 'smoothstep', // clean orthogonal rounded lines
        animated: isConnectedToActive && !isError,
        style: {
          stroke,
          strokeWidth: isConnectedToActive ? 2.5 : 1.75,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: stroke,
          width: 14,
          height: 14,
        },
      })
    }

    return list
  }, [connections, activeAgents, doneAgents, errorAgents])

  return (
    <div className="relative h-full w-full" dir="ltr">
      <ReactFlow
        nodes={flowNodes}
        edges={edges}
        onNodesChange={onNodesChange}
        nodesDraggable={true}
        fitView={!savedLayout.viewport}
        fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
        defaultViewport={savedLayout.viewport}
        onNodeDragStop={persistLayout}
        onMove={(_, viewport) => { viewportRef.current = viewport }}
        onMoveEnd={(_, viewport) => { viewportRef.current = viewport; persistLayout() }}
        nodeTypes={nodeTypes}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} color="rgb(var(--ink-200, 226 232 240) / 0.55)" size={1.5} />
        <Controls
          onZoomIn={() => requestAnimationFrame(persistLayout)}
          onZoomOut={() => requestAnimationFrame(persistLayout)}
          onFitView={() => requestAnimationFrame(persistLayout)}
        />
      </ReactFlow>
      {!running && events.length === 0 && previewPosts.length === 0 && (
        <div role="status" className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center p-8 text-center">
          <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary-200 bg-white text-primary-500"><Network size={24} strokeWidth={1.5} /></span>
          <h2 className="text-base font-semibold text-ink-900">The work will take shape here.</h2>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-ink-600">Ask your Director for help. This canvas will show the recorded specialists, tools, and handoffs for this conversation.</p>
        </div>
      )}
    </div>
  )
}
