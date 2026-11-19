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
  BRAIN_CAT_HEIGHT, BRAIN_CAT_WIDTH, BRAIN_HUB_HEIGHT, BRAIN_HUB_WIDTH,
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

// 1. Central Hub Node (Company profile or Business root)
const CustomHubNode = memo(function CustomHubNode({ data, selected }: NodeProps<{ title: string; subtitle: string }>) {
  return (
    <div className={`brain-map-hub ${selected ? 'is-selected' : ''}`}>
      <Handle type="source" id="out-left" position={Position.Left} />
      <Handle type="source" id="out-right" position={Position.Right} />
      <Handle type="target" id="in-left" position={Position.Left} />
      <Handle type="target" id="in-right" position={Position.Right} />
      <div className="flex items-center gap-2.5 w-full">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/20 text-white shadow-xs">
          <Building2 size={17} />
        </span>
        <div className="min-w-0 flex-1 text-start">
          <h3 className="truncate text-xs font-bold text-white tracking-wide" dir="auto" title={data.title}>
            {data.title}
          </h3>
          <p className="text-[10px] text-white/80 leading-tight mt-0.5">{data.subtitle}</p>
        </div>
      </div>
    </div>
  )
})

// 2. Category Branch Node (Capsule pill)
const CustomCategoryNode = memo(function CustomCategoryNode({ data, selected }: NodeProps<{ category: BrainCategory; label: string; count: number }>) {
  const config = CATEGORY_CONFIG[data.category]
  const Icon = config.icon
  return (
    <div
      className={`brain-map-category-node ${selected ? 'is-selected' : ''}`}
      style={{
        borderColor: config.color,
        backgroundColor: config.bg,
        color: config.color,
      }}
    >
      <Handle type="target" id="in-left" position={Position.Left} />
      <Handle type="target" id="in-right" position={Position.Right} />
      <Handle type="source" id="out-left" position={Position.Left} />
      <Handle type="source" id="out-right" position={Position.Right} />
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md" style={{ color: config.color }}>
        <Icon size={13} />
      </span>
      <span className="text-xs font-bold tracking-tight truncate max-w-[76px]" title={data.label}>{data.label}</span>
      <span
        className="ml-auto px-1.5 py-0.2 rounded-full text-[10px] font-bold"
        style={{ backgroundColor: `${config.color}25`, color: config.color }}
      >
        {data.count}
      </span>
    </div>
  )
})

// 3. Leaf Knowledge Item Node (Sleek minimalist capsule)
const CustomBrainNode = memo(function CustomBrainNode({ data, selected }: NodeProps<BrainNodeData>) {
  const { node, categoryLabel, connectionCount } = data
  const config = CATEGORY_CONFIG[node.category]
  const Icon = config.icon
  const isPending = node.status === 'candidate'

  return (
    <div
      className={`brain-map-node ${selected ? 'is-selected' : ''} ${isPending ? 'is-pending' : ''}`}
      style={{
        borderColor: selected ? '#7c3aed' : isPending ? '#f59e0b' : `${config.color}50`,
      }}
    >
      <Handle type="target" id="in-left" position={Position.Left} />
      <Handle type="target" id="in-right" position={Position.Right} />
      <Handle type="source" id="out-left" position={Position.Left} />
      <Handle type="source" id="out-right" position={Position.Right} />
      <Handle type="target" id="in-top" position={Position.Top} />
      <Handle type="source" id="out-bottom" position={Position.Bottom} />

      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: config.bg, color: config.color }}
        title={categoryLabel}
      >
        <Icon size={14} />
      </span>

      <div className="min-w-0 flex-1 px-2.5 text-start">
        <h3 className="truncate text-xs font-semibold text-ink-900 leading-snug" dir="auto" title={node.title}>
          {node.title}
        </h3>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {isPending && (
          <span
            className="h-2 w-2 rounded-full bg-amber-500 animate-pulse shrink-0"
            title="Pending proposal awaiting review"
          />
        )}
        {connectionCount > 0 && (
          <span
            className="flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-ink-100 text-ink-600"
            title={`${connectionCount} connections`}
          >
            <GitBranch size={9} />
            <span>{connectionCount}</span>
          </span>
        )}
      </div>
    </div>
  )
})

