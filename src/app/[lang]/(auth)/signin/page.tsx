import { getIdentity } from '@/server/auth'
import { redirect } from 'next/navigation'
import { localizePath } from '@/lib/i18n'
import { getRequestLocale } from '@/server/locale'
import SignIn from '@/screens/auth/SignIn'

export default async function SignInPage() {
  const identity = await getIdentity()
  if (identity) {
    const locale = await getRequestLocale()
    redirect(localizePath('/employee', locale))
  }
  return <SignIn />
}
