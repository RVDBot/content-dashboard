import { getDb } from '@/lib/db'
import { log } from '@/lib/logger'

const CACHE_DAYS = 7

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Answer The Public-style modifiers
const QUESTION_PREFIXES = ['how to', 'what is', 'why', 'when to', 'can you', 'is', 'are', 'how much', 'how long', 'which', 'where to buy']
const QUESTION_SUFFIXES = ['how', 'what', 'why', 'when', 'who', 'which', 'where', 'can', 'is', 'are']
const PREPOSITIONS = ['for', 'with', 'without', 'vs', 'or', 'like', 'near', 'to', 'after', 'before']
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz'.split('')

function buildExpansions(seed: string): string[] {
  const expansions: string[] = [seed]

  // "how to speed rope", "what is speed rope", etc.
  for (const prefix of QUESTION_PREFIXES) {
    expansions.push(`${prefix} ${seed}`)
  }

  // "speed rope how", "speed rope what", etc.
  for (const suffix of QUESTION_SUFFIXES) {
    expansions.push(`${seed} ${suffix}`)
  }

  // "speed rope for", "speed rope vs", etc.
  for (const prep of PREPOSITIONS) {
    expansions.push(`${seed} ${prep}`)
  }

  // "speed rope a", "speed rope b", etc.
  for (const letter of ALPHABET) {
    expansions.push(`${seed} ${letter}`)
  }

  return expansions
}

async function fetchAutocomplete(query: string, language: string): Promise<string[]> {
  const db = getDb()

  // Check cache
  const cached = db.prepare(
    `SELECT suggestions, fetched_at FROM autocomplete_cache WHERE keyword = ? AND language = ?`
  ).get(query, language) as { suggestions: string; fetched_at: string } | undefined

  if (cached) {
    const age = (Date.now() - new Date(cached.fetched_at).getTime()) / (1000 * 60 * 60 * 24)
    if (age < CACHE_DAYS) {
      return JSON.parse(cached.suggestions)
    }
  }

  // Fetch from Google
  const langMap: Record<string, string> = {
    nl: 'nl', en: 'en', de: 'de', es: 'es', it: 'it', fr: 'fr',
  }
  const hl = langMap[language] || 'en'
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(query)}&hl=${hl}`

  try {
    const res = await fetch(url)
    if (!res.ok) return []

    const data = await res.json()
    const suggestions: string[] = Array.isArray(data[1]) ? data[1] : []

    // Cache result
    db.prepare(
      `INSERT INTO autocomplete_cache (keyword, language, suggestions, fetched_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(keyword, language) DO UPDATE SET suggestions = ?, fetched_at = CURRENT_TIMESTAMP`
    ).run(query, language, JSON.stringify(suggestions), JSON.stringify(suggestions))

    await sleep(200) // Rate limit

    return suggestions
  } catch {
    return []
  }
}

export interface AutocompleteTopic {
  keyword: string
  type: 'question' | 'preposition' | 'alphabet' | 'direct'
  language: string
}

export async function expandSeedKeywords(
  seedKeywords: { keyword: string; language: string }[],
): Promise<AutocompleteTopic[]> {
  const allTopics = new Map<string, AutocompleteTopic>()
  let queryCount = 0

  for (const seed of seedKeywords) {
    const expansions = buildExpansions(seed.keyword)

    for (const expansion of expansions) {
      const suggestions = await fetchAutocomplete(expansion, seed.language)
      queryCount++

      for (const suggestion of suggestions) {
        const key = suggestion.toLowerCase().trim()
        if (key === seed.keyword.toLowerCase()) continue // Skip exact seed match
        if (allTopics.has(key)) continue

        // Determine type
        let type: AutocompleteTopic['type'] = 'direct'
        if (QUESTION_PREFIXES.some(p => expansion.startsWith(p)) || QUESTION_SUFFIXES.some(s => expansion.endsWith(` ${s}`))) {
          type = 'question'
        } else if (PREPOSITIONS.some(p => expansion.endsWith(` ${p}`))) {
          type = 'preposition'
        } else if (ALPHABET.some(l => expansion === `${seed.keyword} ${l}`)) {
          type = 'alphabet'
        }

        allTopics.set(key, { keyword: suggestion, type, language: seed.language })
      }
    }
  }

  log('info', `Autocomplete: ${queryCount} queries uitgevoerd, ${allTopics.size} unieke topics gevonden`)
  return [...allTopics.values()]
}
