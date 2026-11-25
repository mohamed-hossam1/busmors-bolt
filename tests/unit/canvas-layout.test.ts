import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildTopDownLayout, type CanvasNode, type CanvasEdge } from '../../src/components/chat/agentCanvasGraph'
import { emptyCanvasUsage } from '../../src/components/chat/agentCanvasGraph'

function makeNode(id: string, kind: CanvasNode['kind'], order = 0): CanvasNode {
  return {
    id,
    instanceId: id,
    kind,
    agentId: id,
    label: id,
    objective: id,
    state: 'completed',
    icon: 'bot',
    color: '#000',
    sources: 0,
    consumption: emptyCanvasUsage(),
    startedAt: null,
    endedAt: null,
    failureReason: null,
    parametersRedacted: {},
    messages: [],
    order,
  }
}

describe('buildTopDownLayout', () => {
  it('strictly increases y coordinates top-to-bottom: User < Orchestrator < Director < Subagents', () => {
    const user = makeNode('user', 'user', 0)
    const orch = makeNode('orch', 'orchestrator', 1)
    const dir = makeNode('dir', 'director', 2)
    const research = makeNode('research', 'subagent', 3)

    const edges: CanvasEdge[] = [
      { id: 'e1', from: 'user', to: 'orch', kind: 'flow', message: '', animated: false },
      { id: 'e2', from: 'orch', to: 'dir', kind: 'delegation', message: '', animated: true },
      { id: 'e3', from: 'dir', to: 'research', kind: 'delegation', message: '', animated: true },
    ]

    const layout = buildTopDownLayout([user, orch, dir, research], edges)

    const userPos = layout.get('user')!
    const orchPos = layout.get('orch')!
    const dirPos = layout.get('dir')!
    const researchPos = layout.get('research')!

    assert.ok(userPos && orchPos && dirPos && researchPos, 'all nodes placed')
    assert.ok(userPos.y < orchPos.y, `User (${userPos.y}) must be above Orchestrator (${orchPos.y})`)
    assert.ok(orchPos.y < dirPos.y, `Orchestrator (${orchPos.y}) must be above Director (${dirPos.y})`)
    assert.ok(dirPos.y < researchPos.y, `Director (${dirPos.y}) must be above Subagent (${researchPos.y})`)
  })

  it('centers same-depth subagents horizontally', () => {
    const dir = makeNode('dir', 'director', 0)
    const sub1 = makeNode('sub1', 'subagent', 1)
    const sub2 = makeNode('sub2', 'subagent', 2)

    const edges: CanvasEdge[] = [
      { id: 'e1', from: 'dir', to: 'sub1', kind: 'delegation', message: '', animated: true },
      { id: 'e2', from: 'dir', to: 'sub2', kind: 'delegation', message: '', animated: true },
    ]

    const layout = buildTopDownLayout([dir, sub1, sub2], edges)
    const pos1 = layout.get('sub1')!
    const pos2 = layout.get('sub2')!

    assert.equal(pos1.y, pos2.y, 'same-depth subagents share y coordinate')
    assert.notEqual(pos1.x, pos2.x, 'same-depth subagents have distinct horizontal x coordinates')
  })
})
