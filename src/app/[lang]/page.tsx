import { getIdentity } from '@/server/auth'
import MarketingLandingPage from '@/features/marketing/ui/MarketingLandingPage'

export default async function Page() {
  const identity = await getIdentity()
  return <MarketingLandingPage initialAuthenticated={Boolean(identity?.user)} />
}
