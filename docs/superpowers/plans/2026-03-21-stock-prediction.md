# Stock Prediction Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a stock prediction dashboard that tells the SpeedRopeShop owner which products to reorder and when, preventing out-of-stock situations.

**Architecture:** Next.js 15 app with SQLite database, syncing product/stock/order data from WooCommerce REST API nightly. A weighted moving average model predicts daily sales per SKU, adjusted for seasonal events. The dashboard shows urgent reorder alerts and per-supplier order views.

**Tech Stack:** Next.js 15, TypeScript, better-sqlite3, Tailwind CSS 4, Docker, WooCommerce REST API

**Spec:** `docs/superpowers/specs/2026-03-21-stock-prediction-design.md`

---

## File Structure

```
stock/
├── app/
│   ├── layout.tsx                    # Root layout (minimal, Dutch lang)
│   ├── globals.css                   # Tailwind + theme (copy from content-dashboard)
│   ├── page.tsx                      # Alerts view (hoofdscherm)
│   ├── login/
│   │   └── page.tsx                  # Login page
│   ├── suppliers/
│   │   ├── page.tsx                  # Supplier list (selectie voor View 2)
│   │   └── [id]/
│   │       └── page.tsx              # Supplier order page (View 2)
│   ├── events/
│   │   └── page.tsx                  # Event calendar (View 3)
│   ├── settings/
│   │   └── page.tsx                  # Settings page (View 4)
│   └── api/
│       ├── auth/
│       │   └── route.ts              # Login/setup/logout endpoints
│       ├── cron/
│       │   └── route.ts              # Nightly sync endpoint
│       ├── sync/
│       │   └── route.ts              # Manual sync + historical import
│       ├── products/
│       │   └── route.ts              # Product listing with predictions
│       ├── suppliers/
│       │   └── route.ts              # Supplier CRUD
│       ├── events/
│       │   └── route.ts              # Event CRUD
│       ├── purchase-orders/
│       │   └── route.ts              # Purchase order CRUD
│       └── settings/
│           └── route.ts              # Settings CRUD
├── lib/
│   ├── db.ts                         # Database init + schema
│   ├── auth.ts                       # Password hashing + session management
│   ├── auth-guard.ts                 # requireAuth helper
│   ├── woocommerce.ts                # WooCommerce API client
│   ├── sync.ts                       # Product/stock/order sync logic
│   ├── prediction.ts                 # Sales prediction (getExpectedDailySales)
│   ├── stock-status.ts               # Stock status calculation (bestel nu/binnenkort/op schema)
│   └── logger.ts                     # Simple logger to DB
├── middleware.ts                      # Auth middleware
├── components/
│   └── Nav.tsx                       # Shared navigation component
├── Dockerfile                        # Multi-stage build
├── docker-compose.yml                # Single service config
├── next.config.ts                    # standalone output
├── package.json
├── tsconfig.json
├── postcss.config.mjs
└── tailwind.config.ts (if needed)
```

---

## Task 1: Project Scaffold + Database

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `app/layout.tsx`, `app/globals.css`, `lib/db.ts`, `lib/logger.ts`, `.gitignore`

- [ ] **Step 1: Clone repo and init Next.js project**

```bash
cd "/Users/ruben/Library/CloudStorage/ProtonDrive-ruben.vandenbussche@proton.me-folder/_Personal/Claude code"
git clone https://github.com/RVDBot/stock.git
cd stock
```

Create `package.json`:
```json
{
  "name": "stock-dashboard",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3100",
    "build": "next build",
    "start": "next start --port 3100",
    "lint": "next lint"
  },
  "dependencies": {
    "better-sqlite3": "^11.9.1",
    "next": "^15.3.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.1.0",
    "@types/better-sqlite3": "^7.6.13",
    "@types/node": "^22.0.0",
    "@types/react": "^19.1.0",
    "@types/react-dom": "^19.1.0",
    "postcss": "^8.5.0",
    "tailwindcss": "^4.1.0",
    "typescript": "^5.8.0"
  }
}
```

- [ ] **Step 2: Create config files**

Create `tsconfig.json` — copy from content-dashboard (uses `@/` path alias).

Create `next.config.ts`:
```typescript
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['better-sqlite3'],
}

export default nextConfig
```

Create `postcss.config.mjs`:
```javascript
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
}
export default config
```

Create `.gitignore`:
```
node_modules/
.next/
data/
*.db
```

- [ ] **Step 3: Create globals.css and layout**

Copy `app/globals.css` from content-dashboard (Tailwind imports + theme variables).

Create `app/layout.tsx`:
```tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Stock Dashboard — SpeedRopeShop',
  description: 'Voorraadvoorspelling en bestelmoment berekening',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  )
}
```

- [ ] **Step 4: Create lib/db.ts with full schema**

