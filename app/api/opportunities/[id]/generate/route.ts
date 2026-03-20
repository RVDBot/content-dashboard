import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { requireAuth } from '@/lib/auth-guard'
import { generateArticle } from '@/lib/ai-suggestions'

function getSetting(key: string): string {
  const db = getDb()
  return (db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)?.value || ''
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = requireAuth(req)
  if (authError) return authError

  const { id } = await params
  const opportunityId = parseInt(id)
  if (isNaN(opportunityId)) {
    return NextResponse.json({ error: 'Ongeldig ID' }, { status: 400 })
  }

  const db = getDb()
  const opp = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(opportunityId) as {
    id: number; keyword: string; title_suggestion: string; description: string;
    source: string; generated_content: string | null
  } | undefined

  if (!opp) {
    return NextResponse.json({ error: 'Opportunity niet gevonden' }, { status: 404 })
  }

  // Return cached content if available
  if (opp.generated_content) {
    return NextResponse.json({ content: opp.generated_content, cached: true })
  }

  const apiKey = getSetting('anthropic_api_key')
  if (!apiKey) {
    return NextResponse.json({ error: 'Anthropic API key niet geconfigureerd' }, { status: 400 })
  }

  const model = getSetting('ai_model') || 'claude-haiku-4-5-20251001'

  // Extract target keywords from description
  const kwMatch = opp.description?.match(/Doelzoekwoorden: (.+)$/)
  const targetKeywords = kwMatch ? kwMatch[1].split(', ') : [opp.keyword]
  const angle = opp.source.startsWith('ai_') ? opp.source.replace('ai_', '') : 'guide'

  try {
    const result = await generateArticle(
      apiKey, model, opportunityId,
      opp.title_suggestion || opp.keyword,
      opp.description?.split('\n\nDoelzoekwoorden:')[0] || '',
      targetKeywords, angle,
    )

    return NextResponse.json({
      content: result.content,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      cached: false,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
