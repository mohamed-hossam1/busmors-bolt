import type { AdAccount } from './contracts'

// These mirror `locales` / `defaultLocale` in src/lib/i18n.ts. They are declared here,
// not imported, because src/lib/i18n.ts imports en.json and the Node test loader cannot
// load a JSON import.
const ADS_LOCALES = ['ar', 'en'] as const
const ADS_DEFAULT_LOCALE = 'ar'

export type AccountChoiceOutcome =
  | { kind: 'none' }
  | { kind: 'auto'; account: AdAccount }
  | { kind: 'choose'; accounts: AdAccount[] }

/**
 * Decides what to do after a Meta Ads account finishes connecting. Inactive accounts are
 * dropped; a single active account is auto-selected; several active accounts are returned
 * sorted by name with localeCompare so the chooser shows a stable order.
 */
export function chooseAccountOutcome(accounts: AdAccount[]): AccountChoiceOutcome {
  const active = accounts.filter((account) => account.active).sort((a, b) => a.name.localeCompare(b.name))
  if (active.length === 0) return { kind: 'none' }
  if (active.length === 1) return { kind: 'auto', account: active[0] }
  return { kind: 'choose', accounts: active }
}

/**
 * Builds the /ads redirect path. Redirecting straight to the locale path avoids a second
 * redirect through src/proxy.ts. The locale is the cookie locale when it is a known
 * locale, otherwise the default locale.
 */
export function adsRedirectPath(cookieLocale: string | undefined, result: string): string {
  const locale = cookieLocale && (ADS_LOCALES as readonly string[]).includes(cookieLocale) ? cookieLocale : ADS_DEFAULT_LOCALE
  return '/' + locale + '/ads?meta=' + encodeURIComponent(result)
}