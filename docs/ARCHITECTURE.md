# Architecture

## Tiers

```
┌──────────────────────────────────────────────────────────────┐
│  client/   React 18 · Vite · Tailwind · React Router         │
│                                                              │
│   PublicLayout          PanelLayout (customer|worker|admin)  │
│   Landing, Browse,      RequireRole gate → panel routes      │
│   ServiceDetail,        ↓                                    │
│   WorkerProfile         src/api/*  one module per endpoint   │
└──────────────────────────────┬───────────────────────────────┘
                               │  JSON over HTTP
                               │  Bearer <JWT>   role claim = panel
                               ▼
┌──────────────────────────────────────────────────────────────┐
│  server/   Express (ESM)                                     │
│                                                              │
│   routes/        route table, role gates, validation         │
│      ↓                                                       │
│   controllers/   request → service call → response envelope  │
│      ↓                                                       │
│   services/      ALL business logic, no HTTP awareness       │
│      ↓                                                       │
│   models/        Mongoose schemas + indexes                  │
└──────────────────────────────┬───────────────────────────────┘
                               ▼
┌──────────────────────────────────────────────────────────────┐
│  MongoDB   8 collections · 2dsphere geo indexes              │
│            aggregation pipelines for forecasting + settlement │
└──────────────────────────────────────────────────────────────┘
```

The layering rule: **controllers never contain business logic, and services
never touch `req`/`res`.** That is what makes `dispatchBooking()` callable from
an HTTP route, from the background scheduler, and from a test with equal ease —
and it is why the scheduler exists at all.

---

## Why MongoDB

Three properties of this domain pushed the choice:

1. **Geospatial queries are the hot path.** Every booking runs a `$geoNear`
   against a 2dsphere index on `Worker.location`. Doing this in Postgres means
   PostGIS; in Mongo it is a first-class index type and an aggregation stage.
2. **A booking is a document, not a row.** It carries an embedded dispatch
   round (every candidate offered, their distance, their response and when),
   a timeline, a price breakdown and two OTPs. Modelling that relationally
   means five join tables for data that is only ever read as one unit.
3. **The analytics are aggregations, not joins.** Demand profiling, the
   settlement run and the workforce gap report are all `$group` pipelines over
   one collection.

Where a relational store would win — the money ledger — the design compensates:
payouts are idempotent on a unique `(worker, period.label)` index, so re-running
a settlement updates rather than duplicates.

---

## The dispatch engine

The central mechanism. Modelled on ride-hailing rather than on classified
listings, because a plumbing emergency cannot wait for a callback.

```
booking created
      │
      ▼
┌─────────────────┐   no candidates    ┌──────────┐
│  $geoNear over  │───────────────────▶│ pending  │
│  2dsphere index │                    └──────────┘
└────────┬────────┘
         │  rank by proximity · rating · reliability · experience · FAIRNESS
         ▼
┌──────────────────────────────────────────────┐
│  offer to top N simultaneously (default 5)   │
│  status = dispatching, expiresAt = now + 45s │
└────────┬──────────────────────────┬──────────┘
         │ someone accepts          │ window closes
         ▼                          ▼
┌─────────────────┐        ┌─────────────────────────┐
│ first wins      │        │ mark all timeout,       │
│ atomically      │        │ re-broadcast wider,      │
│ others → timeout│        │ excluding those who      │
└─────────────────┘        │ already declined         │
                           │ (max 3 rounds)           │
                           └─────────────────────────┘
```

### Why broadcast rather than sequential

Offering to one member at a time with a per-member timeout looks fairer, but
adds *N × timeout* to the customer's wait. Broadcasting costs the losing members
a notification; sequential costs the customer minutes.

The fairness cost of broadcast is paid back in the **ranking function** instead:
members below the local median job count get a bounded boost, so volume spreads
across the membership rather than concentrating on whoever is already busiest.

### Winning the race without a lock

Two members tapping *Accept* in the same instant is resolved by one conditional
update:

```js
Booking.findOneAndUpdate(
  { _id, status: 'dispatching', worker: null, 'dispatch.expiresAt': { $gt: now } },
  { $set: { worker: workerId, status: 'accepted', ... } },
)
```

MongoDB guarantees document-level atomicity, so exactly one update matches. The
loser gets `null` back, and the controller then distinguishes *"someone beat you
to it"* from *"you were never offered this"* by re-reading the document — which
matters, because those are different messages to show a person.

No transaction, no distributed lock, no queue.

---

## Pricing

`buildPricing()` is a pure function. Given a base price, a surge multiplier, an
emergency surcharge, add-ons and a coupon, it returns every line **and** the
ownership split. It is called in three places — the live quote, booking
creation, and the seed — and produces identical numbers in all three.

