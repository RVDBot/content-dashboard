'use client'

import { useState, useEffect } from 'react'

function Field({ label, id, value, onChange, show, onToggle, placeholder, multiline }: {
  label: string
  id: string
  value: string
  onChange: (v: string) => void
  show?: boolean
  onToggle?: () => void
  placeholder?: string
  multiline?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-text-tertiary text-[11px] font-semibold uppercase tracking-wider">{label}</label>
      <div className="relative">
        {multiline ? (
          <textarea
            id={id}
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            rows={3}
            className="w-full bg-surface-0 text-text-primary text-[13px] px-3 py-2.5 rounded-xl outline-none border border-border hover:border-text-tertiary focus:border-accent placeholder:text-text-tertiary resize-none font-mono transition-colors duration-150"
          />
        ) : (
          <input
            id={id}
            type={onToggle ? (show ? 'text' : 'password') : 'text'}
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full bg-surface-0 text-text-primary text-[13px] px-3 py-2.5 rounded-xl outline-none border border-border hover:border-text-tertiary focus:border-accent placeholder:text-text-tertiary pr-14 transition-colors duration-150"
          />
        )}
        {onToggle && !multiline && (
          <button
            type="button"
            onClick={onToggle}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary text-[11px] font-medium transition-colors"
          >
            {show ? 'Verberg' : 'Toon'}
          </button>
        )}
      </div>
    </div>
  )
}

interface GA4PropertyForm {
  id?: number
  name: string
  language: string
  property_id: string
  base_url: string
  post_sitemap_path: string
  category_sitemap_path: string
}

const LANGUAGES = [
  { code: 'nl', label: 'Nederlands' },
  { code: 'en', label: 'Engels' },
  { code: 'de', label: 'Duits' },
  { code: 'es', label: 'Spaans' },
  { code: 'it', label: 'Italiaans' },
  { code: 'fr', label: 'Frans' },
]

interface Props {
  onClose: () => void
}

