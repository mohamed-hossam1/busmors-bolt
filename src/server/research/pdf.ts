import 'server-only'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import type { PdfInspect, PdfInspectTransport, PdfRenderTransport } from '../../features/research/deliverable/pdf'

const run = promisify(execFile)
const CHROME = process.env.CHROME_PATH ?? '/usr/bin/google-chrome'

/** Chromium headless print. No server-side rendering service is required. */
export function createPdfRenderer(): PdfRenderTransport {
  return {
    async print(html, options) {
      const workdir = await mkdtemp(join(tmpdir(), 'busmora-pdf-'))
      const htmlPath = join(workdir, 'report.html')
      await writeFile(htmlPath, html, 'utf8')
      await mkdir(dirname(options.pdfPath), { recursive: true })
      try {
        await run(CHROME, [
          '--headless=new',
          '--no-sandbox',
          '--disable-gpu',
          '--disable-dev-shm-usage',
          '--no-pdf-header-footer',
          '--virtual-time-budget=8000',
          `--print-to-pdf=${options.pdfPath}`,
          `file://${htmlPath}`,
        ], { timeout: 90000, maxBuffer: 1024 * 1024 * 8 })
      } finally {
        await readFile(options.pdfPath).catch(() => null)
      }
    },
  }
}

function parsePdfInfo(output: string): { pageCount: number; metadata: Record<string, string> } {
  const metadata: Record<string, string> = {}
  let pageCount = 0
  for (const line of output.split('\n')) {
    const match = /^([A-Za-z ]+):\s*(.*)$/.exec(line.trim())
    if (!match) continue
    const key = match[1].trim()
    const value = match[2].trim()
    if (key === 'Pages') pageCount = Number.parseInt(value, 10) || 0
    else if (value) metadata[key] = value
  }
  return { pageCount, metadata }
}

/** pdfinfo + pdftotext + pdftoppm give objective PDF QA without a vision model. */
export function createPdfInspector(): PdfInspectTransport {
  return {
    async inspect(pdfPath, options): Promise<PdfInspect> {
      await mkdir(options.outDir, { recursive: true })
      const [{ stdout }, text] = await Promise.all([
        run('pdfinfo', [pdfPath], { timeout: 30000, maxBuffer: 4 * 1024 * 1024 }),
        run('pdftotext', ['-layout', pdfPath, '-'], { timeout: 30000, maxBuffer: 8 * 1024 * 1024 }),
      ])
      const { pageCount, metadata } = parsePdfInfo(stdout)
      const pngs: string[] = []
      try {
        await run('pdftoppm', ['-png', '-r', '70', pdfPath, join(options.outDir, 'page')], { timeout: 60000, maxBuffer: 8 * 1024 * 1024 })
        const files = (await readdir(options.outDir)).filter(name => name.endsWith('.png')).sort()
        for (const file of files) pngs.push(join(options.outDir, file))
      } catch {
        // A missing renderer is reported by the visual_qa check, never silently passed.
      }
      return { pageCount, metadata, text: text.stdout, pngs }
    },
  }
}

export async function pdfBytes(pdfPath: string): Promise<Buffer> {
  return readFile(pdfPath)
}