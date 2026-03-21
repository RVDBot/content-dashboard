# Stock Prediction Dashboard — Design Spec

**Project:** stock.speedropeshop.com
**Doel:** Nooit meer out-of-stock raken zonder torenhoge voorraden. Dashboard dat toont wanneer producten besteld moeten worden zodat ze op tijd op voorraad zijn.

---

## 1. Context

SpeedRopeShop verkoopt springtouwen en fitness-accessoires via WooCommerce (speedropeshop.com). De shop heeft ~500 SKU's, meerdere talen (NL, EN, DE, ES, IT, FR) met gedeelde SKU's, Engels als basis. Sommige SKU's zijn samengesteld (bijv. `ACC010100+SR0100302`) — de verzendpartij werkt de stock per deelproduct bij in WooCommerce.

Producten worden handmatig besteld bij fabrikanten via email. Fabrikant levertijden variëren van enkele weken tot 4 maanden. Na ontvangst duurt het 1-2 weken (vast) om producten in het warehouse pickklaar te krijgen.

Het probleem: levertijden en voorraadniveaus zitten in het hoofd van de eigenaar, waardoor producten regelmatig onverwacht uitverkocht raken.

## 2. Tech Stack

- **Framework:** Next.js 15 (TypeScript)
- **Database:** SQLite (better-sqlite3, WAL mode)
- **Styling:** Tailwind CSS 4
- **Deployment:** Docker container op bestaande VPS, poort 3100
- **Reverse proxy:** Nginx → stock.speedropeshop.com
- **Databron:** WooCommerce REST API

## 3. Datamodel

### `suppliers` — Fabrikanten
| Kolom | Type | Beschrijving |
|---|---|---|
| id | INTEGER PK | |
| name | TEXT NOT NULL | Naam fabrikant |
| lead_time_days | INTEGER NOT NULL | Levertijd in dagen |
| contact_info | TEXT | Email/telefoon |
| notes | TEXT | Notities |
| created_at | DATETIME | |

### `products` — Producten (sync uit WooCommerce)
| Kolom | Type | Beschrijving |
|---|---|---|
| id | INTEGER PK | |
| woo_product_id | INTEGER NOT NULL | WooCommerce product ID |
| sku | TEXT NOT NULL UNIQUE | Individuele SKU (samengestelde zijn gesplitst) |
| name | TEXT NOT NULL | Productnaam |
| current_stock | INTEGER NOT NULL DEFAULT 0 | Huidige voorraad |
| price | REAL NOT NULL DEFAULT 0 | Prijs |
| is_composite | INTEGER NOT NULL DEFAULT 0 | Onderdeel van samengestelde SKU |
| composite_sku | TEXT | Originele samengestelde SKU (als is_composite = 1) |
| supplier_id | INTEGER REFERENCES suppliers(id) | Fabrikant |
| active | INTEGER NOT NULL DEFAULT 1 | Actief product |
| updated_at | DATETIME | |

### `stock_snapshots` — Dagelijkse voorraadstand
| Kolom | Type | Beschrijving |
|---|---|---|
| id | INTEGER PK | |
| product_id | INTEGER NOT NULL REFERENCES products(id) | |
| date | TEXT NOT NULL | Datum (YYYY-MM-DD) |
| stock_level | INTEGER NOT NULL | Voorraadstand |
| PRIMARY KEY | (product_id, date) | |

### `sales_history` — Historische verkopen
| Kolom | Type | Beschrijving |
|---|---|---|
| id | INTEGER PK | |
| product_id | INTEGER NOT NULL REFERENCES products(id) | |
| date | TEXT NOT NULL | Datum (YYYY-MM-DD) |
| quantity | INTEGER NOT NULL DEFAULT 0 | Aantal verkocht |
| UNIQUE | (product_id, date) | Eén rij per product per dag |

### `events` — Seizoensgebonden pieken
| Kolom | Type | Beschrijving |
|---|---|---|
| id | INTEGER PK | |
| name | TEXT NOT NULL | Eventnaam |
| expected_date | TEXT | Verwachte datum (YYYY-MM-DD) |
| duration_days | INTEGER NOT NULL DEFAULT 7 | Duur van de piek |
| impact_percentage | INTEGER NOT NULL DEFAULT 100 | Extra verkoop (bijv. 150 = +150%) |
| recurring | INTEGER NOT NULL DEFAULT 1 | Jaarlijks terugkerend |
| last_checked_at | DATETIME | Laatste keer dat datum gecontroleerd is |
| notes | TEXT | |
| created_at | DATETIME | |

