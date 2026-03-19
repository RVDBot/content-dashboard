import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

const SETTINGS_KEYS = [
  'ga4_property_id',
  'ga4_client_email',
  'ga4_private_key',
  'wc_store_url',
  'wc_consumer_key',
  'wc_consumer_secret',
  'blog_url_pattern',
]

const SECRET_KEYS = ['ga4_private_key', 'wc_consumer_secret']

export async function GET() {
  const db = getDb()
  const result: Record<string, string> = {}
  for (const key of SETTINGS_KEYS) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
    if (row) {
      result[key] = SECRET_KEYS.includes(key) && row.value ? '••••••••' : row.value
    } else {
      result[key] = ''
    }
  }
  return NextResponse.json(result)
}

export async function PUT(req: NextRequest) {
  const body = await req.json()
  const db = getDb()

  for (const key of SETTINGS_KEYS) {
    if (key in body) {
      const value = body[key]
      // Don't overwrite secrets with masked value
      if (SECRET_KEYS.includes(key) && value === '••••••••') continue
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?')
        .run(key, value, value)
    }
  }

  return NextResponse.json({ ok: true })
}
