# Stock Prediction Dashboard — Design Spec

**Project:** stock.speedropeshop.com
**Repository:** github.com/RVDBot/stock
**Doel:** Nooit meer out-of-stock raken zonder torenhoge voorraden. Dashboard dat toont wanneer producten besteld moeten worden zodat ze op tijd op voorraad zijn.

> Dit is een planning-document dat in de content-dashboard repo leeft totdat de stock repo opgezet is. Bij implementatie wordt de spec verplaatst naar de stock repo.

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
| product_id | INTEGER NOT NULL REFERENCES products(id) | |
| date | TEXT NOT NULL | Datum (YYYY-MM-DD) |
| stock_level | INTEGER NOT NULL | Voorraadstand |
| PRIMARY KEY | (product_id, date) | Composiet primary key |

### `sales_history` — Historische verkopen (primaire bron voor verkoopsnelheid)
| Kolom | Type | Beschrijving |
|---|---|---|
| product_id | INTEGER NOT NULL REFERENCES products(id) | |
| date | TEXT NOT NULL | Datum (YYYY-MM-DD) |
| quantity | INTEGER NOT NULL DEFAULT 0 | Aantal verkocht |
| PRIMARY KEY | (product_id, date) | Eén rij per product per dag |

### `purchase_orders` — Lopende bestellingen bij fabrikanten
| Kolom | Type | Beschrijving |
|---|---|---|
| id | INTEGER PK | |
| supplier_id | INTEGER NOT NULL REFERENCES suppliers(id) | |
| product_id | INTEGER NOT NULL REFERENCES products(id) | |
| quantity | INTEGER NOT NULL | Besteld aantal |
| order_date | TEXT NOT NULL | Besteldatum (YYYY-MM-DD) |
| expected_arrival | TEXT | Verwachte aankomst (YYYY-MM-DD) |
| status | TEXT NOT NULL DEFAULT 'ordered' | ordered / shipped / received |
| notes | TEXT | |
| created_at | DATETIME | |

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
| notes | TEXT | Incl. hoe toekomstige datum te bepalen (bijv. "4e vrijdag november") |
| created_at | DATETIME | |

Terugkerende events hebben geen automatische datumberekening. Toekomstige datums worden handmatig bijgewerkt via de driemaandelijkse event-check of wanneer het event aangekondigd wordt.

### `settings` — App-instellingen
| Kolom | Type | Beschrijving |
|---|---|---|
| key | TEXT PK | |
| value | TEXT NOT NULL DEFAULT '' | |

Settings keys: `woo_url`, `woo_consumer_key`, `woo_consumer_secret`, `warehouse_inbound_days` (default 14), `safety_margin_days` (default 7), `password_hash`, `last_sync_at`, `last_sync_status`.

## 4. Samengestelde SKU's

WooCommerce producten met een `+` in de SKU (bijv. `ACC010100+SR0100302`) zijn bundels van meerdere producten. De verzendpartij werkt de stock van elk deelproduct apart bij in WooCommerce.

**Sync-logica:**
- Bij het ophalen van producten uit WooCommerce: als een SKU een `+` bevat, wordt het product niet als eigen product opgeslagen maar worden de deelproducten herkend via hun individuele SKU's.
- De individuele deelproducten bestaan al als eigen producten in WooCommerce met hun eigen stock level — die zijn leidend.
- `stock_snapshots` en `sales_history` worden alleen bijgehouden per individueel product, nooit per composiet.

**Orderverwerking:**
- Bij historische orderimport: als een order-item een samengestelde SKU heeft, wordt de verkoop gesplitst naar de deelproducten (elk +1 verkoop).

## 5. Voorspellingslogica

### Verkoopsnelheid (gewogen moving average)
- 12 weken terugkijken
- Gewichten: week 1 (meest recent) = 12, week 2 = 11, ... week 12 = 1
- Resultaat: verwachte verkoop per dag per SKU
- **Primaire databron:** `sales_history` (uit WooCommerce orders)
- `stock_snapshots` worden alleen gebruikt voor monitoring, niet voor verkoopberekening (restocking maakt stock-deltas onbetrouwbaar als verkoopindicator)
- **Nieuwe producten (<12 weken data):** gebruiken beschikbare data met een waarschuwing in het dashboard. Handmatige override van verwachte verkoop/dag is mogelijk via `products` tabel.

### Seizoenscorrectie
- Als een event binnen de bestelperiode valt, wordt de verwachte verkoop voor die dagen vermenigvuldigd met `(100 + impact_percentage) / 100`
- Voorbeeld: normaal 2/dag, Black Friday (impact +150%) → 2 * (100+150)/100 = 5/dag gedurende de eventperiode
- Events gelden voor alle producten (vereenvoudiging). Dit is acceptabel omdat de pieken bij SpeedRopeShop grotendeels de hele productlijn raken.
- **Berekening per dag:** de `dagen_tot_leeg` berekening simuleert dag-voor-dag: elke dag wordt de voorraad verminderd met de verwachte verkoop van die dag (incl. eventuele event-multiplier). Dit voorkomt fouten bij events die deels in de bestelperiode vallen.

