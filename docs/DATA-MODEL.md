# Data Model

Eight collections. Every schema lives in `server/src/models/`.

```
                    ┌───────────────┐
                    │  Cooperative  │  governance: commission, dividend %,
                    └───┬───────┬───┘  rate floor, surge ceiling
                        │       │
              ┌─────────┘       └──────────┐
              ▼                            ▼
        ┌──────────┐  1:1  ┌────────┐   ┌────────┐
        │   User   │◀─────▶│ Worker │   │ Payout │
        └────┬─────┘       └───┬────┘   └────────┘
             │                 │
             │   ┌─────────────┘
             ▼   ▼
        ┌──────────────┐        ┌─────────┐
        │   Booking    │───────▶│ Service │
        └──────┬───────┘        └─────────┘
               │
               ▼
        ┌──────────┐        ┌──────────────┐
        │  Review  │        │ Notification │ (per user, no FK to booking)
        └──────────┘        └──────────────┘
```

---

## User

Identity and authentication for all three roles.

| Field | Type | Notes |
|---|---|---|
| `name` | String | |
| `phone` | String, unique | 10-digit Indian mobile; the login identifier |
| `passwordHash` | String, `select: false` | bcrypt; never leaves the server |
| `role` | Enum | `customer` · `worker` · `admin` — **this drives the panel** |
| `language` | Enum | `en` `hi` `mr` `ta` `bn` |
| `addresses[]` | Subdocument | Each with a GeoJSON `location` |
| `wallet` | Object | Refund ledger / earnings float |
| `cooperative` | Ref | Members *and* consumer-members may belong to one |
| `membershipId` | String | e.g. `MKS-M0042` |

`toSafeJSON()` strips the hash even if a caller forgets `.select()`.

**Indexes** — `phone` unique · `role` · `addresses.location` 2dsphere

---

## Cooperative

The organisation that owns the platform. Commission flows here, not to an
outside shareholder.

| Field | Type | Notes |
|---|---|---|
| `name`, `code`, `registrationNo` | String | `code` unique; state society registration |
| `governance.commissionPct` | Number | Default 0.08, capped at 0.30 |
| `governance.dividendPoolPct` | Number | Share of commission returned to members |
| `governance.minHourlyRate` | Number | **Collectively bargained floor** |
| `governance.surgeCeiling` | Number | Caps the surge multiplier |
| `governance.lastGeneralBodyMeeting` | Date | |
| `stats.*` | Object | Members, jobs, gross, commission earned, dividends paid |
| `trainingPrograms[]` | Subdocument | Skill programmes the coop runs |

`dividendPool` is a **virtual**: `commissionEarned × dividendPoolPct −
dividendsDistributed`. It is computed, never stored, so it cannot drift.

> Virtuals do not survive `.lean()`. Controllers that read lean recompute it
> explicitly — see `admin.controller.js`.

These parameters live on the cooperative rather than in global config precisely
because they are the members' to change by vote.

**Indexes** — `code` unique · `location` 2dsphere · `(city, isActive)`

---

## Service

The catalogue. Follows a category → service → package hierarchy so a customer
picks a fixed scope at a known price instead of negotiating at the door.

| Field | Type | Notes |
|---|---|---|
| `name`, `slug`, `category`, `skillTag` | String | `skillTag` joins a service to the members who can do it |
| `basePrice`, `unit`, `baseDurationMins` | | `per_job` · `per_hour` · `per_visit` |
| `packages[]` | Subdocument | `{ name, price, durationMins, includes[], excludes[], popular }` |
| `checklist[]` | [String] | Shown to the customer *and* to the member as a job checklist |
| `equipment[]` | [String] | Tools the member is expected to bring |
| `emergencyAvailable`, `emergencySurcharge` | | |

**Indexes** — `slug` unique · text index on name/description/category/skillTag ·
`(isActive, displayOrder)`

---

## Worker

The professional profile behind a `role: worker` user. Kept separate from `User`
because it is queried on entirely different axes — geo, skill, availability —
and carries the 2dsphere index the dispatch engine hits on every booking.

| Field | Type | Notes |
|---|---|---|
| `user`, `cooperative` | Ref | |
| `displayName`, `photo` | | **Denormalised** — avoids populating `User` on every search hit |
| `skills[]` | Subdocument | `{ service, skillTag, level, yearsExperience }` |
| `hourlyRate` | Number | Never below the coop's rate floor |
| `verification.status` | Enum | `pending` · `verified` · `rejected` · `suspended` |
| `verification.documents[]` | Subdocument | Masked in the seed; real PII belongs in a vault |
| `rating.average`, `.count`, `.tagCounts` | | `tagCounts` is a Map, powering the profile chips |
| `stats.*` | Object | Jobs, cancellations, offers received/accepted, on-time count, response latency |
| `earnings.*` | Object | Lifetime, this month, pending payout, dividends received |
| `availability.isOnline` | Boolean | |
| `availability.activeBooking` | Ref | **Non-null means do not offer another job** |
| `availability.acceptsEmergency` | Boolean | Opt-in |
| `location` | GeoJSON Point | Updated by the GPS ping endpoint |
| `serviceRadiusKm` | Number | A hard constraint the member sets themselves |
| `badges[]` | [String] | `coop_verified` `top_rated` `master_craftsman` |

**Virtuals** — `acceptanceRate`, `onTimeRate`, `isBookable`

**Indexes**

```js
{ location: '2dsphere' }                                            // dispatch
{ 'skills.skillTag': 1, 'verification.status': 1, 'availability.isOnline': 1 }
{ 'rating.average': -1, 'stats.jobsCompleted': -1 }                 // browse
```

