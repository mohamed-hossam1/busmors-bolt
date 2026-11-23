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
  Network,
  ExternalLink,
  X,
  BrainCircuit,
} from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import type { AgentEvent } from '../../lib/types'
import { useCopy } from '../../hooks/useCopy'
import { PostPreviewCard, type PostPreviewData } from './PostPreview'
import { readCanvasLayout, saveCanvasLayout } from '../../lib/chatCanvasStorage'
import { buildAgentGraph, type CanvasGraph, type CanvasNode, type CanvasNodeKind, type PersistedEvent } from '../../features/research/canvas/graph'

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
  hasTopConnection?: boolean
  hasBottomConnection?: boolean
  hasRightConnection?: boolean
  hasLeftConnection?: boolean
  targetSide?: 'left' | 'right' | 'top'
}

function isToolOrSkill(kind: CanvasNodeKind): boolean {
  return kind === 'tool' || kind === 'skill'
}

const NODE_ICON: Record<CanvasNodeKind, typeof Bot> = {
  user: User,
  orchestrator: BrainCircuit,
  director: Sparkles,
  subagent: Bot,
  tool: Wrench,
  skill: BookOpen,
  auditor: ShieldCheck,
  synthesis: FileText,
}

function statePill(node: CanvasNode, t: ReturnType<typeof useCopy>['t']) {
  if (node.state === 'running') return <span className="inline-flex items-center gap-1 rounded-full bg-primary-100 px-1.5 py-0.5 text-[10px] font-semibold text-primary-800"><Spinner size={10} />{t('stateRunning')}</span>
  if (node.state === 'completed') return <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700"><Check size={10} />{t('stateDone')}</span>
  if (node.state === 'failed') return <span className="inline-flex items-center gap-0.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700"><AlertCircle size={10} />{t('stateFailed')}</span>
  if (node.state === 'partial') return <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">{t('statePartial')}</span>
  return <span className="rounded-full bg-ink-100 px-1.5 py-0.5 text-[10px] font-semibold text-ink-600">{t('stateQueued')}</span>
}

