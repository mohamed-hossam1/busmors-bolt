import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  appendMessage,
  createConversation,
  deleteConversation,
  listConversations,
  loadMessages,
  renameConversation,
  titleFromMessage,
  DEFAULT_CONVERSATION_TITLE,
  type ConversationSupabase,
} from '../../src/server/employee/conversation-store'

type Op = 'select' | 'insert' | 'update' | 'delete'

interface RecordedBuilder {
  table: string
  op: Op
  payload: unknown
  filters: Array<[string, unknown]>
  order?: [string, { ascending?: boolean } | undefined]
  limit?: number
}

type Handler = (
  table: string,
  op: Op,
  builder: RecordedBuilder,
) => { data?: unknown; error?: unknown } | Promise<{ data?: unknown; error?: unknown }>

/**
 * Minimal thenable Supabase-like fake. Each builder records its filters/order/
 * limit and resolves to the handler's result, so tests can assert both the
 * returned mapping and the scoping filters applied.
 */
function createFakeSupabase(handler: Handler): {
  supabase: ConversationSupabase
  builders: RecordedBuilder[]
} {
  const builders: RecordedBuilder[] = []

  const makeBuilder = (table: string, op: Op, payload: unknown): RecordedBuilder & { then: unknown } => {
    const builder = {
      table,
      op,
      payload,
      filters: [] as Array<[string, unknown]>,
      eq(column: string, value: unknown) {
        builder.filters.push([column, value])
        return builder
      },
      order(column: string, options?: { ascending?: boolean }) {
        builder.order = [column, options]
        return builder
      },
      limit(count: number) {
        builder.limit = count
        return builder
      },
      then(onfulfilled?: (value: { data: unknown; error: unknown }) => unknown, onrejected?: (reason: unknown) => unknown) {
        const result = handler(table, op, builder) as { data: unknown; error: unknown }
        return Promise.resolve(result).then(onfulfilled, onrejected)
      },
    } as unknown as RecordedBuilder & { then: unknown }
    builders.push(builder)
    return builder
  }

  const supabase = {
    from(table: string) {
      return {
        select(columns: string) {
          return makeBuilder(table, 'select', { columns })
        },
        insert(row: unknown) {
          return makeBuilder(table, 'insert', row)
        },
        update(row: unknown) {
          return makeBuilder(table, 'update', row)
        },
        delete() {
          return makeBuilder(table, 'delete', null)
        },
      }
    },
  } as unknown as ConversationSupabase

  return { supabase, builders }
}

describe('titleFromMessage', () => {
  it('collapses whitespace and truncates long titles with an ellipsis', () => {
    assert.equal(titleFromMessage('  Save   this   fact  '), 'Save this fact')
    const long = 'a'.repeat(120)
    const titled = titleFromMessage(long)
    assert.ok(titled.endsWith('…'))
    assert.ok(Array.from(titled).length <= 61)
  })

  it('returns the default title for empty input', () => {
    assert.equal(titleFromMessage('   '), DEFAULT_CONVERSATION_TITLE)
  })
})

describe('createConversation', () => {
  it('inserts a workspace-scoped row and echoes it back', async () => {
    const { supabase, builders } = createFakeSupabase(() => ({ error: null }))
    const conversation = await createConversation(supabase, {
      id: 'conv-1',
      workspace_id: 'ws-1',
      user_id: 'user-1',
      title: 'My chat',
    })
    assert.equal(conversation.id, 'conv-1')
    assert.equal(conversation.title, 'My chat')
    const insert = builders.find((b) => b.op === 'insert')!
    assert.equal(insert.table, 'employee_conversations')
    assert.deepEqual(insert.payload, {
      id: 'conv-1',
      workspace_id: 'ws-1',
      user_id: 'user-1',
      title: 'My chat',
    })
  })

  it('surfaces a database error as a thrown Error', async () => {
    const { supabase } = createFakeSupabase(() => ({ error: { message: 'boom' } }))
    await assert.rejects(
      () =>
        createConversation(supabase, {
          id: 'conv-1',
          workspace_id: 'ws-1',
          user_id: 'user-1',
          title: 'x',
        }),
      /could not be started/,
    )
  })
})

describe('listConversations', () => {
  it('filters by workspace, orders by updated_at desc, and maps rows', async () => {
    const { supabase, builders } = createFakeSupabase(() => ({
      data: [
        { id: 'c1', title: 'First', created_at: '2026-01-01', updated_at: '2026-01-02' },
        { id: 'c2', title: '', created_at: '2026-01-01', updated_at: '2026-01-03' },
      ],
      error: null,
    }))
    const conversations = await listConversations(supabase, 'ws-1')
    assert.equal(conversations.length, 2)
    assert.equal(conversations[1].title, DEFAULT_CONVERSATION_TITLE)
    const select = builders.find((b) => b.op === 'select')!
    assert.deepEqual(select.filters, [['workspace_id', 'ws-1']])
    assert.deepEqual(select.order, ['updated_at', { ascending: false }])
  })
})

describe('loadMessages', () => {
  it('orders ascending and normalizes role/metadata', async () => {
    const { supabase, builders } = createFakeSupabase(() => ({
      data: [
        { id: 'm1', conversation_id: 'c1', role: 'user', content: 'hi', metadata: null, created_at: 't1' },
        { id: 'm2', conversation_id: 'c1', role: 'assistant', content: 'hello', metadata: { traceId: 'x' }, created_at: 't2' },
      ],
      error: null,
    }))
    const messages = await loadMessages(supabase, 'c1')
    assert.equal(messages[0].role, 'user')
    assert.deepEqual(messages[0].metadata, {})
    assert.equal(messages[1].role, 'assistant')
    assert.deepEqual(messages[1].metadata, { traceId: 'x' })
    const select = builders.find((b) => b.op === 'select')!
    assert.deepEqual(select.filters, [['conversation_id', 'c1']])
    assert.deepEqual(select.order, ['created_at', { ascending: true }])
  })
})

describe('appendMessage', () => {
  it('inserts the message with metadata', async () => {
    const { supabase, builders } = createFakeSupabase(() => ({ error: null }))
    await appendMessage(supabase, {
      id: 'm1',
      conversation_id: 'c1',
      role: 'assistant',
      content: 'done',
      metadata: { status: 'completed' },
    })
    const insert = builders.find((b) => b.op === 'insert')!
    assert.equal(insert.table, 'employee_messages')
    assert.deepEqual(insert.payload, {
      id: 'm1',
      conversation_id: 'c1',
      role: 'assistant',
      content: 'done',
      metadata: { status: 'completed' },
    })
  })
})

describe('deleteConversation', () => {
  it('scopes the delete by id AND workspace', async () => {
    const { supabase, builders } = createFakeSupabase(() => ({ error: null }))
    await deleteConversation(supabase, 'c1', 'ws-1')
    const del = builders.find((b) => b.op === 'delete')!
    assert.deepEqual(del.filters, [
      ['id', 'c1'],
      ['workspace_id', 'ws-1'],
    ])
  })
})

describe('renameConversation', () => {
  it('updates the title scoped by id', async () => {
    const { supabase, builders } = createFakeSupabase(() => ({ error: null }))
    await renameConversation(supabase, 'c1', '  New   title ')
    const update = builders.find((b) => b.op === 'update')!
    assert.deepEqual(update.payload, { title: 'New title' })
    assert.deepEqual(update.filters, [['id', 'c1']])
  })
})