```typescript
import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

const DB_PATH = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(process.cwd(), 'data', 'stock-dashboard.db')

const dir = path.dirname(DB_PATH)
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true })
}

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (_db) return _db
  _db = new Database(DB_PATH)
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')
  initSchema(_db)
  return _db
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      name           TEXT NOT NULL,
      lead_time_days INTEGER NOT NULL,
      contact_info   TEXT,
      notes          TEXT,
      created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS products (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      woo_product_id  INTEGER NOT NULL,
      sku             TEXT NOT NULL UNIQUE,
      name            TEXT NOT NULL,
      current_stock   INTEGER NOT NULL DEFAULT 0,
      price           REAL NOT NULL DEFAULT 0,
      is_composite    INTEGER NOT NULL DEFAULT 0,
      composite_sku   TEXT,
      supplier_id     INTEGER REFERENCES suppliers(id),
      manual_daily_sales REAL,
      active          INTEGER NOT NULL DEFAULT 1,
      updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS stock_snapshots (
      product_id  INTEGER NOT NULL REFERENCES products(id),
      date        TEXT NOT NULL,
      stock_level INTEGER NOT NULL,
      PRIMARY KEY (product_id, date)
    );

    CREATE TABLE IF NOT EXISTS sales_history (
      product_id INTEGER NOT NULL REFERENCES products(id),
      date       TEXT NOT NULL,
      quantity   INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (product_id, date)
    );

    CREATE TABLE IF NOT EXISTS purchase_orders (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_id      INTEGER NOT NULL REFERENCES suppliers(id),
      product_id       INTEGER NOT NULL REFERENCES products(id),
      quantity         INTEGER NOT NULL,
      order_date       TEXT NOT NULL,
      expected_arrival TEXT,
      status           TEXT NOT NULL DEFAULT 'ordered',
      notes            TEXT,
      created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS events (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      name              TEXT NOT NULL,
      expected_date     TEXT,
      duration_days     INTEGER NOT NULL DEFAULT 7,
      impact_percentage INTEGER NOT NULL DEFAULT 100,
      recurring         INTEGER NOT NULL DEFAULT 1,
      last_checked_at   DATETIME,
      notes             TEXT,
      created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS logs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      level      TEXT NOT NULL DEFAULT 'info',
      message    TEXT NOT NULL,
      meta       TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)
}
```

- [ ] **Step 5: Create lib/logger.ts**

```typescript
import { getDb } from '@/lib/db'

export function log(level: 'info' | 'error' | 'warn', message: string, meta?: string) {
  const db = getDb()
  db.prepare('INSERT INTO logs (level, message, meta) VALUES (?, ?, ?)').run(level, message, meta || null)
}
```

- [ ] **Step 6: Install dependencies and verify build**

```bash
npm install
npm run build
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: project scaffold with database schema and logger"
```

---

## Task 2: Authentication

**Files:**
- Create: `lib/auth.ts`, `lib/auth-guard.ts`, `middleware.ts`, `app/login/page.tsx`, `app/api/auth/route.ts`

- [ ] **Step 1: Create lib/auth.ts**

Copy the auth pattern from content-dashboard (uses scrypt, not bcrypt as spec states — scrypt is equally secure):
- `hashPassword(password)` — scrypt with random salt
- `verifyPassword(password, stored)` — timing-safe comparison
- `isPasswordSet()` — checks settings for `auth_password_hash`
- `createSession()` — UUID token stored in settings as `auth_session_token`
- `validateSession(token)` — compares cookie with DB

Settings keys used: `auth_password_hash`, `auth_session_token`.

- [ ] **Step 2: Create lib/auth-guard.ts**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { validateSession } from '@/lib/auth'

export function requireAuth(req: NextRequest): NextResponse | null {
  const token = req.cookies.get('session')?.value
  if (!token || !validateSession(token)) {
    return NextResponse.json({ error: 'Niet geautoriseerd' }, { status: 401 })
  }
  return null
}
```

- [ ] **Step 3: Create middleware.ts**

Protect all routes except `/login`, `/api/auth`, `/api/cron`. Redirect to `/login` if no valid session. Match content-dashboard pattern.

- [ ] **Step 4: Create app/api/auth/route.ts**

POST handler with actions: `setup` (first password), `login`, `logout`. Same pattern as content-dashboard.

- [ ] **Step 5: Create app/login/page.tsx**

Client component with password form. Shows "Wachtwoord instellen" on first visit, "Inloggen" thereafter. Same style as content-dashboard.

- [ ] **Step 6: Verify auth flow**

```bash
npm run build
```

Start dev server, verify:
1. All routes redirect to `/login`
2. Can set password
3. Can login
4. Session persists

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: password authentication with session cookies"
```

---

## Task 3: WooCommerce API Client

**Files:**
- Create: `lib/woocommerce.ts`

- [ ] **Step 1: Create lib/woocommerce.ts**

