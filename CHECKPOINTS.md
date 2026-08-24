# Build Checkpoints

Each checkpoint is a git commit tagged `cp-N`, representing a state where the
project builds and its verification step passes. To inspect or roll back:

```bash
git log --oneline --decorate
```

```bash
git checkout cp-3
```

| # | Tag | Scope | Verification |
|---|-----|-------|--------------|
| 0 | `cp-0` | Monorepo scaffold, npm workspaces, toolchain | `npm install` resolves in both packages |
| 1 | `cp-1` | Database tier — 8 Mongoose models, geo + compound indexes | Models load, indexes build on connect |
| 2 | `cp-2` | API tier — services, controllers, routes, middleware, seed | `npm run smoke` → 78/78 checks pass |
| 3 | `cp-3` | Frontend shell — design system, auth, role-gated panel router | App boots, login routes to the correct panel |
| 4 | `cp-4` | Customer panel — discovery, booking, tracking, reviews | Full booking journey works against the live API |
| 5 | `cp-5` | Worker panel — dispatch inbox, OTP job flow, earnings | Accept → complete cycle works in the UI |
| 6 | `cp-6` | Admin panel — verification, ops, settlement, insights | Verification and settlement act on real data |
| 7 | `cp-7` | Documentation + production build | `npm run build` succeeds |

---

## Verifying a checkpoint

Every checkpoint from `cp-2` onward can be verified by running the API and its
smoke test, which walks the complete customer → dispatch → worker → completion →
review → admin path and asserts on each response:

```bash
npm run dev:api
```

```bash
npm run smoke --prefix server
```

The smoke test is not a mock: it drives the real HTTP API against the real
database, including the role boundaries between the three panels.

---

## Checkpoint detail

### cp-0 — Scaffold
Two packages under one root: `server/` (Express, ESM) and `client/` (Vite +
React). Root scripts run both together via `concurrently`.

### cp-1 — Database tier
`User`, `Cooperative`, `Service`, `Worker`, `Booking`, `Review`, `Notification`,
`Payout`. Geospatial `2dsphere` indexes on `Worker.location` and
`Booking.address.location`; compound indexes sized for the dispatch sweeper and
the demand-forecasting aggregations.

### cp-2 — API tier
Layered as routes → controllers → services, so business logic is testable
independently of HTTP. Includes the dispatch engine, demand-responsive pricing,
the settlement/dividend calculation and the forecasting aggregations.

### cp-3 — Frontend shell
Token-driven panel routing: the JWT's `role` claim decides which panel mounts,
and every panel-scoped endpoint re-checks it server-side.

### cp-4/5/6 — The three panels
Customer, worker and admin, each loading from its own role-scoped endpoints.

### cp-7 — Documentation
`docs/ARCHITECTURE.md`, `docs/API.md`, `docs/DATA-MODEL.md`, and a production
client build.
