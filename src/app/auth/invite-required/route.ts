import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/server/supabase'
import { localizePath } from '@/lib/i18n'
import { getRequestLocale } from '@/server/locale'

export async function GET(request: Request) {
 const url = new URL(request.url)
 const supabase = await createServerSupabase()
 await supabase.auth.signOut()
 const locale = await getRequestLocale()
 return NextResponse.redirect(new URL(localizePath('/signin?error=invite_required', locale), url))
}