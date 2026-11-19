import { rmSync } from 'node:fs'
import { resolve } from 'node:path'

// This directory is ignored, dedicated to Playwright, and contains no source.
rmSync(resolve('.next-e2e'), { recursive: true, force: true })
