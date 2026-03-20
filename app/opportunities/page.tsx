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
  created_at: string
  updated_at: string
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

function PriorityBadge({ score }: { score: number }) {
  const color = score >= 70
    ? 'bg-success/15 text-success border-success/20'
    : score >= 40
      ? 'bg-warning/15 text-warning border-warning/20'
      : 'bg-danger/15 text-danger border-danger/20'

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[12px] font-bold tabular-nums border ${color}`}>
      {score}
    </span>
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
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cached, setCached] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [search, setSearch] = useState('')
  const [filterLang, setFilterLang] = useState<string>('all')
  const [filterDifficulty, setFilterDifficulty] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('active') // 'active' = new+planned
  const [sortBy, setSortBy] = useState<SortKey>('priority_score')

  function loadOpportunities(refresh = false) {
    const url = refresh ? '/api/opportunities?refresh=1' : '/api/opportunities'
    if (refresh) setRefreshing(true)
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

    // Status filter
    if (filterStatus === 'active') {
      result = result.filter(o => o.status === 'new' || o.status === 'planned')
    } else if (filterStatus !== 'all') {
      result = result.filter(o => o.status === filterStatus)
    }

    // Language filter
    if (filterLang !== 'all') {
      result = result.filter(o => o.language === filterLang)
    }

    // Difficulty filter
    if (filterDifficulty !== 'all') {
      result = result.filter(o => o.difficulty === filterDifficulty)
    }

    // Search
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(o =>
        o.keyword.toLowerCase().includes(q) ||
        o.title_suggestion?.toLowerCase().includes(q)
      )
    }

    // Sort
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
  }, [opportunities, filterStatus, filterLang, filterDifficulty, search, sortBy])

  // Summary stats
  const summary = useMemo(() => {
    const active = opportunities.filter(o => o.status === 'new' || o.status === 'planned')
    return {
      total: active.length,
      totalRevenue: active.reduce((s, o) => s + o.expected_revenue, 0),
      easy: active.filter(o => o.difficulty === 'easy').length,
      medium: active.filter(o => o.difficulty === 'medium').length,
      hard: active.filter(o => o.difficulty === 'hard').length,
    }
  }, [opportunities])

  const languages = useMemo(() => {
    const langs = new Set<string>()
    opportunities.forEach(o => { if (o.language) langs.add(o.language) })
    return [...langs].sort()
  }, [opportunities])

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-surface-0/80 backdrop-blur-xl border-b border-border-subtle">
        <div className="max-w-[1100px] mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center">
              <svg className="w-4 h-4 text-white" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 1l2 4 4.5.7-3.2 3.1.8 4.5L8 11.2 3.9 13.3l.8-4.5L1.5 5.7 6 5z" />
              </svg>
            </div>
            <div className="flex items-center gap-2">
              {/* Navigation pills */}
              <nav className="flex bg-surface-1 rounded-lg p-0.5 border border-border-subtle">
                <a
                  href="/"
                  className="text-[12px] font-medium px-3 py-1.5 rounded-md text-text-tertiary hover:text-text-secondary transition-all duration-150"
                >
                  Dashboard
                </a>
                <span className="text-[12px] font-medium px-3 py-1.5 rounded-md bg-surface-3 text-text-primary shadow-sm">
                  Opportunities
                </span>
              </nav>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {cached && <span className="text-text-tertiary text-[11px] bg-surface-2 px-2 py-1 rounded-md">Cache</span>}
            <button onClick={() => loadOpportunities(true)} disabled={refreshing} className="p-2 rounded-lg text-text-tertiary hover:text-text-secondary hover:bg-surface-2 disabled:opacity-40 transition-all duration-150" title="Vernieuwen">
              <RefreshIcon spinning={refreshing} />
            </button>
            <button onClick={() => setShowSettings(true)} className="p-2 rounded-lg text-text-tertiary hover:text-text-secondary hover:bg-surface-2 transition-all duration-150" title="Instellingen">
              <SettingsIcon />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1100px] mx-auto px-6 py-6">
        {/* Loading */}
        {loading && (
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-surface-1 rounded-2xl border border-border-subtle p-5">
                <div className="flex justify-between mb-3">
                  <div className="skeleton h-5 w-60" />
                  <div className="skeleton h-6 w-16" />
                </div>
                <div className="skeleton h-4 w-40" />
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-danger-subtle border border-danger/20 rounded-2xl p-5 mb-6">
            <p className="text-danger text-sm font-medium">{error}</p>
            <button onClick={() => setShowSettings(true)} className="text-accent text-xs mt-2 hover:underline font-medium">
              Instellingen openen
            </button>
          </div>
        )}

        {!loading && (
          <>
            {/* Summary */}
            <div className="bg-surface-1 rounded-2xl border border-border-subtle p-5 mb-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-8">
                  <div>
                    <p className="text-text-tertiary text-[11px] font-semibold uppercase tracking-wider mb-0.5">Opportunities</p>
                    <p className="text-[22px] font-bold text-text-primary tracking-tight leading-none tabular-nums">
                      {summary.total}
                    </p>
                  </div>
                  <div>
                    <p className="text-text-tertiary text-[11px] font-semibold uppercase tracking-wider mb-0.5">Potentiele omzet/mnd</p>
                    <p className="text-[22px] font-bold text-text-primary tracking-tight leading-none tabular-nums">
                      {formatCurrency(summary.totalRevenue)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1.5 bg-surface-0 border border-border-subtle rounded-lg px-2.5 py-1.5">
                    <span className="w-2 h-2 rounded-full bg-success" />
                    <span className="text-text-secondary text-[11px] font-semibold">Easy</span>
                    <span className="text-text-tertiary text-[11px] tabular-nums">{summary.easy}</span>
                  </span>
                  <span className="flex items-center gap-1.5 bg-surface-0 border border-border-subtle rounded-lg px-2.5 py-1.5">
                    <span className="w-2 h-2 rounded-full bg-warning" />
                    <span className="text-text-secondary text-[11px] font-semibold">Medium</span>
                    <span className="text-text-tertiary text-[11px] tabular-nums">{summary.medium}</span>
                  </span>
                  <span className="flex items-center gap-1.5 bg-surface-0 border border-border-subtle rounded-lg px-2.5 py-1.5">
                    <span className="w-2 h-2 rounded-full bg-danger" />
                    <span className="text-text-secondary text-[11px] font-semibold">Hard</span>
                    <span className="text-text-tertiary text-[11px] tabular-nums">{summary.hard}</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Filters & Sort */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              {/* Search */}
              <div className="relative flex-1 min-w-[200px]">
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Zoek keywords..."
                  className="w-full bg-surface-1 text-text-primary text-[13px] pl-8 pr-3 py-2 rounded-xl outline-none border border-border-subtle hover:border-border focus:border-accent placeholder:text-text-tertiary transition-colors duration-150"
                />
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="7" cy="7" r="4.5" />
                  <path d="M10.5 10.5L14 14" strokeLinecap="round" />
                </svg>
              </div>

              {/* Status filter */}
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="bg-surface-1 text-text-primary text-[13px] px-3 py-2 rounded-xl outline-none border border-border-subtle hover:border-border focus:border-accent transition-colors duration-150 cursor-pointer"
              >
                <option value="active">Actief</option>
                <option value="all">Alle</option>
                <option value="new">Nieuw</option>
                <option value="planned">Gepland</option>
                <option value="written">Geschreven</option>
                <option value="dismissed">Afgewezen</option>
              </select>

              {/* Language filter */}
              <select
                value={filterLang}
                onChange={e => setFilterLang(e.target.value)}
                className="bg-surface-1 text-text-primary text-[13px] px-3 py-2 rounded-xl outline-none border border-border-subtle hover:border-border focus:border-accent transition-colors duration-150 cursor-pointer"
              >
                <option value="all">Alle talen</option>
                {languages.map(l => (
                  <option key={l} value={l}>{l.toUpperCase()}</option>
                ))}
              </select>

              {/* Difficulty filter */}
              <select
                value={filterDifficulty}
                onChange={e => setFilterDifficulty(e.target.value)}
                className="bg-surface-1 text-text-primary text-[13px] px-3 py-2 rounded-xl outline-none border border-border-subtle hover:border-border focus:border-accent transition-colors duration-150 cursor-pointer"
              >
                <option value="all">Alle moeilijkheid</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>

              {/* Sort */}
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as SortKey)}
                className="bg-surface-1 text-text-primary text-[13px] px-3 py-2 rounded-xl outline-none border border-border-subtle hover:border-border focus:border-accent transition-colors duration-150 cursor-pointer"
              >
                <option value="priority_score">Prioriteit</option>
                <option value="expected_revenue">Verwachte omzet</option>
                <option value="monthly_impressions">Zoekvolume</option>
                <option value="difficulty">Moeilijkheid</option>
              </select>
            </div>

            {/* Results count */}
            <p className="text-text-tertiary text-[11px] mb-3">
              {filtered.length} van {opportunities.length} opportunities
            </p>

            {/* Opportunity cards */}
            {filtered.length === 0 ? (
              <div className="bg-surface-1 rounded-2xl border border-border-subtle p-16 text-center">
                <p className="text-text-primary text-[14px] font-semibold mb-1">
                  {opportunities.length === 0 ? 'Geen opportunities gevonden' : 'Geen resultaten voor deze filters'}
                </p>
                <p className="text-text-tertiary text-[13px] mb-4">
                  {opportunities.length === 0
                    ? 'Configureer Search Console en klik op vernieuwen.'
                    : 'Pas je filters aan om meer resultaten te zien.'}
                </p>
                {opportunities.length === 0 && (
                  <div className="flex items-center justify-center gap-3">
                    <button onClick={() => setShowSettings(true)} className="bg-accent hover:bg-accent-hover text-white text-[13px] font-medium px-4 py-2 rounded-xl transition-colors duration-150">
                      Instellingen
                    </button>
                    <button onClick={() => loadOpportunities(true)} className="text-[13px] text-text-tertiary hover:text-text-secondary px-4 py-2 rounded-xl hover:bg-surface-3 transition-colors duration-150">
                      Data ophalen
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map((opp, i) => (
                  <div
                    key={opp.id}
                    className="bg-surface-1 rounded-2xl border border-border-subtle p-4 hover:border-border transition-colors duration-200 animate-row"
                    style={{ animationDelay: `${Math.min(i * 20, 400)}ms` }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      {/* Left: keyword info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <PriorityBadge score={opp.priority_score} />
                          <span className="text-text-primary text-[14px] font-semibold truncate">{opp.keyword}</span>
                        </div>
                        {opp.title_suggestion && (
                          <p className="text-text-secondary text-[13px] mb-1.5 ml-[40px]">{opp.title_suggestion}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-2 ml-[40px]">
                          {/* Difficulty badge */}
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${DIFFICULTY_COLORS[opp.difficulty]?.bg || 'bg-surface-3'} ${DIFFICULTY_COLORS[opp.difficulty]?.text || 'text-text-tertiary'}`}>
                            {opp.difficulty}
                          </span>
                          {/* Language */}
                          {opp.language && (
                            <span className="text-[11px] font-semibold text-text-tertiary bg-surface-3 px-2 py-0.5 rounded-md">
                              {opp.language.toUpperCase()}
                            </span>
                          )}
                          {/* Source */}
                          <span className="text-[11px] text-text-tertiary bg-surface-2 px-2 py-0.5 rounded-md">
                            {opp.source === 'search_console' ? 'Search Console' : 'Autocomplete'}
                          </span>
                          {/* Brand fit */}
                          {opp.brand_fit_score >= 60 && (
                            <span className="text-[11px] font-medium text-accent bg-accent-subtle px-2 py-0.5 rounded-md">
                              Brand fit {opp.brand_fit_score}%
                            </span>
                          )}
                          {/* Existing content */}
                          {opp.has_existing_content === 1 && opp.existing_url && (
                            <a href={opp.existing_url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-accent hover:text-accent-hover transition-colors">
                              Bestaand artikel (pos. {opp.current_position?.toFixed(1)})
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Right: metrics + actions */}
                      <div className="shrink-0 text-right space-y-1">
                        <p className="text-[16px] font-bold text-text-primary tabular-nums leading-none">
                          {formatCurrency(opp.expected_revenue)}
                          <span className="text-text-tertiary text-[11px] font-normal">/mnd</span>
                        </p>
                        <p className="text-text-tertiary text-[11px] tabular-nums">
                          {formatNumber(opp.monthly_impressions)} impressies &middot; {formatNumber(opp.expected_traffic)} bezoekers
                        </p>
                        <select
                          value={opp.status}
                          onChange={e => updateStatus(opp.id, e.target.value)}
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
                  </div>
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
