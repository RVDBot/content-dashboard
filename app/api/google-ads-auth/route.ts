import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { requireAuth } from '@/lib/auth-guard'
import { getAuthUrl, exchangeCodeForToken } from '@/lib/keyword-planner'

function getSetting(key: string): string {
  const db = getDb()
  return (db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)?.value || ''
}

function setSetting(key: string, value: string) {
  const db = getDb()
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?')
    .run(key, value, value)
}

// GET: generate auth URL
export async function GET(req: NextRequest) {
  const authError = requireAuth(req)
  if (authError) return authError

  const clientId = getSetting('gads_client_id')
  if (!clientId) {
    return NextResponse.json({ error: 'Client ID niet ingesteld' }, { status: 400 })
  }

  return NextResponse.json({ url: getAuthUrl(clientId) })
}

// POST: exchange code for refresh token
export async function POST(req: NextRequest) {
  const authError = requireAuth(req)
  if (authError) return authError

  const { code } = await req.json()
  if (!code) {
    return NextResponse.json({ error: 'Code is verplicht' }, { status: 400 })
  }

  const clientId = getSetting('gads_client_id')
  const clientSecret = getSetting('gads_client_secret')

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'Client ID en Secret moeten eerst ingesteld worden' }, { status: 400 })
  }

  try {
    const refreshToken = await exchangeCodeForToken(clientId, clientSecret, code)
    setSetting('gads_refresh_token', refreshToken)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
