import Anthropic from '@anthropic-ai/sdk'
import { log } from '@/lib/logger'

export interface ArticleSuggestion {
  title: string
  description: string
  targetKeywords: string[]
  language: string
  angle: string
}

interface KeywordInput {
  keyword: string
  monthlyImpressions: number
  type: string
  language: string
}

/**
 * Groups related keywords into article clusters using Claude,
 * then generates article suggestions per cluster.
 */
export async function generateArticleSuggestions(
  apiKey: string,
  keywords: KeywordInput[],
  language: string,
): Promise<ArticleSuggestion[]> {
  if (keywords.length === 0) return []

  const client = new Anthropic({ apiKey })

  // Chunk keywords per language, max ~200 per call to stay within context
  const langKeywords = keywords.filter(k => k.language === language)
  if (langKeywords.length === 0) return []

  const chunks: KeywordInput[][] = []
  for (let i = 0; i < langKeywords.length; i += 200) {
    chunks.push(langKeywords.slice(i, i + 200))
  }

  const allSuggestions: ArticleSuggestion[] = []

  for (const chunk of chunks) {
    const keywordList = chunk
      .sort((a, b) => b.monthlyImpressions - a.monthlyImpressions)
      .map(k => `- "${k.keyword}" (${k.monthlyImpressions} impressies/mnd, type: ${k.type})`)
      .join('\n')

    const langLabel: Record<string, string> = {
      en: 'English', nl: 'Dutch', de: 'German', es: 'Spanish', it: 'Italian', fr: 'French',
    }

    try {
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content: `You are a content strategist for an online jump rope shop (speedropeshop.com). The shop sells speed ropes, freestyle ropes, and accessories for crossfitters and freestyle jump ropers.

Below is a list of keywords that people search for. Group related keywords into article clusters, and for each cluster suggest ONE blog article.

Keywords:
${keywordList}

For each article suggestion, provide:
1. **title**: A compelling ${langLabel[language] || 'English'} blog article title (SEO-optimized, include primary keyword)
2. **description**: 2-3 sentences describing the article angle, what to cover, and why it would drive traffic + sales
3. **targetKeywords**: Array of keywords from the list that this article would target
4. **angle**: One of: "guide", "comparison", "listicle", "how-to", "explanation", "review", "tips"

Rules:
- Write titles and descriptions in ${langLabel[language] || 'English'}
- Group keywords that would naturally fit in one article
- Focus on articles that could lead to product purchases
- Skip keywords that are too generic, branded (competitors), or not relevant to jump rope content
- Aim for 10-30 article suggestions depending on the keyword variety

Respond ONLY with a JSON array of objects. No markdown, no explanation. Example:
[{"title":"...","description":"...","targetKeywords":["kw1","kw2"],"angle":"guide"}]`
        }],
      })

      const text = response.content[0].type === 'text' ? response.content[0].text : ''

      // Parse JSON — handle potential markdown wrapping
      const jsonStr = text.replace(/^```json?\s*/, '').replace(/\s*```$/, '').trim()
      const suggestions = JSON.parse(jsonStr) as Omit<ArticleSuggestion, 'language'>[]

      for (const s of suggestions) {
        allSuggestions.push({ ...s, language })
      }
    } catch (e) {
      log('error', `AI suggesties fout (${language}): ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  log('info', `AI suggesties: ${allSuggestions.length} artikelen gegenereerd voor ${language}`)
  return allSuggestions
}
