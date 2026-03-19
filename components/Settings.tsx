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
      <label htmlFor={id} className="text-gray-400 text-xs font-medium">{label}</label>
      <div className="relative">
        {multiline ? (
          <textarea
            id={id}
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            rows={3}
            className="w-full bg-gray-800 text-gray-100 text-sm px-3 py-2 rounded-lg outline-none border border-gray-700 focus:border-emerald-500 placeholder:text-gray-500 resize-none font-mono"
          />
        ) : (
          <input
            id={id}
            type={onToggle ? (show ? 'text' : 'password') : 'text'}
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full bg-gray-800 text-gray-100 text-sm px-3 py-2 rounded-lg outline-none border border-gray-700 focus:border-emerald-500 placeholder:text-gray-500 pr-10"
          />
        )}
        {onToggle && !multiline && (
          <button
            type="button"
            onClick={onToggle}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 text-xs"
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
  blog_path: string
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
  const [showKey, setShowKey] = useState(false)
  const [showWcSecret, setShowWcSecret] = useState(false)
  const [activeTab, setActiveTab] = useState<'ga4' | 'woocommerce'>('ga4')

  const emptyProp: GA4PropertyForm = {
    name: '', language: 'nl', property_id: '', base_url: '', blog_path: '/blog/',
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-[580px] max-h-[85vh] mx-4 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h2 className="text-gray-100 font-semibold">Instellingen</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-200 text-xl leading-none">&times;</button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-20">
            <p className="text-gray-400 text-sm">Laden...</p>
          </div>
        ) : (
          <div className="flex-1 flex min-h-0">
            {/* Tabs */}
            <div className="w-[140px] shrink-0 border-r border-gray-800 py-2">
              <button
                onClick={() => setActiveTab('ga4')}
                className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                  activeTab === 'ga4' ? 'text-emerald-400 bg-emerald-400/10 border-r-2 border-emerald-400' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                }`}
              >
                Google Analytics
              </button>
              <button
                onClick={() => setActiveTab('woocommerce')}
                className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                  activeTab === 'woocommerce' ? 'text-emerald-400 bg-emerald-400/10 border-r-2 border-emerald-400' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                }`}
              >
                WooCommerce
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {activeTab === 'ga4' && (
                <>
                  {/* Service account credentials (shared) */}
                  <h3 className="text-gray-100 font-medium text-sm">Service Account</h3>
                  <p className="text-gray-500 text-xs">
                    Eén service account voor alle GA4 properties. Voeg het toe als Viewer in elke GA4 property.
                  </p>
                  <Field
                    label="Service Account Email"
                    id="ga4_client_email"
                    value={settings.ga4_client_email}
                    onChange={v => setSettings(p => ({ ...p, ga4_client_email: v }))}
                    placeholder="xxx@xxx.iam.gserviceaccount.com"
                  />
                  <Field
                    label="Private Key"
                    id="ga4_private_key"
                    value={settings.ga4_private_key}
                    onChange={v => setSettings(p => ({ ...p, ga4_private_key: v }))}
                    show={showKey}
                    onToggle={() => setShowKey(!showKey)}
                    placeholder="-----BEGIN PRIVATE KEY-----\n..."
                    multiline
                  />

                  <hr className="border-gray-800" />

                  {/* Properties list */}
                  {editingProp ? (
                    <>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setEditingProp(null)} className="text-gray-400 hover:text-gray-200 text-sm">&larr;</button>
                        <h3 className="text-gray-100 font-medium text-sm">
                          {editingProp.id ? 'Property bewerken' : 'Nieuwe property'}
                        </h3>
                      </div>
                      <Field label="Naam" id="prop_name" value={editingProp.name} onChange={v => setEditingProp(p => p && ({ ...p, name: v }))} placeholder="Bijv. SpeedRope NL" />
                      <div className="space-y-1.5">
                        <label className="text-gray-400 text-xs font-medium">Taal</label>
                        <select
                          value={editingProp.language}
                          onChange={e => setEditingProp(p => p && ({ ...p, language: e.target.value }))}
                          className="w-full bg-gray-800 text-gray-100 text-sm px-3 py-2 rounded-lg outline-none border border-gray-700 focus:border-emerald-500"
                        >
                          {LANGUAGES.map(l => (
                            <option key={l.code} value={l.code}>{l.label}</option>
                          ))}
                        </select>
                      </div>
                      <Field label="GA4 Property ID" id="prop_id" value={editingProp.property_id} onChange={v => setEditingProp(p => p && ({ ...p, property_id: v }))} placeholder="123456789" />
                      <Field label="Base URL" id="prop_base_url" value={editingProp.base_url} onChange={v => setEditingProp(p => p && ({ ...p, base_url: v }))} placeholder="https://speedropeshop.com" />
                      <Field label="Blog pad" id="prop_blog_path" value={editingProp.blog_path} onChange={v => setEditingProp(p => p && ({ ...p, blog_path: v }))} placeholder="/blog/" />
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={saveProp}
                          className="bg-emerald-500 text-white text-sm px-4 py-2 rounded-lg hover:bg-emerald-600 transition-colors"
                        >
                          {editingProp.id ? 'Bijwerken' : 'Toevoegen'}
                        </button>
                        <button
                          onClick={() => setEditingProp(null)}
                          className="text-sm text-gray-400 hover:text-gray-200 px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors"
                        >
                          Annuleren
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <h3 className="text-gray-100 font-medium text-sm">GA4 Properties</h3>
                        <button
                          onClick={() => setEditingProp({ ...emptyProp })}
                          className="text-xs text-emerald-400 hover:underline"
                        >
                          + Property toevoegen
                        </button>
                      </div>
                      {properties.length === 0 ? (
                        <div className="bg-gray-800 rounded-lg p-4 text-center">
                          <p className="text-gray-400 text-sm">Geen properties geconfigureerd</p>
                          <button
                            onClick={() => setEditingProp({ ...emptyProp })}
                            className="mt-2 text-xs text-emerald-400 hover:underline"
                          >
                            Voeg je eerste property toe
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {properties.map(prop => (
                            <div key={prop.id} className="bg-gray-800 rounded-lg p-3">
                              <div className="flex items-center justify-between">
                                <div>
                                  <span className="text-gray-100 text-sm font-medium">{prop.name}</span>
                                  <span className="ml-2 text-gray-500 text-xs">{prop.language.toUpperCase()}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => setEditingProp({ ...prop })}
                                    className="text-gray-400 hover:text-gray-200 text-xs px-2 py-1"
                                  >
                                    Bewerken
                                  </button>
                                  <button
                                    onClick={() => deleteProp(prop.id, prop.name)}
                                    className="text-gray-400 hover:text-red-400 text-xs px-2 py-1"
                                  >
                                    Verwijder
                                  </button>
                                </div>
                              </div>
                              <p className="text-gray-500 text-xs mt-0.5">Property: {prop.property_id} &middot; {prop.base_url || '(geen URL)'}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </>
              )}

              {activeTab === 'woocommerce' && (
                <>
                  <h3 className="text-gray-100 font-medium text-sm">WooCommerce REST API</h3>
                  <p className="text-gray-500 text-xs">
                    Zelfde credentials als je webshop. Genereer keys via WooCommerce &gt; Instellingen &gt; Geavanceerd &gt; REST API.
                  </p>
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
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-800 flex justify-end">
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg hover:bg-emerald-600 transition-colors"
          >
            {saving ? 'Opslaan...' : saved ? '✓ Opgeslagen' : 'Opslaan'}
          </button>
        </div>
      </div>
    </div>
  )
}
