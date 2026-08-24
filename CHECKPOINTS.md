# Build Checkpoints

Each checkpoint is a git tag marking a state where the project builds and its
verification step passes.

```bash
git log --oneline --decorate
```

```bash
git checkout cp-2
```

| Tag | Scope | Verification |
|---|---|---|
| `cp-2` | Database + API tier — 8 models, dispatch engine, pricing, forecasting, settlement, role-gated routes, deterministic seed | 78/78 smoke checks |
| `cp-6` | Frontend — design system, auth, three role-gated panels, validated chart set | Smoke checks still green; full journey driven through a browser; client build clean |
| `cp-7` | Documentation — README, architecture, API reference, data model | Both of the above |

The numbering follows the phases below; only the tags above are cut, because
those are the points where the whole thing was actually verified end to end.

---

## Verifying any checkpoint

Every checkpoint from `cp-2` onward is verified the same way. Start the API:

```bash
npm run dev:api
```

Then, in a second terminal:

```bash
npm run smoke
```

This is not a mock: it drives the real HTTP API against the real database and
walks the complete path — catalogue → login → panel boundaries → geospatial
search → quote → booking → dispatch → worker accept → OTP start → OTP complete
→ review → tracking → insights → admin verification → settlement →
notifications → input validation.

It asserts the role boundaries directly: a customer token must get 403 from
`/api/admin/*`, an admin token must get 403 from the customer panel, and a
request with no token must get 401.

For the frontend:

```bash
npm run build
```

---

## Phases

**Scaffold.** Two packages under one root — `server/` (Express, ESM) and
`client/` (Vite + React). Root scripts run both together.

**Database tier.** `User`, `Cooperative`, `Service`, `Worker`, `Booking`,
`Review`, `Notification`, `Payout`. Geospatial `2dsphere` indexes on
`Worker.location` and `Booking.address.location`; compound indexes sized for the
dispatch sweeper and the demand-forecasting aggregations.

**API tier.** Layered routes → controllers → services, so the business logic is
callable from an HTTP route, from the background scheduler, or from a test
without change. Includes the broadcast dispatch engine, demand-responsive
pricing, the settlement and dividend calculation, and the forecasting
aggregations.

**Frontend shell.** Token-driven panel routing: the JWT's `role` claim decides
which panel mounts, and every panel-scoped endpoint re-checks it server-side.

**The three panels.** Customer (discovery, booking, tracking, reviews), member
(offer inbox, OTP job flow, earnings), and cooperative board (verification,
operations, settlement, insights) — each loading only from its own role-scoped
endpoints.

**Documentation.** `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/DATA-MODEL.md`.

---

## Bugs caught during verification

Recorded because each one was found by running the thing rather than by reading
it, and each is the kind that a type checker would not have caught.

| Bug | Found by | Fix |
|---|---|---|
| Seed left a whole trade with nobody bookable, so dispatch dead-ended | Smoke test failing on "online electricians available" | Seeded PRNG for reproducibility, plus a guarantee that the first three members of every trade are verified and online |
| `PriceBreakdown` crashed on a stored booking | Opening the tracker after creating a booking | `split` is derived by the quote endpoint and never persisted; now recomputed at display time so percentages cannot drift from rupees |
| A future-dated booking awaiting dispatch reported "nobody available" | Reading the tracker copy on a 7pm booking | Queued, searching and failed are now distinct states |
| Worker earnings took the last 14 *entries*, not 14 days — a "last 14 days" chart spanned two months | Chart x-axis showing Jun–Aug | Fixed date window with zero-days filled |
| Demand aggregations bucketed in UTC while the client read local hours | "Busiest hour 02:00" on data seeded to peak at 18:00 | Explicit `timezone` on every `$hour`/`$dayOfWeek`/`$dateToString`, plus `utils/datetime.js` to keep the JS side in the same frame |
| "Nearest" label read the first list row, but the list is ranked by match score | Map showing a 1.0 km member below a 3.3 km one | Compute the actual minimum |
