import type { Viewport, XYPosition } from 'reactflow'

type StorageAccess = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
export type ChatCanvasLayout = { positions: Record<string, XYPosition>; viewport?: Viewport }
const canvasKey = (conversationId: string) => `busmora:chat-canvas:${conversationId}`
const conversationKey = (workspaceId: string) => `busmora:active-conversation:${workspaceId}`
const isPosition = (value: unknown): value is XYPosition => typeof value === 'object' && value !== null
  && 'x' in value && 'y' in value && Number.isFinite(value.x) && Number.isFinite(value.y)

export function readCanvasLayout(conversationId: string | null, storage?: StorageAccess): ChatCanvasLayout {
  try {
    if (!conversationId) return { positions: {} }
    const value = JSON.parse((storage ?? localStorage).getItem(canvasKey(conversationId)) ?? 'null')
    if (!value || typeof value !== 'object') return { positions: {} }
    const positions = Object.fromEntries(Object.entries(value.positions ?? {}).filter(([, position]) => isPosition(position))) as Record<string, XYPosition>
    const viewport = isPosition(value.viewport) && Number.isFinite(value.viewport.zoom) && value.viewport.zoom > 0
      ? value.viewport as Viewport : undefined
    return { positions, viewport }
  } catch {
    return { positions: {} }
  }
}

export function saveCanvasLayout(conversationId: string | null, layout: ChatCanvasLayout, storage?: StorageAccess) {
  try {
    if (conversationId) (storage ?? localStorage).setItem(canvasKey(conversationId), JSON.stringify(layout))
  } catch { /* Canvas interaction still works when browser storage is unavailable. */ }
}

export function forgetCanvasLayout(conversationId: string) {
  try { localStorage.removeItem(canvasKey(conversationId)) } catch { /* Optional browser preference. */ }
}

export function readActiveConversation(workspaceId: string) {
  try { return localStorage.getItem(conversationKey(workspaceId)) } catch { return null }
}

export function saveActiveConversation(workspaceId: string, conversationId: string) {
  try { localStorage.setItem(conversationKey(workspaceId), conversationId) } catch { /* Optional browser preference. */ }
}