```
base
  + surge      (base × (multiplier − 1))
  + emergency
  + add-ons
  − discount
  ─────────────
  = subtotal   ← what the customer pays
      ├── platform fee     2%
      ├── coop commission  8%   (40% of this becomes dividend)
      └── worker payout    90%
```

Prices are **stored** on the booking rather than recomputed, so a historical
booking always shows the numbers the customer actually agreed to. The one
derived value — the percentage split — is deliberately *not* stored, and is
recomputed for display, so the percentages can never drift from the rupees.

Surge scales on `sqrt(demand/supply − 1)` rather than linearly, so one extra
booking cannot spike the price, and is clamped to the cooperative's voted
ceiling. When supply is zero the multiplier holds at the ceiling rather than
running away — no-supply is not a licence to gouge.

---

## Demand forecasting

No ML dependency, and that is a deliberate choice rather than a shortcut.

Demand in this domain is overwhelmingly **seasonal**: it depends on hour-of-day
and day-of-week far more than on anything else. An additive decomposition of
those two factors against a moving baseline predicts about as well as a heavier
model would — and unlike a black box, a cooperative's members can audit it,
which matters when the same signal sets their prices.

```
forecast(t) = baseline_per_hour
            × hourOfDay_index[hour(t)]
            × dayOfWeek_index[weekday(t)]
```

Both indices are `$group` pipelines over `Booking`, normalised so `1.0` is an
average hour or day. Confidence is reported explicitly and decays across the
horizon, rather than presenting a flat number as if it were certain.

### One trap worth naming

MongoDB's `$hour`, `$dayOfWeek` and `$dateToString` default to **UTC**. The
client reads them back in **local** time. On an IST deployment that is a 5.5-hour
skew — enough to report 02:00 as the busiest hour on data that actually peaks at
18:00. Every date-part extraction passes an explicit `timezone`, and
`utils/datetime.js` keeps the JavaScript side of the same calculation in the
same frame. This bug was live until the seeded evening peak visibly failed to
appear in the UI.

---

## Settlement

Two components make a member's payout:

| Component | Source |
|---|---|
| Job earnings | Sum of `pricing.workerPayout` over the period's completed bookings — already net of commission and platform fee |
| Dividend | Their share of the cooperative's undistributed commission pool |

The dividend is apportioned **by contribution** — each member's share of the
period's gross — not equally. A member who worked more receives more. That rule
is the general body's to change, which is why it lives in
`Cooperative.governance` rather than in global config.

Runs are idempotent: the unique index on `(worker, period.label)` means
re-running a period updates the drafts instead of duplicating them. Drafts still
need per-member approval before money moves.

---

## Authentication and the panel boundary

```
POST /api/auth/login
      │
      ▼
  JWT { sub: userId, role: 'customer'|'worker'|'admin' }
      │
      ├──▶ client: mount the matching panel   ← convenience
      │
      └──▶ server: requireRole(...) on every panel-scoped route
                   + admin queries scoped to req.user.cooperative
                                                 ↑
                                          the actual boundary
```

`requireAuth` also resolves the `Worker` profile once for worker tokens, since
worker routes act on the profile far more often than on the user record.

Admin controllers scope every query to `req.user.cooperative`, so one
cooperative's board cannot read another's members, bookings or ledgers even
though they share a route.

---

## Frontend structure

**`useApi`** collapses the loading/error/data/reload cycle every panel needs,
with optional polling. Polls refresh *silently* — a spinner must never flash over
content the user is reading.

**Poll intervals are chosen by how fast the underlying thing changes:**

| Screen | Interval | Why |
|---|---|---|
| Worker offer inbox | 5 s | Offers expire in 45 s |
| Worker dashboard | 8 s | Offers plus active job |
| Booking tracker | 8 s | Only while the booking is live |
| Customer home | 12 s | Live job strip |
| Notifications | 20 s | Inbox badge |
| Admin overview | 20 s | Operational, not real-time |
| Nearby map | 25 s | Positions drift slowly |

**Charts** use a palette validated with the dataviz checker — all six checks
pass, worst adjacent-pair CVD separation ΔE 8.8 (deutan) against a 24.9
normal-vision floor. Every chart has a table view behind a toggle, a legend
whenever there are two or more series, and no color-only encoding.

**Route-level code splitting** means a customer never downloads the admin
bundle. The largest panel chunk is ~16 KB.

---

## Production gaps

Named plainly, with where each one would be closed:

| Gap | Where it plugs in |
|---|---|
| Push notifications | `deliver()` in `notification.service.js` |
| Real payment capture | `pay` controller + a gateway webhook |
| Multi-instance scheduling | Replace `scheduler.service.js` with BullMQ/Agenda |
| Live worker location | Websocket channel feeding the same `location` field |
| Document storage | Encrypted object store; the DB keeps references only |
| Observability | Structured logs from `utils/logger.js` into a collector |
