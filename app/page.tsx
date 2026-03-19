'use client'

import { useEffect, useState } from 'react'
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

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="bg-surface-1 rounded-2xl p-5 border border-border-subtle relative overflow-hidden group hover:border-border transition-colors duration-200">
      <div className={`absolute top-0 left-0 w-full h-[2px] ${color}`} />
      <p className="text-text-secondary text-xs font-medium uppercase tracking-wider mb-3">{label}</p>
      <p className="text-[28px] font-bold text-text-primary leading-none tracking-tight">{value}</p>
      {sub && <p className="text-text-tertiary text-xs mt-2">{sub}</p>}
    </div>
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

function SortArrow({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return null
  return (
    <svg className="w-3 h-3 ml-1 inline-block text-accent" viewBox="0 0 12 12" fill="currentColor">
      {dir === 'desc'
        ? <path d="M6 9L2 4h8L6 9z" />
        : <path d="M6 3l4 5H2l4-5z" />
      }
    </svg>
  )
}

export default function Home() {
  const [articles, setArticles] = useState<Article[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<keyof Article>('revenue')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [showSettings, setShowSettings] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [cached, setCached] = useState(false)
  const [filterLang, setFilterLang] = useState<string>('all')

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

  function toggleSort(col: keyof Article) {
    if (sortBy === col) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    } else {
      setSortBy(col)
      setSortDir('desc')
    }
  }

  const languages = [...new Set(articles.map(a => a.language).filter(Boolean))] as string[]
  const filtered = filterLang === 'all' ? articles : articles.filter(a => a.language === filterLang)

  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortBy], bv = b[sortBy]
    const cmp = typeof av === 'number' ? (av as number) - (bv as number) : String(av).localeCompare(String(bv))
    return sortDir === 'desc' ? -cmp : cmp
  })

  const totalRevenue = filtered.reduce((s, a) => s + a.revenue, 0)
  const totalSessions = filtered.reduce((s, a) => s + a.sessions, 0)
  const totalTransactions = filtered.reduce((s, a) => s + a.transactions, 0)
  const avgRevenuePerSession = totalSessions > 0 ? totalRevenue / totalSessions : 0

  return (
    <div className="min-h-screen">
      {/* Top bar */}
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
            {languages.length > 1 && (
              <select
                value={filterLang}
                onChange={e => setFilterLang(e.target.value)}
                className="bg-surface-2 text-text-secondary text-xs font-medium px-3 py-1.5 rounded-lg border border-border-subtle outline-none hover:border-border focus:border-accent transition-colors cursor-pointer appearance-none pr-7"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='%236b7075'%3E%3Cpath d='M6 8L2 4h8L6 8z'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}
              >
                <option value="all">Alle talen</option>
                {languages.sort().map(l => (
                  <option key={l} value={l}>{l.toUpperCase()}</option>
                ))}
              </select>
            )}

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
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <StatCard
            label="Omzet"
            value={`€${totalRevenue.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            sub="Afgelopen 365 dagen"
            color="bg-success"
          />
          <StatCard
            label="Sessies"
            value={totalSessions.toLocaleString('nl-NL')}
            color="bg-accent"
          />
          <StatCard
            label="Transacties"
            value={totalTransactions.toLocaleString('nl-NL')}
            color="bg-warning"
          />
          <StatCard
            label="Omzet / sessie"
            value={`€${avgRevenuePerSession.toFixed(2)}`}
            color="bg-[#8b5cf6]"
          />
        </div>

        {/* Loading */}
        {loading && (
          <div className="bg-surface-1 rounded-2xl border border-border-subtle overflow-hidden">
            <div className="px-5 py-3 border-b border-border-subtle">
              <div className="skeleton h-4 w-24" />
            </div>
            {[...Array(8)].map((_, i) => (
              <div key={i} className="px-5 py-3.5 flex items-center gap-4 border-b border-border-subtle last:border-0">
                <div className="skeleton h-4 flex-1" />
                <div className="skeleton h-4 w-12" />
                <div className="skeleton h-4 w-16" />
                <div className="skeleton h-4 w-14" />
                <div className="skeleton h-4 w-16" />
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-danger-subtle border border-danger/20 rounded-2xl p-5 mb-6">
            <p className="text-danger text-sm font-medium">{error}</p>
            <button
              onClick={() => setShowSettings(true)}
              className="text-accent text-xs mt-2 hover:underline font-medium"
            >
              Instellingen openen
            </button>
          </div>
        )}

        {/* Table */}
        {!loading && !error && (
          <div className="bg-surface-1 rounded-2xl border border-border-subtle overflow-hidden">
            {/* Table header info */}
            <div className="px-5 py-3 border-b border-border-subtle flex items-center justify-between">
              <span className="text-text-secondary text-xs font-medium">
                {sorted.length} artikel{sorted.length !== 1 ? 'en' : ''}
                {filterLang !== 'all' && ` in ${filterLang.toUpperCase()}`}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border-subtle">
                    {([
                      { key: 'title' as const, label: 'Artikel', align: 'left' },
                      { key: 'language' as const, label: 'Taal', align: 'center' },
                      { key: 'pageviews' as const, label: 'Pageviews', align: 'right' },
                      { key: 'sessions' as const, label: 'Sessies', align: 'right' },
                      { key: 'transactions' as const, label: 'Transacties', align: 'right' },
                      { key: 'revenue' as const, label: 'Omzet', align: 'right' },
                      { key: 'revenuePerSession' as const, label: 'Per sessie', align: 'right' },
                    ] as const).map(col => (
                      <th
                        key={col.key}
                        onClick={() => toggleSort(col.key)}
                        className={`px-5 py-3 font-medium text-text-tertiary text-xs uppercase tracking-wider cursor-pointer select-none hover:text-text-secondary transition-colors ${
                          col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                        } ${sortBy === col.key ? 'text-text-secondary' : ''}`}
                      >
                        {col.label}
                        <SortArrow active={sortBy === col.key} dir={sortDir} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-5 py-16 text-center">
                        <p className="text-text-tertiary text-sm">Geen artikelen gevonden</p>
                        <button
                          onClick={() => loadArticles(true)}
                          className="mt-3 text-accent text-xs font-medium hover:underline"
                        >
                          Data ophalen
                        </button>
                      </td>
                    </tr>
                  )}
                  {sorted.map((a, i) => (
                    <tr
                      key={a.url}
                      className="border-b border-border-subtle last:border-0 hover:bg-surface-hover transition-colors duration-100 animate-row"
                      style={{ animationDelay: `${Math.min(i * 20, 300)}ms` }}
                    >
                      <td className="px-5 py-3.5 max-w-[400px]">
                        <a
                          href={a.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-text-primary hover:text-accent transition-colors duration-150 truncate block font-medium"
                        >
                          {a.title || a.url}
                        </a>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <span className="text-[11px] font-semibold text-text-tertiary bg-surface-3 px-2 py-0.5 rounded-md">
                          {a.language?.toUpperCase() || '—'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right text-text-secondary tabular-nums">{a.pageviews.toLocaleString('nl-NL')}</td>
                      <td className="px-5 py-3.5 text-right text-text-secondary tabular-nums">{a.sessions.toLocaleString('nl-NL')}</td>
                      <td className="px-5 py-3.5 text-right text-text-secondary tabular-nums">{a.transactions}</td>
                      <td className="px-5 py-3.5 text-right tabular-nums">
                        <span className={a.revenue > 0 ? 'text-success font-semibold' : 'text-text-tertiary'}>
                          €{a.revenue.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right text-text-secondary tabular-nums">
                        €{a.revenuePerSession.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
    </div>
  )
}
