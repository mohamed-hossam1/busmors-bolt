import { getIdentity } from '@/server/auth'
import { redirect } from 'next/navigation'
import { localizePath } from '@/lib/i18n'
import { getRequestLocale } from '@/server/locale'
import SignUp from '@/screens/auth/SignUp'

export default async function SignUpPage() {
  const identity = await getIdentity()
  if (identity) {
    const locale = await getRequestLocale()
    redirect(localizePath('/employee', locale))
  }
  return <SignUp />
}
