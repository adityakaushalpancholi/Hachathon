/**
 * Hit every route the app exposes and report what each one does.
 *
 * The smoke suite proves behaviour; this proves *reachability* — that no route
 * is 404ing because a controller was renamed, and that every guarded route is
 * actually guarded. Those are different failures: a smoke test only covers the
 * paths it happens to walk, and a route nobody wrote a test for can rot quietly
 * until a customer finds it.
 *
 *   API=http://localhost:4300/api node src/seed/endpoints.js
 */
const BASE = process.env.API || 'http://localhost:4000/api';
const OWNER = process.env.SMOKE_OWNER_PHONE || '9876500001';

const c = {
  dim: (t) => `[2m${t}[0m`,
  green: (t) => `[32m${t}[0m`,
  red: (t) => `[31m${t}[0m`,
  amber: (t) => `[33m${t}[0m`,
  cyan: (t) => `[36m${t}[0m`,
};

async function call(method, path, { token, body } = {}) {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  } catch (err) {
    return { status: 0, json: { error: { message: err.message } } };
  }
}

const rows = [];

/**
 * `expect` is the set of statuses that mean the route is working *as designed*.
 * A guarded route answering 401 is a pass — it proves the guard runs. Only an
 * unexpected status, a 404 on a route that should exist, or a 5xx is a failure.
 */
function record(method, path, status, expect, note = '') {
  const ok = expect.includes(status);
  rows.push({ method, path, status, ok, note });
}

async function probe(method, path, expect, opts = {}) {
  const { status, json } = await call(method, path, opts);
  record(method, path, status, expect, json?.error?.message ?? '');
  return { status, json };
}

