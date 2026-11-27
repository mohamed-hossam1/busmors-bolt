import { redirect } from 'next/navigation'
import { requireAdminPage } from '@/server/admin/auth'
import { getRequestLocale } from '@/server/locale'
import { localizePath } from '@/lib/i18n'

/** Admin entry point: authenticated operators land on the Promo Control Center. */
export default async function AdminIndexPage() {
  await requireAdminPage('/admin/promos')
  redirect(localizePath('/admin/promos', await getRequestLocale()))
}