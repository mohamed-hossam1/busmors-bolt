import { useCallback, useEffect, useMemo, useState } from 'react'
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
} from 'reactflow'
import 'reactflow/dist/style.css'
import {
  X,
  Building2,
  Package,
  Users,
  Palette,
  Target,
  FileCheck,
  Swords,
  Radio,
  Flag,
  RotateCcw,
  Pencil,
  type LucideIcon,
} from 'lucide-react'
import type { BrainCategory, BrainEdge, BrainNode } from '../../lib/types'
import { useLang } from '../../context/LangContext'

interface CategoryConfig {
  color: string
  bg: string
  border: string
  icon: LucideIcon
}

const CATEGORY_CONFIG: Record<BrainCategory, CategoryConfig> = {
  company_profile: {
    color: '#0f766e',
    bg: '#f0fdfa',
    border: '#0f766e',
    icon: Building2,
  },
  offering: {
    color: '#059669',
    bg: '#ecfdf5',
    border: '#059669',
    icon: Package,
  },
  audience: {
    color: '#d97706',
    bg: '#fffbeb',
    border: '#d97706',
    icon: Users,
  },
  brand_rule: {
    color: '#ea580c',
    bg: '#fff7ed',
    border: '#ea580c',
    icon: Palette,
  },
  positioning: {
    color: '#7c3aed',
    bg: '#faf5ff',
    border: '#7c3aed',
    icon: Target,
  },
  strategic_goal: {
    color: '#2563eb',
    bg: '#eff6ff',
    border: '#2563eb',
    icon: Flag,
  },
  channel: {
    color: '#0891b2',
    bg: '#ecfeff',
    border: '#0891b2',
    icon: Radio,
  },
  competitor: {
    color: '#e11d48',
    bg: '#fff1f2',
    border: '#e11d48',
    icon: Swords,
  },
  company_fact: {
    color: '#475569',
    bg: '#f8fafc',
    border: '#475569',
    icon: FileCheck,
  },
}

interface BrainNodeData {
  node: BrainNode
  categoryLabel: string
}

function CustomBrainNode({ data, selected }: NodeProps<BrainNodeData>) {
  const { node, categoryLabel } = data
  const config = CATEGORY_CONFIG[node.category] ?? {
    color: '#0f766e',
    bg: '#f0fdfa',
    border: '#0f766e',
    icon: Building2,
  }
  const Icon = config.icon

  return (
    <div
      className={`group relative min-w-[190px] max-w-[240px] rounded-2xl border-2 bg-white p-3 shadow-xs transition-all hover:shadow-md cursor-grab active:cursor-grabbing ${
        selected ? 'ring-2 ring-primary-500 shadow-md scale-102' : ''
      }`}
      style={{ borderColor: config.color }}
    >
      {/* 4 Handles for clean multi-directional curves */}
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !bg-primary-500 !border-2 !border-white" />
      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !bg-primary-500 !border-2 !border-white" />
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !bg-primary-500 !border-2 !border-white" />
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !bg-primary-500 !border-2 !border-white" />

      <div className="flex items-center gap-1.5 mb-1.5">
        <div
          className="flex h-5 w-5 items-center justify-center rounded-md shrink-0"
          style={{ backgroundColor: `${config.color}15`, color: config.color }}
        >
          <Icon size={12} />
        </div>
        <span
          className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full truncate"
          style={{ backgroundColor: `${config.color}15`, color: config.color }}
        >
          {categoryLabel}
        </span>
      </div>

      <h4 className="text-xs font-bold text-ink-900 leading-snug line-clamp-2" dir="auto">
        {node.title}
      </h4>

      {node.summary && (
        <p className="mt-1 text-[11px] text-ink-500 line-clamp-2 leading-relaxed" dir="auto">
          {node.summary}
        </p>
      )}
    </div>
  )
}

const nodeTypes = {
  brainNode: CustomBrainNode,
}