function CanvasAgentNode({ data }: NodeProps<AgentNodeData>) {
  const { t } = useCopy()
  const { selected, onSelect } = data
  const isTool = data.kind === 'tool'
  const isSkill = data.kind === 'skill'
  const isCircleNode = isTool || isSkill
  const displayLabel = data.label

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

  if (isCircleNode) {
    const targetSide = data.targetSide ?? 'left'
    return (
      <div
        className={`relative flex h-16 w-16 cursor-pointer flex-col items-center justify-center rounded-full border-2 p-1 text-center shadow-md transition-all hover:scale-105 ${border}`}
        onClick={() => onSelect(data.id)}
      >
        <Handle
          type="target"
          id="left"
          position={Position.Left}
          className={`!h-2 !w-2 !rounded-full !border-2 !border-white !bg-primary-500 ${targetSide === 'left' ? '' : '!opacity-0 pointer-events-none'}`}
        />
        <Handle
          type="target"
          id="right"
          position={Position.Right}
          className={`!h-2 !w-2 !rounded-full !border-2 !border-white !bg-primary-500 ${targetSide === 'right' ? '' : '!opacity-0 pointer-events-none'}`}
        />
        <Handle
          type="target"
          id="top"
          position={Position.Top}
          className={`!h-2 !w-2 !rounded-full !border-2 !border-white !bg-primary-500 ${targetSide === 'top' ? '' : '!opacity-0 pointer-events-none'}`}
        />
        <span className="flex h-5 w-5 items-center justify-center rounded-full" style={{ backgroundColor: `${data.color}25`, color: data.color }}>
          <Icon size={12} />
        </span>
        <span className="mt-0.5 text-[10px] font-extrabold tracking-tight text-ink-900">{displayLabel}</span>
        <div className="scale-75">
          {statePill(data, t)}
        </div>
        <Handle
          type="source"
          id="bottom"
          position={Position.Bottom}
          className="!h-2 !w-2 !rounded-full !border-2 !border-white !bg-primary-500 !opacity-0 pointer-events-none"
        />
      </div>
    )
  }

  return (
    <div
      className={`relative min-w-[150px] cursor-pointer rounded-xl border p-2.5 transition-all ${border}`}
      onClick={() => onSelect(data.id)}
    >
      <Handle
        type="target"
        id="top"
        position={Position.Top}
        className={`!h-2 !w-2 !rounded-full !border-2 !border-white !bg-primary-500 ${data.hasTopConnection === false ? '!opacity-0 pointer-events-none' : ''}`}
      />
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${data.color}1a`, color: data.color }}>
          <Icon size={14} />
        </span>
        <div className="min-w-0">
          <div className="truncate text-xs font-bold leading-tight text-ink-900">{displayLabel}</div>
          <div className="mt-0.5 flex items-center gap-1">
            {statePill(data, t)}
            {data.sources > 0 && <span className="rounded-full bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium text-ink-600">{t('sourcesShort', { count: data.sources })}</span>}
            {data.consumption.credits > 0 && <span className="rounded-full bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium text-ink-600">{t('creditsShort', { count: data.consumption.credits })}</span>}
          </div>
        </div>
      </div>
      <Handle
        type="source"
        id="bottom"
        position={Position.Bottom}
        className={`!h-2 !w-2 !rounded-full !border-2 !border-white !bg-primary-500 ${data.hasBottomConnection === false ? '!opacity-0 pointer-events-none' : ''}`}
      />
      <Handle
        type="source"
        id="right"
        position={Position.Right}
        className={`!h-2 !w-2 !rounded-full !border-2 !border-white !bg-primary-500 ${data.hasRightConnection ? '' : '!opacity-0 pointer-events-none'}`}
      />
      <Handle
        type="source"
        id="left"
        position={Position.Left}
        className={`!h-2 !w-2 !rounded-full !border-2 !border-white !bg-primary-500 ${data.hasLeftConnection ? '' : '!opacity-0 pointer-events-none'}`}
      />
    </div>
  )
}

const nodeTypes = {
  agentNode: CanvasAgentNode,
  postPreview: PreviewNode,
}

function stableJitter(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return Math.abs(h) % 3
}

/**
 * Hierarchical layout separating agent hierarchy (vertical top-to-bottom rows)
 * from tools and skills (placed to the side of their parent agent).
 */
function buildHierarchicalLayout(graph: CanvasGraph): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>()
  const { nodes, edges } = graph
  if (nodes.length === 0) return pos
  const ids = new Set(nodes.map(node => node.id))

  const agentNodes = nodes.filter(node => !isToolOrSkill(node.kind))
  const toolNodes = nodes.filter(node => isToolOrSkill(node.kind))
  const agentIds = new Set(agentNodes.map(node => node.id))

  const agentParent = new Map<string, string>()
  const toolParent = new Map<string, string>()

  for (const edge of edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to) || edge.from === edge.to) continue
    const toNode = nodes.find(n => n.id === edge.to)
    if (!toNode) continue

    if (isToolOrSkill(toNode.kind)) {
      if (!toolParent.has(edge.to)) toolParent.set(edge.to, edge.from)
    } else if (agentIds.has(edge.from)) {
      if (!agentParent.has(edge.to)) agentParent.set(edge.to, edge.from)
    }
  }

  const TOP = 20
  const ROW_GAP = 140
  const COL_GAP = 280
  const CENTER = 320
  const placed = new Set<string>()
  let rowY = TOP

  const placeRow = (row: CanvasNode[]) => {
    const rowWidth = (row.length - 1) * COL_GAP
    row.forEach((node, index) => {
      pos.set(node.id, { x: CENTER - rowWidth / 2 + index * COL_GAP + stableJitter(node.id) * 4, y: rowY })
      placed.add(node.id)
    })
    rowY += ROW_GAP
  }

  // 1. Root agent nodes (e.g. user)
  const roots = agentNodes.filter(node => !agentParent.has(node.id))
  const user = roots.find(node => node.kind === 'user')
  if (user) {
    placeRow([user])
    rowY += 10
  }
  const otherRoots = roots.filter(node => node.kind !== 'user')
  if (otherRoots.length) placeRow(otherRoots)

  // 2. Child agents in vertical generations (downward hierarchy: "تحت يعني في agent")
  let pendingAgents = agentNodes.filter(node => !placed.has(node.id))
  let guard = 0
  while (pendingAgents.length > 0 && guard++ < 200) {
    const row = pendingAgents.filter(node => {
      const parentId = agentParent.get(node.id)
      return !parentId || placed.has(parentId)
    })
    if (row.length === 0) break
    placeRow(row)
    const placedIds = new Set(row.map(node => node.id))
    pendingAgents = pendingAgents.filter(node => !placedIds.has(node.id))
  }
  if (pendingAgents.length > 0) {
    const cols = Math.max(1, Math.ceil(Math.sqrt(pendingAgents.length)))
    pendingAgents.forEach((node, index) => {
      pos.set(node.id, { x: CENTER + (index % cols - (cols - 1) / 2) * COL_GAP, y: rowY + Math.floor(index / cols) * ROW_GAP })
    })
    rowY += ROW_GAP
  }

  // 3. Tools and Skills placed to the side of their parent agent ("الجنب يعني تولز وskills")
  const toolsByParent = new Map<string, CanvasNode[]>()
  for (const toolNode of toolNodes) {
    const pId = toolParent.get(toolNode.id)
    if (pId) {
      const list = toolsByParent.get(pId) ?? []
      list.push(toolNode)
      toolsByParent.set(pId, list)
    }
  }

  toolsByParent.forEach((tools, parentId) => {
    const parentPos = pos.get(parentId)
    if (!parentPos) return
    const count = tools.length
    tools.forEach((tool, index) => {
      const yOffset = count === 1 ? -6 : -6 + (index - (count - 1) / 2) * 72
      pos.set(tool.id, {
        x: parentPos.x + 190,
        y: parentPos.y + yOffset,
      })
      placed.add(tool.id)
    })
  })

  // 4. Any dangling tools without placed parent
  const unplacedTools = toolNodes.filter(node => !placed.has(node.id))
  if (unplacedTools.length > 0) {
    unplacedTools.forEach((tool, index) => {
      pos.set(tool.id, {
        x: CENTER + 190,
        y: rowY + index * 72,
      })
      placed.add(tool.id)
    })
  }

  return pos
}

export default function AgentCanvas({
  conversationId,
  events,
  running,
  taskId,
  userMessage = null,
  previewPosts = EMPTY_PREVIEWS,
}: {
  conversationId: string | null
  events: AgentEvent[]
  running: boolean
  taskId?: string | null
  taskStatus?: string
  userMessage?: string | null
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
    userMessage,
  }), [events, running, userMessage])

  useEffect(() => {
    const layout = buildHierarchicalLayout(graph)
    const newNodes: Node[] = graph.nodes.map((node) => {
      const position = userPositionsRef.current[node.id] ?? layout.get(node.id) ?? { x: 300, y: 20 }

      const incomingEdges = graph.edges.filter(e => e.to === node.id)
      const outgoingEdges = graph.edges.filter(e => e.from === node.id)

      let targetSide: 'left' | 'right' | 'top' = 'left'
      if (incomingEdges.length > 0) {
        const edge = incomingEdges[0]
        const isTool = isToolOrSkill(node.kind) || edge.kind === 'tool_call' || edge.kind === 'skill_read'
        if (isTool) {
          const fromPos = userPositionsRef.current[edge.from] ?? layout.get(edge.from)
          if (fromPos && position.x < fromPos.x) {
            targetSide = 'right'
          } else {
            targetSide = 'left'
          }
        } else {
          targetSide = 'top'
        }
      }

      let hasRightConnection = false
      let hasLeftConnection = false
      let hasBottomConnection = false
      for (const edge of outgoingEdges) {
        const targetNode = graph.nodes.find(n => n.id === edge.to)
        const isTool = targetNode ? isToolOrSkill(targetNode.kind) : (edge.kind === 'tool_call' || edge.kind === 'skill_read')
        if (isTool) {
          const targetPos = userPositionsRef.current[edge.to] ?? layout.get(edge.to)
          if (targetPos && targetPos.x < position.x) {
            hasLeftConnection = true
          } else {
            hasRightConnection = true
          }
        } else {
          hasBottomConnection = true
        }
      }

      return {
        id: node.id,
        type: 'agentNode',
        position,
        data: {
          ...node,
          selected: node.id === selectedId,
          onSelect,
          hasTopConnection: incomingEdges.length > 0,
          hasBottomConnection,
          hasRightConnection,
          hasLeftConnection,
          targetSide,
        } as AgentNodeData,
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

      const isToolOrSkillTarget = to ? isToolOrSkill(to.kind) : (edge.kind === 'tool_call' || edge.kind === 'skill_read')

      let sourceHandle = 'bottom'
      let targetHandle = 'top'

      if (isToolOrSkillTarget) {
        const fromPos = flowNodes.find(n => n.id === edge.from)?.position
        const toPos = flowNodes.find(n => n.id === edge.to)?.position
        if (fromPos && toPos && toPos.x < fromPos.x) {
          sourceHandle = 'left'
          targetHandle = 'right'
        } else {
          sourceHandle = 'right'
          targetHandle = 'left'
        }
      }

      return [{
        id: edge.id,
        source: edge.from,
        target: edge.to,
        sourceHandle,
        targetHandle,
        type: 'smoothstep',
        animated: edge.animated,
        style: { stroke, strokeWidth: edge.kind === 'delegation' ? 2.4 : 1.6 },
        markerEnd: { type: MarkerType.ArrowClosed, color: stroke, width: 14, height: 14 },
      }]
    })
  }, [graph, flowNodes])

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