```typescript
import { getDb } from '@/lib/db'
import { log } from '@/lib/logger'

interface WooProduct {
  id: number
  name: string
  sku: string
  stock_quantity: number | null
  price: string
  status: string
}

interface WooOrder {
  id: number
  date_created: string
  line_items: {
    product_id: number
    sku: string
    quantity: number
  }[]
}

export function getWooCredentials(): { url: string; key: string; secret: string } {
  const db = getDb()
  const get = (k: string) =>
    (db.prepare('SELECT value FROM settings WHERE key = ?').get(k) as { value: string } | undefined)?.value || ''
  const url = get('woo_url')
  const key = get('woo_consumer_key')
  const secret = get('woo_consumer_secret')
  if (!url || !key || !secret) throw new Error('WooCommerce credentials niet geconfigureerd')
  return { url, key, secret }
}

async function wooFetch<T>(endpoint: string, params: Record<string, string> = {}): Promise<T[]> {
  const { url, key, secret } = getWooCredentials()
  const allResults: T[] = []
  let page = 1
  const perPage = 100

  while (true) {
    const searchParams = new URLSearchParams({ per_page: String(perPage), page: String(page), ...params })
    const res = await fetch(
      `${url}/wp-json/wc/v3/${endpoint}?${searchParams}`,
      {
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${key}:${secret}`).toString('base64'),
        },
      }
    )
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`WooCommerce API fout (${res.status}): ${err}`)
    }
    const data = await res.json() as T[]
    allResults.push(...data)
    if (data.length < perPage) break
    page++
    await new Promise(r => setTimeout(r, 200)) // rate limit
  }

  return allResults
}

export async function fetchAllProducts(): Promise<WooProduct[]> {
  log('info', 'WooCommerce: producten ophalen...')
  const products = await wooFetch<WooProduct>('products', { status: 'publish' })
  log('info', `WooCommerce: ${products.length} producten opgehaald`)
  return products
}

export async function fetchOrders(afterDate?: string): Promise<WooOrder[]> {
  const params: Record<string, string> = { status: 'completed,processing' }
  if (afterDate) params.after = afterDate
  log('info', `WooCommerce: orders ophalen${afterDate ? ` na ${afterDate}` : ''}...`)
  const orders = await wooFetch<WooOrder>('orders', params)
  log('info', `WooCommerce: ${orders.length} orders opgehaald`)
  return orders
}

export function splitCompositeSku(sku: string): string[] {
  if (!sku.includes('+')) return [sku]
  return sku.split('+').map(s => s.trim()).filter(Boolean)
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add lib/woocommerce.ts
git commit -m "feat: WooCommerce API client with pagination and composite SKU splitting"
```

---

## Task 4: Sync Logic

**Files:**
- Create: `lib/sync.ts`, `app/api/sync/route.ts`, `app/api/cron/route.ts`

- [ ] **Step 1: Create lib/sync.ts**

Core sync functions:
- `syncProducts()` — fetches WooCommerce products, skips composites, upserts individual products, saves stock snapshots
- `syncRecentOrders()` — fetches last 24h of orders, splits composite SKUs, aggregates into `sales_history`
- `importHistoricalOrders()` — fetches 3 years of orders, same processing as syncRecentOrders but with progress callback
- `analyzeHistoricalPeaks()` — finds weeks with >2x avg sales, returns peak data for labeling
- `runDailySync()` — orchestrator: syncProducts → syncRecentOrders, updates `last_sync_at`/`last_sync_status`

```typescript
import { getDb } from '@/lib/db'
import { fetchAllProducts, fetchOrders, splitCompositeSku } from '@/lib/woocommerce'
import { log } from '@/lib/logger'

function getSetting(key: string): string {
  const db = getDb()
  return (db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)?.value || ''
}

function setSetting(key: string, value: string) {
  const db = getDb()
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?').run(key, value, value)
}

export async function syncProducts() {
  const db = getDb()
  const products = await fetchAllProducts()
  const today = new Date().toISOString().slice(0, 10)

  const upsertProduct = db.prepare(`
    INSERT INTO products (woo_product_id, sku, name, current_stock, price, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(sku) DO UPDATE SET
      woo_product_id = ?, name = ?, current_stock = ?, price = ?, updated_at = CURRENT_TIMESTAMP
  `)

  const upsertSnapshot = db.prepare(`
    INSERT INTO stock_snapshots (product_id, date, stock_level)
    VALUES (?, ?, ?)
    ON CONFLICT(product_id, date) DO UPDATE SET stock_level = ?
  `)

  let synced = 0
  db.transaction(() => {
    for (const p of products) {
      if (!p.sku) continue
      // Skip composite SKUs — individual sub-products exist as their own products
      if (p.sku.includes('+')) continue

      const stock = p.stock_quantity ?? 0
      const price = parseFloat(p.price) || 0
      upsertProduct.run(p.id, p.sku, p.name, stock, price, p.id, p.name, stock, price)

      // Get the product id for snapshot
      const row = db.prepare('SELECT id FROM products WHERE sku = ?').get(p.sku) as { id: number }
      upsertSnapshot.run(row.id, today, stock, stock)
      synced++
    }
  })()

  log('info', `Sync: ${synced} producten bijgewerkt`)
  return synced
}

export async function syncRecentOrders() {
  const db = getDb()
  const yesterday = new Date(Date.now() - 86400000).toISOString()
  const orders = await fetchOrders(yesterday)
  return processOrders(db, orders)
}

export async function importHistoricalOrders(onProgress?: (pct: number, msg: string) => void) {
  const db = getDb()
  const { url, key, secret } = getWooCredentials()
  const threeYearsAgo = new Date()
  threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3)

  // Paginated fetch with real progress reporting
  let page = 1
  const perPage = 100
  let allOrders: Awaited<ReturnType<typeof fetchOrders>> = []

  // First request to get total from headers
  const firstParams = new URLSearchParams({
    per_page: String(perPage), page: '1',
    status: 'completed,processing', after: threeYearsAgo.toISOString(),
  })
  const firstRes = await fetch(`${url}/wp-json/wc/v3/orders?${firstParams}`, {
    headers: { 'Authorization': 'Basic ' + Buffer.from(`${key}:${secret}`).toString('base64') },
  })
  const totalPages = parseInt(firstRes.headers.get('x-wp-totalpages') || '1', 10)
  const firstData = await firstRes.json()
  allOrders.push(...firstData)
  if (onProgress) onProgress(Math.round((1 / totalPages) * 100), `Pagina 1/${totalPages}`)

  for (page = 2; page <= totalPages; page++) {
    await new Promise(r => setTimeout(r, 200))
    const params = new URLSearchParams({
      per_page: String(perPage), page: String(page),
      status: 'completed,processing', after: threeYearsAgo.toISOString(),
    })
    const res = await fetch(`${url}/wp-json/wc/v3/orders?${params}`, {
      headers: { 'Authorization': 'Basic ' + Buffer.from(`${key}:${secret}`).toString('base64') },
    })
    const data = await res.json()
    allOrders.push(...data)
    if (onProgress) onProgress(Math.round((page / totalPages) * 100), `Pagina ${page}/${totalPages}`)
  }

  log('info', `Historische import: ${allOrders.length} orders opgehaald uit ${totalPages} pagina's`)
  return processOrders(db, allOrders)
}

