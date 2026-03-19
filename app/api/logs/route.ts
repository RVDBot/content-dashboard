import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET(req: NextRequest) {
  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '100', 10)
  const db = getDb()
  const logs = db.prepare('SELECT * FROM logs ORDER BY created_at DESC LIMIT ?').all(Math.min(limit, 500))
  return NextResponse.json(logs)
}

export async function DELETE() {
  const db = getDb()
  db.prepare('DELETE FROM logs').run()
  return NextResponse.json({ ok: true })
}
