import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { z } from 'zod'
import type { AgentTurnRunner } from '../../src/server/employee/agent-runtime'

type LooseTool = { execute: (input: unknown, options?: unknown) => Promise<unknown> }
type LooseTools = Record<string, LooseTool>

const originalEnv = {
  AI_MODE: process.env.AI_MODE,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  DAHL_API_KEY: process.env.DAHL_API_KEY,
}

let runtime: typeof import('../../src/server/employee/agent-runtime')
let registry: typeof import('../../src/server/employee/tool-registry')
let observability: typeof import('../../src/server/observability')

before(async () => {
  process.env.AI_MODE = 'test'
  process.env.GROQ_API_KEY = 'test-groq-key'
  process.env.DAHL_API_KEY = 'test-dahl-key'
  const tag = '?runtime-test=1'
  runtime = await import(`../../src/server/employee/agent-runtime.ts${tag}`)
  registry = await import(`../../src/server/employee/tool-registry.ts${tag}`)
  observability = await import(`../../src/server/observability/index.ts${tag}`)
})

after(() => {
  if (originalEnv.AI_MODE === undefined) delete process.env.AI_MODE
  else process.env.AI_MODE = originalEnv.AI_MODE
  if (originalEnv.GROQ_API_KEY === undefined) delete process.env.GROQ_API_KEY
  else process.env.GROQ_API_KEY = originalEnv.GROQ_API_KEY
  if (originalEnv.DAHL_API_KEY === undefined) delete process.env.DAHL_API_KEY
  else process.env.DAHL_API_KEY = originalEnv.DAHL_API_KEY
})

const TRACE_ID = '11111111-1111-4111-8111-111111111111'

function makeCollector() {
  const captured: { trace: unknown; events: unknown[] }[] = []
  const collector = observability.createTraceCollector(
    { traceId: TRACE_ID, workspaceId: 'ws-1', request: 'unit test' },
    {
      enabled: true,
      sink: async (trace, events) => {
        captured.push({ trace, events })
      },
    },
  )
  return { collector, captured }
}

function echoTool() {
  return {
    name: 'echo',
    description: 'Echo text back.',
    external: true,
    inputSchema: z.object({ text: z.string() }),
    execute: async (args: { text: string }) => ({ echo: args.text }),
  }
}

function loose(tools: unknown): LooseTools {
  return tools as LooseTools
}

describe('shared tool registry', () => {
  it('only exposes allow-listed tools and wraps execution with tracing + budget', async () => {
    ;(registry.ROLE_TOOL_ALLOWLIST as Record<string, string[]>).director = ['echo']
    const reg = registry.createToolRegistry([echoTool()])
    const { collector } = makeCollector()
    const tracker = new runtime.TaskGuardrailTracker()
    const tools = loose(
      registry.getToolsForRole('director', reg, {
        workspaceId: 'ws-1',
        tracker,
        collector,
        traceId: TRACE_ID,
        instanceId: 'inst-1',
      }),
    )

    assert.deepEqual(Object.keys(tools), ['echo'])
    const result = await tools.echo.execute({ text: 'hi' })
    assert.deepEqual(result, { echo: 'hi' })
    assert.equal(tracker.snapshot().externalToolCalls, 1)
    assert.deepEqual(tracker.listUsedTools(), ['echo'])

    await collector.flush()
  })

  it('blocks external tools once the external-call budget is exhausted', async () => {
    const reg = registry.createToolRegistry([echoTool()])
    const tracker = new runtime.TaskGuardrailTracker({
      activeExecutionTimeoutMs: 10_000,
      maxLlmCallsPerTask: 50,
      maxExternalToolCallsPerTask: 1,
      maxConcurrentSpecialistSubtasks: 3,
      maxRetriesPerFailedOperation: 2,
    })
    const tools = loose(
      registry.getToolsForRole('director', reg, {
        workspaceId: 'ws-1',
        tracker,
        traceId: TRACE_ID,
      }),
    )
    await tools.echo.execute({ text: 'one' })
    await assert.rejects(
      () => tools.echo.execute({ text: 'two' }),
      (error: unknown) => error instanceof registry.ToolBudgetError,
    )
    assert.equal(tracker.snapshot().externalToolCalls, 1)
  })

  it('rejects a workspace scope mismatch', async () => {
    const reg = registry.createToolRegistry([echoTool()])
    const tracker = new runtime.TaskGuardrailTracker()
    const tools = loose(
      registry.getToolsForRole('director', reg, {
        workspaceId: 'ws-1',
        tracker,
        traceId: TRACE_ID,
      }),
    )
    await assert.rejects(
      () => tools.echo.execute({ text: 'x', workspaceId: 'ws-2' }),
      (error: unknown) => error instanceof registry.ToolWorkspaceError,
    )
  })
})

