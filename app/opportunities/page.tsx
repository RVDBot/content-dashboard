'use client'

import { useEffect, useState, useMemo } from 'react'
import Settings from '@/components/Settings'

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
  data_source: string | null
}

interface Benchmarks {
  avgRevenuePerArticle: number
  articleCount: number
  revenuePerVisitor: number
}

const DATA_SOURCE_LABELS: Record<string, { label: string; color: string; tip: string }> = {
  keyword_planner: { label: 'KP', color: 'text-success bg-success/10', tip: 'Zoekvolume uit Google Ads Keyword Planner (exacte data)' },
  search_console: { label: 'SC', color: 'text-accent bg-accent-subtle', tip: 'Zoekvolume geschat op basis van Search Console impressies' },
  estimated: { label: 'Est', color: 'text-text-tertiary bg-surface-2', tip: 'Zoekvolume is een schatting (geen exacte data beschikbaar)' },
}

const DIFFICULTY_COLORS: Record<string, { bg: string; text: string }> = {
  easy: { bg: 'bg-success/15', text: 'text-success' },
  medium: { bg: 'bg-warning/15', text: 'text-warning' },
  hard: { bg: 'bg-danger/15', text: 'text-danger' },
}

const STATUS_OPTIONS = [
  { value: 'new', label: 'Nieuw' },
  { value: 'planned', label: 'Gepland' },
  { value: 'written', label: 'Geschreven' },
  { value: 'dismissed', label: 'Afgewezen' },
]

function formatCurrency(n: number): string {
  return `€${n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatNumber(n: number): string {
  return n.toLocaleString('nl-NL')
}

function Tip({ children, tip }: { children: React.ReactNode; tip: string }) {
  return <span title={tip} className="cursor-help">{children}</span>
}

function PriorityBadge({ score }: { score: number }) {
  const color = score >= 70
    ? 'bg-success/15 text-success border-success/20'
    : score >= 40
      ? 'bg-warning/15 text-warning border-warning/20'
      : 'bg-danger/15 text-danger border-danger/20'
  return (
    <Tip tip="Prioriteitscore (0-100): gewogen mix van zoekvolume (30%), omzetpotentieel (30%), moeilijkheidsgraad (20%) en brand fit (20%)">
      <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[12px] font-bold tabular-nums border ${color}`}>
        {score}
      </span>
    </Tip>
  )
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg className={`w-4 h-4 ${spinning ? 'animate-spin' : ''}`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M2.5 8a5.5 5.5 0 0 1 9.3-4M13.5 8a5.5 5.5 0 0 1-9.3 4" />
      <path d="M12 1.5v3h-3M4 11.5v3h3" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="8" cy="8" r="2.5" />
      <path d="M6.7 1.5h2.6l.4 1.7a5 5 0 0 1 1.2.7l1.6-.5 1.3 2.2-1.3 1.2a5 5 0 0 1 0 1.4l1.3 1.2-1.3 2.2-1.6-.5a5 5 0 0 1-1.2.7l-.4 1.7H6.7l-.4-1.7a5 5 0 0 1-1.2-.7l-1.6.5-1.3-2.2 1.3-1.2a5 5 0 0 1 0-1.4L2.2 5.6l1.3-2.2 1.6.5a5 5 0 0 1 1.2-.7l.4-1.7Z" />
    </svg>
  )
}

type SortKey = 'priority_score' | 'expected_revenue' | 'monthly_impressions' | 'difficulty'