export default function Settings({ onClose }: Props) {
  const [settings, setSettings] = useState({
    ga4_client_email: '',
    ga4_private_key: '',
    wc_store_url: '',
    wc_consumer_key: '',
    wc_consumer_secret: '',
  })
  const [properties, setProperties] = useState<(GA4PropertyForm & { id: number })[]>([])
  const [editingProp, setEditingProp] = useState<GA4PropertyForm | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showWcSecret, setShowWcSecret] = useState(false)
  const [activeTab, setActiveTab] = useState<'ga4' | 'woocommerce' | 'logs'>('ga4')
  const [logs, setLogs] = useState<{ id: number; level: string; message: string; meta: string | null; created_at: string }[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [expandedLog, setExpandedLog] = useState<number | null>(null)

  const emptyProp: GA4PropertyForm = {
    name: '', language: 'nl', property_id: '', base_url: '', post_sitemap_path: '/post-sitemap.xml', category_sitemap_path: '/category-sitemap.xml',
  }

  async function fetchProperties() {
    const res = await fetch('/api/properties')
    setProperties(await res.json())
  }

  useEffect(() => {
    Promise.all([
      fetch('/api/settings').then(r => r.json()),
      fetch('/api/properties').then(r => r.json()),
    ]).then(([settingsData, propsData]) => {
      setSettings(prev => ({ ...prev, ...settingsData }))
      setProperties(propsData)
      setLoading(false)
    })
  }, [])

  async function save() {
    setSaving(true)
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function saveProp() {
    if (!editingProp || !editingProp.name || !editingProp.property_id) return
    const method = editingProp.id ? 'PUT' : 'POST'
    await fetch('/api/properties', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editingProp),
    })
    await fetchProperties()
    setEditingProp(null)
  }

  async function fetchLogs() {
    setLogsLoading(true)
    try {
      const res = await fetch('/api/logs')
      if (res.ok) setLogs(await res.json())
    } finally {
      setLogsLoading(false)
    }
  }

  async function clearLogs() {
    if (!confirm('Alle logs verwijderen?')) return
    await fetch('/api/logs', { method: 'DELETE' })
    setLogs([])
  }

  async function deleteProp(id: number, name: string) {
    if (!confirm(`Property "${name}" verwijderen?`)) return
    await fetch('/api/properties', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    await fetchProperties()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-surface-1 border border-border rounded-2xl w-full max-w-[600px] max-h-[85vh] mx-4 flex flex-col shadow-2xl shadow-black/40">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
          <h2 className="text-text-primary text-[15px] font-semibold">Instellingen</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-text-tertiary hover:text-text-secondary hover:bg-surface-3 transition-all duration-150"
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-20">
            <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="flex-1 flex min-h-0">
            {/* Tabs */}
            <div className="w-[150px] shrink-0 border-r border-border-subtle p-2">
              {[
                { id: 'ga4' as const, label: 'Analytics' },
                { id: 'woocommerce' as const, label: 'WooCommerce' },
                { id: 'logs' as const, label: 'Logboek' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => { setActiveTab(tab.id); if (tab.id === 'logs') fetchLogs() }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 ${
                    activeTab === tab.id
                      ? 'text-text-primary bg-surface-3'
                      : 'text-text-tertiary hover:text-text-secondary hover:bg-surface-2'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto min-h-0 p-6 space-y-5">
              {activeTab === 'ga4' && (
                <>
                  <div>
                    <h3 className="text-text-primary text-[13px] font-semibold mb-1">Service Account</h3>
                    <p className="text-text-tertiary text-[11px] leading-relaxed">
                      Upload het JSON-sleutelbestand van je Google Cloud service account.
                    </p>
                  </div>

                  {settings.ga4_client_email ? (
                    <div className="bg-surface-0 rounded-xl p-3.5 border border-border-subtle">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-success/10 flex items-center justify-center">
                            <svg className="w-3.5 h-3.5 text-success" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                              <path d="M3 8.5l3.5 3.5 6.5-8" />
                            </svg>
                          </div>
                          <div>
                            <p className="text-text-primary text-[13px] font-medium">Service account gekoppeld</p>
                            <p className="text-text-tertiary text-[11px] font-mono">{settings.ga4_client_email}</p>
                          </div>
                        </div>
                        <label className="text-[11px] font-semibold text-accent hover:text-accent-hover transition-colors cursor-pointer">
                          Wijzigen
                          <input
                            type="file"
                            accept=".json"
                            className="hidden"
                            onChange={e => {
                              const file = e.target.files?.[0]
                              if (!file) return
                              const reader = new FileReader()
                              reader.onload = () => {
                                try {
                                  const json = JSON.parse(reader.result as string)
                                  if (json.client_email && json.private_key) {
                                    setSettings(p => ({
                                      ...p,
                                      ga4_client_email: json.client_email,
                                      ga4_private_key: json.private_key,
                                    }))
                                  }
                                } catch { /* invalid json */ }
                              }
                              reader.readAsText(file)
                              e.target.value = ''
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  ) : (
                    <label className="block bg-surface-0 rounded-xl border-2 border-dashed border-border hover:border-accent p-8 text-center cursor-pointer transition-colors duration-150 group">
                      <div className="w-10 h-10 rounded-xl bg-surface-3 group-hover:bg-accent-subtle flex items-center justify-center mx-auto mb-3 transition-colors">
                        <svg className="w-5 h-5 text-text-tertiary group-hover:text-accent transition-colors" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                          <path d="M8 3v10M3 8h10" />
                        </svg>
                      </div>
                      <p className="text-text-primary text-[13px] font-medium mb-1">JSON-sleutelbestand uploaden</p>
                      <p className="text-text-tertiary text-[11px]">Het bestand dat je downloadt bij het aanmaken van een service account key</p>
                      <input
                        type="file"
                        accept=".json"
                        className="hidden"
                        onChange={e => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          const reader = new FileReader()
                          reader.onload = () => {
                            try {
                              const json = JSON.parse(reader.result as string)
                              if (json.client_email && json.private_key) {
                                setSettings(p => ({
                                  ...p,
                                  ga4_client_email: json.client_email,
                                  ga4_private_key: json.private_key,
                                }))
                              }
                            } catch { /* invalid json */ }
                          }
                          reader.readAsText(file)
                          e.target.value = ''
                        }}
                      />
                    </label>
                  )}

                  <div className="border-t border-border-subtle pt-5">
                    {editingProp ? (
                      <>
                        <div className="flex items-center gap-2 mb-4">
                          <button
                            onClick={() => setEditingProp(null)}
                            className="w-6 h-6 rounded-lg flex items-center justify-center text-text-tertiary hover:text-text-secondary hover:bg-surface-3 transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                              <path d="M8 1L3 6l5 5" />
                            </svg>
                          </button>
                          <h3 className="text-text-primary text-[13px] font-semibold">
                            {editingProp.id ? 'Property bewerken' : 'Nieuwe property'}
                          </h3>
                        </div>
                        <div className="space-y-4">
                          <Field label="Naam" id="prop_name" value={editingProp.name} onChange={v => setEditingProp(p => p && ({ ...p, name: v }))} placeholder="Bijv. SpeedRope NL" />
                          <div className="space-y-1.5">
                            <label className="text-text-tertiary text-[11px] font-semibold uppercase tracking-wider">Taal</label>
                            <select
                              value={editingProp.language}
                              onChange={e => setEditingProp(p => p && ({ ...p, language: e.target.value }))}
                              className="w-full bg-surface-0 text-text-primary text-[13px] px-3 py-2.5 rounded-xl outline-none border border-border hover:border-text-tertiary focus:border-accent transition-colors duration-150 cursor-pointer"
                            >
                              {LANGUAGES.map(l => (
                                <option key={l.code} value={l.code}>{l.label}</option>
                              ))}
                            </select>
                          </div>
                          <Field label="GA4 Property ID" id="prop_id" value={editingProp.property_id} onChange={v => setEditingProp(p => p && ({ ...p, property_id: v }))} placeholder="123456789" />
                          <Field label="Base URL" id="prop_base_url" value={editingProp.base_url} onChange={v => setEditingProp(p => p && ({ ...p, base_url: v }))} placeholder="https://speedropeshop.com" />
                          <Field label="Post Sitemap pad" id="prop_post_sitemap" value={editingProp.post_sitemap_path} onChange={v => setEditingProp(p => p && ({ ...p, post_sitemap_path: v }))} placeholder="/post-sitemap.xml" />
                          <Field label="Category Sitemap pad" id="prop_cat_sitemap" value={editingProp.category_sitemap_path} onChange={v => setEditingProp(p => p && ({ ...p, category_sitemap_path: v }))} placeholder="/category-sitemap.xml" />
                          <div className="flex gap-2 pt-1">
                            <button
                              onClick={saveProp}
                              className="bg-accent hover:bg-accent-hover text-white text-[13px] font-medium px-4 py-2 rounded-xl transition-colors duration-150"
                            >
                              {editingProp.id ? 'Bijwerken' : 'Toevoegen'}
                            </button>
                            <button
                              onClick={() => setEditingProp(null)}
                              className="text-[13px] text-text-tertiary hover:text-text-secondary px-4 py-2 rounded-xl hover:bg-surface-3 transition-colors duration-150"
                            >
                              Annuleren
                            </button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-text-primary text-[13px] font-semibold">GA4 Properties</h3>
                          <button
                            onClick={() => setEditingProp({ ...emptyProp })}
                            className="text-[11px] font-semibold text-accent hover:text-accent-hover transition-colors"
                          >
                            + Toevoegen
                          </button>
                        </div>
                        {properties.length === 0 ? (
                          <div className="bg-surface-0 rounded-xl p-5 text-center border border-border-subtle">
                            <p className="text-text-tertiary text-[13px]">Geen properties geconfigureerd</p>
                            <button
                              onClick={() => setEditingProp({ ...emptyProp })}
                              className="mt-2 text-[11px] text-accent font-semibold hover:text-accent-hover transition-colors"
                            >
                              Voeg je eerste property toe
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {properties.map(prop => (
                              <div key={prop.id} className="bg-surface-0 rounded-xl p-3.5 border border-border-subtle hover:border-border transition-colors duration-150 group">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2.5">
                                    <span className="text-[11px] font-semibold text-text-tertiary bg-surface-3 px-2 py-0.5 rounded-md">
                                      {prop.language.toUpperCase()}
                                    </span>
                                    <span className="text-text-primary text-[13px] font-medium">{prop.name}</span>
                                  </div>
                                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                                    <button
                                      onClick={() => setEditingProp({ ...prop })}
                                      className="text-text-tertiary hover:text-text-secondary text-[11px] font-medium px-2 py-1 rounded-lg hover:bg-surface-3 transition-colors"
                                    >
                                      Bewerk
                                    </button>
                                    <button
                                      onClick={() => deleteProp(prop.id, prop.name)}
                                      className="text-text-tertiary hover:text-danger text-[11px] font-medium px-2 py-1 rounded-lg hover:bg-danger-subtle transition-colors"
                                    >
                                      Verwijder
                                    </button>
                                  </div>
                                </div>
                                <p className="text-text-tertiary text-[11px] mt-1 ml-[38px]">
                                  ID: {prop.property_id}
                                  {prop.base_url && <> &middot; {prop.base_url}</>}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </>
              )}

              {activeTab === 'woocommerce' && (
                <>
                  <div>
                    <h3 className="text-text-primary text-[13px] font-semibold mb-1">WooCommerce REST API</h3>
                    <p className="text-text-tertiary text-[11px] leading-relaxed">
                      Genereer keys via WooCommerce &gt; Instellingen &gt; Geavanceerd &gt; REST API.
                    </p>
                  </div>
                  <Field
                    label="Winkel URL"
                    id="wc_store_url"
                    value={settings.wc_store_url}
                    onChange={v => setSettings(p => ({ ...p, wc_store_url: v }))}
                    placeholder="https://speedropeshop.com"
                  />
                  <Field
                    label="Consumer Key"
                    id="wc_consumer_key"
                    value={settings.wc_consumer_key}
                    onChange={v => setSettings(p => ({ ...p, wc_consumer_key: v }))}
                    placeholder="ck_..."
                  />
                  <Field
                    label="Consumer Secret"
                    id="wc_consumer_secret"
                    value={settings.wc_consumer_secret}
                    onChange={v => setSettings(p => ({ ...p, wc_consumer_secret: v }))}
                    show={showWcSecret}
                    onToggle={() => setShowWcSecret(!showWcSecret)}
                    placeholder="cs_..."
                  />
                </>
              )}

              {activeTab === 'logs' && (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-text-primary text-[13px] font-semibold mb-1">Activiteitenlog</h3>
                      <p className="text-text-tertiary text-[11px] leading-relaxed">
                        Recente API-activiteit en foutmeldingen.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={fetchLogs}
                        className="text-[11px] font-semibold text-accent hover:text-accent-hover transition-colors"
                      >
                        Vernieuwen
                      </button>
                      {logs.length > 0 && (
                        <button
                          onClick={clearLogs}
                          className="text-[11px] font-semibold text-text-tertiary hover:text-danger transition-colors"
                        >
                          Wissen
                        </button>
                      )}
                    </div>
                  </div>
                  {logsLoading ? (
                    <div className="flex items-center justify-center py-10">
                      <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : logs.length === 0 ? (
                    <div className="bg-surface-0 rounded-xl p-5 text-center border border-border-subtle">
                      <p className="text-text-tertiary text-[13px]">Geen logs beschikbaar</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                      {logs.map(log => {
                        const isExpanded = expandedLog === log.id
                        const hasMeta = !!log.meta
                        return (
                          <div
                            key={log.id}
                            onClick={() => hasMeta && setExpandedLog(isExpanded ? null : log.id)}
                            className={`bg-surface-0 rounded-xl px-3.5 py-2.5 border border-border-subtle transition-colors duration-150 ${
                              hasMeta ? 'cursor-pointer hover:border-border' : ''
                            } ${isExpanded ? 'border-border' : ''}`}
                          >
                            <div className="flex items-start gap-2">
                              <span className={`shrink-0 mt-0.5 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md ${
                                log.level === 'error' ? 'bg-danger-subtle text-danger' :
                                log.level === 'warn' ? 'bg-warning-subtle text-warning' :
                                'bg-surface-3 text-text-tertiary'
                              }`}>
                                {log.level}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-text-primary text-[13px] leading-snug">{log.message}</p>
                                {hasMeta && !isExpanded && (
                                  <p className="text-text-tertiary text-[11px] mt-1 font-mono truncate">
                                    {log.meta}
                                  </p>
                                )}
                                {hasMeta && isExpanded && (
                                  <pre className="text-text-secondary text-[11px] mt-2 font-mono bg-surface-1 border border-border-subtle rounded-lg p-3 whitespace-pre-wrap break-all">
                                    {(() => {
                                      try { return JSON.stringify(JSON.parse(log.meta!), null, 2) }
                                      catch { return log.meta }
                                    })()}
                                  </pre>
                                )}
                              </div>
                              <span className="shrink-0 text-text-tertiary text-[11px] tabular-nums">
                                {new Date(log.created_at).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border-subtle flex justify-end">
          <button
            onClick={save}
            disabled={saving}
            className={`text-[13px] font-semibold px-5 py-2 rounded-xl transition-all duration-150 ${
              saved
                ? 'bg-success/15 text-success'
                : 'bg-accent hover:bg-accent-hover text-white disabled:opacity-50'
            }`}
          >
            {saving ? 'Opslaan...' : saved ? 'Opgeslagen' : 'Opslaan'}
          </button>
        </div>
      </div>
    </div>
  )
}
