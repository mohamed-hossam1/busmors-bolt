const workspace = '11111111-1111-4111-8111-111111111111'

function createLegacyDatabase() {
  const tables = { brain_nodes: [], brain_edges: [], workspace_settings: [{ workspace_id: workspace }], audit_log: [] }
  const writes = []
  const failures = {}
  const db = {
    auth: { getSession: async () => ({ data: { session: { user: { id: workspace } } } }) },
    rpc: async () => ({ data: null, error: { code: 'PGRST202', message: 'function not found' } }),
    from(table) {
      let operation = 'select', payload, filters = []
      const query = {
        select: () => query,
        eq: (key, value) => { filters.push((row) => row[key] === value); return query },
        in: (key, values) => { filters.push((row) => values.includes(row[key])); return query },
        abortSignal: () => query,
        upsert: (rows, options) => {
          if (options.onConflict !== 'id' || !options.ignoreDuplicates) throw new Error('Compatibility writes must preserve existing IDs')
          operation = 'upsert'; payload = rows; return query
        },
        insert: (rows) => { operation = 'insert'; payload = rows; return query },
        update: (row) => { operation = 'update'; payload = row; return query },
        delete: () => { throw new Error('Compatibility saves must never delete knowledge') },
        then(resolve, reject) {
          if (failures[table + ':' + operation]) return Promise.resolve({ data: null, error: { message: 'simulated ' + table + ' failure' } }).then(resolve, reject)
          let rows = tables[table].filter((row) => filters.every((filter) => filter(row)))
          if (operation === 'update') rows.forEach((row) => Object.assign(row, payload))
          if (operation === 'upsert' || operation === 'insert') {
            rows = (Array.isArray(payload) ? payload : [payload]).map((row) => structuredClone(row))
            for (const row of rows) {
              if (table === 'brain_edges' && row.properties) throw new Error('Legacy edge schema has no properties column')
              if (operation === 'insert' || !tables[table].some((existing) => existing.id === row.id)) tables[table].push(row)
            }
          }
          if (operation !== 'select') writes.push({ table, operation, payload })
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject)
        },
      }
      return query
    },
  }
  return { db, tables, failures, writes, workspace }
}

module.exports = { createLegacyDatabase }