export default function OpportunitiesPage() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [benchmarks, setBenchmarks] = useState<Benchmarks | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cached, setCached] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [search, setSearch] = useState('')
  const [filterDifficulty, setFilterDifficulty] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('active')
  const [sortBy, setSortBy] = useState<SortKey>('priority_score')

  function loadOpportunities(refresh = false, regenerate = false) {
    const url = regenerate ? '/api/opportunities?regenerate=1' : refresh ? '/api/opportunities?refresh=1' : '/api/opportunities'
    if (refresh || regenerate) setRefreshing(true)
    else setLoading(true)
    setError(null)
    fetch(url)
      .then(async r => {
        if (!r.ok) {
          const data = await r.json().catch(() => ({ error: `Server fout (${r.status})` }))
          throw new Error(data.error || `Server fout (${r.status})`)
        }
        return r.json()
      })
      .then(data => {
        setOpportunities(data.opportunities || [])
        setCached(!!data.cached)
        if (data.benchmarks) setBenchmarks(data.benchmarks)
      })
      .catch(e => setError(e.message))
      .finally(() => { setLoading(false); setRefreshing(false) })
  }

  async function updateStatus(id: number, status: string) {
    await fetch('/api/opportunities', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
    setOpportunities(prev =>
      prev.map(o => o.id === id ? { ...o, status } : o)
    )
  }

  useEffect(() => { loadOpportunities() }, [])

  const filtered = useMemo(() => {
    let result = opportunities

    if (filterStatus === 'active') {
      result = result.filter(o => o.status === 'new' || o.status === 'planned')
    } else if (filterStatus !== 'all') {
      result = result.filter(o => o.status === filterStatus)
    }

    if (filterDifficulty !== 'all') {
      result = result.filter(o => o.difficulty === filterDifficulty)
    }

    if (search) {
      const q = search.toLowerCase()
      result = result.filter(o =>
        o.keyword.toLowerCase().includes(q) ||
        o.title_suggestion?.toLowerCase().includes(q) ||
        o.description?.toLowerCase().includes(q)
      )
    }

    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case 'expected_revenue': return b.expected_revenue - a.expected_revenue
        case 'monthly_impressions': return b.monthly_impressions - a.monthly_impressions
        case 'difficulty': {
          const order = { easy: 0, medium: 1, hard: 2 }
          return (order[a.difficulty as keyof typeof order] ?? 1) - (order[b.difficulty as keyof typeof order] ?? 1)
        }
        default: return b.priority_score - a.priority_score
      }
    })

    return result
  }, [opportunities, filterStatus, filterDifficulty, search, sortBy])

  const summary = useMemo(() => {
    const active = opportunities.filter(o => o.status === 'new' || o.status === 'planned')
    return {
      total: active.length,
      totalRevenue: active.reduce((s, o) => s + o.expected_revenue, 0),
      easy: active.filter(o => o.difficulty === 'easy').length,
      medium: active.filter(o => o.difficulty === 'medium').length,
      hard: active.filter(o => o.difficulty === 'hard').length,
      generated: opportunities.filter(o => o.generated_content).length,
    }
  }, [opportunities])

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 bg-surface-0/80 backdrop-blur-xl border-b border-border-subtle">
        <div className="max-w-[1100px] mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center">
              <svg className="w-4 h-4 text-white" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 1l2 4 4.5.7-3.2 3.1.8 4.5L8 11.2 3.9 13.3l.8-4.5L1.5 5.7 6 5z" />
              </svg>
            </div>
            <nav className="flex bg-surface-1 rounded-lg p-0.5 border border-border-subtle">
              <a href="/" className="text-[12px] font-medium px-3 py-1.5 rounded-md text-text-tertiary hover:text-text-secondary transition-all duration-150">
                Dashboard
              </a>
              <span className="text-[12px] font-medium px-3 py-1.5 rounded-md bg-surface-3 text-text-primary shadow-sm">
                Opportunities
              </span>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            {cached && <span className="text-text-tertiary text-[11px] bg-surface-2 px-2 py-1 rounded-md">Cache</span>}
            <button onClick={() => { if (confirm('Alle artikelideeën opnieuw laten genereren door AI?')) loadOpportunities(false, true) }} disabled={refreshing}
              className="text-[11px] font-medium text-text-tertiary hover:text-text-secondary px-2 py-1.5 rounded-lg hover:bg-surface-2 disabled:opacity-40 transition-all duration-150" title="AI opnieuw genereren">
              Regenereer
            </button>
            <button onClick={() => loadOpportunities(true)} disabled={refreshing} className="p-2 rounded-lg text-text-tertiary hover:text-text-secondary hover:bg-surface-2 disabled:opacity-40 transition-all duration-150" title="Metrics vernieuwen">
              <RefreshIcon spinning={refreshing} />
            </button>
            <button onClick={() => setShowSettings(true)} className="p-2 rounded-lg text-text-tertiary hover:text-text-secondary hover:bg-surface-2 transition-all duration-150" title="Instellingen">
              <SettingsIcon />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1100px] mx-auto px-6 py-6">
        {loading && (
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-surface-1 rounded-2xl border border-border-subtle p-5">
                <div className="flex justify-between mb-3"><div className="skeleton h-5 w-60" /><div className="skeleton h-6 w-16" /></div>
                <div className="skeleton h-4 w-40" />
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="bg-danger-subtle border border-danger/20 rounded-2xl p-5 mb-6">
            <p className="text-danger text-sm font-medium">{error}</p>
            <button onClick={() => setShowSettings(true)} className="text-accent text-xs mt-2 hover:underline font-medium">Instellingen openen</button>
          </div>
        )}

        {!loading && (
          <>
            {/* Summary */}
            <div className="bg-surface-1 rounded-2xl border border-border-subtle p-5 mb-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-8">
                  <Tip tip="Aantal actieve artikelideeën (status: nieuw of gepland)">
                    <div>
                      <p className="text-text-tertiary text-[11px] font-semibold uppercase tracking-wider mb-0.5">Artikelideeën</p>
                      <p className="text-[22px] font-bold text-text-primary tracking-tight leading-none tabular-nums">{summary.total}</p>
                    </div>
                  </Tip>
                  <Tip tip="Som van verwachte maandelijkse omzet van alle actieve artikelideeën">
                    <div>
                      <p className="text-text-tertiary text-[11px] font-semibold uppercase tracking-wider mb-0.5">Potentiële omzet/mnd</p>
                      <p className="text-[22px] font-bold text-text-primary tracking-tight leading-none tabular-nums">{formatCurrency(summary.totalRevenue)}</p>
                    </div>
                  </Tip>
                  {benchmarks && benchmarks.articleCount > 0 && (
                    <Tip tip={`Benchmark: gemiddelde omzet van ${benchmarks.articleCount} bestaande artikelen met omzet. Omzet per bezoeker: €${benchmarks.revenuePerVisitor.toFixed(2)}.`}>
                      <div className="hidden sm:block">
                        <p className="text-text-tertiary text-[11px] font-semibold uppercase tracking-wider mb-0.5">Gem. artikel</p>
                        <p className="text-[22px] font-bold text-text-primary tracking-tight leading-none tabular-nums">{formatCurrency(benchmarks.avgRevenuePerArticle)}/mnd</p>
                      </div>
                    </Tip>
                  )}
                  <Tip tip="Aantal artikelen waarvoor de volledige tekst al gegenereerd is via AI">
                    <div className="hidden sm:block">
                      <p className="text-text-tertiary text-[11px] font-semibold uppercase tracking-wider mb-0.5">Gegenereerd</p>
                      <p className="text-[22px] font-bold text-text-primary tracking-tight leading-none tabular-nums">{summary.generated}/{opportunities.length}</p>
                    </div>
                  </Tip>
                </div>
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1.5 bg-surface-0 border border-border-subtle rounded-lg px-2.5 py-1.5">
                    <span className="w-2 h-2 rounded-full bg-success" /><span className="text-text-secondary text-[11px] font-semibold">Easy</span><span className="text-text-tertiary text-[11px] tabular-nums">{summary.easy}</span>
                  </span>
                  <span className="flex items-center gap-1.5 bg-surface-0 border border-border-subtle rounded-lg px-2.5 py-1.5">
                    <span className="w-2 h-2 rounded-full bg-warning" /><span className="text-text-secondary text-[11px] font-semibold">Medium</span><span className="text-text-tertiary text-[11px] tabular-nums">{summary.medium}</span>
                  </span>
                  <span className="flex items-center gap-1.5 bg-surface-0 border border-border-subtle rounded-lg px-2.5 py-1.5">
                    <span className="w-2 h-2 rounded-full bg-danger" /><span className="text-text-secondary text-[11px] font-semibold">Hard</span><span className="text-text-tertiary text-[11px] tabular-nums">{summary.hard}</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <div className="relative flex-1 min-w-[200px]">
                <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Zoek artikelen..."
                  className="w-full bg-surface-1 text-text-primary text-[13px] pl-8 pr-3 py-2 rounded-xl outline-none border border-border-subtle hover:border-border focus:border-accent placeholder:text-text-tertiary transition-colors duration-150" />
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" strokeLinecap="round" />
                </svg>
              </div>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                className="bg-surface-1 text-text-primary text-[13px] px-3 py-2 rounded-xl outline-none border border-border-subtle hover:border-border focus:border-accent transition-colors duration-150 cursor-pointer">
                <option value="active">Actief</option><option value="all">Alle</option><option value="new">Nieuw</option>
                <option value="planned">Gepland</option><option value="written">Geschreven</option><option value="dismissed">Afgewezen</option>
              </select>
              <select value={filterDifficulty} onChange={e => setFilterDifficulty(e.target.value)}
                className="bg-surface-1 text-text-primary text-[13px] px-3 py-2 rounded-xl outline-none border border-border-subtle hover:border-border focus:border-accent transition-colors duration-150 cursor-pointer">
                <option value="all">Alle moeilijkheid</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
              </select>
              <select value={sortBy} onChange={e => setSortBy(e.target.value as SortKey)}
                className="bg-surface-1 text-text-primary text-[13px] px-3 py-2 rounded-xl outline-none border border-border-subtle hover:border-border focus:border-accent transition-colors duration-150 cursor-pointer">
                <option value="priority_score">Prioriteit</option><option value="expected_revenue">Verwachte omzet</option>
                <option value="monthly_impressions">Zoekvolume</option><option value="difficulty">Moeilijkheid</option>
              </select>
            </div>

            <p className="text-text-tertiary text-[11px] mb-3">{filtered.length} van {opportunities.length} artikelideeën</p>

            {filtered.length === 0 ? (
              <div className="bg-surface-1 rounded-2xl border border-border-subtle p-16 text-center">
                <p className="text-text-primary text-[14px] font-semibold mb-1">
                  {opportunities.length === 0 ? 'Geen artikelideeën gevonden' : 'Geen resultaten voor deze filters'}
                </p>
                <p className="text-text-tertiary text-[13px] mb-4">
                  {opportunities.length === 0 ? 'Configureer Search Console + API key en klik op vernieuwen.' : 'Pas je filters aan.'}
                </p>
                {opportunities.length === 0 && (
                  <div className="flex items-center justify-center gap-3">
                    <button onClick={() => setShowSettings(true)} className="bg-accent hover:bg-accent-hover text-white text-[13px] font-medium px-4 py-2 rounded-xl transition-colors duration-150">Instellingen</button>
                    <button onClick={() => loadOpportunities(true)} className="text-[13px] text-text-tertiary hover:text-text-secondary px-4 py-2 rounded-xl hover:bg-surface-3 transition-colors duration-150">Data ophalen</button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map((opp, i) => (
                  <a
                    key={opp.id}
                    href={`/opportunities/${opp.id}`}
                    className="block bg-surface-1 rounded-2xl border border-border-subtle p-4 hover:border-border transition-colors duration-200 animate-row"
                    style={{ animationDelay: `${Math.min(i * 20, 400)}ms` }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <PriorityBadge score={opp.priority_score} />
                          <span className="text-text-primary text-[14px] font-semibold leading-snug">
                            {opp.title_suggestion || opp.keyword}
                          </span>
                          {opp.generated_content && (
                            <span className="text-[10px] font-semibold text-success bg-success/10 px-1.5 py-0.5 rounded-md">Gegenereerd</span>
                          )}
                        </div>
                        {opp.description && (
                          <p className="text-text-secondary text-[12px] leading-relaxed mb-2 ml-[40px] line-clamp-2">
                            {opp.description.split('\n\nDoelzoekwoorden:')[0]}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-2 ml-[40px]">
                          <Tip tip="Geschatte moeilijkheid om te ranken: easy = geen/lage concurrentie, medium = positie 11-30, hard = top 10">
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${DIFFICULTY_COLORS[opp.difficulty]?.bg || 'bg-surface-3'} ${DIFFICULTY_COLORS[opp.difficulty]?.text || 'text-text-tertiary'}`}>
                              {opp.difficulty}
                            </span>
                          </Tip>
                          <Tip tip="Type artikel: guide, how-to, comparison, listicle, tips, etc.">
                            <span className="text-[11px] text-text-tertiary bg-surface-2 px-2 py-0.5 rounded-md">
                              {opp.source.startsWith('ai_') ? opp.source.replace('ai_', '') : opp.source}
                            </span>
                          </Tip>
                          {opp.brand_fit_score >= 60 && (
                            <Tip tip="Hoe goed dit keyword past bij het productaanbod: 100 = exact product, 80 = jump rope gerelateerd, 60 = crossfit/fitness">
                              <span className="text-[11px] font-medium text-accent bg-accent-subtle px-2 py-0.5 rounded-md">Brand fit {opp.brand_fit_score}%</span>
                            </Tip>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-right space-y-1">
                        <Tip tip="Verwachte maandelijkse omzet = verwacht verkeer × gem. omzet per organische bezoeker (uit bestaande GA4 data)">
                          <p className="text-[16px] font-bold text-text-primary tabular-nums leading-none">
                            {formatCurrency(opp.expected_revenue)}<span className="text-text-tertiary text-[11px] font-normal">/mnd</span>
                          </p>
                        </Tip>
                        <p className="text-text-tertiary text-[11px] tabular-nums">
                          <Tip tip="Maandelijks zoekvolume (Keyword Planner of Search Console impressies als fallback)">{formatNumber(opp.estimated_volume)} vol</Tip>
                          {' · '}
                          <Tip tip="Verwacht maandelijks verkeer = zoekvolume × CTR uit eigen Search Console data">{formatNumber(opp.expected_traffic)} bezoekers</Tip>
                          {opp.data_source && DATA_SOURCE_LABELS[opp.data_source] && (
                            <>
                              {' · '}
                              <Tip tip={DATA_SOURCE_LABELS[opp.data_source].tip}>
                                <span className={`inline-flex text-[10px] font-semibold px-1 py-0 rounded ${DATA_SOURCE_LABELS[opp.data_source].color}`}>
                                  {DATA_SOURCE_LABELS[opp.data_source].label}
                                </span>
                              </Tip>
                            </>
                          )}
                        </p>
                        <select
                          value={opp.status}
                          onClick={e => e.preventDefault()}
                          onChange={e => { e.preventDefault(); updateStatus(opp.id, e.target.value) }}
                          className={`mt-1 text-[11px] font-medium px-2 py-1 rounded-lg outline-none border cursor-pointer transition-colors duration-150 ${
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
                    </div>
                  </a>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
    </div>
  )
}