const nodeTypes = {
  hubNode: CustomHubNode,
  categoryNode: CustomCategoryNode,
  brainNode: CustomBrainNode,
}
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

  const categoryCounts = useMemo(() => {
    const counts = new Map<BrainCategory, number>()
    for (const node of statusNodes) counts.set(node.category, (counts.get(node.category) ?? 0) + 1)
    return counts
  }, [statusNodes])

  const filteredNodes = useMemo(() => statusNodes.filter((node) =>
    (category === 'all' || node.category === category)
    && `${node.title} ${node.summary}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  ), [statusNodes, category, query])

  const visibleIds = useMemo(() => new Set(filteredNodes.map((node) => node.id)), [filteredNodes])
  const visibleSignature = [...visibleIds].sort().join('|')

  // Calculate mind-map layout
  const layout = useMemo(() => calculateBrainPositions(filteredNodes), [filteredNodes])

  // Cross edges: Exclude connections to the hub (already connected via tree branches)
  const crossEdges = useMemo(() => {
    const nodeIds = new Set(filteredNodes.map((node) => node.id))
    return edges
      .filter((edge) =>
        edge.status !== 'rejected' &&
        nodeIds.has(edge.source_node_id) &&
        nodeIds.has(edge.target_node_id) &&
        edge.source_node_id !== layout.hubId &&
        edge.target_node_id !== layout.hubId &&
        edge.source_node_id !== layout.hubNode?.id &&
        edge.target_node_id !== layout.hubNode?.id
      )
      .map((edge) => ({
        id: edge.id,
        source: edge.source_node_id,
        target: edge.target_node_id,
        label: edge.relation_type.replace(/_/g, ' ').toLowerCase(),
        inferred: edge.status === 'candidate',
      }))
  }, [filteredNodes, edges, layout.hubId, layout.hubNode])

  const connectionCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const edge of crossEdges) {
      counts.set(edge.source, (counts.get(edge.source) ?? 0) + 1)
      counts.set(edge.target, (counts.get(edge.target) ?? 0) + 1)
    }
    return counts
  }, [crossEdges])

  // Selected state: can be a knowledge node, category node, or hub
  const selectedNode = statusNodes.find((node) => node.id === selectedId) ?? null
  const selectedCategory = selectedId?.startsWith('cat-') ? (selectedId.replace('cat-', '') as BrainCategory) : null
  const selectedHub = selectedId === layout.hubId && !layout.hubNode

  const nodeData = useMemo(() => new Map(filteredNodes.map((node) => [node.id, {
    node,
    categoryLabel: String(t(`cat_${node.category}` as never)),
    connectionCount: connectionCounts.get(node.id) ?? 0,
  }])), [filteredNodes, t, connectionCounts])

  // Construct ReactFlow nodes: Hub + Category pills + Leaf items
  const flowNodes: Node[] = useMemo(() => {
    if (filteredNodes.length === 0) return []
    const result: Node[] = []

    // 1. Center Hub Node
    const hubPos = positions[layout.hubId] ?? layout.positions.get(layout.hubId) ?? { x: -BRAIN_HUB_WIDTH / 2, y: -BRAIN_HUB_HEIGHT / 2 }
    result.push({
      id: layout.hubId,
      type: 'hubNode',
      position: hubPos,
      selected: layout.hubId === selectedId,
      width: BRAIN_HUB_WIDTH,
      height: BRAIN_HUB_HEIGHT,
      style: { width: BRAIN_HUB_WIDTH, height: BRAIN_HUB_HEIGHT },
      data: {
        title: layout.hubNode ? layout.hubNode.title : 'Business Brain',
        subtitle: `${filteredNodes.length} knowledge items`,
      },
    })

    // 2. Category Nodes
    const activeCategories = [...layout.rightCategories, ...layout.leftCategories]
    for (const cat of activeCategories) {
      const catId = `cat-${cat}`
      const catPos = positions[catId] ?? layout.positions.get(catId) ?? { x: 0, y: 0 }
      const count = filteredNodes.filter((n) => n.category === cat).length
      result.push({
        id: catId,
        type: 'categoryNode',
        position: catPos,
        selected: catId === selectedId,
        width: BRAIN_CAT_WIDTH,
        height: BRAIN_CAT_HEIGHT,
        style: { width: BRAIN_CAT_WIDTH, height: BRAIN_CAT_HEIGHT },
        data: {
          category: cat,
          label: String(t(`cat_${cat}` as never)),
          count,
        },
      })
    }

    // 3. Leaf Knowledge Item Nodes
    for (const node of filteredNodes) {
      if (node.id === layout.hubNode?.id) continue
      const itemPos = positions[node.id] ?? layout.positions.get(node.id) ?? { x: 0, y: 0 }
      result.push({
        id: node.id,
        type: 'brainNode',
        position: itemPos,
        selected: node.id === selectedId,
        width: BRAIN_CARD_WIDTH,
        height: BRAIN_CARD_HEIGHT,
        ariaLabel: `${node.title}. ${t(`cat_${node.category}` as never)}. Open knowledge details.`,
        style: cardStyle,
        data: nodeData.get(node.id)!,
      })
    }

    return result
  }, [filteredNodes, positions, layout, selectedId, t, nodeData])

  // Construct ReactFlow edges: Tree branches (Hub -> Cat -> Item) + Clean Cross connections
  const flowEdges: Edge[] = useMemo(() => {
    if (filteredNodes.length === 0) return []
    const edgesList: Edge[] = []

    // 1. Hub -> Right Categories
    for (const cat of layout.rightCategories) {
      const config = CATEGORY_CONFIG[cat]
      edgesList.push({
        id: `branch-hub-cat-${cat}`,
        source: layout.hubId,
        target: `cat-${cat}`,
        sourceHandle: 'out-right',
        targetHandle: 'in-left',
        type: 'default',
        style: { stroke: config.color, strokeWidth: 2.2, opacity: 0.85 },
      })
    }

    // 2. Hub -> Left Categories
    for (const cat of layout.leftCategories) {
      const config = CATEGORY_CONFIG[cat]
      edgesList.push({
        id: `branch-hub-cat-${cat}`,
        source: layout.hubId,
        target: `cat-${cat}`,
        sourceHandle: 'out-left',
        targetHandle: 'in-right',
        type: 'default',
        style: { stroke: config.color, strokeWidth: 2.2, opacity: 0.85 },
      })
    }

    // 3. Category -> Leaf Items (Right)
    for (const cat of layout.rightCategories) {
      const config = CATEGORY_CONFIG[cat]
      const items = filteredNodes.filter((n) => n.category === cat && n.id !== layout.hubNode?.id)
      for (const item of items) {
        edgesList.push({
          id: `branch-cat-${cat}-${item.id}`,
          source: `cat-${cat}`,
          target: item.id,
          sourceHandle: 'out-right',
          targetHandle: 'in-left',
          type: 'default',
          style: { stroke: config.color, strokeWidth: 1.6, opacity: 0.7 },
        })
      }
    }

    // 3. Category -> Leaf Items (Left)
    for (const cat of layout.leftCategories) {
      const config = CATEGORY_CONFIG[cat]
      const items = filteredNodes.filter((n) => n.category === cat && n.id !== layout.hubNode?.id)
      for (const item of items) {
        edgesList.push({
          id: `branch-cat-${cat}-${item.id}`,
          source: `cat-${cat}`,
          target: item.id,
          sourceHandle: 'out-left',
          targetHandle: 'in-right',
          type: 'default',
          style: { stroke: config.color, strokeWidth: 1.6, opacity: 0.7 },
        })
      }
    }

    // 4. Subtle Cross-connections between leaf items
    if (showConnections) {
      for (const edge of crossEdges) {
        const active = selectedId === edge.source || selectedId === edge.target
        const sourcePos = positions[edge.source] ?? layout.positions.get(edge.source)
        const targetPos = positions[edge.target] ?? layout.positions.get(edge.target)
        if (!sourcePos || !targetPos) continue

        const horizontal = Math.abs(sourcePos.x - targetPos.x) > 30
        const forward = horizontal ? targetPos.x > sourcePos.x : targetPos.y > sourcePos.y

        edgesList.push({
          id: `rel-${edge.id}`,
          source: edge.source,
          target: edge.target,
          sourceHandle: horizontal ? (forward ? 'out-right' : 'out-left') : (forward ? 'out-bottom' : 'out-top'),
          targetHandle: horizontal ? (forward ? 'in-left' : 'in-right') : (forward ? 'in-top' : 'in-bottom'),
          type: 'default',
          // Show label only when this edge is active (connected to selected node)
          label: active ? edge.label : undefined,
          style: {
            stroke: active ? '#7c3aed' : '#cbd5e1',
            strokeWidth: active ? 2 : 1,
            strokeDasharray: '4 4',
            opacity: selectedId ? (active ? 1 : 0.08) : 0.35,
          },
          labelStyle: { fontSize: 10, fill: '#6d28d9', fontWeight: 600 },
          labelBgStyle: { fill: '#ffffff', fillOpacity: 0.95, rx: 4, ry: 4 },
          labelBgPadding: [4, 2],
          zIndex: active ? 10 : 1,
        })
      }
    }

    return edgesList
  }, [filteredNodes, layout, showConnections, crossEdges, selectedId, positions])

  // Zoom to fit on initial load and reset
  useEffect(() => {
    if (!nodesInitialized || selectedId || !canvasWidth || !canvasHeight) return
    const frame = requestAnimationFrame(() => {
      const bounds = getNodesBounds(getNodes())
      const zoom = Math.min(1, Math.max(0.65, Math.min(
        (canvasWidth - 80) / (bounds.width || 800),
        (canvasHeight - 80) / (bounds.height || 600),
      )))
      setViewport({
        x: Math.max(24, (canvasWidth - bounds.width * zoom) / 2) - bounds.x * zoom,
        y: Math.max(24, (canvasHeight - bounds.height * zoom) / 2) - bounds.y * zoom,
        zoom,
      }, { duration: 250 })
    })
    return () => cancelAnimationFrame(frame)
  }, [nodesInitialized, visibleSignature, layoutVersion, selectedId, canvasWidth, canvasHeight, getNodes, setViewport])

  // Center selected node
  useEffect(() => {
    if (!selectedId || !nodesInitialized) return
    const node = getNode(selectedId)
    if (!node) return
    const nodeWidth = (node.style?.width as number) || BRAIN_CARD_WIDTH
    const nodeHeight = (node.style?.height as number) || BRAIN_CARD_HEIGHT
    const frame = requestAnimationFrame(() => setCenter(
      node.position.x + nodeWidth / 2,
      node.position.y + nodeHeight / 2,
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
  const connections = selectedNode ? crossEdges.filter((edge) => edge.source === selectedNode.id || edge.target === selectedNode.id) : []
  const matchingProposal = selectedNode ? proposals?.find((p) => p.node_id === selectedNode.id) : null

  return (
    <section className="brain-map" aria-label="Business knowledge map">
      <div className="brain-map-toolbar">
        <div className="flex shrink-0 items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-50 text-primary-600"><Network size={18} /></span>
          <div>
            <h2 className="text-sm font-semibold text-ink-900">Knowledge map</h2>
            <p className="mt-0.5 text-[11px] text-ink-500">{statusNodes.length} visible · {crossEdges.length} connections</p>
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
          <button type="button" className={`brain-map-tool ${showConnections ? 'is-active' : ''}`} aria-pressed={showConnections} onClick={() => setShowConnections(!showConnections)} title="Show or hide cross-connections">
            <GitBranch size={15} /><span className="hidden sm:inline">Connections</span>
          </button>
          <button type="button" className="brain-map-tool" onClick={() => fitView({ padding: 0.18, duration: 250, maxZoom: 1 })} title="Fit all visible cards" aria-label="Fit map to view"><Scan size={16} /></button>
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
            fitView fitViewOptions={{ padding: 0.18, maxZoom: 1 }}
            onNodeClick={(_, node) => setSelectedId(node.id)} onPaneClick={() => setSelectedId(null)}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#dce0ef" gap={22} size={0.8} />
            <Controls showInteractive={false} />
            {statusNodes.length > 6 && (
              <MiniMap
                className="brain-map-minimap"
                pannable
                zoomable
                maskColor="rgba(239, 241, 250, 0.65)"
                nodeColor={(node) => {
                  if (node.type === 'hubNode') return '#7c3aed'
                  if (node.type === 'categoryNode') {
                    const cat = (node.data as { category: BrainCategory })?.category
                    return CATEGORY_CONFIG[cat]?.color ?? '#6366f1'
                  }
                  const n = (node.data as BrainNodeData)?.node
                  return n ? (CATEGORY_CONFIG[n.category]?.color ?? '#94a3b8') : '#94a3b8'
                }}
                nodeBorderRadius={6}
              />
            )}
          </ReactFlow>

          {filteredNodes.length === 0 && (
            <div className="brain-map-empty" role="status">
              <div className="max-w-md w-full mx-auto text-center p-6 bg-white/95 backdrop-blur-md rounded-2xl border border-ink-200/80 shadow-lg">
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
                    <p className="mt-2 max-w-xs mx-auto text-sm leading-relaxed text-ink-500">
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
            </div>
          )}
        </div>

        {/* 1. Knowledge Item Inspector */}
        {selectedNode && (
          <aside className="brain-map-inspector" aria-label="Knowledge details">
            <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
              <span className="text-xs font-semibold text-ink-500">KNOWLEDGE DETAILS</span>
              <button type="button" onClick={() => setSelectedId(null)} className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-50 hover:text-ink-900" aria-label="Close knowledge details"><X size={16} /></button>
            </div>
            <div key={selectedNode.id} className="min-h-0 flex-1 overflow-y-auto p-5">
              {selectedNode.status === 'candidate' && (
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
                            await onDecideNode(selectedNode, 'approved')
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
                            await onDecideNode(selectedNode, 'rejected')
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

              <span className="brain-map-node-category" style={{ color: CATEGORY_CONFIG[selectedNode.category].color, background: CATEGORY_CONFIG[selectedNode.category].bg }}>{t(`cat_${selectedNode.category}` as never)}</span>
              <h3 className="mt-4 text-lg font-semibold leading-snug text-ink-900" dir="auto">{selectedNode.title}</h3>
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-600" dir="auto">{selectedNode.summary}</p>
              <KnowledgeLabels node={selectedNode}/>
              {onEvidence && <button className="mt-3 text-sm text-primary-700 underline" onClick={() => onEvidence(selectedNode)}>View evidence and versions</button>}
              <div className="mt-5 rounded-xl bg-ink-50/70 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">Source</p>
                <p className="mt-1 break-words text-xs leading-relaxed text-ink-600" dir="auto">{selectedNode.source_detail || selectedNode.source}</p>
              </div>
              <div className="mb-3 mt-6 flex items-center justify-between">
                <h4 className="text-xs font-semibold text-ink-900">Connections</h4><span className="rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-semibold text-primary-700">{connections.length}</span>
              </div>
              <div className="space-y-2">
                {connections.map((edge) => {
                  const other = statusNodes.find((node) => node.id === (edge.source === selectedNode.id ? edge.target : edge.source))
                  if (!other) return null
                  return <button type="button" key={edge.id} className="brain-map-connection" onClick={() => { setCategory('all'); setQuery(''); setSelectedId(other.id) }}>
                    <span className="min-w-0 flex-1"><span className="block text-[10px] text-primary-700">{edge.label}{edge.inferred ? ' · Suggested' : ''}</span><span className="mt-1 block text-xs font-medium leading-relaxed text-ink-800" dir="auto">{other.title}</span></span><ArrowUpRight size={14} className="shrink-0 text-ink-400" />
                  </button>
                })}
                {connections.length === 0 && <p className="text-xs leading-relaxed text-ink-500">No cross-connections for this item yet.</p>}
              </div>
            </div>
            {onEditNode && <div className="border-t border-ink-100 p-4"><button type="button" className="btn-primary w-full text-xs" onClick={() => { setSelectedId(null); onEditNode(selectedNode) }}><Pencil size={14} />{t('edit')} knowledge</button></div>}
          </aside>
        )}

        {/* 2. Category Node Inspector */}
        {!selectedNode && selectedCategory && (
          <aside className="brain-map-inspector" aria-label="Category details">
            <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
              <span className="text-xs font-semibold text-ink-500">CATEGORY OVERVIEW</span>
              <button type="button" onClick={() => setSelectedId(null)} className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-50 hover:text-ink-900" aria-label="Close category details"><X size={16} /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <div className="flex items-center gap-2.5">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                  style={{ backgroundColor: CATEGORY_CONFIG[selectedCategory].bg, color: CATEGORY_CONFIG[selectedCategory].color }}
                >
                  {(() => { const CatIcon = CATEGORY_CONFIG[selectedCategory].icon; return <CatIcon size={20} /> })()}
                </span>
                <div>
                  <h3 className="text-base font-bold text-ink-900">{t(`cat_${selectedCategory}` as never)}</h3>
                  <p className="text-xs text-ink-500">{filteredNodes.filter((n) => n.category === selectedCategory).length} items in map</p>
                </div>
              </div>

              <div className="mt-6 space-y-2">
                <h4 className="text-xs font-semibold text-ink-700 uppercase tracking-wider">Knowledge in this branch</h4>
                {filteredNodes.filter((n) => n.category === selectedCategory).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className="w-full text-start p-2.5 rounded-xl border border-ink-100 hover:border-primary-300 hover:bg-primary-50/30 transition-all flex items-center justify-between gap-2"
                  >
                    <span className="text-xs font-medium text-ink-900 truncate" dir="auto">{item.title}</span>
                    {item.status === 'candidate' && (
                      <span className="text-[10px] bg-amber-100 text-amber-800 font-semibold px-1.5 py-0.2 rounded-full shrink-0">Pending</span>
                    )}
                  </button>
                ))}
              </div>

              <div className="mt-6">
                <button
                  type="button"
                  onClick={() => { setCategory(selectedCategory); setSelectedId(null) }}
                  className="btn-secondary w-full text-xs"
                >
                  Filter map to {t(`cat_${selectedCategory}` as never)}
                </button>
              </div>
            </div>
          </aside>
        )}

        {/* 3. Business Hub Inspector */}
        {!selectedNode && !selectedCategory && selectedHub && (
          <aside className="brain-map-inspector" aria-label="Brain details">
            <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
              <span className="text-xs font-semibold text-ink-500">BUSINESS BRAIN</span>
              <button type="button" onClick={() => setSelectedId(null)} className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-50 hover:text-ink-900" aria-label="Close brain details"><X size={16} /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-100 text-primary-700">
                  <Building2 size={20} />
                </span>
                <div>
                  <h3 className="text-base font-bold text-ink-900">Knowledge Map Hub</h3>
                  <p className="text-xs text-ink-500">{statusNodes.length} confirmed knowledge cards</p>
                </div>
              </div>
              <p className="mt-4 text-xs text-ink-600 leading-relaxed">
                This mind-map visually connects your business profile, offerings, audience, and goals into a unified knowledge graph.
              </p>
              <div className="mt-6 space-y-2">
                <h4 className="text-xs font-semibold text-ink-700 uppercase tracking-wider">Categories</h4>
                {BRAIN_CATEGORY_ORDER.filter((cat) => categoryCounts.has(cat)).map((cat) => {
                  const config = CATEGORY_CONFIG[cat]
                  const CatIcon = config.icon
                  return (
                    <div key={cat} className="flex items-center justify-between p-2 rounded-lg bg-ink-50/70 text-xs">
                      <div className="flex items-center gap-2">
                        <CatIcon size={14} style={{ color: config.color }} />
                        <span className="font-medium text-ink-800">{t(`cat_${cat}` as never)}</span>
                      </div>
                      <span className="font-semibold text-ink-600">{categoryCounts.get(cat)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </aside>
        )}
      </div>

      <footer className="brain-map-footer">
        <span className="flex items-center gap-1.5"><MousePointer2 size={12} />{selectedId ? 'Click any card to inspect details' : 'Select a card to explore its connections'}</span>
        <span className="hidden sm:inline">Drag to arrange · Scroll to zoom</span>
      </footer>
    </section>
  )
}
