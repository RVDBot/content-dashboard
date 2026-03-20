import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { requireAuth } from '@/lib/auth-guard'

export async function GET(req: NextRequest) {
  const authError = requireAuth(req)
  if (authError) return authError

  const db = getDb()
  const keywords = db.prepare('SELECT * FROM seed_keywords ORDER BY category, keyword').all()
  return NextResponse.json(keywords)
}

export async function POST(req: NextRequest) {
  const authError = requireAuth(req)
  if (authError) return authError

  const { keyword, category, language, active } = await req.json()

  if (!keyword) {
    return NextResponse.json({ error: 'Keyword is verplicht' }, { status: 400 })
  }

  const db = getDb()
  const result = db.prepare(
    'INSERT INTO seed_keywords (keyword, category, language, active) VALUES (?, ?, ?, ?)'
  ).run(keyword, category || 'general', language || 'en', active !== undefined ? (active ? 1 : 0) : 1)

  return NextResponse.json({ id: result.lastInsertRowid })
}

export async function DELETE(req: NextRequest) {
  const authError = requireAuth(req)
  if (authError) return authError

  const { id } = await req.json()

  if (!id) {
    return NextResponse.json({ error: 'id is verplicht' }, { status: 400 })
  }

  const db = getDb()
  db.prepare('DELETE FROM seed_keywords WHERE id = ?').run(id)

  return NextResponse.json({ ok: true })
}
