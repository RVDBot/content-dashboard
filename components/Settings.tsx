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

interface Props {
  onClose: () => void
}

export default function Settings({ onClose }: Props) {
  const [settings, setSettings] = useState({
    ga4_property_id: '',
    ga4_client_email: '',
    ga4_private_key: '',
    wc_store_url: '',
    wc_consumer_key: '',
    wc_consumer_secret: '',
    blog_url_pattern: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [showWcSecret, setShowWcSecret] = useState(false)
  const [activeTab, setActiveTab] = useState<'ga4' | 'woocommerce'>('ga4')

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        setSettings(prev => ({ ...prev, ...data }))
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-[520px] max-h-[85vh] mx-4 flex flex-col shadow-2xl">
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
                  <h3 className="text-gray-100 font-medium text-sm">GA4 Data API</h3>
                  <p className="text-gray-500 text-xs">
                    Maak een service account aan in Google Cloud Console, enable de GA4 Data API, en voeg het service account toe als Viewer in GA4.
                  </p>
                  <Field
                    label="Property ID"
                    id="ga4_property_id"
                    value={settings.ga4_property_id}
                    onChange={v => setSettings(p => ({ ...p, ga4_property_id: v }))}
                    placeholder="123456789"
                  />
                  <Field
                    label="Service Account Email"
                    id="ga4_client_email"
                    value={settings.ga4_client_email}
                    onChange={v => setSettings(p => ({ ...p, ga4_client_email: v }))}
                    placeholder="xxx@xxx.iam.gserviceaccount.com"
                  />
                  <Field
                    label="Private Key (uit JSON key file)"
                    id="ga4_private_key"
                    value={settings.ga4_private_key}
                    onChange={v => setSettings(p => ({ ...p, ga4_private_key: v }))}
                    show={showKey}
                    onToggle={() => setShowKey(!showKey)}
                    placeholder="-----BEGIN PRIVATE KEY-----\n..."
                    multiline
                  />
                  <Field
                    label="Blog URL patroon (optioneel)"
                    id="blog_url_pattern"
                    value={settings.blog_url_pattern}
                    onChange={v => setSettings(p => ({ ...p, blog_url_pattern: v }))}
                    placeholder="/blog/ (standaard)"
                  />
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