/** Compute an organized category cluster layout for the nodes */
function calculateClusterPositions(nodes: BrainNode[], cx = 550, cy = 360): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>()
  const byCategory = (cat: BrainCategory) => nodes.filter((n) => n.category === cat)

  // 1. Center: Company Profile
  const profile = byCategory('company_profile')[0]
  if (profile) {
    positions.set(profile.id, { x: cx, y: cy })
  }

  // 2. Upper-Right: Products & Services (Offerings)
  const offerings = byCategory('offering')
  offerings.forEach((n, i) => {
    const col = i % 2
    const row = Math.floor(i / 2)
    positions.set(n.id, { x: cx + 280 + col * 220, y: cy - 200 + row * 130 })
  })

  // 3. Upper-Left: Audience & Market
  const audiences = byCategory('audience')
  audiences.forEach((n, i) => {
    positions.set(n.id, { x: cx - 350 - (i % 2) * 110, y: cy - 180 + i * 140 })
  })

  // 4. Lower-Left: Brand & Messaging, Positioning
  const brandRules = [...byCategory('brand_rule'), ...byCategory('positioning')]
  brandRules.forEach((n, i) => {
    positions.set(n.id, { x: cx - 340 - (i % 2) * 90, y: cy + 120 + i * 130 })
  })

  // 5. Lower-Right: Company Facts & Competitors
  const facts = [...byCategory('company_fact'), ...byCategory('competitor')]
  facts.forEach((n, i) => {
    const col = i % 2
    const row = Math.floor(i / 2)
    positions.set(n.id, { x: cx + 280 + col * 220, y: cy + 130 + row * 130 })
  })

  // 6. Remaining nodes: Radial arc around center
  const remaining = nodes.filter((n) => !positions.has(n.id))
  remaining.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / (remaining.length || 1)
    const r = 320
    positions.set(n.id, { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) })
  })

  return positions
}