describe('runAgent', () => {
  it('executes tools, records trace events, and returns a completed result', async () => {
    ;(registry.ROLE_TOOL_ALLOWLIST as Record<string, string[]>).director = ['echo']
    const reg = registry.createToolRegistry([echoTool()])
    const { collector, captured } = makeCollector()
    const tracker = new runtime.TaskGuardrailTracker()

    const runTurn: AgentTurnRunner = async (opts) => {
      const tools = loose(opts.tools)
      const echoResult = await tools.echo.execute({ text: 'hello' })
      const step = {
        index: 0,
        text: 'final answer',
        toolCalls: [{ toolName: 'echo' }],
        toolResults: [echoResult],
        usage: { inputTokens: 5, outputTokens: 3 },
        finishReason: 'stop',
      }
      opts.onStepFinish?.(step)
      return {
        text: 'final answer',
        provider: 'mock',
        model: 'mock-model',
        usage: { inputTokens: 5, outputTokens: 3 },
        steps: [step],
        finishReason: 'stop',
        latencyMs: 2,
        totalLatencyMs: 2,
        fallback: { used: false, attempts: [] },
      }
    }

    const result = await runtime.runAgent({
      role: 'director',
      systemPrompt: 'You are a test agent.',
      input: 'do the thing',
      tools: registry.getToolsForRole('director', reg, {
        workspaceId: 'ws-1',
        tracker,
        collector,
        traceId: TRACE_ID,
      }),
      workspaceId: 'ws-1',
      traceContext: { traceId: TRACE_ID },
      tracker,
      collector,
      runTurn,
    })

    assert.equal(result.status, 'completed')
    assert.equal(result.output, 'final answer')
    assert.deepEqual(result.usedTools, ['echo'])
    assert.equal(tracker.snapshot().llmCalls, 1)
    assert.equal(tracker.snapshot().externalToolCalls, 1)

    await collector.flush()
    assert.equal(captured.length, 1)
    const events = captured[0].events as Array<{ event_type: string; tool_name?: string | null }>
    const types = events.map((e) => e.event_type)
    assert.ok(types.includes('agent'))
    assert.ok(types.includes('model'))
    assert.ok(types.includes('tool'))
    const toolEvent = events.find((e) => e.event_type === 'tool')
    assert.equal(toolEvent?.tool_name, 'echo')
  })

  it('enforces the LLM-call budget and returns partial honestly', async () => {
    const { collector } = makeCollector()
    const tracker = new runtime.TaskGuardrailTracker({
      activeExecutionTimeoutMs: 10_000,
      maxLlmCallsPerTask: 2,
      maxExternalToolCallsPerTask: 100,
      maxConcurrentSpecialistSubtasks: 3,
      maxRetriesPerFailedOperation: 2,
    })

    const runTurn: AgentTurnRunner = async (opts) => {
      const steps: unknown[] = []
      let completed = 0
      while (!opts.shouldStop?.(completed) && completed < 10) {
        const step = {
          index: completed,
          text: `step ${completed}`,
          toolCalls: null,
          toolResults: null,
          usage: { inputTokens: 1, outputTokens: 1 },
          finishReason: 'tool-calls',
        }
        opts.onStepFinish?.(step)
        steps.push(step)
        completed += 1
      }
      return {
        text: 'partial output',
        provider: 'mock',
        model: 'mock-model',
        usage: { inputTokens: completed, outputTokens: completed },
        steps: steps as never,
        finishReason: 'stop',
        latencyMs: 1,
        totalLatencyMs: 1,
        fallback: { used: false, attempts: [] },
      }
    }

    const result = await runtime.runAgent({
      role: 'director',
      systemPrompt: 'test',
      input: 'loop',
      workspaceId: 'ws-1',
      traceContext: { traceId: TRACE_ID },
      tracker,
      collector,
      runTurn,
    })

    assert.equal(tracker.snapshot().llmCalls, 2)
    assert.equal(result.status, 'partial')
    assert.ok(['max_steps', 'budget_llm'].includes(result.stopReason))
  })
})