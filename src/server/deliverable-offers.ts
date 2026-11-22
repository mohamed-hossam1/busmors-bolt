'use server'
import { getIdentity } from './auth'

const offerIdPattern = /^[0-9a-f-]{36}$/i

function friendly(message: string | undefined): string {
 return message?.includes('NOT_FOUND') ? 'This result no longer exists.' : 'Could not save. Please retry.'
}

/** Saves an offered chat result to Deliverables. Idempotent on repeated calls. */
export async function acceptDeliverableOffer(offerId: string): Promise<{ deliverableId?: string; type?: string; error?: string }> {
 if (typeof offerId !== 'string' || !offerIdPattern.test(offerId)) return { error: 'This result no longer exists.' }
 const identity = await getIdentity()
 if (!identity) return { error: 'Sign in again.' }
 const { data, error } = await identity.supabase.rpc('accept_deliverable_offer', { p_offer_id: offerId })
 if (error) return { error: friendly(error.message) }
 const saved = data as { deliverableId?: string; type?: string } | null
 if (!saved?.deliverableId) return { error: 'Could not save. Please retry.' }
 return { deliverableId: saved.deliverableId, type: saved.type }
}

/** "Not now": marks an offered result as dismissed. It can still be saved later. */
export async function dismissDeliverableOffer(offerId: string): Promise<{ error?: string }> {
 if (typeof offerId !== 'string' || !offerIdPattern.test(offerId)) return { error: 'This result no longer exists.' }
 const identity = await getIdentity()
 if (!identity) return { error: 'Sign in again.' }
 const { error } = await identity.supabase.rpc('dismiss_deliverable_offer', { p_offer_id: offerId })
 if (error) return { error: error.message.includes('NOT_FOUND') ? 'This result no longer exists.' : 'Could not update. Please retry.' }
 return {}
}