function processOrders(db: ReturnType<typeof getDb>, orders: Awaited<ReturnType<typeof fetchOrders>>) {
  const upsertSales = db.prepare(`
    INSERT INTO sales_history (product_id, date, quantity)
    VALUES (?, ?, ?)
    ON CONFLICT(product_id, date) DO UPDATE SET quantity = quantity + ?
  `)

  let processed = 0
  db.transaction(() => {
    for (const order of orders) {
      const date = order.date_created.slice(0, 10)
      for (const item of order.line_items) {
        const skus = splitCompositeSku(item.sku || '')
        for (const sku of skus) {
          const product = db.prepare('SELECT id FROM products WHERE sku = ?').get(sku) as { id: number } | undefined
          if (!product) continue
          upsertSales.run(product.id, date, item.quantity, item.quantity)
          processed++
        }
      }
    }
  })()

  log('info', `Orders: ${processed} verkoopregels verwerkt uit ${orders.length} orders`)
  return processed
}

export interface PeakWeek {
  weekStart: string
  totalSales: number
  avgWeeklySales: number
  ratio: number
}

export function analyzeHistoricalPeaks(): PeakWeek[] {
  const db = getDb()
  // Aggregate sales by ISO week
  const weeks = db.prepare(`
    SELECT strftime('%Y-W%W', date) as week,
           MIN(date) as week_start,
           SUM(quantity) as total_sales
    FROM sales_history
    GROUP BY week
    ORDER BY week
  `).all() as { week: string; week_start: string; total_sales: number }[]

  if (weeks.length === 0) return []

  const avgWeekly = weeks.reduce((s, w) => s + w.total_sales, 0) / weeks.length
  return weeks
    .filter(w => w.total_sales > avgWeekly * 2)
    .map(w => ({
      weekStart: w.week_start,
      totalSales: w.total_sales,
      avgWeeklySales: Math.round(avgWeekly),
      ratio: Math.round((w.total_sales / avgWeekly) * 10) / 10,
    }))
    .sort((a, b) => b.ratio - a.ratio)
}

export async function runDailySync() {
  try {
    setSetting('last_sync_status', 'running')
    await syncProducts()
    await syncRecentOrders()
    setSetting('last_sync_at', new Date().toISOString())
    setSetting('last_sync_status', 'success')
    log('info', 'Dagelijkse sync voltooid')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    setSetting('last_sync_status', `error: ${msg}`)
    log('error', `Sync fout: ${msg}`)
    throw e
  }
}
```

- [ ] **Step 2: Create app/api/cron/route.ts**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { runDailySync } from '@/lib/sync'

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  await runDailySync()
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Create app/api/sync/route.ts**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'
import { runDailySync, importHistoricalOrders, analyzeHistoricalPeaks } from '@/lib/sync'

export async function POST(req: NextRequest) {
  const denied = requireAuth(req); if (denied) return denied
  const { action } = await req.json()

  if (action === 'daily') {
    await runDailySync()
    return NextResponse.json({ ok: true })
  }

  if (action === 'historical') {
    const count = await importHistoricalOrders()
    const peaks = analyzeHistoricalPeaks()
    return NextResponse.json({ ok: true, ordersProcessed: count, peaks })
  }

  return NextResponse.json({ error: 'Onbekende actie' }, { status: 400 })
}
```

