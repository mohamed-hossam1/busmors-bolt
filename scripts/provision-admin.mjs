#!/usr/bin/env node
// Provision the admin operator account for the execution observability dashboard.
//
// Idempotent and secret-safe:
//   - finds an existing auth user by ADMIN_EMAIL, or creates one,
//   - optionally resets the password when ADMIN_PASSWORD is provided,
//   - prints the user id so it can be pinned in ADMIN_USER_ID.
//
// Required env: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and
// SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY).
//   ADMIN_EMAIL     operator email (required)
//   ADMIN_PASSWORD  operator password (optional; set/reset when provided)

import { createClient } from '@supabase/supabase-js'

function loadEnv() {
  try {
    process.loadEnvFile?.('.env')
  } catch {
    /* Explicit environment variables still work. */
  }
}

function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}. Set it in the environment or .env.`)
  return value
}

async function findUserByEmail(admin, email) {
  const target = email.toLowerCase()
  let page = 1
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const users = data?.users ?? []
    const match = users.find((user) => (user.email ?? '').toLowerCase() === target)
    if (match) return match
    if (users.length < 200) return null
    page += 1
  }
}

async function main() {
  loadEnv()
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Missing SUPABASE_URL and SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY.')
  const email = required('ADMIN_EMAIL')
  const password = process.env.ADMIN_PASSWORD

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

  let user = await findUserByEmail(admin, email)
  if (user) {
    console.log(`Found existing user ${user.id} for ${email}.`)
    if (password) {
      const { error } = await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true })
      if (error) throw error
      console.log('Password reset for the admin user.')
    }
  } else {
    if (!password) throw new Error('ADMIN_PASSWORD is required to create a new admin user.')
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    if (error) throw error
    user = data.user
    console.log(`Created admin user ${user.id} for ${email}.`)
  }

  console.log('\nSet the following in your server environment so the dashboard grants access:')
  console.log(`ADMIN_USER_ID=${user.id}`)
  console.log(`ADMIN_EMAIL=${email}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})