import { redirect } from 'next/navigation'
import { getIdentity } from '@/server/auth'
import { isAdminUser } from '@/server/admin/identity'
import { getRequestLocale } from '@/server/locale'
import { localizePath } from '@/lib/i18n'
import MarketingLandingPage from '@/features/marketing/ui/MarketingLandingPage'

export default async function Page() {
  const identity = await getIdentity()
  if (identity && isAdminUser(identity.user)) {
    const locale = await getRequestLocale()
    redirect(localizePath('/admin', locale))
  }
  return <MarketingLandingPage initialAuthenticated={Boolean(identity?.user)} />
}