- [ ] **Step 4: Verify build**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: WooCommerce sync with daily cron and historical import"
```

---

## Task 5: Prediction Engine

**Files:**
- Create: `lib/prediction.ts`, `lib/stock-status.ts`

- [ ] **Step 1: Create lib/prediction.ts**

```typescript
import { getDb } from '@/lib/db'

/**
 * Weighted moving average over 12 weeks.
 * Week 1 (most recent) = weight 12, week 12 = weight 1.
 * All 12 weeks count — a zero-sale week is real data that pulls the average down.
 * Returns expected daily sales for a product.
 * If manual_daily_sales is set on the product, returns that instead.
 */
export function getWeightedDailySales(productId: number): number {
  const db = getDb()

  // Check for manual override first
  const product = db.prepare('SELECT manual_daily_sales FROM products WHERE id = ?')
    .get(productId) as { manual_daily_sales: number | null } | undefined
  if (product?.manual_daily_sales !== null && product?.manual_daily_sales !== undefined) {
    return product.manual_daily_sales
  }

  const now = new Date()
  const twelveWeeksAgo = new Date(now.getTime() - 12 * 7 * 86400000)

  const rows = db.prepare(`
    SELECT date, quantity FROM sales_history
    WHERE product_id = ? AND date >= ?
    ORDER BY date DESC
  `).all(productId, twelveWeeksAgo.toISOString().slice(0, 10)) as { date: string; quantity: number }[]

  if (rows.length === 0) return 0

  // Aggregate by week (week 0 = most recent)
  const weeklyTotals = new Array(12).fill(0)
  const weekWeights = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]

  for (const row of rows) {
    const dayDate = new Date(row.date)
    const daysAgo = Math.floor((now.getTime() - dayDate.getTime()) / 86400000)
    const weekIndex = Math.floor(daysAgo / 7)
    if (weekIndex < 12) {
      weeklyTotals[weekIndex] += row.quantity
    }
  }

  // All 12 weeks count — zero-sale weeks are real data
  let weightedSum = 0
  let totalWeight = 0
  for (let i = 0; i < 12; i++) {
    weightedSum += (weeklyTotals[i] / 7) * weekWeights[i]
    totalWeight += weekWeights[i]
  }

  if (totalWeight === 0) return 0
  return weightedSum / totalWeight
}

/**
 * Get number of weeks of sales data available for a product.
 */
export function getDataWeeks(productId: number): number {
  const db = getDb()
  const result = db.prepare(`
    SELECT MIN(date) as first_date FROM sales_history WHERE product_id = ? AND quantity > 0
  `).get(productId) as { first_date: string | null } | undefined

  if (!result?.first_date) return 0
  const firstDate = new Date(result.first_date)
  const now = new Date()
  return Math.floor((now.getTime() - firstDate.getTime()) / (7 * 86400000))
}

/**
 * Interface for future ML model replacement.
 * Accepts SKU (not productId) so a future ML model can be a drop-in replacement.
 * Returns expected daily sales for each day in the period.
 * If two events overlap, the highest impact multiplier is used (not additive).
 */
export function getExpectedDailySales(sku: string, startDate: Date, endDate: Date): number[] {
  const db = getDb()
  const product = db.prepare('SELECT id FROM products WHERE sku = ?').get(sku) as { id: number } | undefined
  if (!product) return []

  const baseDailySales = getWeightedDailySales(product.id)

  // Get events in the period
  const events = db.prepare(`
    SELECT expected_date, duration_days, impact_percentage FROM events
    WHERE expected_date IS NOT NULL
  `).all() as { expected_date: string; duration_days: number; impact_percentage: number }[]

  const days: number[] = []
  const current = new Date(startDate)

  while (current <= endDate) {
    let multiplier = 1

    // If two events overlap, use the highest impact (not additive)
    for (const event of events) {
      const eventStart = new Date(event.expected_date)
      const eventEnd = new Date(eventStart.getTime() + event.duration_days * 86400000)
      if (current >= eventStart && current < eventEnd) {
        multiplier = Math.max(multiplier, (100 + event.impact_percentage) / 100)
      }
    }

    days.push(baseDailySales * multiplier)
    current.setDate(current.getDate() + 1)
  }

  return days
}
```

- [ ] **Step 2: Create lib/stock-status.ts**

```typescript
import { getDb } from '@/lib/db'
import { getExpectedDailySales, getWeightedDailySales, getDataWeeks } from '@/lib/prediction'

