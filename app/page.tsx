'use client'

import { useEffect, useState, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import Settings from '@/components/Settings'

interface Article {
  url: string
  title: string
  language: string | null
  pageviews: number
  sessions: number
  revenue: number
  transactions: number
  revenuePerSession: number
}

interface ArticleGroup {
  slug: string
  title: string
  languages: Record<string, Article>
  totalRevenue: number
  totalSessions: number
  totalPageviews: number
  totalTransactions: number
}

const LANG_COLORS: Record<string, string> = {
  en: '#006fff',
  nl: '#f97316',
  de: '#64748b',
  es: '#ef4444',
  it: '#10b981',
  fr: '#8b5cf6',
}

const LANG_LABELS: Record<string, string> = {
  en: 'Engels',
  nl: 'Nederlands',
  de: 'Duits',
  es: 'Spaans',
  it: 'Italiaans',
  fr: 'Frans',
}

function extractSlug(url: string): string {
  try {
    const path = new URL(url).pathname
    const match = path.match(/\/blog\/(.+?)\/?\s*$/)
    if (match) return match[1]
    const segments = path.replace(/\/+$/, '').split('/')
    return segments[segments.length - 1] || url
  } catch {
    return url
  }
}

function formatCurrency(n: number, decimals = 0): string {
  return `€${n.toLocaleString('nl-NL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`
}

function formatNumber(n: number): string {
  return n.toLocaleString('nl-NL')
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ArticleChartTooltip({ active, payload, metric }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  return (
    <div className="bg-surface-1 border border-border rounded-xl px-3.5 py-2.5 shadow-lg shadow-black/8">
      <div className="flex items-center gap-2 text-[12px]">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
        <span className="text-text-secondary font-medium">{d.label}</span>
        <span className="text-text-primary font-semibold ml-auto tabular-nums">
          {metric === 'revenue' ? formatCurrency(d.value, 2) : formatNumber(d.value)}
        </span>
      </div>
    </div>
  )
}

function ArticleCard({
  group,
  languages,
  metric,
  rank,
}: {
  group: ArticleGroup
  languages: string[]
  metric: 'revenue' | 'sessions'
  rank: number
}) {
  const chartData = languages.map(lang => {
    const a = group.languages[lang]
    return {
      lang,
      label: LANG_LABELS[lang] || lang.toUpperCase(),
      value: a ? (metric === 'revenue' ? a.revenue : a.sessions) : 0,
      color: LANG_COLORS[lang] || '#94a3b8',
      available: !!a,
    }
  }).filter(d => d.available)

  const maxValue = Math.max(...chartData.map(d => d.value), 1)
  const totalValue = metric === 'revenue' ? group.totalRevenue : group.totalSessions
  const enArticle = group.languages['en']
  const enUrl = enArticle?.url

  return (
    <div className="bg-surface-1 rounded-2xl border border-border-subtle p-5 hover:border-border transition-colors duration-200 animate-row" style={{ animationDelay: `${Math.min(rank * 30, 400)}ms` }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 mb-1">
            <span className="text-text-tertiary text-[11px] font-bold tabular-nums shrink-0">#{rank}</span>
            {enUrl ? (
              <a href={enUrl} target="_blank" rel="noopener noreferrer" className="text-text-primary text-[14px] font-semibold truncate hover:text-accent transition-colors">
                {group.title}
              </a>
            ) : (
              <span className="text-text-primary text-[14px] font-semibold truncate">{group.title}</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 ml-[26px]">
            {languages.map(lang => (
              <span
                key={lang}
                className={`w-2 h-2 rounded-full ${group.languages[lang] ? '' : 'opacity-15'}`}
                style={{ backgroundColor: LANG_COLORS[lang] || '#94a3b8' }}
                title={`${LANG_LABELS[lang] || lang.toUpperCase()}${group.languages[lang] ? '' : ' (geen data)'}`}
              />
            ))}
            <span className="text-text-tertiary text-[11px] ml-1.5">
              {Object.keys(group.languages).length}/{languages.length} talen
            </span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className={`text-[18px] font-bold tabular-nums leading-none ${group.totalRevenue > 0 ? 'text-text-primary' : 'text-text-tertiary'}`}>
            {formatCurrency(group.totalRevenue)}
          </p>
          <p className="text-text-tertiary text-[11px] mt-1 tabular-nums">
            {formatNumber(group.totalSessions)} bezoekers
          </p>
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="ml-[26px]">
          <div className="h-[${chartData.length * 36 + 8}px]" style={{ height: chartData.length * 36 + 8 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                <XAxis type="number" hide domain={[0, maxValue * 1.15]} />
                <YAxis
                  type="category"
                  dataKey="lang"
                  width={28}
                  tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)', fontWeight: 600 }}
                  tickFormatter={v => v.toUpperCase()}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<ArticleChartTooltip metric={metric} />} cursor={false} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={20}>
                  {chartData.map((d, i) => (
                    <Cell key={i} fill={d.color} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Values next to bars */}
          <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2">
            {chartData.map(d => (
              <div key={d.lang} className="flex items-center gap-1.5 text-[11px]">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                <span className="text-text-tertiary">{d.label}</span>
                <span className="text-text-secondary font-semibold tabular-nums">
                  {metric === 'revenue' ? formatCurrency(d.value, 2) : formatNumber(d.value)}
                </span>
                {totalValue > 0 && (
                  <span className="text-text-tertiary tabular-nums">
                    ({((d.value / totalValue) * 100).toFixed(0)}%)
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Home() {
  const [articles, setArticles] = useState<Article[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [cached, setCached] = useState(false)
  const [metric, setMetric] = useState<'revenue' | 'sessions'>('revenue')
  const [sortBy, setSortBy] = useState<'revenue' | 'sessions'>('revenue')

  function loadArticles(refresh = false) {
    const url = refresh ? '/api/articles?refresh=1' : '/api/articles'
    if (refresh) setRefreshing(true)
    else setLoading(true)
    setError(null)
    fetch(url)
      .then(async r => {
        if (!r.ok) {
          const text = await r.text()
          throw new Error(`Server fout (${r.status}): ${text.slice(0, 200)}`)
        }
        return r.json()
      })
      .then(data => {
        if (data.error) {
          setError(data.error)
        } else {
          setArticles(data.articles || [])
          setCached(!!data.cached)
        }
      })
      .catch(e => setError(e.message))
      .finally(() => { setLoading(false); setRefreshing(false) })
  }

  useEffect(() => { loadArticles() }, [])

  // Group articles by slug
  const groups = useMemo<ArticleGroup[]>(() => {
    const map = new Map<string, ArticleGroup>()
    for (const a of articles) {
      const slug = extractSlug(a.url)
      let group = map.get(slug)
      if (!group) {
        group = { slug, title: '', languages: {}, totalRevenue: 0, totalSessions: 0, totalPageviews: 0, totalTransactions: 0 }
        map.set(slug, group)
      }
      if (a.language) group.languages[a.language] = a
      group.totalRevenue += a.revenue
      group.totalSessions += a.sessions
      group.totalPageviews += a.pageviews
      group.totalTransactions += a.transactions
      if (a.language === 'en' || !group.title) group.title = a.title || slug
    }
    return [...map.values()]
  }, [articles])

  const languages = useMemo(() => {
    const langs = new Set<string>()
    articles.forEach(a => { if (a.language) langs.add(a.language) })
    return [...langs].sort((a, b) => {
      if (a === 'en') return -1
      if (b === 'en') return 1
      return a.localeCompare(b)
    })
  }, [articles])

  const sortedGroups = useMemo(() => {
    return [...groups].sort((a, b) =>
      sortBy === 'revenue' ? b.totalRevenue - a.totalRevenue : b.totalSessions - a.totalSessions
    )
  }, [groups, sortBy])

  // Totals per language
  const langTotals = useMemo(() => {
    const totals: Record<string, { revenue: number; sessions: number }> = {}
    for (const a of articles) {
      const lang = a.language || 'unknown'
      if (!totals[lang]) totals[lang] = { revenue: 0, sessions: 0 }
      totals[lang].revenue += a.revenue
      totals[lang].sessions += a.sessions
    }
    return totals
  }, [articles])

  const totalRevenue = articles.reduce((s, a) => s + a.revenue, 0)
  const totalSessions = articles.reduce((s, a) => s + a.sessions, 0)

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-surface-0/80 backdrop-blur-xl border-b border-border-subtle">
        <div className="max-w-[1100px] mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center">
              <svg className="w-4 h-4 text-white" viewBox="0 0 16 16" fill="currentColor">
                <path d="M2 3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3zm0 5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8zm0 5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-1z" />
              </svg>
            </div>
            <h1 className="text-[15px] font-semibold text-text-primary">Content Dashboard</h1>
          </div>
          <div className="flex items-center gap-2">
            {cached && <span className="text-text-tertiary text-[11px] bg-surface-2 px-2 py-1 rounded-md">Cache</span>}
            <button onClick={() => loadArticles(true)} disabled={refreshing} className="p-2 rounded-lg text-text-tertiary hover:text-text-secondary hover:bg-surface-2 disabled:opacity-40 transition-all duration-150" title="Vernieuwen">
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
                <div className="flex justify-between mb-4">
                  <div className="skeleton h-5 w-60" />
                  <div className="skeleton h-6 w-20" />
                </div>
                <div className="skeleton h-24 w-full rounded-xl" />
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

        {!loading && !error && articles.length > 0 && (
          <>
            {/* Summary bar */}
            <div className="bg-surface-1 rounded-2xl border border-border-subtle p-5 mb-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                {/* Totals */}
                <div className="flex items-center gap-8">
                  <div>
                    <p className="text-text-tertiary text-[11px] font-semibold uppercase tracking-wider mb-0.5">Totale omzet</p>
                    <p className="text-[22px] font-bold text-text-primary tracking-tight leading-none tabular-nums">
                      {formatCurrency(totalRevenue)}
                    </p>
                  </div>
                  <div>
                    <p className="text-text-tertiary text-[11px] font-semibold uppercase tracking-wider mb-0.5">Bezoekers</p>
                    <p className="text-[22px] font-bold text-text-primary tracking-tight leading-none tabular-nums">
                      {formatNumber(totalSessions)}
                    </p>
                  </div>
                  <div className="hidden sm:block">
                    <p className="text-text-tertiary text-[11px] font-semibold uppercase tracking-wider mb-0.5">Artikelen</p>
                    <p className="text-[22px] font-bold text-text-primary tracking-tight leading-none tabular-nums">
                      {groups.length}
                    </p>
                  </div>
                </div>

                {/* Language chips */}
                <div className="flex flex-wrap items-center gap-2">
                  {languages.map(lang => {
                    const t = langTotals[lang]
                    return (
                      <div key={lang} className="flex items-center gap-1.5 bg-surface-0 border border-border-subtle rounded-lg px-2.5 py-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: LANG_COLORS[lang] || '#94a3b8' }} />
                        <span className="text-text-secondary text-[11px] font-semibold">{lang.toUpperCase()}</span>
                        <span className="text-text-tertiary text-[11px] tabular-nums">{t ? formatCurrency(t.revenue) : '—'}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex bg-surface-1 rounded-lg p-0.5 border border-border-subtle">
                <button
                  onClick={() => { setMetric('revenue'); setSortBy('revenue') }}
                  className={`text-[12px] font-medium px-3 py-1.5 rounded-md transition-all duration-150 ${
                    metric === 'revenue' ? 'bg-surface-3 text-text-primary shadow-sm' : 'text-text-tertiary hover:text-text-secondary'
                  }`}
                >
                  Omzet
                </button>
                <button
                  onClick={() => { setMetric('sessions'); setSortBy('sessions') }}
                  className={`text-[12px] font-medium px-3 py-1.5 rounded-md transition-all duration-150 ${
                    metric === 'sessions' ? 'bg-surface-3 text-text-primary shadow-sm' : 'text-text-tertiary hover:text-text-secondary'
                  }`}
                >
                  Bezoekers
                </button>
              </div>
              <span className="text-text-tertiary text-[11px]">
                Gesorteerd op {metric === 'revenue' ? 'omzet' : 'bezoekers'} &middot; Engelse titel als referentie
              </span>
            </div>

            {/* Article cards */}
            <div className="space-y-3">
              {sortedGroups.map((g, i) => (
                <ArticleCard key={g.slug} group={g} languages={languages} metric={metric} rank={i + 1} />
              ))}
            </div>
          </>
        )}

        {/* Empty state */}
        {!loading && !error && articles.length === 0 && (
          <div className="bg-surface-1 rounded-2xl border border-border-subtle p-16 text-center">
            <div className="w-12 h-12 rounded-2xl bg-surface-0 border border-border-subtle flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-text-tertiary" viewBox="0 0 16 16" fill="currentColor">
                <path d="M2 3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3zm0 5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8z" />
              </svg>
            </div>
            <p className="text-text-primary text-[14px] font-semibold mb-1">Geen data beschikbaar</p>
            <p className="text-text-tertiary text-[13px] mb-4">Configureer je GA4 properties en haal data op.</p>
            <div className="flex items-center justify-center gap-3">
              <button onClick={() => setShowSettings(true)} className="bg-accent hover:bg-accent-hover text-white text-[13px] font-medium px-4 py-2 rounded-xl transition-colors duration-150">
                Instellingen
              </button>
              <button onClick={() => loadArticles(true)} className="text-[13px] text-text-tertiary hover:text-text-secondary px-4 py-2 rounded-xl hover:bg-surface-3 transition-colors duration-150">
                Data ophalen
              </button>
            </div>
          </div>
        )}
      </main>

      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
    </div>
  )
}
