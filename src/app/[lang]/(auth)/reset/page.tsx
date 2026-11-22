import { getIdentity } from '@/server/auth'
import { redirect } from 'next/navigation'
import { localizePath } from '@/lib/i18n'
import { getRequestLocale } from '@/server/locale'
import ResetPassword from '@/screens/auth/ResetPassword'

export default async function ResetPasswordPage() {
  const identity = await getIdentity()
  if (identity) {
    const locale = await getRequestLocale()
    redirect(localizePath('/employee', locale))
  }
  return <ResetPassword />
}
