# ShramSetu

A cooperative-owned digital marketplace for home services. The people who do the
work own the platform, elect the board that verifies members, vote on the
commission rate and the hourly rate floor, and share the surplus their labour
generates.

Three role-gated panels — **customer**, **member (worker)**, and **cooperative
board (admin)** — over one Express + MongoDB API.

---

## Run it

Node 18+ is required. No database installation is needed: with `MONGO_URI`
unset the API boots an in-memory MongoDB and seeds it, so a clone runs in two
commands.

```bash
npm run install:all
```

```bash
npm run dev
```

- Web: <http://localhost:5173>
- API: <http://localhost:4000/api/health>

### Demo accounts

The seed is deterministic (fixed PRNG), so these are stable across restarts.

| Panel | Phone | Password | Who |
|---|---|---|---|
| Customer | `9876543210` | `customer123` | Aditya Rao, Bandra West |
| Member | `9000000001` | `worker123` | Ramesh Patil, electrician |
| Board | `9876500001` | `admin123` | Anjali Deshpande, Mumbai Kaamgaar Sahakari Sanstha |

The login screen has a one-click button for each.

### Verify it

```bash
npm run smoke --prefix server
```

78 end-to-end checks against the running API: the full customer → dispatch →
worker → OTP → completion → review → settlement path, plus the role boundaries
between the three panels.

### Point it at a real MongoDB

```bash
cp server/.env.example server/.env
```

Set `MONGO_URI` to a local `mongod` or an Atlas cluster, then seed once:

```bash
npm run seed
```

---

## What makes it a cooperative, in the code

This is not branding on a generic marketplace. Four things are structurally
different, and each one is a specific mechanism you can point at:

**Commission is 8%, not 25%, and 40% of it comes back.**
`buildPricing()` in [pricing.service.js](server/src/services/pricing.service.js)
returns the complete split, and the customer sees it *before* confirming —
the same numbers the settlement run uses later.

**Dispatch has a fairness term.**
Ranking in [matching.service.js](server/src/services/matching.service.js) blends
proximity, rating and reliability — and a fairness score that boosts members who
have worked fewer jobs than the local median. On an investor-owned platform the
highest-rated worker in a zone absorbs the volume and newcomers starve; here
work spreads across the membership. It is bounded, so it never overrides a large
distance or a poor rating.

**Surge has a ceiling the members voted for.**
`computeSurge()` scales on the square root of the demand/supply ratio and is
capped by each cooperative's `governance.surgeCeiling`. The uplift goes to the
member's payout, not to platform margin. The live surge board is published to
members, not hidden.

**Members verify members.**
The verification queue in the admin panel is scoped to the reviewing admin's own
cooperative, and the decision is recorded against the deciding user.

**Surplus is returned as a dividend.**
[payout.service.js](server/src/services/payout.service.js) apportions the
dividend pool by contribution — each member's share of the period's gross — and
the settlement screen shows that percentage on every line.

---

## What was borrowed, and from where

| From | Mechanism | Where it lives |
|---|---|---|
| Urban Company | Fixed-scope, fixed-price **packages** instead of hourly haggling | [Service.js](server/src/models/Service.js) |
| Urban Company | Job **checklist** shown to customer and member alike | `Service.checklist` |
| Urban Company | **Book this professional** directly | `dispatchToWorker()` |
| Rapido | **Broadcast dispatch** — top-N nearest, first-accept-wins | [dispatch.service.js](server/src/services/dispatch.service.js) |
| Rapido | **Countdown** on each offer, then re-broadcast wider | `expireStaleDispatches()` |
| Rapido | **OTP to start** the job, and a second to close it | [booking.service.js](server/src/services/booking.service.js) |
| Rapido | **Surge** from live demand/supply | `computeSurge()` |
| Rapido | Daily **incentive target** on the worker's home screen | `workerEarnings()` |
| Both | **SOS** raisable by either side, routed to the board | `raiseSos()` |

---

## Architecture

```
client/  React 18 + Vite + Tailwind + React Router
   |     panel chosen by the JWT role claim
   |
   |  HTTP  (Vite proxies /api in dev, so there is no CORS preflight
   |         and no base URL baked into the bundle)
   v
server/  Express, layered:  routes -> controllers -> services
   |     business logic sits in services/, testable without HTTP
   v
MongoDB  8 collections, 2dsphere geo indexes, aggregation pipelines
         for demand forecasting and settlement
```

Full detail in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
Endpoint reference in [docs/API.md](docs/API.md).
Collections and indexes in [docs/DATA-MODEL.md](docs/DATA-MODEL.md).
Build history and how to roll back in [CHECKPOINTS.md](CHECKPOINTS.md).

### How the three panels are kept apart

Sign-in returns a JWT whose `role` claim names the panel. The client mounts the
matching panel and nothing else — but that is a convenience, not the boundary.
Every panel-scoped route re-checks the claim server-side through `requireRole`,
and admin routes additionally scope their queries to the admin's own
cooperative. Editing the token in `localStorage` changes which screen renders,
and nothing about what data comes back.

The smoke test asserts this directly: a customer token gets 403 from
`/api/admin/*`, an admin token gets 403 from the customer panel, and a missing
token gets 401.

---

## Repository layout

```
shramsetu/
├── server/
│   └── src/
│       ├── config/       env, database connection, domain constants
│       ├── models/       8 Mongoose schemas
│       ├── services/     dispatch, pricing, matching, forecast, payout,
│       │                 notifications, scheduler  ← the business logic
│       ├── controllers/  HTTP handling only
│       ├── routes/       route table + role gates
│       ├── middleware/   auth, validation, errors, rate limits
│       ├── validators/   Zod request schemas
│       ├── utils/        geo maths, ids, timezone, response envelope
│       └── seed/         fixtures, deterministic seed, smoke test
└── client/
    └── src/
        ├── api/          one module per endpoint group
        ├── panels/       customer/ · worker/ · admin/
        ├── pages/        public site
        ├── components/   UI primitives + validated chart set
        ├── layouts/      panel chrome, public chrome
        ├── context/      auth session, toasts
        ├── hooks/        useApi (loading/error/poll), useDebounced
        └── lib/          formatting, status vocabulary, icon map
```

---

## Known limitations

Honest about what this prototype does not do:

- **Notifications are polled, not pushed.** `deliver()` in
  `notification.service.js` is the single seam where FCM/APNs and a websocket
  channel would plug in.
- **The scheduler is `setInterval`, not a queue.** Fine for one API instance and
  an idempotent workload; several replicas would each fire their own timers, so
  a distributed lock or a real scheduler (BullMQ, Agenda) is needed before
  scaling out.
- **Payment capture is simulated.** The `payment` sub-document is already shaped
  for a gateway — `txnId` holds the reference, `status` mirrors its lifecycle —
  so integration is confined to one controller and a webhook.
- **Worker location updates on a ping endpoint, not a live socket.** The map and
  the dispatch index read whatever the last ping wrote.
- **Document numbers in the seed are masked.** Real identity documents belong in
  an encrypted vault, never in the application database.
- **No file upload endpoint.** `Worker.photo`, verification documents, and review
  photos have schema fields but no upload route — a production deployment would
  add multer (or a presigned-URL flow to S3/GCS) behind a size and type guard.
- **Accessibility has a baseline, not an audit.** Semantic elements, labelled
  controls, focus rings, a table view behind every chart, and no color-only
  encoding — but no screen-reader testing has been done.

## Licence

Prototype. Demo data only; no real personal data is present.