### `settings` — App-instellingen
| Kolom | Type | Beschrijving |
|---|---|---|
| key | TEXT PK | |
| value | TEXT NOT NULL DEFAULT '' | |

Settings keys: `woo_url`, `woo_consumer_key`, `woo_consumer_secret`, `warehouse_inbound_days` (default 14), `safety_margin_days` (default 7), `password_hash`.

## 4. Voorspellingslogica

### Verkoopsnelheid (gewogen moving average)
- 12 weken terugkijken
- Gewichten: week 1 (meest recent) = 12, week 2 = 11, ... week 12 = 1
- Resultaat: verwachte verkoop per dag per SKU
- Databron: `stock_snapshots` (verschil over tijd) aangevuld met `sales_history`

### Seizoenscorrectie
- Als een event binnen de bestelperiode valt, wordt de verwachte verkoop vermenigvuldigd met `(100 + impact_percentage) / 100`
- Voorbeeld: normaal 2/dag, Black Friday (impact +150%) → 2 * (100+150)/100 = 5/dag gedurende de eventperiode

### Bestelmoment berekening
```
dagen_tot_leeg = huidige_stock / verwachte_verkoop_per_dag (incl. seizoenscorrectie)
bestel_deadline = fabrikant_levertijd + warehouse_inbound_days

Status:
  "Bestel nu"  → dagen_tot_leeg < bestel_deadline
  "Binnenkort" → dagen_tot_leeg < bestel_deadline + safety_margin_days
  "Op schema"  → ruim voldoende voorraad
```

### Interface voor toekomstig ML-model
```typescript
function getExpectedDailySales(sku: string, startDate: Date, endDate: Date): number[]
```
Approach B (moving average + events) implementeert deze functie. Approach C (ML) kan deze later vervangen zonder de rest van de app aan te raken.

## 5. Dashboard views

### View 1: Alerts (hoofdscherm)
- Alle producten die actie nodig hebben, gesorteerd op urgentie
- "Bestel nu" bovenaan (rood), dan "Binnenkort" (oranje)
- "Op schema" wordt hier niet getoond
- Per product: naam, SKU, huidige stock, dagen tot leeg, fabrikant, verwachte verkoop/dag

### View 2: Fabrikant bestelpagina
- Selecteer een fabrikant → zie al diens producten
- Gesorteerd: "Bestel nu" → "Binnenkort" → "Op schema"
- Per product: naam, SKU, huidige stock, verwachte verkoop/dag, dagen tot leeg
- Samenvatting bovenaan: aantal producten per status, fabrikant levertijd

### View 3: Eventkalender
- Overzicht van alle events met datum, impact, terugkerend ja/nee
- Events toevoegen/bewerken/verwijderen
- Knop om toekomstige datums te checken/updaten

### View 4: Instellingen
- WooCommerce credentials
- Fabrikanten beheren (naam, levertijd, contactgegevens)
- Warehouse inbound tijd (default 14 dagen)
- Veiligheidsmarge (default 7 dagen)

## 6. Data sync & achtergrondprocessen

### Dagelijkse sync (nachtelijk, 03:00)
1. Haal alle producten + stock levels op via WooCommerce REST API (~5-10 calls, 100/pagina)
2. Splits samengestelde SKU's op `+` separator
3. Upsert producten in `products` tabel
4. Sla stock snapshot op in `stock_snapshots`
5. Herbereken verkoopsnelheid per product

### Eenmalige historische import (bij setup)
1. Haal 3 jaar aan orders op uit WooCommerce REST API
2. Splits samengestelde SKU's naar deelproducten
3. Sla op in `sales_history` (geaggregeerd per dag per SKU)
4. Analyseer pieken: weken met >2x gemiddelde verkoop
5. Presenteer gevonden pieken aan gebruiker om te labelen met events

### Driemaandelijkse event-check
- Cron of handmatige knop
- Events zonder bekende toekomstige datum krijgen "datum onbekend" status

## 7. Authenticatie & beveiliging
- Enkel wachtwoord met bcrypt hash
- Session cookie: httpOnly, secure, sameSite=strict
- Middleware beschermt alle routes behalve `/login`
- HTTPS via Nginx + certbot

## 8. Deployment
- Apart Next.js project in eigen repository
- Docker container, poort 3100
- SQLite database in Docker volume mount
- Nginx: `stock.speedropeshop.com` → `localhost:3100`
- SSL: `certbot --nginx -d stock.speedropeshop.com`
