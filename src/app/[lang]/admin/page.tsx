import { redirect } from 'next/navigation'
import { requireAdminPage } from '@/server/admin/auth'
import { getRequestLocale } from '@/server/locale'
import { localizePath } from '@/lib/i18n'

/** Admin entry point: authenticated operators land on the Trace Explorer. */
export default async function AdminIndexPage() {
  await requireAdminPage()
  redirect(localizePath('/admin/traces', await getRequestLocale()))
}