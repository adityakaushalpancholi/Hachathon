# API Reference

Base URL `http://localhost:4000/api`

## Conventions

Every response uses one envelope, so the client never has to guess where the
payload is:

```jsonc
// success
{ "success": true, "data": <payload>, "meta": { ... } }   // meta only when paginated

// failure
{ "success": false, "error": { "message": "...", "code": 400, "details": [ ... ] } }
```

`details` is present on validation failures and is an array of
`{ field, message }`, ready to bind to inline form errors.

**Auth** — `Authorization: Bearer <token>`. The token's `role` claim selects the
panel and is re-checked on every panel-scoped route.

**Access column** — `public`, `auth` (any signed-in role), or a specific role.

---

## Health

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/health` | public | Liveness, uptime, which database is connected |

---

## Auth

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/auth/register` | public | Create a customer or member account |
| POST | `/auth/login` | public | Exchange phone + password for a token |
| POST | `/auth/otp/request` | public | Send a one-time code to a number |
| POST | `/auth/otp/verify` | public | Exchange phone + code for a token |
| GET | `/auth/me` | auth | Rehydrate the session; returns `panel` |
| PATCH | `/auth/me` | auth | Update name, email, language |
| POST | `/auth/addresses` | auth | Add a service address |
| DELETE | `/auth/addresses/:id` | auth | Remove one |

`register` with `role: "worker"` also provisions a `Worker` profile attached to
a cooperative, in `pending` verification.

Login and register are rate-limited to 20 attempts per 15 minutes, counting only
failures.

<details>
<summary><code>POST /auth/login</code></summary>

```json
{ "phone": "9876543210", "password": "customer123" }
```

```jsonc
{
  "success": true,
  "data": {
    "token": "eyJhbGciOi...",
    "panel": "customer",          // which panel the client may mount
    "user": { "_id": "...", "name": "Priya Sharma", "role": "customer", "addresses": [...] },
    "account": {                  // what this account is, stated by the server
      "role": "customer",
      "label": "Customer",
      "isOwner": false,
      "phoneVerified": true,
      "hasPassword": true,
      "signInMethods": ["otp", "password"],
      "membershipId": null,
      "memberSince": "2026-01-14T09:22:10.441Z",
      "lastLoginAt": "2026-08-25T04:11:02.910Z"
    },
    "isOwner": false,
    "workerProfile": null,        // populated for role=worker
    "cooperative": null           // populated when the user belongs to one
  }
}
```

`account` is the server's own description of the caller. The client renders it
rather than deducing any of it — `signInMethods`, in particular, is why the sign-in
screen never offers a password box to an account that has no password.
</details>

<details>
<summary><code>POST /auth/otp/request</code> → <code>POST /auth/otp/verify</code></summary>

```json
{ "phone": "9812345678" }
```

```jsonc
{
  "success": true,
  "data": {
    "sent": true,
    "phone": "9812345678",
    "expiresInSec": 300,
    "channel": "log",          // "log" until SMS_PROVIDER is configured
    "devCode": "418205"        // only when OTP_ECHO=true, which prod refuses
  }
}
```

The response is **identical whether or not the number has an account**. That is
deliberate: an endpoint that answers differently is a directory of who is
registered.

```json
{ "phone": "9812345678", "code": "418205", "name": "Priya Sharma" }
```

Returns the same session shape as `/auth/login`, plus `isNew`. `name` is only
used when the number has no account yet — verifying an unknown number creates
one, which is why there is no separate registration step for customers.

Codes are stored as SHA-256 hashes, compared in constant time, expire via a TTL
index, allow `OTP_MAX_ATTEMPTS` guesses before the code is burned, and are
limited to 8 requests per hour **per phone number** rather than per IP — the
number being targeted is what needs protecting, not the caller's address.
</details>

---

## Database (owner)

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/database` | owner | Collection list with counts, connection, storage |
| GET | `/database/config` | owner | Runtime configuration; secrets as booleans |
| GET | `/database/:collection` | owner | A page of documents. `?page&limit&sort&q` |
| GET | `/database/:collection/indexes` | owner | Index definitions |
| GET | `/database/:collection/:id` | owner | One document |
| DELETE | `/database/:collection/:id` | owner | Delete one document |

"Owner" is stricter than `role: admin` — the caller's number must be in
`OWNER_PHONES`. An admin who runs a cooperative gets 403 here.

Collections are addressed through an allowlist of registered models, never by the
raw URL string, so this cannot be walked sideways into `system.*`. `passwordHash`
and `codeHash` are stripped from every response at any nesting depth. `q` is
regex-escaped before it becomes a pattern. Delete is the only write offered:
editing arbitrary fields from a grid would route around every validator and hook
the models define.

---

## Catalogue (public)

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/services` | public | List services. `?q&category&emergency&page&limit` |
| GET | `/services/categories` | public | Category tiles with live counts |
| GET | `/services/:id` | public | One service, its packages, and top members |
| GET | `/services/:id/reviews` | public | Reviews for a service |
| GET | `/cooperatives` | public | List cooperatives. `?city` |
| GET | `/cooperatives/:id` | public | One cooperative and its governance |

