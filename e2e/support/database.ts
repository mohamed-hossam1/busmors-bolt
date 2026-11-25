import { spawnSync } from 'node:child_process'
import { loadE2EEnv } from './env'

function redact(value: string) {
  return value.replace(/postgres(?:ql)?:\/\/[^\s@]+@/gi, 'postgresql://<redacted>@')
}

export function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

export function runSql(sql: string): string {
  const result = spawnSync('psql', [loadE2EEnv().databaseUrl, '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
    encoding: 'utf8', timeout: 90_000,
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`Postgres command failed: ${redact(result.stderr || result.stdout)}`)
  return result.stdout.trim()
}

export function queryRows<T>(query: string): T[] {
  const output = runSql(`SELECT coalesce(jsonb_agg(to_jsonb(e2e_row)), '[]'::jsonb) FROM (${query}) AS e2e_row`)
  return JSON.parse(output || '[]') as T[]
}

export function verifyRequiredSchema() {
  const rows = queryRows<{ missing: string[] }>(`
    SELECT array_remove(ARRAY[
      CASE WHEN to_regprocedure('public.bootstrap_workspace()') IS NULL THEN 'bootstrap_workspace' END,
      CASE WHEN to_regprocedure('public.save_crawl_brain(text,jsonb,jsonb,integer,boolean)') IS NULL THEN 'save_crawl_brain' END,
      CASE WHEN to_regclass('public.deliverables') IS NULL THEN 'deliverables' END,
      CASE WHEN to_regclass('public.post_versions') IS NULL THEN 'post_versions' END,
      CASE WHEN to_regclass('public.publish_attempts') IS NULL THEN 'publish_attempts' END
    ], NULL) AS missing
  `)
  const missing = rows[0]?.missing ?? []
  if (missing.length) throw new Error(`E2E database is missing required migrations: ${missing.join(', ')}`)
}

export function cleanupAccounts(ids: string[]) {
  const safe = ids.filter(id => /^[0-9a-f-]{36}$/i.test(id))
  if (!safe.length) return
  const values = safe.map(sqlLiteral).join(',')
  // brain_before_delete writes an audit row. Delete Brain rows while their
  // workspace still exists, then let auth/workspace cascades remove the rest.
  runSql(`BEGIN; DELETE FROM public.brain_nodes WHERE workspace_id IN (${values}); DELETE FROM auth.users WHERE id IN (${values}); COMMIT;`)
}
