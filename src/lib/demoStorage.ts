import type { ApprovalState, DemoBusiness, DemoPost, DemoTask } from '../data/landingDemoData'

export const DEMO_STORAGE_KEY = 'busmora:guest-demo'

export interface SavedDemoState {
  business: DemoBusiness
  task: DemoTask
  posts: DemoPost[]
  approvals: Record<string, ApprovalState>
  savedAt: string
}

export function saveDemoState(state: Omit<SavedDemoState, 'savedAt'>) {
  try {
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify({ ...state, savedAt: new Date().toISOString() }))
  } catch {
    // The demo still works when storage is unavailable.
  }
}

export function loadDemoState(): SavedDemoState | null {
  try {
    const value = localStorage.getItem(DEMO_STORAGE_KEY)
    return value ? (JSON.parse(value) as SavedDemoState) : null
  } catch {
    return null
  }
}
