import Anthropic from '@anthropic-ai/sdk'
import { getDb } from '@/lib/db'
import { log } from '@/lib/logger'

export interface ArticleSuggestion {
  title: string
  description: string
  targetKeywords: string[]
  angle: string
}

interface KeywordInput {
  keyword: string
  monthlyImpressions: number
  type: string
}

function trackTokens(action: string, model: string, inputTokens: number, outputTokens: number, opportunityId?: number) {
  const db = getDb()
  db.prepare(
    'INSERT INTO token_usage (action, model, input_tokens, output_tokens, opportunity_id) VALUES (?, ?, ?, ?, ?)'
  ).run(action, model, inputTokens, outputTokens, opportunityId || null)
}

export function getTokenUsage(): { total_input: number; total_output: number; by_action: Record<string, { input: number; output: number; count: number }> } {
  const db = getDb()
  const rows = db.prepare(`
    SELECT action, SUM(input_tokens) as input, SUM(output_tokens) as output, COUNT(*) as count
    FROM token_usage GROUP BY action
  `).all() as { action: string; input: number; output: number; count: number }[]

  let totalInput = 0, totalOutput = 0
  const byAction: Record<string, { input: number; output: number; count: number }> = {}
  for (const row of rows) {
    totalInput += row.input
    totalOutput += row.output
    byAction[row.action] = { input: row.input, output: row.output, count: row.count }
  }

  return { total_input: totalInput, total_output: totalOutput, by_action: byAction }
}

/**
 * Generate 10 English article ideas that work across international markets.
 * Results are cached — only regenerated when explicitly requested.
 */
export async function generateArticleSuggestions(
  apiKey: string,
  model: string,
  keywords: KeywordInput[],
): Promise<ArticleSuggestion[]> {
  if (keywords.length === 0) return []

  const client = new Anthropic({ apiKey })

  // Take top 300 keywords by impressions for the prompt
  const topKeywords = [...keywords]
    .sort((a, b) => b.monthlyImpressions - a.monthlyImpressions)
    .slice(0, 300)

  const keywordList = topKeywords
    .map(k => `- "${k.keyword}" (${k.monthlyImpressions} imp/mnd, ${k.type})`)
    .join('\n')

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: `You are a content strategist for speedropeshop.com, an online shop selling speed ropes, freestyle ropes, and accessories for crossfitters and freestyle jump ropers. The shop operates in 6 markets: EN, NL, DE, ES, IT, FR.

Below is a list of keywords people search for across all markets. Analyze them and suggest exactly 10 blog article ideas in English that would work well when translated to all 6 languages.

Keywords:
${keywordList}

For each article, provide:
1. **title**: Compelling English blog title (SEO-optimized, include primary keyword)
2. **description**: 2-3 sentences: the article angle, what to cover, why it drives traffic AND product sales
3. **targetKeywords**: Array of keywords from the list this article would rank for (include keywords from multiple languages if applicable)
4. **angle**: One of: "guide", "comparison", "listicle", "how-to", "explanation", "review", "tips"

Rules:
- Exactly 10 articles, sorted by estimated business impact (highest first)
- Focus on topics that are universal across cultures (not market-specific)
- Prioritize articles that naturally lead to product purchases
- Group related keywords into one article — don't make separate articles for similar queries
- Skip branded competitor keywords
- Each article should target a different topic cluster

Respond ONLY with a JSON array of 10 objects. No markdown, no explanation.
[{"title":"...","description":"...","targetKeywords":["kw1","kw2"],"angle":"guide"}]`
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const inputTokens = response.usage?.input_tokens || 0
  const outputTokens = response.usage?.output_tokens || 0

  trackTokens('suggestions', model, inputTokens, outputTokens)
  log('info', `AI suggesties: ${inputTokens} input + ${outputTokens} output tokens (${model})`)

  const jsonStr = text.replace(/^```json?\s*/, '').replace(/\s*```$/, '').trim()
  return JSON.parse(jsonStr) as ArticleSuggestion[]
}

/**
 * Generate a full article for an opportunity.
 */
export async function generateArticle(
  apiKey: string,
  model: string,
  opportunityId: number,
  title: string,
  description: string,
  targetKeywords: string[],
  angle: string,
): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const client = new Anthropic({ apiKey })

  const response = await client.messages.create({
    model,
    max_tokens: 8192,
    messages: [{
      role: 'user',
      content: `Write a complete blog article for speedropeshop.com.

Title: ${title}
Angle: ${angle}
Description: ${description}
Target keywords to naturally include: ${targetKeywords.join(', ')}

Requirements:
- Write in English (will be translated to NL, DE, ES, IT, FR later)
- SEO-optimized with proper heading structure (H2, H3)
- 1000-1500 words
- Engaging, informative, and actionable
- Naturally mention speed ropes / jump ropes where relevant (don't force it)
- Include a brief product mention or CTA near the end, but keep it subtle
- Use markdown formatting
- Start with the article directly (no meta-commentary)`
    }],
  })

  const content = response.content[0].type === 'text' ? response.content[0].text : ''
  const inputTokens = response.usage?.input_tokens || 0
  const outputTokens = response.usage?.output_tokens || 0

  trackTokens('generation', model, inputTokens, outputTokens, opportunityId)

  // Cache the generated content
  const db = getDb()
  db.prepare('UPDATE opportunities SET generated_content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(content, opportunityId)

  log('info', `Artikel gegenereerd voor opportunity ${opportunityId}: ${inputTokens} input + ${outputTokens} output tokens`)

  return { content, inputTokens, outputTokens }
}