---

## Worker discovery (public)

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/workers` | public | List verified members. `?q&skillTag&city&minRating&sort&page&limit` |
| GET | `/workers/nearby` | public | **Geospatial search**, ranked |
| GET | `/workers/:id` | public | Profile, stats, reviews, cooperative |

<details>
<summary><code>GET /workers/nearby</code></summary>

`?lat=19.0596&lng=72.8296&radiusKm=8&skillTag=electrician&online=true&limit=20`

Runs a `$geoNear` over the 2dsphere index, drops anyone whose own service radius
excludes the point, then ranks. Widens the radius automatically if the first
pass returns nothing.

```jsonc
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "displayName": "Ramesh Patil",
      "distanceKm": 2.84,
      "etaMins": 16,
      "matchScore": 0.842,
      "matchBreakdown": {          // the ranking is auditable, not a black box
        "proximity": 0.645,
        "rating": 0.76,
        "reliability": 0.87,
        "experience": 0.9,
        "fairness": 1              // boost for members below the local median
      },
      "cooperativeName": "Mumbai Kaamgaar Sahakari Sanstha"
    }
  ],
  "meta": { "radiusKm": 8, "center": [72.8296, 19.0596], "count": 12 }
}
```

Results are ordered by `matchScore`, **not** by distance.
</details>

---

## Customer panel · `role=customer`

| Method | Path | Purpose |
|---|---|---|
| GET | `/bookings/dashboard` | Live, upcoming, past, and lifetime stats in one call |
| GET | `/bookings` | List own bookings. `?status&live&page&limit` |
| POST | `/bookings/quote` | **Price without creating** — surge + full split |
| POST | `/bookings` | Create a booking and trigger dispatch |
| GET | `/bookings/:id` | Detail, including the start OTP |
| GET | `/bookings/:id/track` | Lightweight tracking payload for polling |
| POST | `/bookings/:id/cancel` | Cancel, with the fee ladder applied |
| POST | `/bookings/:id/retry` | Re-dispatch a booking nobody took |
| POST | `/bookings/:id/pay` | Capture payment |
| POST | `/bookings/:id/sos` | Raise an alert (either party may call this) |
| GET | `/reviews/mine` | Reviews written |
| POST | `/reviews` | Rate a completed booking |

Booking creation is rate-limited to 12/minute, mostly as a double-submit guard.

<details>
<summary><code>POST /bookings/quote</code></summary>

```json
{
  "serviceId": "...",
  "packageName": "Quick Fix Visit",
  "location": { "lat": 19.0596, "lng": 72.8296 },
  "zone": "Bandra West",
  "city": "Mumbai",
  "type": "standard",
  "couponCode": "FIRST50"
}
```

```jsonc
{
  "success": true,
  "data": {
    "surge": {
      "multiplier": 1.15,
      "openDemand": 7,          // the inputs are published, not hidden
      "availableSupply": 4,
      "reason": "high_demand"
    },
    "pricing": {
      "base": 349, "surgeMultiplier": 1.15, "surgeAmount": 52,
      "discount": 150, "couponCode": "FIRST50",
      "subtotal": 251,
      "platformFee": 5, "coopCommission": 20, "workerPayout": 226,
      "total": 251,
      "split": { "workerPct": 90, "coopPct": 8, "platformPct": 2 }
    }
  }
}
```

`split` is derived and returned for display only; it is not persisted on the
booking, so the percentages can never drift from the stored rupees.
</details>

<details>
<summary><code>POST /bookings</code></summary>

```json
{
  "serviceId": "...",
  "packageName": "Quick Fix Visit",
  "address": {
    "label": "Home", "line1": "402, Sunrise Apartments",
    "city": "Mumbai", "pincode": "400050", "zone": "Bandra West",
    "location": { "lat": 19.0596, "lng": 72.8296 }
  },
  "scheduledFor": "2026-08-24T13:30:00.000Z",
  "type": "standard",
  "paymentMethod": "upi",
  "preferredWorkerId": "..."
}
```

Dispatch fires immediately for emergencies and for slots under 30 minutes away;
later bookings are picked up by the scheduler as their slot approaches.
`preferredWorkerId` offers the job to that member alone first.
</details>

---

## Worker panel · `role=worker`

| Method | Path | Purpose |
|---|---|---|
| GET | `/workers/me/dashboard` | Profile, offers, active job, upcoming, recent, earnings |
| GET | `/workers/me/earnings` | 14-day series, payouts, daily incentive target |
| GET | `/workers/me/offers` | Live offers not yet expired |
| PATCH | `/workers/me/availability` | Go online/offline, radius, emergency opt-in |
| POST | `/workers/me/location` | GPS ping — keeps the dispatch index fresh |
| POST | `/workers/me/offers/:id/accept` | **Claim a job** (first-accept-wins) |
| POST | `/workers/me/offers/:id/decline` | Pass, with a reason |
| POST | `/workers/me/jobs/:id/enroute` | Travelling |
| POST | `/workers/me/jobs/:id/arrived` | On site |
| POST | `/workers/me/jobs/:id/start` | **Requires the customer's 4-digit code** |
| POST | `/workers/me/jobs/:id/complete` | **Requires the second code**; settles payment |
| POST | `/workers/me/jobs/:id/cancel` | Cancel; the job is re-dispatched |
| POST | `/workers/me/reviews/:id/respond` | Right of reply on a review |

Going online is refused unless the member's verification status is `verified`.

**Accept outcomes:** `200` you won · `409` someone beat you to it, or the offer
expired · `403` you were never offered this job.

---

## Admin panel · `role=admin`

All routes are additionally scoped to the admin's own cooperative.

| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/overview` | Workforce, operations, finance, 14-day trend |
| GET | `/admin/workers` | Member list. `?status&q&skillTag&sort&page&limit` |
| PATCH | `/admin/workers/:id/verification` | **Verify / reject / suspend** |
| PATCH | `/admin/workers/:id/documents/:docId` | Review one document |
| GET | `/admin/bookings` | All bookings. `?status&page&limit` |
| GET | `/admin/sos` | Open safety alerts |
| POST | `/admin/sos/:id/resolve` | Close an alert, recorded on the timeline |
| POST | `/admin/settlements/preview` | **Compute a run without committing** |
| POST | `/admin/settlements/run` | Create draft payouts (idempotent per period) |
| GET | `/admin/payouts` | Payout ledger |
| POST | `/admin/payouts/:id/approve` | Approve and disburse |
| GET | `/admin/workforce` | Supply-gap analysis with recommendations |
| GET | `/admin/heatmap` | Demand by zone |
| GET | `/admin/reviews/flagged` | Flagged and low-rated reviews |