export default function BrainGraph({
  nodes,
  edges,
  onEditNode,
}: {
  nodes: BrainNode[]
  edges: BrainEdge[]
  onEditNode?: (node: BrainNode) => void
}) {
  const { t } = useLang()
  const [selected, setSelected] = useState<BrainNode | null>(null)
  const [flowNodes, setFlowNodes] = useState<Node[]>([])

  // Category counts for the legend
  const categoryCounts = useMemo(() => {
    const map = new Map<BrainCategory, number>()
    for (const n of nodes) {
      map.set(n.category, (map.get(n.category) ?? 0) + 1)
    }
    return map
  }, [nodes])

  // Derive all active connections: merge database edges + logical connections so NO nodes are orphaned
  const completeEdges = useMemo(() => {
    const edgeList: { id: string; source: string; target: string; label: string }[] = []
    const seen = new Set<string>()

    // 1. Add DB edges first
    for (const e of edges) {
      const key = `${e.source_node_id}|${e.target_node_id}`
      if (!seen.has(key)) {
        seen.add(key)
        edgeList.push({
          id: e.id,
          source: e.source_node_id,
          target: e.target_node_id,
          label: e.relation_type.replace(/_/g, ' ').toLowerCase(),
        })
      }
    }

    // 2. Contextual heuristic connections so every node is visually part of the knowledge web
    const byCategory = (cat: BrainCategory) => nodes.filter((n) => n.category === cat)
    const profile = byCategory('company_profile')[0] || nodes[0]

    const addLink = (sourceId?: string, targetId?: string, label = 'related to') => {
      if (!sourceId || !targetId || sourceId === targetId) return
      const k1 = `${sourceId}|${targetId}`
      const k2 = `${targetId}|${sourceId}`
      if (!seen.has(k1) && !seen.has(k2)) {
        seen.add(k1)
        edgeList.push({
          id: `derived-${sourceId}-${targetId}`,
          source: sourceId,
          target: targetId,
          label,
        })
      }
    }

    // Connect offerings to audience
    for (const offering of byCategory('offering')) {
      for (const audience of byCategory('audience')) {
        addLink(offering.id, audience.id, 'targets')
      }
      if (profile && profile.id !== offering.id) {
        addLink(profile.id, offering.id, 'offers')
      }
    }

    // Connect brand rules to profile
    for (const rule of byCategory('brand_rule')) {
      addLink(rule.id, profile?.id, 'has tone')
    }

    // Connect positioning to profile
    for (const pos of byCategory('positioning')) {
      addLink(pos.id, profile?.id, 'differentiates')
    }

    // Connect facts to profile
    for (const fact of byCategory('company_fact')) {
      addLink(fact.id, profile?.id, 'fact of')
    }

    // Connect competitors to profile
    for (const comp of byCategory('competitor')) {
      addLink(comp.id, profile?.id, 'competes with')
    }

    return edgeList
  }, [nodes, edges])

  // Initialize and update node positions
  const resetLayout = useCallback(() => {
    const initialPositions = calculateClusterPositions(nodes)

    const newFlowNodes: Node<BrainNodeData>[] = nodes.map((n) => {
      const pos = initialPositions.get(n.id) ?? { x: 500, y: 350 }
      return {
        id: n.id,
        type: 'brainNode',
        position: pos,
        data: {
          node: n,
          categoryLabel: String(t(`cat_${n.category}` as never) ?? n.category),
        },
      }
    })

    setFlowNodes(newFlowNodes)
  }, [nodes, t])

  useEffect(() => {
    const initialPositions = calculateClusterPositions(nodes)

    setFlowNodes((prev) => {
      const prevPosMap = new Map(prev.map((n) => [n.id, n.position]))

      // ALWAYS DISPLAY ALL NODES — NEVER FILTER THEM OUT!
      return nodes.map((n) => {
        const pos = prevPosMap.get(n.id) ?? initialPositions.get(n.id) ?? { x: 500, y: 350 }
        return {
          id: n.id,
          type: 'brainNode',
          position: pos,
          data: {
            node: n,
            categoryLabel: String(t(`cat_${n.category}` as never) ?? n.category),
          },
        }
      })
    })
  }, [nodes, t])

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setFlowNodes((nds) => applyNodeChanges(changes, nds))
  }, [])

  // Format ReactFlow edges
  const flowEdges: Edge[] = useMemo(() => {
    return completeEdges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      type: 'smoothstep',
      animated: true,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: '#0d9488',
        width: 14,
        height: 14,
      },
      style: { stroke: '#0d9488', strokeWidth: 1.8, strokeDasharray: '4,4' },
      labelStyle: { fontSize: 10, fill: '#0f766e', fontWeight: 600 },
      labelBgStyle: { fill: '#ffffff', stroke: '#ccfbf1', strokeWidth: 1.5, rx: 6, ry: 6 },
      labelBgPadding: [6, 3],
    }))
  }, [completeEdges])

  return (
    <div className="relative h-[65vh] min-h-[420px] sm:h-[75vh] overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-2xs">
      {/* Graph Top Toolbar & Category Legend */}
      <div className="absolute inset-x-0 top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 bg-white/90 px-4 py-2.5 backdrop-blur-xs">
        <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto no-scrollbar">
          <span className="text-xs font-bold text-ink-700 me-1">
            {nodes.length} Nodes
          </span>
          {[...categoryCounts.entries()].map(([cat, count]) => {
            const config = CATEGORY_CONFIG[cat]
            return (
              <span
                key={cat}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border"
                style={{
                  backgroundColor: `${config.color}10`,
                  color: config.color,
                  borderColor: `${config.color}30`,
                }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: config.color }} />
                <span>{t(`cat_${cat}` as never)}</span>
                <span className="opacity-75">({count})</span>
              </span>
            )
          })}
        </div>

        <button
          type="button"
          onClick={resetLayout}
          className="btn-secondary px-2.5 py-1 text-xs inline-flex items-center gap-1.5 shadow-2xs text-ink-700 hover:text-ink-900"
          title="Reset nodes layout"
        >
          <RotateCcw size={13} />
          <span>Reset Layout</span>
        </button>
      </div>

      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        nodesDraggable={true}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        onNodeClick={(_, node) => {
          const found = nodes.find((n) => n.id === node.id)
          if (found) setSelected(found)
        }}
      >
        <Background color="#cbd5e1" gap={18} size={1} />
        <Controls className="!border-ink-200 !shadow-sm !rounded-xl overflow-hidden" />
      </ReactFlow>

      {flowNodes.length === 0 && (
        <p className="absolute inset-0 flex items-center justify-center text-sm text-ink-400">
          {t('noCandidates')}
        </p>
      )}

      {/* Selected Node Details Slide-Out Drawer */}
      {selected && (
        <div className="absolute inset-x-3 bottom-3 sm:bottom-auto sm:inset-x-auto sm:end-4 sm:top-14 sm:w-88 max-w-md rounded-2xl border border-ink-200 bg-white p-4 shadow-xl z-20 animate-fade-up">
          <div className="flex items-start justify-between border-b border-ink-100 pb-2.5">
            <span
              className="badge text-xs font-semibold border"
              style={{
                backgroundColor: `${CATEGORY_CONFIG[selected.category]?.color}15`,
                color: CATEGORY_CONFIG[selected.category]?.color,
                borderColor: `${CATEGORY_CONFIG[selected.category]?.color}30`,
              }}
            >
              {t(`cat_${selected.category}` as never)}
            </span>
            <button
              onClick={() => setSelected(null)}
              className="rounded-lg p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
            >
              <X size={16} />
            </button>
          </div>

          <h3 className="mt-3 font-bold text-sm sm:text-base text-ink-900 leading-snug" dir="auto">
            {selected.title}
          </h3>

          <p className="mt-2 text-xs leading-relaxed text-ink-600 max-h-48 overflow-y-auto" dir="auto">
            {selected.summary}
          </p>

          <div className="mt-4 flex items-center justify-between border-t border-ink-100 pt-2.5">
            <span className="text-[11px] text-ink-400 truncate max-w-[160px]" dir="ltr">
              {selected.source_detail || selected.source}
            </span>
            {onEditNode && (
              <button
                type="button"
                onClick={() => {
                  const nodeToEdit = selected
                  setSelected(null)
                  onEditNode(nodeToEdit)
                }}
                className="btn-secondary px-2.5 py-1 text-xs inline-flex items-center gap-1 shadow-2xs"
              >
                <Pencil size={12} />
                <span>{t('edit')}</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
