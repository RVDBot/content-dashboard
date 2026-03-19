'use client'

import { useEffect, useState, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
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
    // Remove language prefixes like /en/, /de/, etc. and extract blog slug
    const match = path.match(/\/blog\/(.+?)\/?\s*$/)
    if (match) return match[1]
    // Fallback: last path segment
    const segments = path.replace(/\/+$/, '').split('/')
    return segments[segments.length - 1] || url
  } catch {
    return url
  }
}

function formatCurrency(n: number): string {
  return `€${n.toLocaleString('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
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

function SortArrow({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return null
  return (
    <svg className="w-3 h-3 ml-1 inline-block text-accent" viewBox="0 0 12 12" fill="currentColor">
      {dir === 'desc' ? <path d="M6 9L2 4h8L6 9z" /> : <path d="M6 3l4 5H2l4-5z" />}
    </svg>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload, label, metric }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-surface-1 border border-border rounded-xl px-4 py-3 shadow-lg shadow-black/8">
      <p className="text-text-primary text-[12px] font-semibold mb-2 max-w-[200px] truncate">{label}</p>
      {payload.map((entry: { color: string; name: string; value: number }) => (
        <div key={entry.name} className="flex items-center gap-2 text-[12px]">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
          <span className="text-text-tertiary">{LANG_LABELS[entry.name] || entry.name.toUpperCase()}</span>
          <span className="text-text-primary font-semibold ml-auto tabular-nums">
            {metric === 'revenue' ? formatCurrency(entry.value) : formatNumber(entry.value)}
          </span>
        </div>
      ))}
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
  const [chartMetric, setChartMetric] = useState<'revenue' | 'sessions'>('revenue')
  const [sortBy, setSortBy] = useState<'totalRevenue' | 'totalSessions' | 'totalPageviews' | 'title'>('totalRevenue')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

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
        group = {
          slug,
          title: '',
          languages: {},
          totalRevenue: 0,
          totalSessions: 0,
          totalPageviews: 0,
          totalTransactions: 0,
        }
        map.set(slug, group)
      }
      if (a.language) {
        group.languages[a.language] = a
      }
      group.totalRevenue += a.revenue
      group.totalSessions += a.sessions
      group.totalPageviews += a.pageviews
      group.totalTransactions += a.transactions
      // Use English title as base, fallback to first available
      if (a.language === 'en' || !group.title) {
        group.title = a.title || slug
      }
    }

    return [...map.values()]
  }, [articles])

  // Available languages in data
  const languages = useMemo(() => {
    const langs = new Set<string>()
    articles.forEach(a => { if (a.language) langs.add(a.language) })
    return [...langs].sort((a, b) => {
      // EN first, then alphabetical
      if (a === 'en') return -1
      if (b === 'en') return 1
      return a.localeCompare(b)
    })
  }, [articles])

  // Sorted groups
  const sortedGroups = useMemo(() => {
    return [...groups].sort((a, b) => {
      let cmp = 0
      if (sortBy === 'title') cmp = a.title.localeCompare(b.title)
      else cmp = a[sortBy] - b[sortBy]
      return sortDir === 'desc' ? -cmp : cmp
    })
  }, [groups, sortBy, sortDir])

  // Cumulative chart data
  const chartData = useMemo(() => {
    // Sort groups by total of the current metric descending
    const sorted = [...groups].sort((a, b) =>
      chartMetric === 'revenue' ? b.totalRevenue - a.totalRevenue : b.totalSessions - a.totalSessions
    )

    // Build cumulative sums per language
    const cumulative: Record<string, number> = {}
    languages.forEach(l => { cumulative[l] = 0 })

    return sorted.map(g => {
      const point: Record<string, string | number> = {
        name: g.title.length > 35 ? g.title.slice(0, 32) + '...' : g.title,
        fullName: g.title,
      }
      for (const lang of languages) {
        const article = g.languages[lang]
        if (article) {
          cumulative[lang] += chartMetric === 'revenue' ? article.revenue : article.sessions
        }
        point[lang] = Math.round(cumulative[lang] * 100) / 100
      }
      return point
    })
  }, [groups, languages, chartMetric])

  // Revenue breakdown per language
  const langBreakdown = useMemo(() => {
    const totals: Record<string, { revenue: number; sessions: number; articles: number }> = {}
    for (const a of articles) {
      const lang = a.language || 'unknown'
      if (!totals[lang]) totals[lang] = { revenue: 0, sessions: 0, articles: 0 }
      totals[lang].revenue += a.revenue
      totals[lang].sessions += a.sessions
      totals[lang].articles++
    }
    return Object.entries(totals).sort((a, b) => b[1].revenue - a[1].revenue)
  }, [articles])

  const totalRevenue = articles.reduce((s, a) => s + a.revenue, 0)
  const totalSessions = articles.reduce((s, a) => s + a.sessions, 0)

  function toggleSort(col: typeof sortBy) {
    if (sortBy === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortBy(col); setSortDir('desc') }
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-surface-0/80 backdrop-blur-xl border-b border-border-subtle">
        <div className="max-w-[1400px] mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center">
              <svg className="w-4 h-4 text-white" viewBox="0 0 16 16" fill="currentColor">
                <path d="M2 3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3zm0 5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8zm0 5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-1z" />
              </svg>
            </div>
            <h1 className="text-[15px] font-semibold text-text-primary">Content Dashboard</h1>
          </div>

          <div className="flex items-center gap-2">
            {cached && (
              <span className="text-text-tertiary text-[11px] bg-surface-2 px-2 py-1 rounded-md">Cache</span>
            )}
            <button
              onClick={() => loadArticles(true)}
              disabled={refreshing}
              className="p-2 rounded-lg text-text-tertiary hover:text-text-secondary hover:bg-surface-2 disabled:opacity-40 transition-all duration-150"
              title="Vernieuwen"
            >
              <RefreshIcon spinning={refreshing} />
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 rounded-lg text-text-tertiary hover:text-text-secondary hover:bg-surface-2 transition-all duration-150"
              title="Instellingen"
            >
              <SettingsIcon />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-6 py-6">
        {/* Loading */}
        {loading && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4 mb-6">
            <div className="bg-surface-1 rounded-2xl border border-border-subtle p-6">
              <div className="skeleton h-4 w-40 mb-4" />
              <div className="skeleton h-[280px] w-full rounded-xl" />
            </div>
            <div className="bg-surface-1 rounded-2xl border border-border-subtle p-6">
              <div className="skeleton h-4 w-24 mb-4" />
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-12 w-full rounded-xl" />)}
              </div>
            </div>
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
            {/* Chart + Revenue breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4 mb-6">
              {/* Cumulative chart */}
              <div className="bg-surface-1 rounded-2xl border border-border-subtle p-6">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-text-primary text-[14px] font-semibold">
                    Cumulatieve {chartMetric === 'revenue' ? 'omzet' : 'bezoekers'} per taal
                  </h2>
                  <div className="flex bg-surface-0 rounded-lg p-0.5 border border-border-subtle">
                    <button
                      onClick={() => setChartMetric('revenue')}
                      className={`text-[12px] font-medium px-3 py-1.5 rounded-md transition-all duration-150 ${
                        chartMetric === 'revenue'
                          ? 'bg-surface-1 text-text-primary shadow-sm'
                          : 'text-text-tertiary hover:text-text-secondary'
                      }`}
                    >
                      Omzet
                    </button>
                    <button
                      onClick={() => setChartMetric('sessions')}
                      className={`text-[12px] font-medium px-3 py-1.5 rounded-md transition-all duration-150 ${
                        chartMetric === 'sessions'
                          ? 'bg-surface-1 text-text-primary shadow-sm'
                          : 'text-text-tertiary hover:text-text-secondary'
                      }`}
                    >
                      Bezoekers
                    </button>
                  </div>
                </div>

                {/* Legend */}
                <div className="flex flex-wrap gap-4 mb-4">
                  {languages.map(lang => (
                    <div key={lang} className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: LANG_COLORS[lang] || '#94a3b8' }} />
                      <span className="text-text-secondary text-[12px] font-medium">{LANG_LABELS[lang] || lang.toUpperCase()}</span>
                    </div>
                  ))}
                </div>

                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" />
                      <XAxis
                        dataKey="name"
                        tick={false}
                        axisLine={{ stroke: 'var(--color-border)' }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={v => chartMetric === 'revenue' ? `€${(v / 1000).toFixed(0)}k` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                        width={52}
                      />
                      <Tooltip content={<ChartTooltip metric={chartMetric} />} />
                      {languages.map(lang => (
                        <Line
                          key={lang}
                          type="monotone"
                          dataKey={lang}
                          stroke={LANG_COLORS[lang] || '#94a3b8'}
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <p className="text-text-tertiary text-[11px] mt-3">
                  {groups.length} artikelen, gesorteerd op {chartMetric === 'revenue' ? 'omzet' : 'bezoekers'} (hoogste eerst)
                </p>
              </div>

              {/* Revenue breakdown */}
              <div className="bg-surface-1 rounded-2xl border border-border-subtle p-6">
                <h2 className="text-text-primary text-[14px] font-semibold mb-5">Omzet per taal</h2>

                {/* Total */}
                <div className="bg-surface-0 rounded-xl p-4 mb-4 border border-border-subtle">
                  <p className="text-text-tertiary text-[11px] font-semibold uppercase tracking-wider mb-1">Totaal</p>
                  <p className="text-[24px] font-bold text-text-primary tracking-tight leading-none">
                    {formatCurrency(totalRevenue)}
                  </p>
                  <p className="text-text-tertiary text-[12px] mt-1.5">
                    {formatNumber(totalSessions)} bezoekers
                  </p>
                </div>

                {/* Per language */}
                <div className="space-y-2">
                  {langBreakdown.map(([lang, data]) => {
                    const pct = totalRevenue > 0 ? (data.revenue / totalRevenue) * 100 : 0
                    return (
                      <div key={lang} className="bg-surface-0 rounded-xl p-3.5 border border-border-subtle">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: LANG_COLORS[lang] || '#94a3b8' }}
                            />
                            <span className="text-text-primary text-[13px] font-medium">
                              {LANG_LABELS[lang] || lang.toUpperCase()}
                            </span>
                          </div>
                          <span className="text-text-primary text-[13px] font-semibold tabular-nums">
                            {formatCurrency(data.revenue)}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex-1 bg-surface-3 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${pct}%`,
                                backgroundColor: LANG_COLORS[lang] || '#94a3b8',
                              }}
                            />
                          </div>
                          <span className="text-text-tertiary text-[11px] tabular-nums w-10 text-right">
                            {pct.toFixed(0)}%
                          </span>
                        </div>
                        <p className="text-text-tertiary text-[11px] mt-1.5">
                          {data.articles} artikelen &middot; {formatNumber(data.sessions)} bezoekers
                        </p>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Article table */}
            <div className="bg-surface-1 rounded-2xl border border-border-subtle overflow-hidden">
              <div className="px-5 py-3 border-b border-border-subtle flex items-center justify-between">
                <span className="text-text-secondary text-xs font-medium">
                  {groups.length} unieke artikel{groups.length !== 1 ? 'en' : ''}
                </span>
                <span className="text-text-tertiary text-[11px]">
                  Engelse titel als referentie
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-border-subtle">
                      <th
                        onClick={() => toggleSort('title')}
                        className={`px-5 py-3 text-left font-medium text-xs uppercase tracking-wider cursor-pointer select-none hover:text-text-secondary transition-colors ${sortBy === 'title' ? 'text-text-secondary' : 'text-text-tertiary'}`}
                      >
                        Artikel
                        <SortArrow active={sortBy === 'title'} dir={sortDir} />
                      </th>
                      <th className="px-3 py-3 text-center font-medium text-text-tertiary text-xs uppercase tracking-wider">
                        Talen
                      </th>
                      <th
                        onClick={() => toggleSort('totalPageviews')}
                        className={`px-5 py-3 text-right font-medium text-xs uppercase tracking-wider cursor-pointer select-none hover:text-text-secondary transition-colors ${sortBy === 'totalPageviews' ? 'text-text-secondary' : 'text-text-tertiary'}`}
                      >
                        Pageviews
                        <SortArrow active={sortBy === 'totalPageviews'} dir={sortDir} />
                      </th>
                      <th
                        onClick={() => toggleSort('totalSessions')}
                        className={`px-5 py-3 text-right font-medium text-xs uppercase tracking-wider cursor-pointer select-none hover:text-text-secondary transition-colors ${sortBy === 'totalSessions' ? 'text-text-secondary' : 'text-text-tertiary'}`}
                      >
                        Bezoekers
                        <SortArrow active={sortBy === 'totalSessions'} dir={sortDir} />
                      </th>
                      <th
                        onClick={() => toggleSort('totalRevenue')}
                        className={`px-5 py-3 text-right font-medium text-xs uppercase tracking-wider cursor-pointer select-none hover:text-text-secondary transition-colors ${sortBy === 'totalRevenue' ? 'text-text-secondary' : 'text-text-tertiary'}`}
                      >
                        Omzet
                        <SortArrow active={sortBy === 'totalRevenue'} dir={sortDir} />
                      </th>
                      {/* Per-language revenue columns */}
                      {languages.map(lang => (
                        <th key={lang} className="px-3 py-3 text-right font-medium text-text-tertiary text-xs uppercase tracking-wider">
                          <span className="inline-flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: LANG_COLORS[lang] || '#94a3b8' }} />
                            {lang.toUpperCase()}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedGroups.length === 0 && (
                      <tr>
                        <td colSpan={5 + languages.length} className="px-5 py-16 text-center">
                          <p className="text-text-tertiary text-sm">Geen artikelen gevonden</p>
                          <button onClick={() => loadArticles(true)} className="mt-3 text-accent text-xs font-medium hover:underline">
                            Data ophalen
                          </button>
                        </td>
                      </tr>
                    )}
                    {sortedGroups.map((g, i) => (
                      <tr
                        key={g.slug}
                        className="border-b border-border-subtle last:border-0 hover:bg-surface-hover transition-colors duration-100 animate-row"
                        style={{ animationDelay: `${Math.min(i * 15, 300)}ms` }}
                      >
                        <td className="px-5 py-3.5 max-w-[360px]">
                          <span className="text-text-primary font-medium truncate block" title={g.title}>
                            {g.title}
                          </span>
                        </td>
                        <td className="px-3 py-3.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {languages.map(lang => (
                              <span
                                key={lang}
                                className={`w-2 h-2 rounded-full ${g.languages[lang] ? '' : 'opacity-15'}`}
                                style={{ backgroundColor: LANG_COLORS[lang] || '#94a3b8' }}
                                title={`${LANG_LABELS[lang] || lang.toUpperCase()}${g.languages[lang] ? '' : ' (niet beschikbaar)'}`}
                              />
                            ))}
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-right text-text-secondary tabular-nums">
                          {formatNumber(g.totalPageviews)}
                        </td>
                        <td className="px-5 py-3.5 text-right text-text-secondary tabular-nums">
                          {formatNumber(g.totalSessions)}
                        </td>
                        <td className="px-5 py-3.5 text-right tabular-nums">
                          <span className={g.totalRevenue > 0 ? 'text-success font-semibold' : 'text-text-tertiary'}>
                            {formatCurrency(g.totalRevenue)}
                          </span>
                        </td>
                        {languages.map(lang => {
                          const a = g.languages[lang]
                          return (
                            <td key={lang} className="px-3 py-3.5 text-right tabular-nums text-[12px]">
                              {a ? (
                                <span className={a.revenue > 0 ? 'text-text-secondary' : 'text-text-tertiary'}>
                                  {formatCurrency(a.revenue)}
                                </span>
                              ) : (
                                <span className="text-text-tertiary/30">—</span>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
              <button
                onClick={() => setShowSettings(true)}
                className="bg-accent hover:bg-accent-hover text-white text-[13px] font-medium px-4 py-2 rounded-xl transition-colors duration-150"
              >
                Instellingen
              </button>
              <button
                onClick={() => loadArticles(true)}
                className="text-[13px] text-text-tertiary hover:text-text-secondary px-4 py-2 rounded-xl hover:bg-surface-3 transition-colors duration-150"
              >
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
