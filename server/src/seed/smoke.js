/**
 * End-to-end smoke test against a running API.
 *
 * Walks the whole customer → dispatch → worker → completion → review → admin
 * path and asserts on each response. The server must be up, and must have been
 * started with the demo fixtures and with the seeded board account nominated as
 * an owner — otherwise there is no admin to test with, by design:
 *
 *   SEED_DEMO=true OWNER_PHONES=9876500001 OTP_ECHO=true node src/index.js
 *   node src/seed/smoke.js
 */
const OWNER_PHONE = process.env.SMOKE_OWNER_PHONE || '9876500001';
const BASE = process.env.API || 'http://localhost:4000/api';

let pass = 0;
let fail = 0;
const failures = [];

const c = { g: '\x1b[32m', r: '\x1b[31m', d: '\x1b[2m', y: '\x1b[33m', x: '\x1b[0m' };

function check(label, condition, detail) {
  if (condition) {
    pass += 1;
    console.log(`  ${c.g}pass${c.x}  ${label}`);
  } else {
    fail += 1;
    failures.push(label);
    console.log(`  ${c.r}FAIL${c.x}  ${label}${detail ? `\n        ${c.d}${JSON.stringify(detail).slice(0, 300)}${c.x}` : ''}`);
  }
}

async function api(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ...json };
}

const section = (t) => console.log(`\n${c.y}${t}${c.x}`);

