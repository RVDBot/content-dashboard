'use client'

import { useEffect, useState, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import Settings from '@/components/Settings'

interface Article {
  url: string
  title: string
  language: string | null
  group_id: number | null
  pageviews: number
  organic_users: number
  revenue: number
  transactions: number
  revenuePerUser: number
}

interface DailyRow {
  url: string
  date: string
  pageviews: number
  organic_users: number
  revenue: number
  transactions: number
}

interface ArticleGroup {
  key: string
  title: string
  languages: Record<string, Article>
  totalRevenue: number
  totalOrganicUsers: number
  daily: Record<string, Record<string, { revenue: number; organicUsers: number }>>
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
function ChartTooltip({ active, payload, label, metric }: any) {
  if (!active || !payload?.length) return null
  const d = new Date(label + 'T00:00:00')
  const dateStr = d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
  return (
    <div className="bg-surface-1 border border-border rounded-xl px-3.5 py-2.5 shadow-lg shadow-black/8">
      <p className="text-text-tertiary text-[11px] font-medium mb-1.5">{dateStr}</p>
      {payload
        .filter((e: { value: number }) => e.value > 0)
        .sort((a: { value: number }, b: { value: number }) => b.value - a.value)
        .map((entry: { color: string; name: string; value: number }) => (
          <div key={entry.name} className="flex items-center gap-2 text-[12px]">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
            <span className="text-text-tertiary">{LANG_LABELS[entry.name] || entry.name.toUpperCase()}</span>
            <span className="text-text-primary font-semibold ml-auto tabular-nums">
              {metric === 'revenue' ? formatCurrency(entry.value, 2) : formatNumber(entry.value)}
            </span>
          </div>
        ))}
    </div>
  )
}

function ArticleCard({
  group,
  languages,
  metric,
  rank,
  allDates,
}: {
  group: ArticleGroup
  languages: string[]
  metric: 'revenue' | 'organicUsers'
  rank: number
  allDates: string[]
}) {
  const activeLangs = languages.filter(l => group.languages[l])
  const enArticle = group.languages['en']
  const enUrl = enArticle?.url

  // Build chart data: one entry per date, one key per language
  const chartData = allDates.map(date => {
    const point: Record<string, string | number> = { date }
    for (const lang of activeLangs) {
      const dayData = group.daily[date]?.[lang]
      point[lang] = dayData ? (metric === 'revenue' ? dayData.revenue : dayData.organicUsers) : 0
    }
    return point
  })

  const hasDaily = chartData.some(d => activeLangs.some(l => (d[l] as number) > 0))

  return (
    <div className="bg-surface-1 rounded-2xl border border-border-subtle p-5 hover:border-border transition-colors duration-200 animate-row" style={{ animationDelay: `${Math.min(rank * 30, 400)}ms` }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-3">
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
                title={LANG_LABELS[lang] || lang.toUpperCase()}
              />
            ))}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className={`text-[18px] font-bold tabular-nums leading-none ${group.totalRevenue > 0 ? 'text-text-primary' : 'text-text-tertiary'}`}>
            {formatCurrency(group.totalRevenue)}
          </p>
          <p className="text-text-tertiary text-[11px] mt-1 tabular-nums">
            {formatNumber(group.totalOrganicUsers)} organische bezoekers &middot; 365d
          </p>
        </div>
      </div>

      {/* Line chart */}
      {hasDaily && (
        <div className="ml-[26px]">
          <div className="h-[140px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: 'var(--color-text-tertiary)' }}
                  tickFormatter={v => {
                    const d = new Date(v + 'T00:00:00')
                    return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
                  }}
                  axisLine={{ stroke: 'var(--color-border-subtle)' }}
                  tickLine={false}
                  interval={Math.floor(allDates.length / 5)}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'var(--color-text-tertiary)' }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                  tickFormatter={v => metric === 'revenue' ? `€${v}` : String(v)}
                />
                <Tooltip content={<ChartTooltip metric={metric} />} />
                {activeLangs.map(lang => (
                  <Line
                    key={lang}
                    type="monotone"
                    dataKey={lang}
                    stroke={LANG_COLORS[lang] || '#94a3b8'}
                    strokeWidth={1.5}
                    dot={false}
                    activeDot={{ r: 3, strokeWidth: 2, stroke: '#fff' }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Per-language totals (365d) */}
          <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2">
            {activeLangs.map(lang => {
              const a = group.languages[lang]
              if (!a) return null
              return (
                <div key={lang} className="flex items-center gap-1.5 text-[11px]">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: LANG_COLORS[lang] || '#94a3b8' }} />
                  <span className="text-text-tertiary">{LANG_LABELS[lang] || lang.toUpperCase()}</span>
                  <span className="text-text-secondary font-semibold tabular-nums">
                    {metric === 'revenue' ? formatCurrency(a.revenue, 2) : formatNumber(a.organic_users)}
                  </span>
                  <span className="text-text-tertiary">(365d)</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Home() {
  const [articles, setArticles] = useState<Article[]>([])
  const [daily, setDaily] = useState<DailyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [cached, setCached] = useState(false)
  const [metric, setMetric] = useState<'revenue' | 'organicUsers'>('revenue')

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
          setDaily(data.daily || [])
          setCached(!!data.cached)
        }
      })
      .catch(e => setError(e.message))
      .finally(() => { setLoading(false); setRefreshing(false) })
  }

  useEffect(() => { loadArticles() }, [])

  const urlToLang = useMemo(() => {
    const map = new Map<string, string>()
    articles.forEach(a => { if (a.language) map.set(a.url, a.language) })
    return map
  }, [articles])

  const urlToGroupKey = useMemo(() => {
    const map = new Map<string, string>()
    articles.forEach(a => {
      const key = a.group_id !== null ? `g:${a.group_id}` : `s:${extractSlug(a.url)}`
      map.set(a.url, key)
    })
    return map
  }, [articles])

  const groups = useMemo<ArticleGroup[]>(() => {
    const map = new Map<string, ArticleGroup>()

    for (const a of articles) {
      const key = urlToGroupKey.get(a.url) || `s:${extractSlug(a.url)}`
      let group = map.get(key)
      if (!group) {
        group = { key, title: '', languages: {}, totalRevenue: 0, totalOrganicUsers: 0, daily: {} }
        map.set(key, group)
      }
      if (a.language) group.languages[a.language] = a
      group.totalRevenue += a.revenue
      group.totalOrganicUsers += a.organic_users
      if (a.language === 'en' || !group.title) group.title = a.title || extractSlug(a.url)
    }

    // Map daily data to groups
    for (const d of daily) {
      const key = urlToGroupKey.get(d.url)
      if (!key) continue
      const group = map.get(key)
      if (!group) continue
      const lang = urlToLang.get(d.url)
      if (!lang) continue
      if (!group.daily[d.date]) group.daily[d.date] = {}
      if (!group.daily[d.date][lang]) group.daily[d.date][lang] = { revenue: 0, organicUsers: 0 }
      group.daily[d.date][lang].revenue += d.revenue
      group.daily[d.date][lang].organicUsers += d.organic_users
    }

    return [...map.values()]
  }, [articles, daily, urlToLang, urlToGroupKey])

  const languages = useMemo(() => {
    const langs = new Set<string>()
    articles.forEach(a => { if (a.language) langs.add(a.language) })
    return [...langs].sort((a, b) => {
      if (a === 'en') return -1
      if (b === 'en') return 1
      return a.localeCompare(b)
    })
  }, [articles])

  const allDates = useMemo(() => {
    const dates = new Set<string>()
    daily.forEach(d => dates.add(d.date))
    return [...dates].sort()
  }, [daily])

  const sortedGroups = useMemo(() => {
    return [...groups].sort((a, b) =>
      metric === 'revenue' ? b.totalRevenue - a.totalRevenue : b.totalOrganicUsers - a.totalOrganicUsers
    )
  }, [groups, metric])

  const langTotals = useMemo(() => {
    const totals: Record<string, { revenue: number; organicUsers: number }> = {}
    for (const a of articles) {
      const lang = a.language || 'unknown'
      if (!totals[lang]) totals[lang] = { revenue: 0, organicUsers: 0 }
      totals[lang].revenue += a.revenue
      totals[lang].organicUsers += a.organic_users
    }
    return totals
  }, [articles])

  const totalRevenue = articles.reduce((s, a) => s + a.revenue, 0)
  const totalOrganicUsers = articles.reduce((s, a) => s + a.organic_users, 0)

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
                <div className="skeleton h-[140px] w-full rounded-xl" />
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
                <div className="flex items-center gap-8">
                  <div>
                    <p className="text-text-tertiary text-[11px] font-semibold uppercase tracking-wider mb-0.5">Totale omzet</p>
                    <p className="text-[22px] font-bold text-text-primary tracking-tight leading-none tabular-nums">
                      {formatCurrency(totalRevenue)}
                    </p>
                  </div>
                  <div>
                    <p className="text-text-tertiary text-[11px] font-semibold uppercase tracking-wider mb-0.5">Organisch</p>
                    <p className="text-[22px] font-bold text-text-primary tracking-tight leading-none tabular-nums">
                      {formatNumber(totalOrganicUsers)}
                    </p>
                  </div>
                  <div className="hidden sm:block">
                    <p className="text-text-tertiary text-[11px] font-semibold uppercase tracking-wider mb-0.5">Artikelen</p>
                    <p className="text-[22px] font-bold text-text-primary tracking-tight leading-none tabular-nums">
                      {groups.length}
                    </p>
                  </div>
                </div>
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
                  onClick={() => setMetric('revenue')}
                  className={`text-[12px] font-medium px-3 py-1.5 rounded-md transition-all duration-150 ${
                    metric === 'revenue' ? 'bg-surface-3 text-text-primary shadow-sm' : 'text-text-tertiary hover:text-text-secondary'
                  }`}
                >
                  Omzet
                </button>
                <button
                  onClick={() => setMetric('organicUsers')}
                  className={`text-[12px] font-medium px-3 py-1.5 rounded-md transition-all duration-150 ${
                    metric === 'organicUsers' ? 'bg-surface-3 text-text-primary shadow-sm' : 'text-text-tertiary hover:text-text-secondary'
                  }`}
                >
                  Organische bezoekers
                </button>
              </div>
              <span className="text-text-tertiary text-[11px]">
                Grafiek: 30 dagen &middot; Totalen: 365 dagen &middot; Alleen organisch zoekverkeer
              </span>
            </div>

            {/* Article cards */}
            <div className="space-y-3">
              {sortedGroups.map((g, i) => (
                <ArticleCard key={g.key} group={g} languages={languages} metric={metric} rank={i + 1} allDates={allDates} />
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
