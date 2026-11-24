import 'server-only'

function csv(value: string | undefined): string[] {
  return (value ?? '').split(',').map((entry) => entry.trim()).filter(Boolean)
}

export function adminUserIds(): string[] {
  return csv(process.env.ADMIN_USER_ID)
}

export function adminEmails(): string[] {
  return csv(process.env.ADMIN_EMAIL ?? process.env.ADMIN_EMAILS).map((email) => email.toLowerCase())
}

export interface AdminIdentityUser {
  id: string
  email?: string | null
}

export function isAdminUser(user: AdminIdentityUser | null | undefined): boolean {
  if (!user) return false
  if (adminUserIds().includes(user.id)) return true
  const email = user.email?.toLowerCase()
  return Boolean(email) && adminEmails().includes(email as string)
}