### Bestelmoment berekening
```
dagen_tot_leeg = dag-voor-dag simulatie van voorraadafname (incl. seizoenscorrectie)
bestel_deadline = fabrikant_levertijd + warehouse_inbound_days
effectieve_stock = huidige_stock + inkomende_bestellingen (purchase_orders met status ordered/shipped)

Status:
  "Bestel nu"  → dagen_tot_leeg < bestel_deadline
  "Binnenkort" → dagen_tot_leeg < bestel_deadline + safety_margin_days
  "Op schema"  → ruim voldoende voorraad
```

Lopende bestellingen (`purchase_orders`) worden meegenomen in de voorraadberekening: bestelde hoeveelheden worden bij de verwachte stock opgeteld op de verwachte aankomstdatum.

### Interface voor toekomstig ML-model
```typescript
function getExpectedDailySales(sku: string, startDate: Date, endDate: Date): number[]
```
Approach B (moving average + events) implementeert deze functie. Approach C (ML) kan deze later vervangen zonder de rest van de app aan te raken.

## 6. Dashboard views

### View 1: Alerts (hoofdscherm)
- Alle producten die actie nodig hebben, gesorteerd op urgentie
- "Bestel nu" bovenaan (rood), dan "Binnenkort" (oranje)
- "Op schema" wordt hier niet getoond
- Per product: naam, SKU, huidige stock, dagen tot leeg, fabrikant, verwachte verkoop/dag
- Producten met lopende bestellingen tonen dit (bijv. "50 besteld, verwacht 15 apr")
- Producten met <12 weken verkoopdata tonen een waarschuwing
- Footer: "Laatste sync: [datum/tijd] — [status]"

### View 2: Fabrikant bestelpagina
- Selecteer een fabrikant → zie al diens producten
- Gesorteerd: "Bestel nu" → "Binnenkort" → "Op schema"
- Per product: naam, SKU, huidige stock, verwachte verkoop/dag, dagen tot leeg
- Samenvatting bovenaan: aantal producten per status, fabrikant levertijd
- Mogelijkheid om bestellingen te registreren (product, aantal, verwachte aankomst)
- Kopieer-knop: productlijst als tekst kopiëren om naar fabrikant te mailen

### View 3: Eventkalender
- Overzicht van alle events met datum, impact, terugkerend ja/nee
- Events toevoegen/bewerken/verwijderen
- Knop om toekomstige datums te checken/updaten
- Events zonder toekomstige datum worden gemarkeerd

### View 4: Instellingen
- WooCommerce credentials
- Fabrikanten beheren (naam, levertijd, contactgegevens)
- Warehouse inbound tijd (default 14 dagen)
- Veiligheidsmarge (default 7 dagen)
- Handmatige sync-knop + status laatste sync

## 7. Data sync & achtergrondprocessen

### Dagelijkse sync (nachtelijk, 03:00 via system crontab + curl)
1. Haal alle producten + stock levels op via WooCommerce REST API (~5-10 calls, 100/pagina)
2. Splits samengestelde SKU's op `+` separator
3. Upsert producten in `products` tabel
4. Sla stock snapshot op in `stock_snapshots`
5. **Haal orders op van de afgelopen 24 uur, splits samengestelde SKU's, en aggregeer in `sales_history`**
6. Herbereken verkoopsnelheid per product
7. Sla `last_sync_at` en `last_sync_status` op in settings

**Trigger:** System crontab op de VPS roept `curl -X POST https://stock.speedropeshop.com/api/cron` aan met een gedeeld secret. Geen node-cron of in-process scheduling.

**Rate limiting:** WooCommerce API calls met 200ms delay tussen requests. Bij een fout: log en ga door met de rest van de sync (partial failure is OK).

### Eenmalige historische import (bij setup)
1. Haal 3 jaar aan orders op uit WooCommerce REST API (gepagineerd, ~100 orders/pagina, kan duizenden calls zijn)
2. Splits samengestelde SKU's naar deelproducten
3. Sla op in `sales_history` (geaggregeerd per dag per SKU)
4. Analyseer pieken: weken met >2x gemiddelde verkoop
5. Presenteer gevonden pieken aan gebruiker om te labelen met events
6. **Rate limiting:** 200ms delay tussen API calls, voortgangsindicator in het dashboard

### Driemaandelijkse event-check
- Handmatige knop in het dashboard
- Events zonder bekende toekomstige datum krijgen "datum onbekend" status

## 8. Authenticatie & beveiliging
- Enkel wachtwoord met bcrypt hash
- Session cookie: httpOnly, secure, sameSite=strict
- Middleware beschermt alle routes behalve `/login`
- Cron endpoint beveiligd met gedeeld secret (header)
- HTTPS via Nginx + certbot

## 9. Deployment
- Apart Next.js project in eigen repository (github.com/RVDBot/stock)
- Docker container, poort 3100
- SQLite database in Docker volume mount
- Nginx: `stock.speedropeshop.com` → `localhost:3100`
- SSL: `certbot --nginx -d stock.speedropeshop.com`