<details>
<summary><code>POST /admin/settlements/preview</code></summary>

```json
{ "from": "2026-08-17T00:00:00.000Z", "to": "2026-08-24T00:00:00.000Z" }
```

```jsonc
{
  "success": true,
  "data": {
    "period": { "label": "2026-W35", "from": "...", "to": "..." },
    "totals": {
      "members": 21, "jobs": 47,
      "gross": 63232, "commission": 5059,
      "dividendPool": 2024,        // commission × the voted dividendPoolPct
      "payable": 58935
    },
    "lines": [
      {
        "worker": "...", "jobs": 5,
        "gross": 15195, "coopCommission": 1216, "platformFee": 304,
        "earnings": 13675,
        "contributionPct": 24,     // share of period gross → share of dividend
        "dividendShare": 487,
        "net": 14162
      }
    ]
  }
}
```
</details>

---

## Insights · any signed-in role

Readable by members as well as the board, by design: a member deciding where to
position themselves needs the same demand picture the board sees. Financial
breakdowns stay behind `/admin`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/insights/forecast` | Hour-by-hour projection. `?skillTag&zone&horizonHours` |
| GET | `/insights/profiles` | Hour-of-day and day-of-week demand profiles |
| GET | `/insights/gaps` | Supply pressure per trade |
| GET | `/insights/trend` | Revenue and volume by day. `?days` |
| GET | `/insights/zones` | Demand intensity by zone |
| GET | `/insights/surge` | **Live surge board** with its demand/supply inputs |

---

## Notifications · any signed-in role

| Method | Path | Purpose |
|---|---|---|
| GET | `/notifications` | Inbox, newest first; `meta.unread` carries the badge |
| POST | `/notifications/:id/read` | Mark one read |
| POST | `/notifications/read-all` | Mark all read |

---

## Status codes

| Code | Meaning here |
|---|---|
| 200 / 201 | Success |
| 400 | Validation failed — `error.details` lists the fields |
| 401 | Missing, expired or invalid token |
| 403 | Wrong role for this panel, or not your resource |
| 404 | No such record, or not visible to you |
| 409 | Conflict — job already taken, duplicate review, illegal state transition |
| 429 | Rate limited |
| 500 | Unhandled; the message is suppressed in production |

## Booking state machine

Enforced server-side by `STATUS_TRANSITIONS`; an illegal jump returns `409` with
the legal moves in `details`.

```
pending → dispatching → accepted → enroute → arrived → in_progress → completed
              │                                              ▲
              ├─→ expired ──→ dispatching (re-broadcast)     │
              │                                     OTP gate ┘
              └─→ cancelled        (any pre-completion state may cancel)
```
