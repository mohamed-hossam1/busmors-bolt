import QRCode from 'qrcode';
import { createClient } from '@supabase/supabase-js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomInt } from 'node:crypto';
import { normalizePhone } from '../src/lib/phone';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

interface PromoRow {
  code: string;
  status: string;
  redeemed_email: string | null;
  redeemed_phone: string | null;
  redeemed_by_workspace_id: string | null;
  heavy_tasks_limit: number;
}

interface WorkspaceAccessRow {
  workspace_id: string;
  heavy_tasks_limit: number;
  heavy_tasks_used?: number;
}

interface PromoInsert {
  code: string;
  heavy_tasks_limit: number;
  batch_label: string | null;
  expires_at: string | null;
}

interface QrCard {
  code: string;
  url: string;
  dataUrl: string;
}

interface ParsedArgs {
  subcommand: string | null;
  flags: Map<string, string>;
  help: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const flags = new Map<string, string>();
  const positionals: string[] = [];
  let help = false;
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--help' || token === '-h') {
      help = true;
      continue;
    }
    if (token.startsWith('--')) {
      const name = token.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('-')) {
        flags.set(name, next);
        i++;
      } else {
        flags.set(name, '');
      }
      continue;
    }
    positionals.push(token);
  }
  return { subcommand: positionals[0] ?? null, flags, help };
}

function printHelp(): void {
  console.log(`Busmora promo-code CLI

Usage:
  npm run promo -- <subcommand> [flags]

Subcommands:
  generate    Generate promo codes, insert them, and render QR PNGs + a
              self-contained cards.html and codes.csv.
  list        List promo codes as a text table.
  revoke      Revoke an active promo code.
  grant       Add heavy-task quota to an existing workspace.

Global flags:
  -h, --help  Show this help and exit.

generate flags:
  --count <n>          Number of codes to generate (default 10).
  --prefix <str>       Code prefix, upper-cased (default BUSM).
  --limit <n>          heavy_tasks_limit per code (default 6).
  --base-url <url>     Signup base URL (default http://localhost:3000).
  --locale <ar|en>     Signup locale segment (default ar).
  --batch <label>      Optional batch_label stored on each code.
  --expires-days <n>   Optional expiry, now + n days.
  --out <dir>          Output directory (default .scratch/promo-qr/<timestamp>).

list flags:
  --status <active|reserved|redeemed|revoked|all>  Filter (default all).
  --batch <label>                                   Filter by batch_label.

revoke flags:
  --code <CODE>        Code to revoke (required).

grant flags:
  --email <email>      Find workspace via redeemed_email (or use --phone).
  --phone <phone>      Find workspace via workspace_access.phone_number.
  --extra <n>          Amount to add to heavy_tasks_limit (default 1).

Environment:
  SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)
  SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY)`);
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function strFlag(flags: Map<string, string>, name: string, fallback: string): string {
  const raw = flags.get(name);
  return raw === undefined || raw === '' ? fallback : raw;
}

function optStr(flags: Map<string, string>, name: string): string | undefined {
  const raw = flags.get(name);
  return raw === undefined || raw === '' ? undefined : raw;
}

function intFlag(flags: Map<string, string>, name: string, fallback: number): number {
  const raw = flags.get(name);
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value)) fail(`--${name} must be an integer.`);
  return value;
}

function getEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  return undefined;
}