---

## Booking

The transaction record, and the most document-shaped collection here.

| Field | Type | Notes |
|---|---|---|
| `code` | String, unique | `SS-7K2FQ` — no 0/O/1/I, so it reads aloud cleanly |
| `customer`, `worker`, `cooperative`, `service` | Ref | `worker` is null until accepted |
| `serviceName`, `skillTag` | String | Denormalised for list views |
| `status` | Enum | See the state machine below |
| `type` | Enum | `standard` · `scheduled` · `emergency` |
| `address` | Object | With `zone` (the forecasting bucket) and a GeoJSON point |
| `pricing` | Object | **Full breakdown, stored** — see below |
| `payment` | Object | `method`, `status`, `txnId`, `paidAt` |
| `otp.start` / `.complete` | String, `select: false` | The two gates |
| `dispatch` | Object | `round`, `radiusKm`, `candidates[]`, `expiresAt` |
| `timeline[]` | Subdocument | `{ status, at, by, note }` — the audit trail |
| `cancellation`, `sos` | Object | |

### Why the price is stored

`pricing` holds base, surge, surcharge, add-ons, discount, subtotal, platform
fee, coop commission, worker payout and total. Storing it means a historical
booking always shows the numbers the customer actually agreed to, even after
rates change.

The one thing **not** stored is the percentage `split` — it is derived at
display time from the stored rupees, so the two can never disagree.

### Why candidates are embedded

`dispatch.candidates[]` records every member the job was offered to, their
distance, ETA, ranking score at offer time, and their response. Embedding means
the whole broadcast round is one document read, and *"who was offered this job
and who declined"* needs no join. The customer's tracker renders this directly,
which is what makes the auction legible rather than a black box.

### State machine

```
pending → dispatching → accepted → enroute → arrived → in_progress → completed
              │                                              ▲
              ├─→ expired ──→ dispatching (re-broadcast)     │
              │                                     OTP gate ┘
              └─→ cancelled        (any pre-completion state may cancel)
```

Enforced by `STATUS_TRANSITIONS` in `config/constants.js`; an illegal jump
returns 409.

**Indexes**

```js
{ code: 1 } unique
{ customer: 1, createdAt: -1 }
{ worker: 1, status: 1, scheduledFor: -1 }
{ status: 1, 'dispatch.expiresAt': 1 }        // the dispatch sweeper
{ 'address.location': '2dsphere' }
{ skillTag: 1, 'address.zone': 1, createdAt: -1 }   // demand forecasting
```

---

## Review

| Field | Type | Notes |
|---|---|---|
| `booking` | Ref, **unique** | One review per booking; the index is the backstop |
| `customer`, `worker`, `service` | Ref | |
| `rating` | Number 1–5 | |
| `tags[]` | Enum | `punctual` `polite` `skilled` `clean_work` `fair_price` … |
| `comment`, `photos[]` | | |
| `response` | Object | The member's **right of reply** — a fairness affordance |
| `isFlagged`, `flagReason` | | Surfaces in the admin panel |

Submitting a review updates the worker's running average **incrementally**
rather than re-aggregating their whole history, and recomputes the service-level
and cooperative-level averages.

---

## Notification

| Field | Type | Notes |
|---|---|---|
| `user` | Ref | Addresses the *user*, not the worker profile |
| `type` | Enum | `job_offer` `booking_update` `payment` `verification` `payout` `sos` `system` |
| `title`, `body`, `data` | | `data` is the deep-link payload |
| `expiresAt` | Date | Job offers grey out past this instant |
| `read`, `readAt` | | |

Persisted and read back by the client's polling inbox. `deliver()` in
`notification.service.js` is the single seam where FCM/APNs and a websocket
channel would attach.

**Indexes** — `(user, read, createdAt: -1)`

---

## Payout

A settlement run for one member for one period.

| Field | Type | Notes |
|---|---|---|
| `worker`, `cooperative` | Ref | |
| `period` | Object | `{ label: '2026-W35', from, to }` |
| `bookings[]` | [Ref] | What the run covers |
| `gross`, `coopCommission`, `platformFee` | Number | |
| `dividendShare` | Number | Share of the pool, **by contribution** |
| `net` | Number | `earnings + dividendShare` |
| `status` | Enum | `draft` · `approved` · `paid` · `failed` |

**Index** — `(worker, period.label)` **unique**

That uniqueness is what makes settlement idempotent: re-running a period updates
the existing drafts rather than paying anyone twice.

---

## Geospatial conventions

All coordinates are GeoJSON `[longitude, latitude]` — **longitude first**. This
is the order MongoDB requires and the reverse of how coordinates are usually
spoken, which makes it the single easiest thing to get wrong in this codebase.
`utils/geo.js` normalises loose input (`{lat, lng}`, `[lng, lat]`, or a GeoJSON
point) through `toPoint()`; use it rather than building points by hand.

Distances use the haversine formula. ETAs apply a 1.3× detour factor and a
4-minute overhead on top of an 18 km/h average, because Indian urban traffic
does not move at crow-flies speed.

## Timezone conventions

Every date-part aggregation (`$hour`, `$dayOfWeek`, `$dateToString`) **must**
pass `timezone: env.timezone`. MongoDB defaults these to UTC; the client reads
them back as local time. On an IST deployment that 5.5-hour skew is enough to
report the small hours as the busiest time of day. `utils/datetime.js` keeps the
JavaScript side of the same calculation in the same frame.