export type StockStatus = 'order_now' | 'soon' | 'on_track'

export interface ProductStatus {
  productId: number
  sku: string
  name: string
  currentStock: number
  dailySales: number
  daysUntilEmpty: number
  orderDeadlineDays: number
  status: StockStatus
  supplierId: number | null
  supplierName: string | null
  supplierLeadTime: number | null
  pendingOrderQty: number
  pendingOrderArrival: string | null
  dataWeeks: number
  price: number
}

function getSetting(key: string, fallback: string): number {
  const db = getDb()
  const val = (db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)?.value
  return parseInt(val || fallback, 10)
}

export function calculateProductStatus(productId: number): ProductStatus | null {
  const db = getDb()

  const product = db.prepare(`
    SELECT p.*, s.name as supplier_name, s.lead_time_days
    FROM products p
    LEFT JOIN suppliers s ON p.supplier_id = s.id
    WHERE p.id = ? AND p.active = 1
  `).get(productId) as {
    id: number; sku: string; name: string; current_stock: number; price: number;
    supplier_id: number | null; supplier_name: string | null; lead_time_days: number | null
  } | undefined

  if (!product) return null

  const now = new Date()
  const warehouseDays = getSetting('warehouse_inbound_days', '14')
  const safetyDays = getSetting('safety_margin_days', '7')
  const leadTime = product.lead_time_days || 0
  const orderDeadline = leadTime + warehouseDays

  // Pending purchase orders — each with its own arrival date
  const pendingOrders = db.prepare(`
    SELECT quantity, expected_arrival
    FROM purchase_orders
    WHERE product_id = ? AND status IN ('ordered', 'shipped')
  `).all(productId) as { quantity: number; expected_arrival: string | null }[]

  const totalPendingQty = pendingOrders.reduce((s, o) => s + o.quantity, 0)
  const earliestArrival = pendingOrders
    .filter(o => o.expected_arrival)
    .sort((a, b) => a.expected_arrival!.localeCompare(b.expected_arrival!))[0]?.expected_arrival || null

  // Build a map of day → incoming stock for the simulation
  const incomingByDay = new Map<number, number>()
  for (const po of pendingOrders) {
    if (po.expected_arrival) {
      const arrivalDay = Math.floor((new Date(po.expected_arrival).getTime() - now.getTime()) / 86400000)
      if (arrivalDay >= 0) {
        incomingByDay.set(arrivalDay, (incomingByDay.get(arrivalDay) || 0) + po.quantity)
      }
    }
  }

  // Day-by-day simulation
  const dailySales = getWeightedDailySales(productId)
  const futureEnd = new Date(now.getTime() + 365 * 86400000)
  const expectedDailySales = getExpectedDailySales(product.sku, now, futureEnd)

  let stock = product.current_stock
  let daysUntilEmpty = 365

  for (let day = 0; day < 365; day++) {
    // Add incoming stock from purchase orders arriving on this day
    const incoming = incomingByDay.get(day)
    if (incoming) stock += incoming

    stock -= expectedDailySales[day] || dailySales
    if (stock <= 0) {
      daysUntilEmpty = day
      break
    }
  }

  let status: StockStatus = 'on_track'
  if (daysUntilEmpty < orderDeadline) {
    status = 'order_now'
  } else if (daysUntilEmpty < orderDeadline + safetyDays) {
    status = 'soon'
  }

  return {
    productId: product.id,
    sku: product.sku,
    name: product.name,
    currentStock: product.current_stock,
    dailySales: Math.round(dailySales * 100) / 100,
    daysUntilEmpty,
    orderDeadlineDays: orderDeadline,
    status,
    supplierId: product.supplier_id,
    supplierName: product.supplier_name,
    supplierLeadTime: product.lead_time_days,
    pendingOrderQty: totalPendingQty,
    pendingOrderArrival: earliestArrival,
    dataWeeks: getDataWeeks(productId),
    price: product.price,
  }
}

export function getAllProductStatuses(): ProductStatus[] {
  const db = getDb()
  const products = db.prepare('SELECT id FROM products WHERE active = 1').all() as { id: number }[]
  const statuses: ProductStatus[] = []

  for (const p of products) {
    const status = calculateProductStatus(p.id)
    if (status) statuses.push(status)
  }

  // Sort: order_now first, then soon, then on_track. Within each group, by daysUntilEmpty ascending
  const ORDER: Record<StockStatus, number> = { order_now: 0, soon: 1, on_track: 2 }
  statuses.sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.daysUntilEmpty - b.daysUntilEmpty)

  return statuses
}