async function loadEnv(): Promise<void> {
  const envPath = path.join(REPO_ROOT, '.env');
  if (typeof process.loadEnvFile === 'function') {
    try {
      process.loadEnvFile(envPath);
      return;
    } catch {
      // Fall through to the manual parser below.
    }
  }
  let raw: string;
  try {
    raw = await readFile(envPath, 'utf8');
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const key = match[1];
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      // Strip inline comments for unquoted values, matching process.loadEnvFile:
      // a `#` at the start or preceded by whitespace begins a comment.
      value = value.replace(/(?:^|\s+)#.*$/, '').trimEnd();
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function createAdmin() {
  const url = getEnv('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL');
  const key = getEnv('SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    fail(
      'Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and ' +
        'SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) in the environment.',
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function randomSegment(): string {
  let segment = '';
  for (let i = 0; i < 4; i++) segment += ALPHABET[randomInt(ALPHABET.length)];
  return segment;
}

function randomCode(prefix: string): string {
  return `${prefix}-${randomSegment()}-${randomSegment()}`;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function loadExistingCodes(
  supabase: ReturnType<typeof createAdmin>,
  codes: string[],
): Promise<Set<string>> {
  const existing = new Set<string>();
  if (codes.length === 0) return existing;
  const { data } = await supabase.from('promo_codes').select('code').in('code', codes);
  for (const row of (data ?? []) as { code: string }[]) existing.add(row.code);
  return existing;
}

function buildCardsHtml(cards: QrCard[], locale: string, limit: number, batch?: string): string {
  const meta = [`${cards.length} code(s)`, `limit ${limit}`, batch ? `batch ${escapeHtml(batch)}` : '']
    .filter(Boolean)
    .join(' · ');
  const cardHtml = cards
    .map(
      (card) => `    <div class="card">
      <img class="qr" src="${card.dataUrl}" alt="QR code for ${escapeHtml(card.code)}" width="220" height="220" />
      <div class="code">${escapeHtml(card.code)}</div>
      <div class="url">${escapeHtml(card.url)}</div>
    </div>`,
    )
    .join('\n');
  return `<!doctype html>
<html lang="${escapeHtml(locale)}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Busmora promo codes</title>
<style>
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; margin: 0; padding: 24px; background: #f7f7f8; color: #111; }
h1 { font-size: 20px; margin: 0 0 4px; }
.meta { color: #555; margin: 0 0 20px; font-size: 13px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }
.card { background: #fff; border: 1px solid #e5e5e5; border-radius: 12px; padding: 16px; text-align: center; break-inside: avoid; }
.qr { display: block; margin: 0 auto 12px; }
.code { font-size: 18px; font-weight: 700; letter-spacing: 1px; }
.url { font-size: 12px; color: #444; margin-top: 6px; word-break: break-all; }
@media print { body { background: #fff; padding: 0; } .card { border-color: #ccc; } }
</style>
</head>
<body>
  <h1>Busmora invite codes</h1>
  <p class="meta">${meta}</p>
  <main class="grid">
${cardHtml}
  </main>
</body>
</html>`;
}

async function cmdGenerate(flags: Map<string, string>): Promise<void> {
  const count = intFlag(flags, 'count', 10);
  const limit = intFlag(flags, 'limit', 6);
  const expiresDays = intFlag(flags, 'expires-days', 0);
  const prefix = strFlag(flags, 'prefix', 'BUSM').toUpperCase() || 'BUSM';
  const baseUrl = stripTrailingSlash(strFlag(flags, 'base-url', 'http://localhost:3000'));
  const locale = strFlag(flags, 'locale', 'ar');
  const batch = optStr(flags, 'batch');
  const outArg = strFlag(flags, 'out', '');

  if (count <= 0) fail('--count must be a positive integer.');
  if (limit <= 0) fail('--limit must be a positive integer.');

  const supabase = createAdmin();

  const generated = new Set<string>();
  while (generated.size < count) generated.add(randomCode(prefix));
  let codes = [...generated];

  const existing = await loadExistingCodes(supabase, codes);
  if (codes.some((code) => existing.has(code))) {
    const regenerated = new Set<string>();
    while (regenerated.size < count) {
      const candidate = randomCode(prefix);
      if (!existing.has(candidate)) regenerated.add(candidate);
    }
    codes = [...regenerated];
  }

  const expiresAt =
    expiresDays > 0 ? new Date(Date.now() + expiresDays * 86_400_000).toISOString() : null;

  const rows: PromoInsert[] = codes.map((code) => ({
    code,
    heavy_tasks_limit: limit,
    batch_label: batch ?? null,
    expires_at: expiresAt,
  }));

  const { error: insertError } = await supabase.from('promo_codes').insert(rows);
  if (insertError) fail(`Insert failed: ${insertError.message}`);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.resolve(REPO_ROOT, outArg || path.join('.scratch', 'promo-qr', stamp));
  await mkdir(outDir, { recursive: true });

  const cards: QrCard[] = [];
  for (const code of codes) {
    const url = `${baseUrl}/${locale}/signup?promo=${code}`;
    await QRCode.toFile(path.join(outDir, `${code}.png`), url, { width: 512 });
    const dataUrl = await QRCode.toDataURL(url, { width: 512 });
    cards.push({ code, url, dataUrl });
  }

  const csvHeader = 'code,url,heavy_tasks_limit,batch_label,expires_at';
  const csvLines = cards.map((card) =>
    [card.code, card.url, String(limit), batch ?? '', expiresAt ?? ''].map(csvCell).join(','),
  );
  await writeFile(path.join(outDir, 'codes.csv'), [csvHeader, ...csvLines].join('\n'), 'utf8');

  const html = buildCardsHtml(cards, locale, limit, batch);
  await writeFile(path.join(outDir, 'cards.html'), html, 'utf8');

  console.log(`Generated ${cards.length} promo code(s).`);
  console.log(`Out dir: ${outDir}`);
  console.log(`Sample URL: ${cards[0]?.url ?? `${baseUrl}/${locale}/signup`}`);
}

function printTable(rows: PromoRow[], usage: Map<string, { used: number; limit: number }>): void {
  const headers = ['code', 'status', 'redeemed_email', 'redeemed_phone', 'used/limit'];
  const cells = rows.map((row) => {
    const stat = row.redeemed_by_workspace_id ? usage.get(row.redeemed_by_workspace_id) : undefined;
    const usedLimit = stat ? `${stat.used}/${stat.limit}` : `0/${row.heavy_tasks_limit}`;
    return [
      row.code,
      row.status,
      row.redeemed_email ?? '-',
      row.redeemed_phone ?? '-',
      usedLimit,
    ];
  });
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...cells.map((cell) => cell[index].length)),
  );
  const format = (values: string[]): string =>
    values.map((value, index) => value.padEnd(widths[index])).join('  ');
  console.log(format(headers));
  console.log(widths.map((width) => '-'.repeat(width)).join('  '));
  for (const cell of cells) console.log(format(cell));
}

async function cmdList(flags: Map<string, string>): Promise<void> {
  const status = strFlag(flags, 'status', 'all');
  const batch = optStr(flags, 'batch');
  const supabase = createAdmin();

  let query = supabase
    .from('promo_codes')
    .select('code, status, redeemed_email, redeemed_phone, redeemed_by_workspace_id, heavy_tasks_limit');
  if (status !== 'all') query = query.eq('status', status);
  if (batch) query = query.eq('batch_label', batch);

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) fail(`List failed: ${error.message}`);

  const rows = (data ?? []) as PromoRow[];
  if (rows.length === 0) {
    console.log('No promo codes found.');
    return;
  }

  const workspaceIds = [
    ...new Set(
      rows
        .map((row) => row.redeemed_by_workspace_id)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const usage = new Map<string, { used: number; limit: number }>();
  if (workspaceIds.length > 0) {
    const { data: accessRows, error: accessError } = await supabase
      .from('workspace_access')
      .select('workspace_id, heavy_tasks_limit, heavy_tasks_used')
      .in('workspace_id', workspaceIds);
    if (accessError) fail(`List failed: ${accessError.message}`);
    for (const access of (accessRows ?? []) as WorkspaceAccessRow[]) {
      usage.set(access.workspace_id, {
        used: access.heavy_tasks_used ?? 0,
        limit: access.heavy_tasks_limit,
      });
    }
  }

  printTable(rows, usage);
  console.log(`\n${rows.length} code(s).`);
}

async function cmdRevoke(flags: Map<string, string>): Promise<void> {
  const code = strFlag(flags, 'code', '').trim().toUpperCase();
  if (!code) fail('Missing --code.');
  const supabase = createAdmin();

  const { data, error } = await supabase
    .from('promo_codes')
    .update({ status: 'revoked' })
    .eq('code', code)
    .eq('status', 'active')
    .select('code');
  if (error) fail(`Revoke failed: ${error.message}`);

  const changed = (data ?? []) as { code: string }[];
  if (changed.length === 0) {
    fail(`No active promo code found for ${code} (nothing revoked).`);
  }
  console.log(`Revoked ${changed.length} code(s): ${changed.map((row) => row.code).join(', ')}`);
}

async function cmdGrant(flags: Map<string, string>): Promise<void> {
  const email = optStr(flags, 'email');
  const phone = optStr(flags, 'phone');
  const extra = intFlag(flags, 'extra', 1);
  if (!email && !phone) fail('Provide --email or --phone.');
  if (extra <= 0) fail('--extra must be a positive integer.');

  const supabase = createAdmin();
  let workspaceId: string;
  let before: number;

  if (phone) {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone.ok) fail(`Invalid --phone: ${phone}`);
    const { data, error } = await supabase
      .from('workspace_access')
      .select('workspace_id, heavy_tasks_limit')
      .eq('phone_number', normalizedPhone.normalized)
      .maybeSingle();
    if (error) fail(`Grant failed: ${error.message}`);
    const row = data as WorkspaceAccessRow | null;
    if (!row) fail(`No workspace found for phone ${normalizedPhone.normalized}.`);
    workspaceId = row.workspace_id;
    before = row.heavy_tasks_limit;
  } else {
    const normalizedEmail = (email as string).trim().toLowerCase();
    const { data, error } = await supabase
      .from('promo_codes')
      .select('redeemed_by_workspace_id')
      .eq('redeemed_email', normalizedEmail)
      .not('redeemed_by_workspace_id', 'is', null)
      .maybeSingle();
    if (error) fail(`Grant failed: ${error.message}`);
    const promo = data as { redeemed_by_workspace_id: string } | null;
    if (!promo) fail(`No redeemed promo code found for email ${normalizedEmail}.`);
    workspaceId = promo.redeemed_by_workspace_id;

    const { data: access, error: accessError } = await supabase
      .from('workspace_access')
      .select('workspace_id, heavy_tasks_limit')
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (accessError) fail(`Grant failed: ${accessError.message}`);
    const accessRow = access as WorkspaceAccessRow | null;
    if (!accessRow) fail(`No workspace_access row for ${normalizedEmail}.`);
    before = accessRow.heavy_tasks_limit;
  }

  const after = before + extra;
  const { error: updateError } = await supabase
    .from('workspace_access')
    .update({ heavy_tasks_limit: after, updated_at: new Date().toISOString() })
    .eq('workspace_id', workspaceId);
  if (updateError) fail(`Grant failed: ${updateError.message}`);

  console.log(`Updated workspace ${workspaceId}: heavy_tasks_limit ${before} -> ${after}.`);
}

async function main(): Promise<void> {
  const { subcommand, flags, help } = parseArgs(process.argv.slice(2));

  if (help || subcommand === null) {
    printHelp();
    return;
  }

  await loadEnv();

  switch (subcommand) {
    case 'generate':
      await cmdGenerate(flags);
      break;
    case 'list':
      await cmdList(flags);
      break;
    case 'revoke':
      await cmdRevoke(flags);
      break;
    case 'grant':
      await cmdGrant(flags);
      break;
    default:
      console.error(`Unknown subcommand: ${subcommand}`);
      printHelp();
      process.exit(1);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exit(1);
});