async function main() {
  console.log(c.cyan(`\nEndpoint sweep → ${BASE}\n`));

  /* ------------------------------- sessions ------------------------------ */
  const cust = await call('POST', '/auth/login', {
    body: { phone: '9876543210', password: 'customer123' },
  });
  const admin = await call('POST', '/auth/login', {
    body: { phone: OWNER, password: 'admin123' },
  });

  const custToken = cust.json?.data?.token;
  const adminToken = admin.json?.data?.token;

  let workerToken;
  if (adminToken) {
    const page = await call('GET', '/database/Worker?limit=50', { token: adminToken });
    const verified = (page.json?.data?.documents ?? []).find(
      (w) => w.verification?.status === 'verified',
    );
    if (verified) {
      const u = await call('GET', `/database/User/${verified.user}`, { token: adminToken });
      const s = await call('POST', '/auth/login', {
        body: { phone: u.json?.data?.phone, password: 'worker123' },
      });
      workerToken = s.json?.data?.token;
    }
  }

  console.log(
    c.dim(
      `  sessions: customer=${custToken ? 'ok' : 'FAIL'} worker=${workerToken ? 'ok' : 'FAIL'} admin=${adminToken ? 'ok' : 'FAIL'}\n`,
    ),
  );

  const ID = '000000000000000000000000'; // well-formed but absent

  /* --------------------------------- public ------------------------------ */
  await probe('GET', '/health', [200]);
  await probe('GET', '/services', [200]);
  await probe('GET', '/services/categories', [200]);
  await probe('GET', `/services/${ID}`, [404]);
  await probe('GET', '/areas', [200]);
  await probe('GET', '/cooperatives', [200]);
  await probe('GET', `/cooperatives/${ID}`, [404]);
  await probe('GET', '/workers', [200]);
  await probe('GET', '/workers/nearby?lat=19.06&lng=72.83', [200]);
  await probe('GET', `/workers/${ID}`, [404]);
  await probe('GET', '/payments/config', [200]);
  await probe('GET', `/reviews/worker/${ID}`, [200, 404]);

  /* ------------------------------ auth guards ---------------------------- */
  await probe('GET', '/auth/me', [401]);
  await probe('GET', '/bookings', [401]);
  await probe('GET', '/notifications', [401]);
  await probe('GET', '/admin/overview', [401]);
  await probe('GET', '/database', [401]);
  await probe('GET', '/insights/forecast', [401]);
  await probe('POST', '/payments/order', [401], { body: { bookingId: ID } });
  await probe('PATCH', '/workers/me/profile', [401], { body: { bio: 'x' } });
  await probe('PATCH', '/workers/me/availability', [401], { body: { isOnline: true } });

  /* -------------------------------- customer ----------------------------- */
  if (custToken) {
    const t = { token: custToken };
    await probe('GET', '/auth/me', [200], t);
    await probe('PATCH', '/auth/me', [200], { ...t, body: { language: 'en' } });
    await probe('GET', '/bookings', [200], t);
    await probe('GET', `/bookings/${ID}`, [404], t);
    await probe('GET', '/notifications', [200], t);
    await probe('POST', '/notifications/read-all', [200], t);
    await probe('GET', '/insights/forecast', [200], t);
    await probe('GET', '/insights/surge', [200], t);
    await probe('GET', `/payments/booking/${ID}`, [200], t);
    // Role boundaries: a customer must be refused these.
    await probe('GET', '/admin/overview', [403], t);
    await probe('GET', '/database', [403], t);
    await probe('GET', '/workers/me/dashboard', [403], t);
  }

  /* -------------------------------- worker ------------------------------- */
  if (workerToken) {
    const t = { token: workerToken };
    await probe('GET', '/workers/me/dashboard', [200], t);
    await probe('GET', '/workers/me/earnings', [200], t);
    await probe('GET', '/workers/me/offers', [200], t);
    await probe('PATCH', '/workers/me/availability', [200], { ...t, body: { isOnline: true } });
    await probe('PATCH', '/workers/me/profile', [200], { ...t, body: { bio: 'Sweep probe.' } });
    await probe('POST', '/workers/me/location', [200], {
      ...t,
      body: { location: { lat: 19.06, lng: 72.83 } },
    });
    await probe('POST', `/workers/me/offers/${ID}/accept`, [404, 409], t);
    await probe('GET', '/admin/overview', [403], t);
  }

  /* --------------------------------- admin ------------------------------- */
  if (adminToken) {
    const t = { token: adminToken };
    await probe('GET', '/admin/overview', [200], t);
    await probe('GET', '/admin/workers', [200], t);
    await probe('PATCH', `/admin/workers/${ID}/coverage`, [404], { ...t, body: { serviceRadiusKm: 20, note: 'sweep probe' } });
    await probe('GET', '/admin/bookings', [200], t);
    await probe('GET', '/admin/sos', [200], t);
    await probe('POST', '/admin/settlements/preview', [200, 400], { ...t, body: {} });
    await probe('GET', '/admin/payouts', [200], t);
    await probe('GET', '/admin/workforce', [200], t);
    await probe('GET', '/admin/heatmap', [200], t);
    await probe('GET', '/admin/reviews/flagged', [200], t);
    await probe('GET', '/insights/zones', [200], t);
    await probe('GET', '/insights/surge', [200], t);
    await probe('GET', '/database', [200], t);
    await probe('GET', '/database/config', [200], t);
    await probe('GET', '/database/User?limit=1', [200], t);
    await probe('GET', '/database/Payment?limit=1', [200], t);
    await probe('GET', '/database/User/indexes', [200], t);
    await probe('GET', '/database/system.users', [404], t);
    // Routes that must NOT exist — a promote endpoint would undo the whole
    // configuration-rooted admin model.
    await probe('POST', '/admin/users/promote', [404], { ...t, body: { role: 'admin' } });
    await probe('PUT', '/database/User/' + ID, [404], { ...t, body: {} });
  }

  /* -------------------------------- report ------------------------------- */
  const failed = rows.filter((r) => !r.ok);

  for (const r of rows) {
    const mark = r.ok ? c.green('ok  ') : c.red('FAIL');
    const status = r.status === 0 ? c.red('---') : String(r.status);
    console.log(`  ${mark} ${status.padStart(3)}  ${r.method.padEnd(6)} ${r.path}`);
  }

  console.log('\n' + '─'.repeat(64));
  if (failed.length) {
    console.log(c.red(`${failed.length} of ${rows.length} endpoints behaved unexpectedly:`));
    for (const f of failed) {
      console.log(c.red(`  · ${f.method} ${f.path} → ${f.status} ${c.dim(f.note)}`));
    }
    process.exitCode = 1;
  } else {
    console.log(c.green(`All ${rows.length} endpoints reachable and correctly guarded.`));
  }
}

main().catch((err) => {
  console.error(c.red('sweep crashed:'), err);
  process.exit(1);
});