export function getProductStatusesBySupplier(supplierId: number): ProductStatus[] {
  const db = getDb()
  const products = db.prepare('SELECT id FROM products WHERE active = 1 AND supplier_id = ?').all(supplierId) as { id: number }[]
  const statuses: ProductStatus[] = []

  for (const p of products) {
    const status = calculateProductStatus(p.id)
    if (status) statuses.push(status)
  }

  const ORDER: Record<StockStatus, number> = { order_now: 0, soon: 1, on_track: 2 }
  statuses.sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.daysUntilEmpty - b.daysUntilEmpty)

  return statuses
}
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add lib/prediction.ts lib/stock-status.ts
git commit -m "feat: sales prediction engine with seasonal correction and stock status calculation"
```

---

## Task 6: API Routes (CRUD)

**Files:**
- Create: `app/api/products/route.ts`, `app/api/suppliers/route.ts`, `app/api/events/route.ts`, `app/api/purchase-orders/route.ts`, `app/api/settings/route.ts`

- [ ] **Step 1: Create app/api/products/route.ts**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'
import { getAllProductStatuses } from '@/lib/stock-status'
import { getDb } from '@/lib/db'

export async function GET(req: NextRequest) {
  const denied = requireAuth(req); if (denied) return denied
  const supplierId = req.nextUrl.searchParams.get('supplier_id')

  if (supplierId) {
    const { getProductStatusesBySupplier } = await import('@/lib/stock-status')
    return NextResponse.json({ products: getProductStatusesBySupplier(parseInt(supplierId)) })
  }

  return NextResponse.json({ products: getAllProductStatuses() })
}

// PATCH: assign supplier to product
export async function PATCH(req: NextRequest) {
  const denied = requireAuth(req); if (denied) return denied
  const { id, supplier_id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id is verplicht' }, { status: 400 })

  const db = getDb()
  db.prepare('UPDATE products SET supplier_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(supplier_id || null, id)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Create app/api/suppliers/route.ts**

Full CRUD: GET (list all), POST (create), PUT (update), DELETE. Follow content-dashboard pattern.

Fields: `name` (required), `lead_time_days` (required), `contact_info`, `notes`.

- [ ] **Step 3: Create app/api/events/route.ts**

Full CRUD: GET, POST, PUT, DELETE.

Fields: `name` (required), `expected_date`, `duration_days`, `impact_percentage`, `recurring`, `notes`.

- [ ] **Step 4: Create app/api/purchase-orders/route.ts**

GET (list, filter by supplier_id and/or status), POST (create), PUT (update status), DELETE.

Fields: `supplier_id` (required), `product_id` (required), `quantity` (required), `order_date`, `expected_arrival`, `status`, `notes`.

- [ ] **Step 5: Create app/api/settings/route.ts**

GET (return non-secret settings), PUT (update settings). Secret keys: `woo_consumer_secret`, `auth_password_hash`, `auth_session_token`. Follow content-dashboard pattern.

- [ ] **Step 6: Verify build**

```bash
npm run build
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: CRUD API routes for products, suppliers, events, purchase orders, settings"
```

---

## Task 7: Navigation Component

**Files:**
- Create: `components/Nav.tsx`

- [ ] **Step 1: Create components/Nav.tsx**

Shared navigation bar used on all pages. Pill-style nav like content-dashboard.

Links: Alerts (home), Fabrikanten, Events, Instellingen.

Shows last sync status in the header (from settings `last_sync_at` and `last_sync_status`).

Sync-knop (refresh icon) that triggers manual sync via `POST /api/sync { action: 'daily' }`.

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add components/Nav.tsx
git commit -m "feat: shared navigation component with sync button"
```

---

## Task 8: Alerts Page (Hoofdscherm)

**Files:**
- Create: `app/page.tsx`

- [ ] **Step 1: Create app/page.tsx**

Client component. Fetches `GET /api/products`.

Shows only products with status `order_now` or `soon`.

Per product card:
- Status badge: "Bestel nu" (red) / "Binnenkort" (orange)
- Product naam + SKU
- Huidige voorraad
- Verwachte verkoop/dag
- Dagen tot leeg
- Fabrikant naam (or "Geen fabrikant" warning)
- If pending order exists: "X besteld, verwacht [date]"
- If dataWeeks < 12: warning icon "Beperkte verkoopdata (X weken)"

Products without a supplier assigned should show a warning — prediction is useless without lead time.

Footer: "Laatste sync: [time] — [status]"

Empty state: "Alle producten op schema" with green checkmark.

- [ ] **Step 2: Verify build and visual check**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat: alerts dashboard showing products needing reorder"
```

---

## Task 9: Supplier Pages

**Files:**
- Create: `app/suppliers/page.tsx`, `app/suppliers/[id]/page.tsx`

- [ ] **Step 1: Create app/suppliers/page.tsx**

Client component. Fetches `GET /api/suppliers` and for each supplier fetches product counts.

Layout:
- List of all suppliers as cards
- Per supplier: name, lead time, number of products per status (order_now / soon / on_track)
- Click on supplier → navigates to `/suppliers/{id}`
- If a supplier has `order_now` products, the card shows a red badge

- [ ] **Step 2: Create app/suppliers/[id]/page.tsx**

Client component. Fetches `GET /api/products?supplier_id={id}` and supplier details.

Layout:
- Header: supplier name, lead time, contact info
- Summary bar: X bestel nu, Y binnenkort, Z op schema
- Product table sorted by urgency (order_now → soon → on_track)
- Each row: SKU, naam, voorraad, verkoop/dag, dagen tot leeg, status badge
- "Bestelling registreren" button → opens form to create purchase order (product dropdown, quantity, expected arrival)
- "Kopieer bestelwijst" button → copies text list of order_now + soon products to clipboard, formatted for email

Format for copy:
```
Bestelling SpeedRopeShop — [supplier name] — [date]

