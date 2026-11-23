'use server'
import { getIdentity } from './auth'
export async function removeAiKey() {
 const identity = await getIdentity()
 if (!identity) return { error: 'Sign in to update your AI settings.' }
 const { error } = await identity.supabase.from('ai_keys').delete().eq('workspace_id', identity.user.id)
 return { error: error ? 'Your key could not be removed. Please retry.' : null }
}
export async function saveAiKey(input: { provider: string; model: string; key: string; baseUrl: string | null }) {
 const identity = await getIdentity()
 if (!identity) return { error: 'Sign in to update your AI settings.' }
 if (!['openai','groq','anthropic','google','openrouter','dahl','custom'].includes(input.provider) || !input.model?.trim() || input.model.length > 200 || input.key?.length < 8 || input.key?.length > 4000) return { error: 'Check the provider, model and API key.' }
 if (input.provider === 'custom' && !(process.env.AI_ALLOWED_BASE_URLS ?? '').split(',').map(url => url.trim()).includes(input.baseUrl ?? '')) return { error: 'This custom endpoint has not been configured by the workspace administrator.' }
 const { error } = await identity.supabase.rpc('save_ai_key', { p_provider: input.provider, p_model: input.model.trim(), p_key: input.key.trim(), p_base_url: input.provider === 'custom' ? input.baseUrl : null })
 if (error) {
  console.error('save_ai_key error:', error)
 }
 return { error: error ? 'Your key could not be saved. Check the inputs and retry.' : null }
}