async function main() {
  console.log(`\nShramSetu API smoke test → ${BASE}\n${'─'.repeat(60)}`);

  /* ---------------------------- health & catalogue --------------------- */
  section('Health & public catalogue');

  const health = await api('GET', '/health');
  check('GET /health responds ok', health.data?.status === 'ok', health);
  check('database is connected', health.data?.db?.state === 'connected', health.data?.db);

  const services = await api('GET', '/services');
  check('GET /services returns a catalogue', services.data?.length > 0, services);
  check('services are paginated', typeof services.meta?.total === 'number', services.meta);

  const service = services.data.find((s) => s.skillTag === 'electrician') || services.data[0];
  check('service carries packages', service.packages?.length > 0, service?.name);

  const cats = await api('GET', '/services/categories');
  check('GET /services/categories aggregates', cats.data?.length > 0, cats);

  /* -------------------------------- auth ------------------------------- */
  section('Authentication & panel routing');

  const badLogin = await api('POST', '/auth/login', { body: { phone: '9876543210', password: 'wrong' } });
  check('wrong password is rejected with 401', badLogin.status === 401, badLogin);

  const customer = await api('POST', '/auth/login', { body: { phone: '9876543210', password: 'customer123' } });
  check('customer login succeeds', customer.status === 200 && !!customer.data?.token, customer);
  check('token resolves the customer panel', customer.data?.panel === 'customer', customer.data?.panel);
  const custToken = customer.data.token;

  check(
    'the API describes the account it just issued',
    customer.data?.account?.role === 'customer' &&
      Array.isArray(customer.data?.account?.signInMethods) &&
      customer.data.account.signInMethods.includes('password'),
    customer.data?.account,
  );

  const admin = await api('POST', '/auth/login', { body: { phone: OWNER_PHONE, password: 'admin123' } });
  check('admin login succeeds', admin.status === 200 && !!admin.data?.token, admin);
  check('token resolves the admin panel', admin.data?.panel === 'admin', admin.data?.panel);
  check('the admin is flagged as the platform owner', admin.data?.account?.isOwner === true, admin.data?.account);
  const adminToken = admin.data.token;

  /* --------------------------- one-time codes -------------------------- */
  section('One-time code sign-in');

  const newPhone = `98${String(Date.now()).slice(-8)}`;

  const req1 = await api('POST', '/auth/otp/request', { body: { phone: newPhone } });
  check('OTP request accepted', req1.status === 200 && req1.data?.sent === true, req1);
  check('OTP echo is on (server needs OTP_ECHO=true)', typeof req1.data?.devCode === 'string', req1.data);

  /* Both numbers must be asking for their first code — the resend cooldown is a
     rate limit, not a disclosure, and comparing a number that already has a live
     code against a fresh one would measure the wrong thing. So the registered
     side is created here, through the password route, which never issues one. */
  const knownPhone = `97${String(Date.now()).slice(-8)}`;
  const freshPhone = `96${String(Date.now()).slice(-8)}`;

  await api('POST', '/auth/register', {
    body: { name: 'Smoke Known Account', phone: knownPhone, password: 'smoke-pass-123', role: 'customer' },
  });

  const knownReq = await api('POST', '/auth/otp/request', { body: { phone: knownPhone } });
  const freshReq = await api('POST', '/auth/otp/request', { body: { phone: freshPhone } });

  const shape = (r) => JSON.stringify(Object.keys(r.data ?? {}).sort());
  check(
    'the response does not reveal whether a number is registered',
    knownReq.status === freshReq.status &&
      knownReq.data?.sent === freshReq.data?.sent &&
      shape(knownReq) === shape(freshReq),
    { known: { status: knownReq.status, keys: shape(knownReq) }, fresh: { status: freshReq.status, keys: shape(freshReq) } },
  );

  const wrongCode = await api('POST', '/auth/otp/verify', {
    body: { phone: newPhone, code: req1.data.devCode === '000000' ? '111111' : '000000' },
  });
  check('a wrong code is rejected with 401', wrongCode.status === 401, wrongCode);

  const otpNew = await api('POST', '/auth/otp/verify', {
    body: { phone: newPhone, code: req1.data.devCode, name: 'Smoke Test Account' },
  });
  check('correct code signs in', !!otpNew.data?.token, otpNew);
  check('an unknown number creates its account', otpNew.data?.isNew === true, otpNew.data);
  check('a new account lands on the customer panel', otpNew.data?.panel === 'customer', otpNew.data?.panel);
  check('the number is recorded as verified', otpNew.data?.account?.phoneVerified === true, otpNew.data?.account);
  check(
    'an OTP-only account is not offered a password',
    otpNew.data?.account?.hasPassword === false &&
      !otpNew.data.account.signInMethods.includes('password'),
    otpNew.data?.account,
  );

  const replay = await api('POST', '/auth/otp/verify', {
    body: { phone: newPhone, code: req1.data.devCode },
  });
  check('a consumed code cannot be replayed', replay.status === 401, replay);

  /* ------------------------- administration is not grantable ------------ */
  section('Administration is rooted in configuration');

  const ownerOtp = await api('POST', '/auth/otp/request', { body: { phone: OWNER_PHONE } });
  const ownerSession = await api('POST', '/auth/otp/verify', {
    body: { phone: OWNER_PHONE, code: ownerOtp.data.devCode },
  });
  check('an owner number signs in as admin without any grant', ownerSession.data?.panel === 'admin', ownerSession.data?.panel);

  check(
    'no endpoint offers to promote an account',
    (await api('POST', '/admin/users/promote', { token: adminToken, body: { role: 'admin' } })).status === 404,
  );

  const otpToken = otpNew.data.token;
  const nonOwnerToDb = await api('GET', '/database', { token: otpToken });
  check('a customer is refused the database panel (403)', nonOwnerToDb.status === 403, nonOwnerToDb);
  check('the database panel refuses anonymous callers (401)', (await api('GET', '/database')).status === 401);

  /* ---------------------------- database panel ------------------------- */
  section('Database panel (owner only)');

  const ownerToken = ownerSession.data.token;

  const dbOverview = await api('GET', '/database', { token: ownerToken });
  check('owner reads the collection overview', dbOverview.status === 200, dbOverview);
  check('every collection reports a count', dbOverview.data?.collections?.every((c2) => typeof c2.count === 'number'), dbOverview.data?.collections);

  const users = await api('GET', '/database/User?limit=5', { token: ownerToken });
  check('owner reads a page of documents', users.data?.documents?.length > 0, users);
  check('password hashes never leave the server', !JSON.stringify(users).includes('passwordHash'), 'passwordHash present');

  const codes = await api('GET', '/database/Otp?limit=5', { token: ownerToken });
  check('code hashes never leave the server', !JSON.stringify(codes).includes('codeHash'), 'codeHash present');

  const escaped = await api('GET', '/database/User?q=.%2A', { token: ownerToken });
  check('a search term is escaped, not run as a pattern', escaped.data?.total === 0, escaped.data?.total);

  const systemColl = await api('GET', '/database/system.users', { token: ownerToken });
  check('collections outside the allowlist are unreachable (404)', systemColl.status === 404, systemColl);

  const cfg = await api('GET', '/database/config', { token: ownerToken });
  check('config summary reduces secrets to booleans', typeof cfg.data?.secretsPresent?.jwtSecret === 'boolean', cfg.data);
  check('config summary contains no secret values', !JSON.stringify(cfg).includes('mongodb+srv'), cfg.data);

  const selfDelete = await api('DELETE', `/database/User/${ownerSession.data.user._id}`, { token: ownerToken });
  check('the panel refuses to delete the account using it', selfDelete.status === 400, selfDelete);

  /* --------------------- role boundaries between panels ---------------- */
  section('Panel access boundaries');

  const custHitsAdmin = await api('GET', '/admin/overview', { token: custToken });
  check('customer token is refused by /admin (403)', custHitsAdmin.status === 403, custHitsAdmin);

  const adminHitsCustomer = await api('GET', '/bookings/dashboard', { token: adminToken });
  check('admin token is refused by the customer panel (403)', adminHitsCustomer.status === 403, adminHitsCustomer);

  const noToken = await api('GET', '/bookings/dashboard');
  check('missing token is refused (401)', noToken.status === 401, noToken);

  /* ------------------------ find a worker to drive --------------------- */
  section('Worker discovery (geospatial)');

  const nearby = await api('GET', '/workers/nearby?lat=19.0596&lng=72.8296&radiusKm=25&limit=10');
  check('GET /workers/nearby returns ranked results', nearby.data?.length > 0, nearby);
  check('results carry a distance', typeof nearby.data?.[0]?.distanceKm === 'number', nearby.data?.[0]);
  check('results carry an ETA', typeof nearby.data?.[0]?.etaMins === 'number', nearby.data?.[0]);
  check(
    'results are sorted by match score',
    nearby.data.every((w, i, a) => i === 0 || a[i - 1].matchScore >= w.matchScore),
  );

  // Pick an online, verified electrician and log in as them.
  const pool = await api(
    'GET',
    `/workers/nearby?lat=19.0896&lng=72.8479&radiusKm=40&limit=30&skillTag=${service.skillTag}&online=true`,
  );
  check(`online ${service.skillTag}s are available for dispatch`, pool.data?.length > 0, pool.meta);

  // Find one that is free (not already holding the seeded live job).
  const freeWorker = pool.data.find((w) => !w.availability?.activeBooking);
  check('at least one free worker exists', !!freeWorker);
  if (!freeWorker) return report();

  const workerDetail = await api('GET', `/workers/${freeWorker._id}`);
  check('GET /workers/:id returns a profile', !!workerDetail.data?.displayName, workerDetail);
  check('profile includes the cooperative', !!workerDetail.data?.cooperative?.name, workerDetail.data?.cooperative);

  /* ------------------------------ quoting ------------------------------ */
  section('Pricing & quote');

  const quote = await api('POST', '/bookings/quote', {
    token: custToken,
    body: {
      serviceId: service._id,
      packageName: service.packages[0].name,
      location: { lat: 19.0596, lng: 72.8296 },
      zone: 'Bandra West',
      city: 'Mumbai',
      type: 'standard',
    },
  });
  check('POST /bookings/quote prices a job', quote.status === 200 && quote.data?.pricing?.total > 0, quote);

  const p = quote.data.pricing;
  check(
    'payout split reconciles to the total',
    p.workerPayout + p.coopCommission + p.platformFee === p.subtotal,
    { workerPayout: p.workerPayout, coopCommission: p.coopCommission, platformFee: p.platformFee, subtotal: p.subtotal },
  );
  check('worker receives the large majority', p.split.workerPct >= 85, p.split);
  check('surge is reported with its inputs', typeof quote.data.surge?.multiplier === 'number', quote.data.surge);

  const coupon = await api('POST', '/bookings/quote', {
    token: custToken,
    body: {
      serviceId: service._id,
      packageName: service.packages[0].name,
      location: { lat: 19.0596, lng: 72.8296 },
      city: 'Mumbai',
      couponCode: 'FIRST50',
    },
  });
  check('coupon reduces the total', coupon.data?.pricing?.discount > 0, coupon.data?.pricing);

  /* ---------------------- booking → dispatch → accept ------------------ */
  section('Booking lifecycle');

  const booking = await api('POST', '/bookings', {
    token: custToken,
    body: {
      serviceId: service._id,
      packageName: service.packages[0].name,
      address: {
        label: 'Home',
        line1: '402, Sunrise Apartments',
        city: 'Mumbai',
        pincode: '400050',
        zone: 'Bandra West',
        location: { lat: 19.0596, lng: 72.8296 },
      },
      type: 'standard',
      notes: 'Smoke test booking',
      paymentMethod: 'upi',
      preferredWorkerId: freeWorker._id,
    },
  });
  check('POST /bookings creates a booking', booking.status === 201 && !!booking.data?.code, booking);
  check('booking enters dispatch immediately', booking.data?.status === 'dispatching', booking.data?.status);
  check('the requested worker was offered the job', booking.data?.dispatch?.candidates?.length > 0, booking.data?.dispatch);

  const bookingId = booking.data._id;

  // Log in as the worker who was offered the job.
  const offeredWorkerId = booking.data.dispatch.candidates[0].worker;
  const workerProfile = await api('GET', `/workers/${offeredWorkerId}`);
  const workerPhone = await resolveWorkerPhone(offeredWorkerId, adminToken);
  check('resolved the offered worker phone', !!workerPhone, offeredWorkerId);
  if (!workerPhone) return report();

  const workerLogin = await api('POST', '/auth/login', { body: { phone: workerPhone, password: 'worker123' } });
  check('worker login succeeds', workerLogin.status === 200, workerLogin);
  check('token resolves the worker panel', workerLogin.data?.panel === 'worker', workerLogin.data?.panel);
  const wToken = workerLogin.data.token;

  const offers = await api('GET', '/workers/me/offers', { token: wToken });
  check('offer appears in the worker inbox', offers.data?.some((o) => o._id === bookingId), offers.data?.length);

  const dash = await api('GET', '/workers/me/dashboard', { token: wToken });
  check('GET /workers/me/dashboard loads the panel', !!dash.data?.profile, dash);
  check('dashboard includes earnings', typeof dash.data?.earnings?.lifetime === 'number', dash.data?.earnings);
  check('dashboard includes a daily incentive target', typeof dash.data?.earnings?.today?.target === 'number', dash.data?.earnings?.today);

  const accept = await api('POST', `/workers/me/offers/${bookingId}/accept`, { token: wToken });
  check('worker accepts the offer', accept.status === 200 && accept.data?.status === 'accepted', accept);

  const doubleAccept = await api('POST', `/workers/me/offers/${bookingId}/accept`, { token: wToken });
  check('re-accepting the same job is rejected', doubleAccept.status >= 400, doubleAccept);

  /* --------------------------- job progression ------------------------- */

  const enroute = await api('POST', `/workers/me/jobs/${bookingId}/enroute`, { token: wToken });
  check('worker marks enroute', enroute.data?.status === 'enroute', enroute);

  const skipAhead = await api('POST', `/workers/me/jobs/${bookingId}/complete`, {
    token: wToken,
    body: { code: '0000' },
  });
  check('cannot complete a job that never started', skipAhead.status >= 400, skipAhead);

  const arrived = await api('POST', `/workers/me/jobs/${bookingId}/arrived`, { token: wToken });
  check('worker marks arrived', arrived.data?.status === 'arrived', arrived);

  /* ------------------------------- OTP gate ---------------------------- */
  section('OTP verification');

  const detail = await api('GET', `/bookings/${bookingId}`, { token: custToken });
  check('customer can read the start code', /^\d{4}$/.test(detail.data?.otp?.start || ''), detail.data?.otp);
  check('completion code is hidden before work starts', !detail.data?.otp?.complete, detail.data?.otp);

  const wrongOtp = await api('POST', `/workers/me/jobs/${bookingId}/start`, {
    token: wToken,
    body: { code: String((Number(detail.data.otp.start) + 1) % 10000).padStart(4, '0') },
  });
  check('a wrong start code is rejected', wrongOtp.status >= 400, wrongOtp);

  const start = await api('POST', `/workers/me/jobs/${bookingId}/start`, {
    token: wToken,
    body: { code: detail.data.otp.start },
  });
  check('correct start code begins the job', start.data?.status === 'in_progress', start);

  const detail2 = await api('GET', `/bookings/${bookingId}`, { token: custToken });
  check('completion code is revealed once work is underway', /^\d{4}$/.test(detail2.data?.otp?.complete || ''), detail2.data?.otp);

  const complete = await api('POST', `/workers/me/jobs/${bookingId}/complete`, {
    token: wToken,
    body: { code: detail2.data.otp.complete },
  });
  check('correct completion code closes the job', complete.data?.status === 'completed', complete);
  check('payment settles on completion', complete.data?.payment?.status === 'paid', complete.data?.payment);

  /* -------------------------------- review ----------------------------- */
  section('Reviews');

  const review = await api('POST', '/reviews', {
    token: custToken,
    body: { bookingId, rating: 5, tags: ['punctual', 'skilled'], comment: 'Smoke test review' },
  });
  check('customer can review a completed job', review.status === 201, review);

  const dupReview = await api('POST', '/reviews', {
    token: custToken,
    body: { bookingId, rating: 4, tags: [] },
  });
  check('a second review on the same booking is rejected', dupReview.status >= 400, dupReview);

  /* ------------------------------- tracking ---------------------------- */
  section('Tracking & customer panel');

  const track = await api('GET', `/bookings/${bookingId}/track`, { token: custToken });
  check('GET /bookings/:id/track returns a timeline', track.data?.timeline?.length > 0, track);

  const custDash = await api('GET', '/bookings/dashboard', { token: custToken });
  check('customer dashboard loads', !!custDash.data?.stats, custDash);
  check('dashboard reports the share reaching workers', custDash.data?.stats?.toWorkersPct > 0, custDash.data?.stats);

  /* ------------------------------- insights ---------------------------- */
  section('Demand insights');

  const forecast = await api('GET', `/insights/forecast?skillTag=${service.skillTag}&horizonHours=24`, { token: custToken });
  check('GET /insights/forecast projects a horizon', forecast.data?.points?.length === 24, forecast.data?.points?.length);
  check('forecast identifies a peak hour', typeof forecast.data?.peak?.hour === 'number', forecast.data?.peak);

  const profiles = await api('GET', '/insights/profiles', { token: custToken });
  check('hourly profile covers 24 hours', profiles.data?.hourly?.length === 24, profiles.data?.hourly?.length);
  check('weekday profile covers 7 days', profiles.data?.weekday?.length === 7, profiles.data?.weekday?.length);

  const surge = await api('GET', '/insights/surge', { token: custToken });
  check('surge board lists every service', surge.data?.length > 0, surge);

  const zones = await api('GET', '/insights/zones', { token: custToken });
  check('zone heatmap aggregates demand', zones.data?.length > 0, zones);

  /* -------------------------------- admin ------------------------------ */
  section('Admin panel');

  const overview = await api('GET', '/admin/overview', { token: adminToken });
  check('GET /admin/overview loads', !!overview.data?.workforce, overview);
  check('overview scopes to the admin cooperative', !!overview.data?.cooperative?.name, overview.data?.cooperative);
  check('overview reports a dividend pool', typeof overview.data?.cooperative?.dividendPool === 'number', overview.data?.cooperative);
  check('overview reports a fulfilment rate', typeof overview.data?.operations?.fulfilmentRate === 'number', overview.data?.operations);
  check('14-day trend is filled for every day', overview.data?.trend?.length === 14, overview.data?.trend?.length);

  const pending = await api('GET', '/admin/workers?status=pending', { token: adminToken });
  check('verification queue is readable', Array.isArray(pending.data), pending);

  if (pending.data?.length) {
    const target = pending.data[0];
    const verify = await api('PATCH', `/admin/workers/${target._id}/verification`, {
      token: adminToken,
      body: { status: 'verified', note: 'Documents checked', backgroundCheckClear: true },
    });
    check('admin can verify a member', verify.data?.verification?.status === 'verified', verify);
  }

  const workforce = await api('GET', '/admin/workforce', { token: adminToken });
  check('workforce gap analysis returns recommendations', workforce.data?.length > 0, workforce);
  check(
    'each skill carries a recommendation',
    workforce.data.every((r) => typeof r.recommendation === 'string'),
    workforce.data?.[0],
  );

  const settlement = await api('POST', '/admin/settlements/preview', {
    token: adminToken,
    body: { from: new Date(Date.now() - 30 * 86400_000).toISOString(), to: new Date().toISOString() },
  });
  check('settlement preview computes payout lines', settlement.data?.lines?.length > 0, settlement.data?.totals);
  if (settlement.data?.lines?.length) {
    const line = settlement.data.lines[0];
    check('payout line includes a dividend share', typeof line.dividendShare === 'number', line);
    check('net equals earnings plus dividend', line.net === line.earnings + line.dividendShare, line);
  }

  /* ---------------------------- notifications -------------------------- */
  section('Notifications');

  const notifs = await api('GET', '/notifications', { token: custToken });
  check('customer inbox is populated', notifs.data?.length > 0, notifs.meta);
  check('unread count is reported', typeof notifs.meta?.unread === 'number', notifs.meta);

  const readAll = await api('POST', '/notifications/read-all', { token: custToken });
  check('mark-all-read works', typeof readAll.data?.updated === 'number', readAll);

  /* ---------------------------- validation ----------------------------- */
  section('Input validation');

  const badBooking = await api('POST', '/bookings', {
    token: custToken,
    body: { serviceId: 'not-an-id', address: { line1: 'x' } },
  });
  check('malformed booking is rejected with details', badBooking.status === 400 && badBooking.error?.details?.length > 0, badBooking);

  const badGeo = await api('GET', '/workers/nearby?lat=999&lng=72');
  check('out-of-range coordinates are rejected', badGeo.status === 400, badGeo);

  const missing = await api('GET', '/services/000000000000000000000000');
  check('unknown id returns 404', missing.status === 404, missing);

  report();
}

/** The admin worker list is the only place a phone number is exposed. */
async function resolveWorkerPhone(workerId, adminToken) {
  const list = await api('GET', '/admin/workers?limit=50', { token: adminToken });
  const found = list.data?.find((w) => w._id === workerId);
  return found?.user?.phone;
}

function report() {
  console.log(`\n${'─'.repeat(60)}`);
  const total = pass + fail;
  if (fail === 0) {
    console.log(`${c.g}All ${total} checks passed.${c.x}\n`);
  } else {
    console.log(`${c.r}${fail} of ${total} checks failed:${c.x}`);
    failures.forEach((f) => console.log(`  ${c.r}·${c.x} ${f}`));
    console.log('');
  }
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`\n${c.r}Smoke test crashed:${c.x}`, err);
  process.exit(1);
});
