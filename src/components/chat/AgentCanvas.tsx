'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from '@/shared/i18n'
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
  Bot,
  Wrench,
  BookOpen,
  ShieldCheck,
  FileText,
  Check,
  AlertCircle,
  Loader2,
  Network,
  ExternalLink,
  X,
} from 'lucide-react'
import type { AgentEvent } from '../../lib/types'
import { useCopy } from '../../hooks/useCopy'
import { PostPreviewCard, type PostPreviewData } from './PostPreview'
import { readCanvasLayout, saveCanvasLayout } from '../../lib/chatCanvasStorage'
import { buildAgentGraph, type CanvasNode, type CanvasNodeKind, type PersistedEvent } from '../../features/research/canvas/graph'

export type CanvasPreviewPost = PostPreviewData
const EMPTY_PREVIEWS: CanvasPreviewPost[] = []

function PreviewNode({ data }: { data: { posts: CanvasPreviewPost[] } }) {
  return (
    <div className="w-64 space-y-2 cursor-grab">
      {data.posts.map((p, i) => (
        <PostPreviewCard key={i} post={p} compact />
      ))}
    </div>
  )
}

interface AgentNodeData extends CanvasNode {
  selected: boolean
  onSelect: (id: string) => void
}

const NODE_ICON: Record<CanvasNodeKind, typeof Bot> = {
  user: User,
  director: Sparkles,
  subagent: Bot,
  tool: Wrench,
  skill: BookOpen,
  auditor: ShieldCheck,
  synthesis: FileText,
}

function statePill(node: CanvasNode, t: ReturnType<typeof useCopy>['t']) {
  if (node.state === 'running') return <span className="inline-flex items-center gap-1 rounded-full bg-primary-100 px-1.5 py-0.5 text-[10px] font-semibold text-primary-800"><Loader2 size={10} className="animate-spin" />{t('stateRunning')}</span>
  if (node.state === 'completed') return <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700"><Check size={10} />{t('stateDone')}</span>
  if (node.state === 'failed') return <span className="inline-flex items-center gap-0.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700"><AlertCircle size={10} />{t('stateFailed')}</span>
  if (node.state === 'partial') return <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">{t('statePartial')}</span>
  return <span className="rounded-full bg-ink-100 px-1.5 py-0.5 text-[10px] font-semibold text-ink-600">{t('stateQueued')}</span>
}

