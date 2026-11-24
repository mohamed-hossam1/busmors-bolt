import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const root = process.cwd()

test('Roadmap Ask my Director no longer calls the retired research RPC', () => {
  const api = readFileSync(`${root}/src/features/roadmap/api.ts`, 'utf8')
  const wizard = readFileSync(`${root}/src/features/roadmap/DiscoveryWizard.tsx`, 'utf8')
  assert.equal(api.includes('start_question_research'), false)
  assert.equal(api.includes('startQuestionResearch'), false)
  assert.equal(wizard.includes('startQuestionResearch'), false)
})

test('Roadmap step-task delegation is disabled at the API boundary', () => {
  const route = readFileSync(`${root}/src/app/api/roadmap/route.ts`, 'utf8')
  const plan = readFileSync(`${root}/src/features/roadmap/RoadmapPlan.tsx`, 'utf8')
  assert.equal(route.includes("db.rpc('start_roadmap_step_task'"), false)
  assert.equal(plan.includes('startRoadmapStepTask'), false)
  assert.equal(existsSync(`${root}/src/features/roadmap/RoadmapResearchPanel.tsx`), false)
})

test('the retired roadmap research proposal module is absent', () => {
  assert.equal(existsSync(`${root}/src/server/roadmap/proposal.ts`), false)
})