import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { exchangeCodeForToken } from '@/lib/keyword-planner'

function getSetting(key: string): string {
  const db = getDb()
  return (db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)?.value || ''
}

function setSetting(key: string, value: string) {
  const db = getDb()
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?')
    .run(key, value, value)
}

// Google redirects here after the user authorizes
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const error = req.nextUrl.searchParams.get('error')

  // Use the stored origin (saved when user clicked "Autoriseren")
  const baseUrl = getSetting('gads_auth_origin')
  if (!baseUrl) {
    return new NextResponse('Auth origin niet gevonden. Ga terug naar het dashboard en probeer opnieuw.', { status: 400 })
  }

  if (error) {
    return NextResponse.redirect(`${baseUrl}/?gads_auth=error&message=${encodeURIComponent(error)}`)
  }

  if (!code) {
    return NextResponse.redirect(`${baseUrl}/?gads_auth=error&message=${encodeURIComponent('Geen autorisatiecode ontvangen')}`)
  }

  const clientId = getSetting('gads_client_id')
  const clientSecret = getSetting('gads_client_secret')

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${baseUrl}/?gads_auth=error&message=${encodeURIComponent('OAuth2 credentials niet ingesteld')}`)
  }

  const redirectUri = `${baseUrl}/api/google-ads-auth/callback`

  try {
    const refreshToken = await exchangeCodeForToken(clientId, clientSecret, code, redirectUri)
    setSetting('gads_refresh_token', refreshToken)
    return NextResponse.redirect(`${baseUrl}/?gads_auth=success`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.redirect(`${baseUrl}/?gads_auth=error&message=${encodeURIComponent(msg)}`)
  }
}
