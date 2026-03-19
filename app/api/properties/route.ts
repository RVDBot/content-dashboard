import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  const db = getDb()
  const properties = db.prepare('SELECT * FROM ga4_properties ORDER BY language ASC').all()
  return NextResponse.json(properties)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, language, property_id, base_url, blog_path } = body

  if (!name || !language || !property_id) {
    return NextResponse.json({ error: 'Naam, taal en property ID zijn vereist' }, { status: 400 })
  }

  const db = getDb()
  const result = db.prepare(
    'INSERT INTO ga4_properties (name, language, property_id, base_url, blog_path) VALUES (?, ?, ?, ?, ?)'
  ).run(name, language, property_id, base_url || '', blog_path || '/blog/')

  return NextResponse.json({ id: result.lastInsertRowid })
}

export async function PUT(req: NextRequest) {
  const body = await req.json()
  const { id, name, language, property_id, base_url, blog_path } = body

  if (!id) return NextResponse.json({ error: 'ID vereist' }, { status: 400 })

  const db = getDb()
  db.prepare(
    'UPDATE ga4_properties SET name = ?, language = ?, property_id = ?, base_url = ?, blog_path = ? WHERE id = ?'
  ).run(name, language, property_id, base_url || '', blog_path || '/blog/', id)

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const body = await req.json()
  const { id } = body

  if (!id) return NextResponse.json({ error: 'ID vereist' }, { status: 400 })

  const db = getDb()
  db.prepare('DELETE FROM ga4_properties WHERE id = ?').run(id)

  return NextResponse.json({ ok: true })
}
