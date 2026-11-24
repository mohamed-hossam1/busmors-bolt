import { NextResponse } from 'next/server'
import { getIdentity } from '@/server/auth'
import { isAdminUser } from '@/server/admin/auth'

export async function GET() {
  const identity = await getIdentity()
  const isAdmin = isAdminUser(identity?.user)
  return NextResponse.json({ isAdmin })
}
