'use client'

import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import ReactFlow, {
  Background, Controls, Handle, MiniMap, Position, ReactFlowProvider,
  getNodesBounds, useNodesInitialized, useReactFlow, useStore,
  type Edge, type Node, type NodeChange, type NodeProps, type XYPosition,
} from 'reactflow'
import 'reactflow/dist/style.css'
import {
  X, Building2, Package, Users, Palette, Target, FileCheck, Swords,
  Radio, Flag, RotateCcw, Pencil, Search, Network, Scan, GitBranch,
  ArrowUpRight, MousePointer2, AlertCircle, CheckCircle2, List, type LucideIcon,
} from 'lucide-react'
import type { BrainCategory, BrainEdge, BrainNode, BrainProposal } from '../../lib/types'
import { useCopy } from '../../hooks/useCopy'
import { KnowledgeLabels } from './KnowledgeEvidence'
import {
  BRAIN_CARD_HEIGHT, BRAIN_CARD_WIDTH, BRAIN_CATEGORY_ORDER, calculateBrainPositions,
} from '../../lib/brainGraphLayout'

const CATEGORY_CONFIG: Record<BrainCategory, { color: string; bg: string; icon: LucideIcon }> = {
  company_profile: { color: '#0f766e', bg: '#f0fdfa', icon: Building2 },
  offering: { color: '#059669', bg: '#ecfdf5', icon: Package },
  audience: { color: '#b45309', bg: '#fffbeb', icon: Users },
  brand_rule: { color: '#c2410c', bg: '#fff7ed', icon: Palette },
  positioning: { color: '#7c3aed', bg: '#faf5ff', icon: Target },
  strategic_goal: { color: '#2563eb', bg: '#eff6ff', icon: Flag },
  channel: { color: '#0e7490', bg: '#ecfeff', icon: Radio },
  competitor: { color: '#be123c', bg: '#fff1f2', icon: Swords },
  company_fact: { color: '#475569', bg: '#f1f5f9', icon: FileCheck },
}

interface BrainNodeData {
  node: BrainNode
  categoryLabel: string
  connectionCount: number
}

const CustomBrainNode = memo(function CustomBrainNode({ data, selected }: NodeProps<BrainNodeData>) {
  const { node, categoryLabel, connectionCount } = data
  const config = CATEGORY_CONFIG[node.category]
  const Icon = config.icon
  const isPending = node.status === 'candidate'
  return (
    <div className={`brain-map-node ${selected ? 'is-selected' : ''} ${isPending ? 'is-pending' : ''}`}>
      {Object.values(Position).map((side) => (
        <span key={side}>
          <Handle type="target" id={`in-${side}`} position={side} />
          <Handle type="source" id={`out-${side}`} position={side} />
        </span>
      ))}
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="brain-map-node-category" style={{ color: config.color, background: config.bg }}>
          <Icon size={12} /> {categoryLabel}
        </span>
        <div className="flex items-center gap-1.5">
          {isPending && (
            <span className="rounded-full bg-amber-100 text-amber-800 text-[10px] font-semibold px-1.5 py-0.2 border border-amber-300">
              Pending
            </span>
          )}
          <span className="flex items-center gap-1 text-[10px] text-ink-500" title={`${connectionCount} connections`}>
            <GitBranch size={11} /> {connectionCount}
          </span>
        </div>
      </div>
      <h3 className="line-clamp-2 text-[15px] font-semibold leading-5 text-ink-900" dir="auto">{node.title}</h3>
      <p className="mt-1.5 line-clamp-2 text-[13px] leading-[17px] text-ink-500" dir="auto">{node.summary}</p>
    </div>
  )
})

const nodeTypes = { brainNode: CustomBrainNode }
const cardStyle = { width: BRAIN_CARD_WIDTH, height: BRAIN_CARD_HEIGHT }

type BrainGraphProps = {
  nodes: BrainNode[]
  edges: BrainEdge[]
  proposals?: BrainProposal[]
  onEditNode?: (node: BrainNode) => void
  onEvidence?: (node: BrainNode) => void
  onDecideProposal?: (proposal: BrainProposal, decision: 'approved' | 'rejected') => Promise<void>
  onDecideNode?: (node: BrainNode, decision: 'approved' | 'rejected') => Promise<void>
  onApproveAllProposals?: () => Promise<void>
  onSwitchToList?: () => void
}