Bestel nu:
- [SKU] [naam] — voorraad: X, verkoop: Y/dag

Binnenkort:
- [SKU] [naam] — voorraad: X, verkoop: Y/dag
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add app/suppliers/
git commit -m "feat: supplier list and order page with copy-to-clipboard"
```

---

## Task 10: Events Page

**Files:**
- Create: `app/events/page.tsx`

- [ ] **Step 1: Create app/events/page.tsx**

Client component. CRUD for events via `/api/events`.

Layout:
- List of events sorted by expected_date (upcoming first, then past, then no date)
- Each event: name, date, duration, impact percentage, recurring badge
- Events without a date: highlighted "Datum onbekend" warning
- Events with date in the past and recurring=1: "Datum verlopen — bijwerken" warning
- Add/edit form: name, expected_date, duration_days, impact_percentage, recurring toggle, notes
- Inline editing (click to edit)
- "Datums controleren" button bovenaan: highlights alle events die aandacht nodig hebben (datum verlopen, datum onbekend). Dit is de driemaandelijkse event-check uit de spec.

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add app/events/page.tsx
git commit -m "feat: event calendar page with CRUD"
```

---

## Task 11: Settings Page

**Files:**
- Create: `app/settings/page.tsx`

- [ ] **Step 1: Create app/settings/page.tsx**

Client component with sections:

**WooCommerce verbinding:**
- URL, Consumer Key, Consumer Secret fields
- Test verbinding button (triggers a sync of 1 product to verify)

**Fabrikanten:**
- List of suppliers with inline edit/delete
- Add supplier form: name, lead_time_days, contact_info, notes

**Voorraad instellingen:**
- Warehouse inbound tijd (dagen)
- Veiligheidsmarge (dagen)

**Data:**
- Laatste sync: [time] — [status]
- Handmatige sync knop
- Historische import knop (with warning: "Dit kan lang duren")
- After historical import: show peak analysis results for labeling

**Product-fabrikant koppeling:**
- Bulk assign: select supplier → select products → assign
- Or per-product dropdown on the products API

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add app/settings/page.tsx
git commit -m "feat: settings page with WooCommerce config, suppliers, and sync controls"
```

---

## Task 12: Docker + Deployment

**Files:**
- Create: `Dockerfile`, `docker-compose.yml`

- [ ] **Step 1: Create Dockerfile**

Multi-stage build — same pattern as content-dashboard:
- `base`: node:22-alpine
- `deps`: install dependencies (include python3, make, g++ for better-sqlite3)
- `builder`: build Next.js
- `runner`: .next/standalone, expose 3100

- [ ] **Step 2: Create docker-compose.yml**

```yaml
services:
  stock-dashboard:
    image: ghcr.io/rvdbot/stock:latest
    ports:
      - "3100:3100"
    volumes:
      - ./data:/app/data
    environment:
      - DATABASE_PATH=/app/data/stock-dashboard.db
      - CRON_SECRET=changeme
      - PORT=3100
    restart: unless-stopped
```

- [ ] **Step 3: Verify build**

```bash
npm run build
docker build -t stock-dashboard .
```

- [ ] **Step 4: Commit**

```bash
git add Dockerfile docker-compose.yml
git commit -m "feat: Docker setup for production deployment"
```

---

## Task 13: Final Integration + Push

- [ ] **Step 1: Full build verification**

```bash
npm run build
```

Verify no TypeScript errors.

- [ ] **Step 2: Test the full flow locally**

```bash
npm run dev
```

1. Open http://localhost:3100 → should redirect to /login
2. Set password → login → see empty alerts page
3. Go to settings → configure WooCommerce credentials
4. Run sync → products should appear
5. Add a supplier with lead time
6. Assign products to supplier
7. Check alerts page → products should show with statuses
8. Add an event → verify it affects predictions

- [ ] **Step 3: Push to GitHub**

```bash
git push origin main
```

- [ ] **Step 4: Deploy on VPS**

On the VPS:
```bash
cd /opt/stock
git clone https://github.com/RVDBot/stock.git .
# Or set up GitHub Actions for auto-deploy
docker compose up -d
```

Configure Nginx:
```bash
# Add server block for stock.speedropeshop.com
sudo certbot --nginx -d stock.speedropeshop.com
```

Add cron job:
```bash
echo "0 3 * * * curl -s -X POST -H 'x-cron-secret: YOUR_SECRET' https://stock.speedropeshop.com/api/cron" | crontab -
```
