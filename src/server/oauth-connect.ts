// [functions.oauth-connect]
// verify_jwt = false

import 'server-only'
import { createAdminClient } from './supabase-admin'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
}

type Platform = 'facebook' | 'instagram'

interface StateRow {
  workspace_id: string
  oauth_state: string
}

function appUrl(): string {
  return (process.env.OAUTH_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
}

function callbackUriFor(req: Request): string {
  return `${new URL(req.url).origin}/api/oauth/callback`
}

function adminClient() {
  return createAdminClient()
}

async function getSecret(name: string): Promise<string | null> {
  const admin = adminClient()
  const { data } = await admin.from('app_secrets').select('value').eq('name', name).maybeSingle()
  return data?.value ?? null
}

async function storeToken(name: string, value: string): Promise<void> {
  const admin = adminClient()
  await admin.from('app_secrets').upsert({ name, value }, { onConflict: 'name' })
}

export async function connectOAuth(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const admin = adminClient()

    // ---- STEP 1: start -> redirect the user to the platform's consent screen
    if (url.pathname.endsWith('/start')) {
      const platform = url.searchParams.get('platform') as Platform | null
      const token = req.headers.get('Authorization')?.replace(/^Bearer /, '') ?? ''
      if (!platform || !['facebook', 'instagram'].includes(platform)) {
        return new Response(JSON.stringify({ error: 'unknown_platform' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (!token) {
        return new Response(JSON.stringify({ error: 'missing_token' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      // verify the caller's JWT so we know which workspace is connecting
      const { data: userData, error: userError } = await admin.auth.getUser(token)
      if (userError || !userData.user) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const state = crypto.randomUUID()
      await admin
        .from('platform_connections')
        .upsert(
          { workspace_id: userData.user.id, platform, oauth_state: state, status: 'disconnected' },
          { onConflict: 'workspace_id,platform' }
        )

      const appId = await getSecret(`${platform}_app_id`)
      if (!appId) {
        // no developer app configured yet — tell the user instead of failing silently
        return Response.redirect(`${appUrl()}/settings?connect_error=not_configured&platform=${platform}`, 302)
      }

      const callbackUri = callbackUriFor(req)
      // instagram connects through the facebook login flow
      const appIdForDialog = platform === 'instagram' ? await getSecret('facebook_app_id') ?? appId : appId
      const scopes =
        platform === 'facebook'
          ? 'pages_show_list,pages_read_engagement,pages_manage_posts'
          : 'instagram_basic,instagram_content_publish,pages_show_list'
      const authorizeUrl =
        `https://www.facebook.com/v19.0/dialog/oauth?client_id=${encodeURIComponent(appIdForDialog)}` +
        `&redirect_uri=${encodeURIComponent(callbackUri)}&state=${state}&scope=${scopes}`

      // 302 the browser to the consent screen
      return new Response(null, {
        status: 302,
        headers: { ...corsHeaders, Location: authorizeUrl },
      })
    }

    // ---- STEP 2: platform redirects back here with ?code&state
    if (url.pathname.endsWith('/callback')) {
      const code = url.searchParams.get('code')
      const state = url.searchParams.get('state')
      if (!code || !state) return htmlPage('Connection failed', 'Missing authorization code.')

      // find which workspace/platform this state belongs to
      const { data: rows } = await admin
        .from('platform_connections')
        .select('workspace_id, oauth_state, platform')
        .eq('oauth_state', state)
        .maybeSingle()
      const row = rows as (StateRow & { platform: Platform }) | null
      if (!row) return htmlPage('Connection failed', 'Invalid or expired state. Please try connecting again.')

      const { data: claimed, error: claimError } = await admin.from('platform_connections')
        .update({ oauth_state: null }).eq('oauth_state', state).select('workspace_id').maybeSingle()
      if (claimError || !claimed) return htmlPage('Connection failed', 'This connection request has already been used.')
      const platform = row.platform
      const workspaceId = row.workspace_id

      // facebook / instagram share the graph api token exchange
      const appSecret = await getSecret(`${platform === 'instagram' ? 'facebook' : platform}_app_secret`)
      const callbackUri = callbackUriFor(req)
      let accessToken: string | null = null
      let expiresIn: number | null = null
      let username = ''
      let externalId = ''

      const tokenRes = await fetch(
        `https://graph.facebook.com/v19.0/oauth/access_token?` +
          `client_id=${encodeURIComponent((await getSecret(`${platform === 'instagram' ? 'facebook' : platform}_app_id`)) ?? '')}` +
          `&client_secret=${encodeURIComponent(appSecret ?? '')}` +
          `&redirect_uri=${encodeURIComponent(callbackUri)}&code=${encodeURIComponent(code)}`
      )
      if (!tokenRes.ok) return htmlPage('Connection failed', 'The platform rejected the connection. Please try again.')
      const tokenData = await tokenRes.json() as { access_token?: string; expires_in?: number }
      accessToken = tokenData.access_token ?? null
      expiresIn = tokenData.expires_in ?? null
      if (accessToken) await storeToken(`${platform}_token_${workspaceId}`, accessToken)

      // resolve the connected account's name via the graph api
      const meRes = await fetch(`https://graph.facebook.com/v19.0/me?fields=name&access_token=${accessToken}`)
      if (meRes.ok) {
        const me = await meRes.json() as { name?: string; id?: string }
        username = me.name ?? ''
        externalId = me.id ?? ''
      }

      if (!accessToken) return htmlPage('Connection failed', 'No access token was returned.')
      // mark the connection real and clean up the one-time state
      const { error: updateError } = await admin
        .from('platform_connections')
        .update({
          account_name: username || platform,
          external_account_id: externalId || null,
          external_username: username || null,
          status: 'connected',
          oauth_state: null,
          token_expires_at: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
        })
        .eq('workspace_id', workspaceId)
        .eq('platform', platform)
      if (updateError) return htmlPage('Connection failed', 'Could not save the connection.')

      await admin.from('audit_log').insert({
        workspace_id: workspaceId,
        action: 'platform_connected_oauth',
        entity_type: 'platform_connection',
        details: { platform, username },
      })

      // return the user to the app settings page with a success flag
      return Response.redirect(
        `${appUrl()}/settings?connected=${platform}&account=${encodeURIComponent(username || platform)}`,
        302
      )
    }

    return new Response(JSON.stringify({ error: 'not_found' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch {
    const message = 'oauth_unavailable'
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
}

function htmlPage(title: string, body: string): Response {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>` +
      `<style>body{font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0;background:#f7fafc}` +
      `.card{background:#fff;padding:40px;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.08);text-align:center}` +
      `h1{font-size:20px;margin:0 0 8px}p{color:#4a5568;margin:0}</style></head>` +
      `<body><div class="card"><h1>${title}</h1><p>${body}</p></div></body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  )
}