export default function BrainGraph(props: BrainGraphProps) {
  return <ReactFlowProvider><BrainGraphView {...props} /></ReactFlowProvider>
}

function BrainGraphView({
  nodes,
  edges,
  proposals,
  onEditNode,
  onEvidence,
  onDecideProposal,
  onDecideNode,
  onApproveAllProposals,
  onSwitchToList,
}: BrainGraphProps) {
  const { t } = useCopy()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [category, setCategory] = useState<BrainCategory | 'all'>('all')
  const [query, setQuery] = useState('')
  const [showConnections, setShowConnections] = useState(true)
  const [positions, setPositions] = useState<Record<string, XYPosition>>({})
  const [layoutVersion, setLayoutVersion] = useState(0)
  const [actionBusy, setActionBusy] = useState(false)

  const approvedCount = useMemo(() => nodes.filter((n) => n.status === 'approved').length, [nodes])
  const pendingCount = useMemo(() => nodes.filter((n) => n.status === 'candidate').length, [nodes])
  const [statusFilter, setStatusFilter] = useState<'approved' | 'candidate' | 'all'>('approved')

  const statusNodes = useMemo(() => {
    if (statusFilter === 'approved') return nodes.filter((n) => n.status === 'approved')
    if (statusFilter === 'candidate') return nodes.filter((n) => n.status === 'candidate')
    return nodes
  }, [nodes, statusFilter])

  const { fitView, setCenter, getZoom, getNode, getNodes, setViewport } = useReactFlow()
  const canvasWidth = useStore((state) => state.width)
  const canvasHeight = useStore((state) => state.height)
  const nodesInitialized = useNodesInitialized()
  const selected = statusNodes.find((node) => node.id === selectedId) ?? null
  const layout = useMemo(() => calculateBrainPositions(statusNodes), [statusNodes])
  const categoryCounts = useMemo(() => {
    const counts = new Map<BrainCategory, number>()
    for (const node of statusNodes) counts.set(node.category, (counts.get(node.category) ?? 0) + 1)
    return counts
  }, [statusNodes])

  // Counts and lines reflect persisted connections, including review suggestions.
  const completeEdges = useMemo(() => {
    const nodeIds = new Set(statusNodes.map((node) => node.id))
    return edges.filter((edge) => edge.status !== 'rejected' && nodeIds.has(edge.source_node_id) && nodeIds.has(edge.target_node_id))
      .map((edge) => ({ id: edge.id, source: edge.source_node_id, target: edge.target_node_id,
        label: edge.relation_type.replace(/_/g, ' ').toLowerCase(), inferred: edge.status === 'candidate' }))
  }, [statusNodes, edges])

  const filteredNodes = useMemo(() => statusNodes.filter((node) =>
    (category === 'all' || node.category === category)
    && `${node.title} ${node.summary}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  ), [statusNodes, category, query])
  const visibleIds = useMemo(() => new Set(filteredNodes.map((node) => node.id)), [filteredNodes])
  const visibleSignature = [...visibleIds].sort().join('|')
  const connectionCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const edge of completeEdges) {
      counts.set(edge.source, (counts.get(edge.source) ?? 0) + 1)
      counts.set(edge.target, (counts.get(edge.target) ?? 0) + 1)
    }
    return counts
  }, [completeEdges])

  const nodeData = useMemo(() => new Map(filteredNodes.map((node) => [node.id, {
    node,
    categoryLabel: String(t(`cat_${node.category}` as never)),
    connectionCount: connectionCounts.get(node.id) ?? 0,
  }])), [filteredNodes, t, connectionCounts])

  const flowNodes: Node<BrainNodeData>[] = useMemo(() => filteredNodes.map((node) => ({
    id: node.id,
    type: 'brainNode',
    position: positions[node.id] ?? layout.get(node.id) ?? { x: 0, y: 0 },
    selected: node.id === selected?.id,
    // These cards are fixed-size. Keep their measured dimensions when positions change.
    width: BRAIN_CARD_WIDTH,
    height: BRAIN_CARD_HEIGHT,
    ariaLabel: `${node.title}. ${t(`cat_${node.category}` as never)}. Open knowledge details.`,
    style: cardStyle,
    data: nodeData.get(node.id)!,
  })), [filteredNodes, positions, layout, selected, t, nodeData])

  const visibleEdges = useMemo(() => completeEdges.filter((edge) =>
    visibleIds.has(edge.source) && visibleIds.has(edge.target)
  ), [completeEdges, visibleIds])
  const flowEdges: Edge[] = useMemo(() => showConnections ? visibleEdges.map((edge) => {
    const active = selected?.id === edge.source || selected?.id === edge.target
    const source = positions[edge.source] ?? layout.get(edge.source)!
    const target = positions[edge.target] ?? layout.get(edge.target)!
    const horizontal = source.x !== target.x
    const forward = horizontal ? target.x > source.x : target.y > source.y
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: `out-${horizontal ? forward ? 'right' : 'left' : forward ? 'bottom' : 'top'}`,
      targetHandle: `in-${horizontal ? forward ? 'left' : 'right' : forward ? 'top' : 'bottom'}`,
      type: 'smoothstep',
      pathOptions: { borderRadius: 18, offset: 30 },
      style: {
        stroke: active ? '#7954e8' : '#b9bed2',
        strokeWidth: active ? 1.8 : 1.1,
        strokeDasharray: edge.inferred ? '5 5' : undefined,
        opacity: selected && !active ? 0.12 : active ? 1 : 0.55,
      },
      zIndex: active ? 1 : 0,
    }
  }) : [], [showConnections, visibleEdges, selected, positions, layout])

  // Keep the initial map readable; Fit view remains available for a complete overview.
  useEffect(() => {
    if (!nodesInitialized || selectedId || !canvasWidth || !canvasHeight) return
    const frame = requestAnimationFrame(() => {
      const bounds = getNodesBounds(getNodes())
      const zoom = Math.min(1, Math.max(0.68, Math.min(
        (canvasWidth - 48) / bounds.width,
        (canvasHeight - 48) / bounds.height,
      )))
      setViewport({
        x: Math.max(24, (canvasWidth - bounds.width * zoom) / 2) - bounds.x * zoom,
        y: Math.max(24, (canvasHeight - bounds.height * zoom) / 2) - bounds.y * zoom,
        zoom,
      }, { duration: 250 })
    })
    return () => cancelAnimationFrame(frame)
  }, [nodesInitialized, visibleSignature, layoutVersion, selectedId, canvasWidth, canvasHeight, getNodes, setViewport])

  useEffect(() => {
    if (!selectedId || !nodesInitialized) return
    const node = getNode(selectedId)
    if (!node) return
    const frame = requestAnimationFrame(() => setCenter(
      node.position.x + BRAIN_CARD_WIDTH / 2,
      node.position.y + BRAIN_CARD_HEIGHT / 2,
      { zoom: Math.max(getZoom(), 0.9), duration: 250 },
    ))
    return () => cancelAnimationFrame(frame)
  }, [selectedId, nodesInitialized, canvasWidth, canvasHeight, getNode, setCenter, getZoom])

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedId(null)
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [])

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const moved: Record<string, XYPosition> = {}
    for (const change of changes) {
      if (change.type === 'position' && change.position) {
        moved[change.id] = change.position
      }
    }
    if (Object.keys(moved).length) setPositions((previous) => ({ ...previous, ...moved }))
  }, [])

  const clearFilters = () => { setCategory('all'); setQuery(''); setSelectedId(null) }
  const connections = selected ? completeEdges.filter((edge) => edge.source === selected.id || edge.target === selected.id) : []

  const matchingProposal = selected ? proposals?.find((p) => p.node_id === selected.id) : null

  return (
    <section className="brain-map" aria-label="Business knowledge map">
      <div className="brain-map-toolbar">
        <div className="flex shrink-0 items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-50 text-primary-600"><Network size={18} /></span>
          <div>
            <h2 className="text-sm font-semibold text-ink-900">Knowledge map</h2>
            <p className="mt-0.5 text-[11px] text-ink-500">{statusNodes.length} visible · {completeEdges.length} connections</p>
          </div>
        </div>

        <div className="flex items-center rounded-lg border border-ink-200 bg-ink-50/70 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => { setStatusFilter('approved'); setSelectedId(null) }}
            className={`px-2.5 py-1 rounded-md font-medium transition-all flex items-center gap-1.5 ${
              statusFilter === 'approved'
                ? 'bg-white text-ink-900 shadow-2xs font-semibold'
                : 'text-ink-600 hover:text-ink-900'
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span>Approved</span>
            <span className={`text-[10px] px-1 rounded-full ${statusFilter === 'approved' ? 'bg-primary-50 text-primary-700 font-bold' : 'bg-ink-100 text-ink-600'}`}>
              {approvedCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => { setStatusFilter('candidate'); setSelectedId(null) }}
            className={`px-2.5 py-1 rounded-md font-medium transition-all flex items-center gap-1.5 ${
              statusFilter === 'candidate'
                ? 'bg-amber-500 text-white shadow-2xs font-semibold'
                : 'text-amber-800 hover:text-amber-900'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${statusFilter === 'candidate' ? 'bg-white' : 'bg-amber-500'}`} />
            <span>Pending</span>
            <span className={`text-[10px] px-1 rounded-full font-bold ${
              statusFilter === 'candidate' ? 'bg-amber-600 text-white' : 'bg-amber-100 text-amber-800'
            }`}>
              {pendingCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => { setStatusFilter('all'); setSelectedId(null) }}
            className={`px-2.5 py-1 rounded-md font-medium transition-all flex items-center gap-1.5 ${
              statusFilter === 'all'
                ? 'bg-white text-ink-900 shadow-2xs font-semibold'
                : 'text-ink-600 hover:text-ink-900'
            }`}
          >
            <span>All</span>
            <span className="text-[10px] px-1 rounded-full bg-ink-100 text-ink-600">
              {nodes.length}
            </span>
          </button>
        </div>

        <div className="brain-map-tools">
          <label className="brain-map-search">
            <Search size={15} className="shrink-0 text-ink-400" />
            <input aria-label="Search knowledge" value={query} placeholder="Search knowledge…" onChange={(event) => { setQuery(event.target.value); setSelectedId(null) }} />
            {query && <button type="button" aria-label="Clear search" onClick={() => setQuery('')}><X size={14} /></button>}
          </label>
          <button type="button" className={`brain-map-tool ${showConnections ? 'is-active' : ''}`} aria-pressed={showConnections} onClick={() => setShowConnections(!showConnections)} title="Show or hide connections">
            <GitBranch size={15} /><span className="hidden sm:inline">Connections</span>
          </button>
          <button type="button" className="brain-map-tool" onClick={() => fitView({ padding: 0.17, duration: 250, maxZoom: 1 })} title="Fit all visible cards" aria-label="Fit map to view"><Scan size={16} /></button>
          <button type="button" className="brain-map-tool" onClick={() => { setPositions({}); setSelectedId(null); setLayoutVersion((version) => version + 1) }} title="Reset card positions" aria-label="Reset map layout"><RotateCcw size={15} /></button>
        </div>
      </div>

      <div className="brain-map-categories" role="group" aria-label="Filter knowledge by category">
        <button type="button" className={`brain-map-category ${category === 'all' ? 'is-active' : ''}`} aria-pressed={category === 'all'} onClick={() => { setCategory('all'); setSelectedId(null) }}>All <span>{statusNodes.length}</span></button>
        {BRAIN_CATEGORY_ORDER.filter((item) => categoryCounts.has(item)).map((item) => {
          const config = CATEGORY_CONFIG[item]
          return <button type="button" key={item} className={`brain-map-category ${category === item ? 'is-active' : ''}`} aria-pressed={category === item} onClick={() => { setCategory(item); setSelectedId(null) }}>
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: config.color }} />
            {t(`cat_${item}` as never)} <span>{categoryCounts.get(item)}</span>
          </button>
        })}
      </div>

      <div className="brain-map-body">
        <div className="brain-map-canvas relative" onKeyDownCapture={(event) => {
          const target = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('.react-flow__node') : null
          if (target?.dataset.id && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault()
            event.stopPropagation()
            setSelectedId(target.dataset.id)
          }
        }}>
          {statusFilter === 'candidate' && statusNodes.length > 0 && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 rounded-xl bg-amber-500/95 text-white px-3.5 py-1.5 text-xs shadow-md backdrop-blur-xs">
              <AlertCircle size={14} className="shrink-0" />
              <span>Previewing <strong>{statusNodes.length} pending proposals</strong> awaiting your review</span>
              {onSwitchToList && (
                <button
                  type="button"
                  onClick={onSwitchToList}
                  className="ms-2 rounded-md bg-white/20 hover:bg-white/30 px-2 py-0.5 text-[11px] font-semibold text-white transition-colors"
                >
                  Review list
                </button>
              )}
            </div>
          )}

          <ReactFlow
            nodes={flowNodes} edges={flowEdges} nodeTypes={nodeTypes} onNodesChange={onNodesChange}
            nodesConnectable={false} edgesFocusable={false} minZoom={0.3} maxZoom={1.6}
            selectNodesOnDrag={false} nodeDragThreshold={4}
            fitView fitViewOptions={{ padding: 0.17, maxZoom: 1 }}
            onNodeClick={(_, node) => setSelectedId(node.id)} onPaneClick={() => setSelectedId(null)}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#dce0ef" gap={22} size={0.8} />
            <Controls showInteractive={false} />
            {statusNodes.length > 6 && <MiniMap className="brain-map-minimap" pannable zoomable maskColor="rgba(239, 241, 250, 0.65)" nodeColor={(node) => CATEGORY_CONFIG[(node.data as BrainNodeData).node.category].color} nodeBorderRadius={5} />}
          </ReactFlow>

          {filteredNodes.length === 0 && (
            <div className="brain-map-empty max-w-md text-center p-6" role="status">
              {statusFilter === 'approved' && approvedCount === 0 && pendingCount > 0 ? (
                <>
                  <span className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                    <AlertCircle size={28} />
                  </span>
                  <h3 className="text-base font-bold text-ink-900">Your Knowledge Map starts here</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-600">
                    You have <strong className="text-amber-800">{pendingCount} pending suggestions</strong> extracted from your website awaiting your approval. Once approved, they will form your confirmed Knowledge Map.
                  </p>
                  <div className="mt-5 flex flex-wrap justify-center gap-2">
                    {onSwitchToList && (
                      <button
                        type="button"
                        onClick={onSwitchToList}
                        className="btn-primary text-xs flex items-center gap-1.5"
                      >
                        <List size={14} /> Review & Approve ({pendingCount})
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setStatusFilter('candidate')}
                      className="btn-secondary text-xs text-amber-800 border-amber-300 hover:bg-amber-50 flex items-center gap-1.5"
                    >
                      <Network size={14} /> Preview on Map
                    </button>
                    {onApproveAllProposals && (
                      <button
                        type="button"
                        onClick={() => void onApproveAllProposals()}
                        className="btn-secondary text-xs text-emerald-700 border-emerald-300 hover:bg-emerald-50 flex items-center gap-1.5"
                      >
                        <CheckCircle2 size={14} /> Approve All Now
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-500">
                    {statusNodes.length ? <Search size={23} /> : <Network size={23} />}
                  </span>
                  <h3 className="text-base font-semibold text-ink-900">
                    {statusNodes.length ? 'No matching knowledge' : 'No knowledge items in this view'}
                  </h3>
                  <p className="mt-2 max-w-xs text-sm leading-relaxed text-ink-500">
                    {statusNodes.length
                      ? 'Try a different search or explore another category.'
                      : 'Add or approve knowledge to see how your business connects.'}
                  </p>
                  {statusNodes.length > 0 && (
                    <button type="button" onClick={clearFilters} className="btn-secondary mt-4 text-xs">
                      Clear filters
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {selected && <aside className="brain-map-inspector" aria-label="Knowledge details">
          <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
            <span className="text-xs font-semibold text-ink-500">KNOWLEDGE DETAILS</span>
            <button type="button" onClick={() => setSelectedId(null)} className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-50 hover:text-ink-900" aria-label="Close knowledge details"><X size={16} /></button>
          </div>
          <div key={selected.id} className="min-h-0 flex-1 overflow-y-auto p-5">
            {selected.status === 'candidate' && (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-900">
                  <AlertCircle size={15} className="text-amber-600" />
                  <span>Pending Review</span>
                </div>
                <p className="mt-1 text-xs text-amber-700 leading-relaxed">
                  This item is proposed knowledge extracted from your website. Approve it to confirm it as business truth.
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={async () => {
                      setActionBusy(true)
                      try {
                        if (matchingProposal && onDecideProposal) {
                          await onDecideProposal(matchingProposal, 'approved')
                        } else if (onDecideNode) {
                          await onDecideNode(selected, 'approved')
                        }
                        setSelectedId(null)
                      } finally {
                        setActionBusy(false)
                      }
                    }}
                    className="btn-primary bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 text-xs inline-flex items-center gap-1 shadow-xs"
                  >
                    <CheckCircle2 size={12} />
                    <span>Approve</span>
                  </button>
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={async () => {
                      setActionBusy(true)
                      try {
                        if (matchingProposal && onDecideProposal) {
                          await onDecideProposal(matchingProposal, 'rejected')
                        } else if (onDecideNode) {
                          await onDecideNode(selected, 'rejected')
                        }
                        setSelectedId(null)
                      } finally {
                        setActionBusy(false)
                      }
                    }}
                    className="btn-secondary px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 border-red-200 inline-flex items-center gap-1"
                  >
                    <X size={12} />
                    <span>Reject</span>
                  </button>
                </div>
              </div>
            )}

            <span className="brain-map-node-category" style={{ color: CATEGORY_CONFIG[selected.category].color, background: CATEGORY_CONFIG[selected.category].bg }}>{t(`cat_${selected.category}` as never)}</span>
            <h3 className="mt-4 text-lg font-semibold leading-snug text-ink-900" dir="auto">{selected.title}</h3>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-600" dir="auto">{selected.summary}</p>
            <KnowledgeLabels node={selected}/>
            {onEvidence&&<button className="mt-3 text-sm text-primary-700 underline" onClick={()=>onEvidence(selected)}>View evidence and versions</button>}
            <div className="mt-5 rounded-xl bg-ink-50/70 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">Source</p>
              <p className="mt-1 break-words text-xs leading-relaxed text-ink-600" dir="auto">{selected.source_detail || selected.source}</p>
            </div>
            <div className="mb-3 mt-6 flex items-center justify-between">
              <h4 className="text-xs font-semibold text-ink-900">Connections</h4><span className="rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-semibold text-primary-700">{connections.length}</span>
            </div>
            <div className="space-y-2">
              {connections.map((edge) => {
                const other = statusNodes.find((node) => node.id === (edge.source === selected.id ? edge.target : edge.source))
                if (!other) return null
                return <button type="button" key={edge.id} className="brain-map-connection" onClick={() => { setCategory('all'); setQuery(''); setSelectedId(other.id) }}>
                  <span className="min-w-0 flex-1"><span className="block text-[10px] text-primary-700">{edge.label}{edge.inferred ? ' · Suggested' : ''}</span><span className="mt-1 block text-xs font-medium leading-relaxed text-ink-800" dir="auto">{other.title}</span></span><ArrowUpRight size={14} className="shrink-0 text-ink-400" />
                </button>
              })}
              {connections.length === 0 && <p className="text-xs leading-relaxed text-ink-500">No connections for this item yet.</p>}
            </div>
          </div>
          {onEditNode && <div className="border-t border-ink-100 p-4"><button type="button" className="btn-primary w-full text-xs" onClick={() => { setSelectedId(null); onEditNode(selected) }}><Pencil size={14} />{t('edit')} knowledge</button></div>}
        </aside>}
      </div>
      <footer className="brain-map-footer">
        <span className="flex items-center gap-1.5"><MousePointer2 size={12} />{selected ? 'Connected knowledge is highlighted' : 'Select a card to explore its connections'}</span>
        <span className="hidden sm:inline">Drag to arrange · Scroll to zoom</span>
      </footer>
    </section>
  )
}
