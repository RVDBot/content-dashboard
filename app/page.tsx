'use client'

import { useEffect, useState } from 'react'
import Settings from '@/components/Settings'

interface Article {
  url: string
  title: string
  pageviews: number
  sessions: number
  revenue: number
  transactions: number
  revenuePerSession: number
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

  function loadArticles(refresh = false) {
    const url = refresh ? '/api/articles?refresh=1' : '/api/articles'
    if (refresh) setRefreshing(true)
    else setLoading(true)
    setError(null)
    fetch(url)
      .then(r => r.json())
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

  const sorted = [...articles].sort((a, b) => {
    const av = a[sortBy], bv = b[sortBy]
    const cmp = typeof av === 'number' ? (av as number) - (bv as number) : String(av).localeCompare(String(bv))
    return sortDir === 'desc' ? -cmp : cmp
  })

  const totalRevenue = articles.reduce((s, a) => s + a.revenue, 0)
  const totalSessions = articles.reduce((s, a) => s + a.sessions, 0)
  const totalTransactions = articles.reduce((s, a) => s + a.transactions, 0)

  const SortIcon = ({ col }: { col: keyof Article }) => (
    <span className="ml-1 text-gray-500">{sortBy === col ? (sortDir === 'desc' ? '↓' : '↑') : ''}</span>
  )

  return (
    <div className="min-h-screen p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Content Dashboard</h1>
        <div className="flex items-center gap-3">
          {cached && (
            <span className="text-gray-500 text-xs">Uit cache</span>
          )}
          <button
            onClick={() => loadArticles(true)}
            disabled={refreshing}
            className="text-sm text-gray-400 hover:text-gray-200 disabled:opacity-50 transition-colors"
          >
            {refreshing ? 'Vernieuwen...' : 'Vernieuwen'}
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="text-sm bg-gray-800 text-gray-300 hover:text-gray-100 px-3 py-1.5 rounded-lg border border-gray-700 hover:border-gray-600 transition-colors"
          >
            Instellingen
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <p className="text-gray-400 text-sm">Totale omzet via blog</p>
          <p className="text-2xl font-bold text-emerald-400 mt-1">€{totalRevenue.toFixed(2)}</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <p className="text-gray-400 text-sm">Sessies</p>
          <p className="text-2xl font-bold text-blue-400 mt-1">{totalSessions.toLocaleString('nl-NL')}</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <p className="text-gray-400 text-sm">Transacties</p>
          <p className="text-2xl font-bold text-amber-400 mt-1">{totalTransactions.toLocaleString('nl-NL')}</p>
        </div>
      </div>

      {loading && <p className="text-gray-400">Laden...</p>}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-6">
          <p className="text-red-400 text-sm">{error}</p>
          <button onClick={() => setShowSettings(true)} className="text-emerald-400 text-xs mt-1 hover:underline">Instellingen openen</button>
        </div>
      )}

      {!loading && !error && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400 text-left">
                  <th className="px-4 py-3 font-medium cursor-pointer hover:text-gray-200" onClick={() => toggleSort('title')}>
                    Artikel<SortIcon col="title" />
                  </th>
                  <th className="px-4 py-3 font-medium text-right cursor-pointer hover:text-gray-200" onClick={() => toggleSort('pageviews')}>
                    Pageviews<SortIcon col="pageviews" />
                  </th>
                  <th className="px-4 py-3 font-medium text-right cursor-pointer hover:text-gray-200" onClick={() => toggleSort('sessions')}>
                    Sessies<SortIcon col="sessions" />
                  </th>
                  <th className="px-4 py-3 font-medium text-right cursor-pointer hover:text-gray-200" onClick={() => toggleSort('transactions')}>
                    Transacties<SortIcon col="transactions" />
                  </th>
                  <th className="px-4 py-3 font-medium text-right cursor-pointer hover:text-gray-200" onClick={() => toggleSort('revenue')}>
                    Omzet<SortIcon col="revenue" />
                  </th>
                  <th className="px-4 py-3 font-medium text-right cursor-pointer hover:text-gray-200" onClick={() => toggleSort('revenuePerSession')}>
                    €/sessie<SortIcon col="revenuePerSession" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">Geen artikelen gevonden</td></tr>
                )}
                {sorted.map((a, i) => (
                  <tr key={a.url} className={`border-b border-gray-800/50 hover:bg-gray-800/30 ${i % 2 === 0 ? '' : 'bg-gray-900/50'}`}>
                    <td className="px-4 py-3">
                      <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                        {a.title || a.url}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-300">{a.pageviews.toLocaleString('nl-NL')}</td>
                    <td className="px-4 py-3 text-right text-gray-300">{a.sessions.toLocaleString('nl-NL')}</td>
                    <td className="px-4 py-3 text-right text-gray-300">{a.transactions}</td>
                    <td className="px-4 py-3 text-right font-medium text-emerald-400">€{a.revenue.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right text-gray-300">€{a.revenuePerSession.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
    </div>
  )
}
