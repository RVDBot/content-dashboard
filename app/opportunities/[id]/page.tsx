'use client'

import { useEffect, useState, use } from 'react'

interface Opportunity {
  id: number
  keyword: string
  title_suggestion: string | null
  description: string | null
  source: string
  language: string | null
  monthly_impressions: number
  estimated_volume: number
  current_position: number | null
  difficulty: string
  expected_traffic: number
  expected_revenue: number
  brand_fit_score: number
  priority_score: number
  status: string
  has_existing_content: number
  existing_url: string | null
  generated_content: string | null
}

const STATUS_OPTIONS = [
  { value: 'new', label: 'Nieuw' },
  { value: 'planned', label: 'Gepland' },
  { value: 'written', label: 'Geschreven' },
  { value: 'dismissed', label: 'Afgewezen' },
]

const DIFFICULTY_COLORS: Record<string, { bg: string; text: string }> = {
  easy: { bg: 'bg-success/15', text: 'text-success' },
  medium: { bg: 'bg-warning/15', text: 'text-warning' },
  hard: { bg: 'bg-danger/15', text: 'text-danger' },
}

function formatCurrency(n: number): string {
  return `€${n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatNumber(n: number): string {
  return n.toLocaleString('nl-NL')
}

function Tip({ children, tip }: { children: React.ReactNode; tip: string }) {
  return <span title={tip} className="cursor-help">{children}</span>
}

export default function OpportunityDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [opp, setOpp] = useState<Opportunity | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [generatedContent, setGeneratedContent] = useState<string | null>(null)
  const [genTokens, setGenTokens] = useState<{ input: number; output: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/opportunities/${id}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) setError(data.error)
        else {
          setOpp(data)
          if (data.generated_content) setGeneratedContent(data.generated_content)
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  async function generate() {
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch(`/api/opportunities/${id}/generate`, { method: 'POST' })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setGeneratedContent(data.content)
      if (!data.cached) {
        setGenTokens({ input: data.inputTokens, output: data.outputTokens })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setGenerating(false)
    }
  }

  async function updateStatus(status: string) {
    await fetch('/api/opportunities', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: parseInt(id), status }),
    })
    if (opp) setOpp({ ...opp, status })
  }

  function copyContent() {
    if (generatedContent) {
      navigator.clipboard.writeText(generatedContent)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!opp) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-text-primary text-[14px] font-semibold mb-2">{error || 'Niet gevonden'}</p>
          <a href="/opportunities" className="text-accent text-[13px] hover:text-accent-hover">Terug naar overzicht</a>
        </div>
      </div>
    )
  }

  const descriptionText = opp.description?.split('\n\nDoelzoekwoorden:')[0] || ''
  const targetKeywords = opp.description?.match(/Doelzoekwoorden: (.+)$/)?.[1]?.split(', ') || [opp.keyword]
  const angle = opp.source.startsWith('ai_') ? opp.source.replace('ai_', '') : opp.source

  const priorityColor = opp.priority_score >= 70
    ? 'bg-success/15 text-success border-success/20'
    : opp.priority_score >= 40
      ? 'bg-warning/15 text-warning border-warning/20'
      : 'bg-danger/15 text-danger border-danger/20'

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-surface-0/80 backdrop-blur-xl border-b border-border-subtle">
        <div className="max-w-[900px] mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/opportunities" className="p-2 rounded-lg text-text-tertiary hover:text-text-secondary hover:bg-surface-2 transition-all duration-150">
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M10 2L4 8l6 6" />
              </svg>
            </a>
            <span className="text-[13px] text-text-tertiary">Opportunities</span>
          </div>
          <select
            value={opp.status}
            onChange={e => updateStatus(e.target.value)}
            className={`text-[12px] font-medium px-3 py-1.5 rounded-lg outline-none border cursor-pointer transition-colors ${
              opp.status === 'new' ? 'border-accent/30 bg-accent-subtle text-accent' :
              opp.status === 'planned' ? 'border-warning/30 bg-warning/10 text-warning' :
              opp.status === 'written' ? 'border-success/30 bg-success/10 text-success' :
              'border-border bg-surface-2 text-text-tertiary'
            }`}
          >
            {STATUS_OPTIONS.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
      </header>

      <main className="max-w-[900px] mx-auto px-6 py-8">
        {/* Title & priority */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <Tip tip="Prioriteitscore (0-100): gewogen mix van zoekvolume (30%), omzetpotentieel (30%), moeilijkheid (20%) en brand fit (20%)">
              <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[14px] font-bold tabular-nums border ${priorityColor}`}>
                {opp.priority_score}
              </span>
            </Tip>
            <Tip tip="Geschatte moeilijkheid: easy = geen/lage concurrentie, medium = positie 11-30, hard = top 10">
              <span className={`text-[12px] font-semibold px-2.5 py-1 rounded-md ${DIFFICULTY_COLORS[opp.difficulty]?.bg || 'bg-surface-3'} ${DIFFICULTY_COLORS[opp.difficulty]?.text || 'text-text-tertiary'}`}>
                {opp.difficulty}
              </span>
            </Tip>
            <Tip tip="Artikeltype / invalshoek zoals bepaald door de AI">
              <span className="text-[12px] text-text-tertiary bg-surface-2 px-2.5 py-1 rounded-md">{angle}</span>
            </Tip>
          </div>
          <h1 className="text-[22px] font-bold text-text-primary leading-tight mb-2">
            {opp.title_suggestion || opp.keyword}
          </h1>
          {descriptionText && (
            <p className="text-text-secondary text-[14px] leading-relaxed">{descriptionText}</p>
          )}
        </div>

        {/* Metrics grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <Tip tip="Totaal maandelijkse impressies van alle doelzoekwoorden samen in Google zoekresultaten (Search Console data, 3 maanden gemiddeld). Bij 0: geen Search Console data gevonden voor deze keywords.">
            <div className="bg-surface-1 rounded-xl border border-border-subtle p-4">
              <p className="text-text-tertiary text-[11px] font-semibold uppercase tracking-wider mb-1">Impressies/mnd</p>
              <p className="text-[18px] font-bold text-text-primary tabular-nums">{formatNumber(opp.monthly_impressions)}</p>
            </div>
          </Tip>
          <Tip tip="Geschat maandelijks verkeer als dit artikel positie 5 bereikt. Berekening: impressies × 5% CTR. Bij 0 impressies wordt 50 als schatting gebruikt.">
            <div className="bg-surface-1 rounded-xl border border-border-subtle p-4">
              <p className="text-text-tertiary text-[11px] font-semibold uppercase tracking-wider mb-1">Verwacht verkeer</p>
              <p className="text-[18px] font-bold text-text-primary tabular-nums">{formatNumber(opp.expected_traffic)}</p>
            </div>
          </Tip>
          <Tip tip="Geschatte maandelijkse omzet. Berekening: verwacht verkeer × conversieratio × gem. orderwaarde (beide uit bestaande GA4 data van je artikelen).">
            <div className="bg-surface-1 rounded-xl border border-border-subtle p-4">
              <p className="text-text-tertiary text-[11px] font-semibold uppercase tracking-wider mb-1">Verwachte omzet</p>
              <p className="text-[18px] font-bold text-text-primary tabular-nums">{formatCurrency(opp.expected_revenue)}/mnd</p>
            </div>
          </Tip>
          <Tip tip="Hoe goed dit onderwerp past bij het productaanbod. 100 = exact product (speed rope), 80 = jump rope gerelateerd, 60 = crossfit, 40 = algemeen fitness, 10 = niet gerelateerd.">
            <div className="bg-surface-1 rounded-xl border border-border-subtle p-4">
              <p className="text-text-tertiary text-[11px] font-semibold uppercase tracking-wider mb-1">Brand fit</p>
              <p className="text-[18px] font-bold text-text-primary tabular-nums">{opp.brand_fit_score}%</p>
            </div>
          </Tip>
        </div>

        {/* Current position + existing content */}
        {(opp.current_position || opp.has_existing_content === 1) && (
          <div className="bg-surface-1 rounded-xl border border-border-subtle p-4 mb-6">
            <h3 className="text-text-primary text-[13px] font-semibold mb-2">Huidige situatie</h3>
            {opp.current_position && (
              <p className="text-text-secondary text-[13px]">Beste positie: <strong>{opp.current_position.toFixed(1)}</strong></p>
            )}
            {opp.has_existing_content === 1 && opp.existing_url && (
              <p className="text-text-secondary text-[13px]">
                Bestaand artikel:{' '}
                <a href={opp.existing_url} target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover">{opp.existing_url}</a>
              </p>
            )}
          </div>
        )}

        {/* Target keywords */}
        <div className="bg-surface-1 rounded-xl border border-border-subtle p-4 mb-6">
          <h3 className="text-text-primary text-[13px] font-semibold mb-2">Doelzoekwoorden</h3>
          <div className="flex flex-wrap gap-1.5">
            {targetKeywords.map((kw, i) => (
              <span key={i} className="text-[12px] text-text-secondary bg-surface-2 px-2 py-1 rounded-lg">{kw}</span>
            ))}
          </div>
        </div>

        {/* Article generation */}
        <div className="bg-surface-1 rounded-xl border border-border-subtle p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-text-primary text-[13px] font-semibold">Artikel</h3>
            <div className="flex items-center gap-2">
              {generatedContent && (
                <button
                  onClick={copyContent}
                  className="text-[11px] font-semibold text-text-tertiary hover:text-text-secondary transition-colors"
                >
                  Kopieer
                </button>
              )}
              {genTokens && (
                <span className="text-[11px] text-text-tertiary tabular-nums">
                  {formatNumber(genTokens.input + genTokens.output)} tokens
                </span>
              )}
            </div>
          </div>

          {error && (
            <div className="bg-danger-subtle border border-danger/20 rounded-xl p-3 mb-3">
              <p className="text-danger text-[13px]">{error}</p>
            </div>
          )}

          {generatedContent ? (
            <div className="prose prose-sm max-w-none text-text-secondary text-[13px] leading-relaxed">
              {generatedContent.split('\n').map((line, i) => {
                if (line.startsWith('## ')) return <h2 key={i} className="text-text-primary text-[16px] font-bold mt-5 mb-2">{line.slice(3)}</h2>
                if (line.startsWith('### ')) return <h3 key={i} className="text-text-primary text-[14px] font-semibold mt-4 mb-1.5">{line.slice(4)}</h3>
                if (line.startsWith('# ')) return <h2 key={i} className="text-text-primary text-[18px] font-bold mt-5 mb-2">{line.slice(2)}</h2>
                if (line.startsWith('- ')) return <li key={i} className="ml-4 mb-1">{line.slice(2)}</li>
                if (line.trim() === '') return <br key={i} />
                return <p key={i} className="mb-2">{line}</p>
              })}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-text-tertiary text-[13px] mb-4">
                Nog geen artikel gegenereerd. Klik op de knop om het artikel te laten schrijven door AI.
              </p>
              <button
                onClick={generate}
                disabled={generating}
                className="bg-accent hover:bg-accent-hover text-white text-[13px] font-medium px-5 py-2.5 rounded-xl transition-colors duration-150 disabled:opacity-50"
              >
                {generating ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Genereren...
                  </span>
                ) : 'Artikel genereren'}
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