function CanvasAgentNode({ data }: NodeProps<AgentNodeData>) {
  const { t } = useCopy()
  const { selected, onSelect } = data
  const Icon = NODE_ICON[data.kind] ?? Bot
  const border = data.state === 'failed'
    ? 'border-red-400 bg-red-50/70'
    : data.state === 'partial'
      ? 'border-amber-400 bg-amber-50/70'
      : data.state === 'completed'
        ? 'border-emerald-300 bg-white'
        : selected || data.state === 'running'
          ? 'border-primary-400 bg-white ring-2 ring-primary-400/20'
          : 'border-ink-200 bg-white'
  const circle = data.kind === 'director' || data.kind === 'tool' || data.kind === 'skill'
  return (
    <div
      className={`relative min-w-[150px] cursor-pointer rounded-xl border p-2.5 transition-all ${circle ? 'rounded-full' : ''} ${border}`}
      onClick={() => onSelect(data.id)}
    >
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !rounded-full !border-2 !border-white !bg-primary-500" />
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${data.color}1a`, color: data.color }}>
          <Icon size={14} />
        </span>
        <div className="min-w-0">
          <div className="truncate text-xs font-bold leading-tight text-ink-900">{data.label}</div>
          <div className="mt-0.5 flex items-center gap-1">
            {statePill(data, t)}
            {data.sources > 0 && <span className="rounded-full bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium text-ink-600">{t('sourcesShort', { count: data.sources })}</span>}
            {data.consumption.credits > 0 && <span className="rounded-full bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium text-ink-600">{t('creditsShort', { count: data.consumption.credits })}</span>}
          </div>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !rounded-full !border-2 !border-white !bg-primary-500" />
    </div>
  )
}

const nodeTypes = {
  agentNode: CanvasAgentNode,
  postPreview: PreviewNode,
}

export default function AgentCanvas({
  conversationId,
  events,
  running,
  taskId,
  previewPosts = EMPTY_PREVIEWS,
}: {
  conversationId: string | null
  events: AgentEvent[]
  running: boolean
  taskId?: string | null
  taskStatus?: string
  previewPosts?: CanvasPreviewPost[]
}) {
  const { t } = useCopy()
  const [flowNodes, setFlowNodes] = useState<Node[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [savedLayout] = useState(() => readCanvasLayout(conversationId))
  const userPositionsRef = useRef({ ...savedLayout.positions })
  const viewportRef = useRef<Viewport | undefined>(savedLayout.viewport)
  const persistLayout = useCallback(() => {
    saveCanvasLayout(conversationId, { positions: userPositionsRef.current, viewport: viewportRef.current })
  }, [conversationId])

  const onSelect = useCallback((id: string) => setSelectedId(current => (current === id ? null : id)), [])

  const graph = useMemo(() => buildAgentGraph({
    events: events as unknown as PersistedEvent[],
    running,
  }), [events, running])

  useEffect(() => {
    const newNodes: Node[] = graph.nodes.map((node, index) => {
      const director = graph.directorId !== null && node.id === graph.directorId
      const position = userPositionsRef.current[node.id] ?? {
        x: director ? 300 : 60 + (index % 3) * 230,
        y: director ? 40 : 160 + Math.floor(index / 3) * 130,
      }
      return {
        id: node.id,
        type: 'agentNode',
        position,
        data: { ...node, selected: node.id === selectedId, onSelect } as AgentNodeData,
      }
    })
    if (previewPosts.length > 0) {
      newNodes.push({
        id: 'post-previews',
        position: userPositionsRef.current['post-previews'] ?? { x: 300, y: 520 },
        type: 'postPreview',
        data: { posts: previewPosts.slice(0, 4) },
      })
    }
    setFlowNodes(previous => {
      const measured = new Map(previous.map(node => [node.id, node]))
      return newNodes.map(node => ({ ...measured.get(node.id), ...node }))
    })
  }, [graph, previewPosts, selectedId, onSelect])

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    for (const change of changes) {
      if (change.type === 'position' && change.position && change.id) userPositionsRef.current[change.id] = change.position
    }
    setFlowNodes(nodes => applyNodeChanges(changes, nodes))
  }, [])

  const edges: Edge[] = useMemo(() => {
    const seen = new Set<string>()
    return graph.edges.flatMap(edge => {
      const key = `${edge.from}->${edge.to}:${edge.kind}`
      if (seen.has(key)) return []
      seen.add(key)
      const from = graph.nodes.find(node => node.id === edge.from)
      const to = graph.nodes.find(node => node.id === edge.to)
      const stroke = to?.state === 'failed' ? '#ef4444' : from?.state === 'running' || to?.state === 'running' ? '#6366f1' : to?.state === 'completed' ? '#10b981' : '#cbd5e1'
      return [{
        id: edge.id,
        source: edge.from,
        target: edge.to,
        type: 'smoothstep',
        animated: edge.animated,
        style: { stroke, strokeWidth: edge.kind === 'delegation' ? 2.4 : 1.6 },
        markerEnd: { type: MarkerType.ArrowClosed, color: stroke, width: 14, height: 14 },
      }]
    })
  }, [graph])

  const selected = graph.nodes.find(node => node.id === selectedId) ?? null

  return (
    <div className="relative h-full w-full" dir="ltr">
      <ReactFlow
        nodes={flowNodes}
        edges={edges}
        onNodesChange={onNodesChange}
        nodesDraggable
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

      {selected && (
        <aside className="absolute right-3 top-3 z-10 max-h-[calc(100%-1.5rem)] w-[min(24rem,calc(100%-1.5rem))] overflow-y-auto rounded-xl border border-ink-200 bg-white/95 p-3 shadow-card backdrop-blur" dir="ltr">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-ink-900">{selected.label}</h3>
              <p className="mt-0.5 text-[11px] text-ink-500">{selected.kind} · {selected.agentId}</p>
            </div>
            <button aria-label={t('closeDetailsAriaLabel')} onClick={() => setSelectedId(null)} className="rounded p-1 text-ink-500 hover:bg-ink-100"><X size={14} /></button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
            {statePill(selected, t)}
            {selected.startedAt && <span className="rounded bg-ink-100 px-1.5 py-0.5 text-ink-600">{t('startedAt', { time: selected.startedAt.slice(11, 19) })}</span>}
            {selected.endedAt && <span className="rounded bg-ink-100 px-1.5 py-0.5 text-ink-600">{t('endedAt', { time: selected.endedAt.slice(11, 19) })}</span>}
            <span className="rounded bg-ink-100 px-1.5 py-0.5 text-ink-600">{t('sourceCountLabel', { count: selected.sources })}</span>
            <span className="rounded bg-ink-100 px-1.5 py-0.5 text-ink-600">{t('callsCreditsLabel', { calls: selected.consumption.calls, credits: selected.consumption.credits })}</span>
          </div>
          <p className="mt-2 text-xs leading-5 text-ink-700">{selected.objective}</p>
          {selected.failureReason && <p className="mt-2 rounded bg-red-50 p-2 text-[11px] text-red-700">{selected.failureReason}</p>}
          {selected.messages.length > 0 && (
            <div className="mt-2">
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">{t('recordedMessages')}</h4>
              <ul className="mt-1 space-y-1 text-[11px] leading-5 text-ink-600">
                {selected.messages.map((message, index) => <li key={index} className="border-l-2 border-ink-200 pl-2">{message}</li>)}
              </ul>
            </div>
          )}
          {Object.keys(selected.parametersRedacted).length > 0 && (
            <details className="mt-2 text-[11px] text-ink-600">
              <summary className="cursor-pointer select-none">{t('redactedParameters')}</summary>
              <pre className="mt-1 overflow-x-auto rounded bg-ink-50 p-2 text-[10px] text-ink-700">{JSON.stringify(selected.parametersRedacted, null, 2)}</pre>
            </details>
          )}
          {taskId && (
            <Link href={`/employee?task=${encodeURIComponent(taskId)}`} className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-primary-700 hover:text-primary-900">
              {t('openTask')} <ExternalLink size={11} />
            </Link>
          )}
        </aside>
      )}

      {!running && graph.nodes.length === 0 && previewPosts.length === 0 && (
        <div role="status" className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center p-8 text-center">
          <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary-200 bg-white text-primary-500"><Network size={24} strokeWidth={1.5} /></span>
          <h2 className="text-base font-semibold text-ink-900">{t('canvasEmptyTitle')}</h2>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-ink-600">{t('canvasEmptyHint')}</p>
        </div>
      )}
    </div>
  )
}