import { User, Cooperative, Service, Worker, Booking, Review, Notification, Payout } from '../models/index.js';
import { ZONES, COOPERATIVES, SERVICES, WORKER_NAMES, REVIEW_COMMENTS } from './fixtures.js';
import {
  BOOKING_STATUS,
  BOOKING_TYPE,
  PAYMENT_STATUS,
  REVIEW_TAGS,
  VERIFICATION_STATUS,
} from '../config/constants.js';
import { bookingCode, otpCode, txnRef, membershipId } from '../utils/ids.js';
import { buildPricing } from '../services/pricing.service.js';
import { logger } from '../utils/logger.js';

/* ----------------------------- small helpers ----------------------------- */

/**
 * Seeded PRNG (mulberry32). The demo data must be identical on every boot: an
 * in-memory database reseeds on each restart, and a reviewer comparing two runs
 * should see the same members, the same ratings and the same numbers.
 * Override with SEED=<int> to generate a different world.
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(Number(process.env.SEED ?? 20260824));

const pick = (arr) => arr[Math.floor(random() * arr.length)];
const pickN = (arr, n) => [...arr].sort(() => random() - 0.5).slice(0, n);
const rand = (min, max) => random() * (max - min) + min;
const randInt = (min, max) => Math.floor(rand(min, max + 1));

/** Scatter a point up to `km` from a centre, so members cluster believably. */
const jitter = ([lng, lat], km = 2) => {
  const dLat = rand(-km, km) / 111;
  const dLng = rand(-km, km) / (111 * Math.cos((lat * Math.PI) / 180));
  return {
    type: 'Point',
    coordinates: [Number((lng + dLng).toFixed(6)), Number((lat + dLat).toFixed(6))],
  };
};

let phoneSeq = 9000000000;
const nextPhone = () => String(++phoneSeq);

/**
 * Demand shape used to generate history.
 *
 * Bookings are not spread uniformly: they cluster in the morning and evening and
 * thin out overnight. Seeding with this shape is what gives the forecasting
 * endpoints a real signal to find, instead of flat noise.
 */
const HOUR_WEIGHTS = [
  0.1, 0.05, 0.05, 0.05, 0.1, 0.3, 0.8, 1.4, 1.8, 1.9, 1.6, 1.2,
  1.0, 0.9, 1.0, 1.2, 1.5, 1.9, 2.0, 1.7, 1.1, 0.6, 0.3, 0.15,
];

const weightedHour = () => {
  const total = HOUR_WEIGHTS.reduce((a, b) => a + b, 0);
  let r = random() * total;
  for (let h = 0; h < 24; h += 1) {
    r -= HOUR_WEIGHTS[h];
    if (r <= 0) return h;
  }
  return 12;
};

/* --------------------------------- seed ---------------------------------- */

/**
 * Populate the database.
 *
 * Two quite different jobs share this function, separated by `demo`:
 *
 *   demo: false — the catalogue a real launch needs, and nothing else. The
 *                 cooperatives and the bookable services are reference data,
 *                 not fiction, so a live deployment wants exactly this.
 *
 *   demo: true  — additionally invents members, customers, bookings, reviews
 *                 and payouts so every screen has something on it. Destructive:
 *                 it clears the collections first, so it must never touch a
 *                 database holding real bookings.
 *
 * The catalogue path is non-destructive and idempotent — it only inserts what
 * is missing — which is what lets it run safely on each boot.
 */
export async function runSeed({ quiet = false, demo = false } = {}) {
  const log = quiet ? () => {} : (...a) => logger.info(...a);

  if (demo) {
    await Promise.all([
      User.deleteMany({}),
      Cooperative.deleteMany({}),
      Service.deleteMany({}),
      Worker.deleteMany({}),
      Booking.deleteMany({}),
      Review.deleteMany({}),
      Notification.deleteMany({}),
      Payout.deleteMany({}),
    ]);
    log('cleared existing collections');
  }

  /* 1 - cooperatives ------------------------------------------------------ */
  const coops = (await Cooperative.countDocuments())
    ? await Cooperative.find()
    : await Cooperative.create(COOPERATIVES);
  log(`${coops.length} cooperatives`);

  /* 2 - service catalogue ------------------------------------------------- */
  const services = (await Service.countDocuments())
    ? await Service.find()
    : await Service.create(SERVICES);
  const serviceBySkill = new Map(services.map((s) => [s.skillTag, s]));
  log(`${services.length} services`);

  if (!demo) {
    if (!quiet) logger.success('catalogue ready');
    return {
      summary: { cooperatives: coops.length, services: services.length },
      credentials: null,
    };
  }

  /* 3 - one admin per cooperative board ----------------------------------- */
  const admins = [];
  for (const [i, coop] of coops.entries()) {
    const admin = new User({
      name: i === 0 ? 'Anjali Deshpande' : 'Vikram Salvi',
      phone: i === 0 ? '9876500001' : '9876500002',
      email: i === 0 ? 'anjali@mumbaikaamgaar.coop' : 'vikram@thaneshramik.coop',
      role: 'admin',
      cooperative: coop._id,
      membershipId: membershipId(coop.code, 1),
    });
    await admin.setPassword('admin123');
    await admin.save();
    admins.push(admin);
  }
  log(`created ${admins.length} cooperative admins`);

  /* 4 - worker members ---------------------------------------------------- */
  const workers = [];
  const workerPhones = new Map();

  for (const [skillTag, names] of Object.entries(WORKER_NAMES)) {
    const service = serviceBySkill.get(skillTag);

    for (const [idx, name] of names.entries()) {
      const zone = pick(ZONES);
      const coop = zone.city === 'Thane' ? coops[1] : coops[0];
      const phone = nextPhone();

      const user = new User({
        name,
        phone,
        role: 'worker',
        cooperative: coop._id,
        membershipId: membershipId(coop.code, workers.length + 2),
        language: pick(['hi', 'mr', 'en']),
      });
      await user.setPassword('worker123');
      await user.save();

      const experienceYears = randInt(1, 18);
      const ratingCount = randInt(0, 180);
      // Rating correlates loosely with experience, with real spread.
      const ratingAvg = ratingCount
        ? Math.min(5, Number((3.5 + Math.min(experienceYears, 12) * 0.08 + rand(-0.35, 0.4)).toFixed(2)))
        : 0;
      const jobsCompleted = Math.round(ratingCount * rand(1.1, 1.8));
      const offersReceived = Math.round(jobsCompleted * rand(1.3, 2.4));

      /**
       * The first three members of every trade are always verified and online.
       * Without this the RNG can leave a whole trade with nobody bookable and
       * the dispatch demo dead-ends. The rest stay randomised, so the admin
       * verification queue and the online/offline mix remain realistic.
       */
      const guaranteed = idx < 3;
      const roll = random();
      const status = guaranteed
        ? VERIFICATION_STATUS.VERIFIED
        : roll < 0.7
          ? VERIFICATION_STATUS.VERIFIED
          : roll < 0.92
            ? VERIFICATION_STATUS.PENDING
            : VERIFICATION_STATUS.SUSPENDED;

      const isOnline =
        status === VERIFICATION_STATUS.VERIFIED && (guaranteed || random() < 0.55);

      const badges = [];
      if (status === VERIFICATION_STATUS.VERIFIED) badges.push('coop_verified');
      if (ratingAvg >= 4.7 && ratingCount >= 10) badges.push('top_rated');
      if (experienceYears >= 10) badges.push('master_craftsman');

      const worker = await Worker.create({
        user: user._id,
        cooperative: coop._id,
        displayName: name,
        bio: `${experienceYears} years working across ${zone.zone} and nearby areas. Member of ${coop.name}.`,
        languages: pickN(['hi', 'en', 'mr', 'ta', 'bn'], randInt(2, 3)),
        skills: [
          {
            service: service?._id,
            skillTag,
            level: experienceYears > 10 ? 'expert' : experienceYears > 4 ? 'skilled' : 'apprentice',
            yearsExperience: experienceYears,
          },
        ],
        hourlyRate: Math.max(coop.governance.minHourlyRate, Math.round(rand(180, 520) / 10) * 10),
        experienceYears,
        verification: {
          status,
          backgroundCheckClear: status === VERIFICATION_STATUS.VERIFIED,
          verifiedBy: status === VERIFICATION_STATUS.VERIFIED ? admins[0]._id : undefined,
          verifiedAt:
            status === VERIFICATION_STATUS.VERIFIED
              ? new Date(Date.now() - randInt(10, 400) * 86400_000)
              : undefined,
          documents: [
            {
              type: 'aadhaar',
              number: `XXXX-XXXX-${randInt(1000, 9999)}`,
              status: status === VERIFICATION_STATUS.VERIFIED ? 'approved' : 'pending',
            },
            {
              type: 'police_verification',
              status: status === VERIFICATION_STATUS.VERIFIED ? 'approved' : 'pending',
            },
            {
              type: 'skill_certificate',
              status: status === VERIFICATION_STATUS.VERIFIED ? 'approved' : 'pending',
            },
          ],
        },
        rating: {
          average: ratingAvg,
          count: ratingCount,
          tagCounts: Object.fromEntries(
            pickN(REVIEW_TAGS, 4).map((t) => [t, randInt(3, Math.max(3, ratingCount))]),
          ),
        },
        stats: {
          jobsCompleted,
          jobsCancelled: randInt(0, 6),
          offersReceived,
          offersAccepted: Math.round(offersReceived * rand(0.55, 0.95)),
          onTimeCount: Math.round(jobsCompleted * rand(0.75, 0.98)),
          repeatCustomers: randInt(0, Math.max(1, Math.round(jobsCompleted * 0.25))),
          responseSeconds: randInt(8, 42),
        },
        earnings: {
          lifetime: jobsCompleted * randInt(280, 900),
          thisMonth: randInt(2000, 26000),
          pendingPayout: randInt(0, 9000),
          dividendsReceived: randInt(0, 7000),
        },
        availability: {
          isOnline,
          acceptsEmergency: Boolean(service?.emergencyAvailable) && (guaranteed || random() < 0.5),
          workingDays: [1, 2, 3, 4, 5, 6],
          shiftStart: pick(['07:00', '08:00', '09:00']),
          shiftEnd: pick(['19:00', '20:00', '21:00']),
        },
        location: jitter(zone.center, 3),
        // Guaranteed members carry a wide radius, so they are reachable from any
        // demo location in the city.
        serviceRadiusKm: guaranteed ? randInt(18, 25) : randInt(5, 14),
        baseArea: zone.zone,
        city: zone.city,
        badges,
        trainingCompleted: pickN(coop.trainingPrograms.map((t) => t.name), randInt(0, 2)),
        joinedCoopAt: new Date(Date.now() - randInt(30, 1400) * 86400_000),
      });

      workerPhones.set(String(worker._id), phone);
      workers.push(worker);
    }
  }

  const verifiedWorkers = workers.filter(
    (w) => w.verification.status === VERIFICATION_STATUS.VERIFIED,
  );
  log(`created ${workers.length} worker members (${verifiedWorkers.length} verified)`);

  /* 5 - customers --------------------------------------------------------- */
  const customerNames = [
    'Kavya Menon', 'Meera Iyer', 'Sameer Kulkarni', 'Divya Nair', 'Rohan Mehta',
    'Farah Khan', 'Karthik Subramanian', 'Nisha Agarwal', 'Tanvi Joshi',
    'Arjun Bhatt', 'Shalini Verma', 'Imtiaz Ali',
  ];

  const customers = [];
  for (const [i, name] of customerNames.entries()) {
    // The demo customer is pinned to Bandra West so the map view is predictable.
    const zone = i === 0 ? ZONES.find((z) => z.zone === 'Bandra West') : pick(ZONES);

    const user = new User({
      name,
      phone: i === 0 ? '9876543210' : nextPhone(),
      email: `${name.split(' ')[0].toLowerCase()}@example.com`,
      role: 'customer',
      language: pick(['en', 'hi', 'mr']),
      addresses: [
        {
          label: 'Home',
          line1: `${randInt(101, 1804)}, ${pick(['Sunrise', 'Oberoi', 'Lokhandwala', 'Hiranandani', 'Shanti'])} ${pick(['Apartments', 'Heights', 'Residency', 'Towers'])}`,
          landmark: pick([
            'Near D-Mart',
            'Opposite the metro station',
            'Behind the bus depot',
            'Next to the market',
          ]),
          city: zone.city,
          state: 'Maharashtra',
          pincode: zone.pincode,
          zone: zone.zone,
          location: jitter(zone.center, 2),
          isDefault: true,
        },
      ],
      wallet: { balance: randInt(0, 2500) },
    });
    await user.setPassword('customer123');
    await user.save();
    customers.push(user);
  }
  log(`created ${customers.length} customers`);

  /* 6 - 60 days of booking history ---------------------------------------- */
  const bookings = [];

  for (let day = 60; day >= 1; day -= 1) {
    const date = new Date(Date.now() - day * 86400_000);
    // Weekends run hotter, and volume trends gently upward over the period.
    const weekendBoost = [0, 6].includes(date.getDay()) ? 1.4 : 1;
    const growth = 1 + (60 - day) / 140;
    const count = Math.round(randInt(4, 9) * weekendBoost * growth);

    for (let i = 0; i < count; i += 1) {
      const service = pick(services);
      const candidates = verifiedWorkers.filter((w) =>
        w.skills.some((s) => s.skillTag === service.skillTag),
      );
      if (!candidates.length) continue;

      const worker = pick(candidates);
      const customer = pick(customers);
      const address = customer.addresses[0];
      const coop = coops.find((c) => String(c._id) === String(worker.cooperative));

      const when = new Date(date);
      when.setHours(weightedHour(), pick([0, 15, 30, 45]), 0, 0);

      const pkg = pick(service.packages);
      const isEmergency = service.emergencyAvailable && random() < 0.08;
      const surge =
        random() < 0.25 ? Number(rand(1.05, coop.governance.surgeCeiling).toFixed(2)) : 1;

      const pricing = buildPricing({
        basePrice: pkg.price,
        surgeMultiplier: surge,
        emergencySurcharge: isEmergency ? service.emergencySurcharge : 0,
        couponCode: random() < 0.12 ? 'MONSOON20' : undefined,
        cooperative: coop,
      });

      // Most jobs complete; a realistic slice cancels or never finds a worker.
      const outcome = random();
      const status =
        outcome < 0.86
          ? BOOKING_STATUS.COMPLETED
          : outcome < 0.95
            ? BOOKING_STATUS.CANCELLED
            : BOOKING_STATUS.EXPIRED;

      const isExpired = status === BOOKING_STATUS.EXPIRED;
      const completedAt = new Date(when.getTime() + pkg.durationMins * 60_000);

      bookings.push({
        code: bookingCode(),
        customer: customer._id,
        worker: isExpired ? null : worker._id,
        cooperative: isExpired ? null : coop._id,
        service: service._id,
        serviceName: service.name,
        skillTag: service.skillTag,
        packageName: pkg.name,
        type: isEmergency ? BOOKING_TYPE.EMERGENCY : BOOKING_TYPE.SCHEDULED,
        status,
        address: {
          label: address.label,
          line1: address.line1,
          landmark: address.landmark,
          city: address.city,
          pincode: address.pincode,
          zone: address.zone,
          location: address.location,
        },
        scheduledFor: when,
        durationMins: pkg.durationMins,
        pricing,
        payment: {
          method: pick(['upi', 'upi', 'upi', 'card', 'cash']),
          status: status === BOOKING_STATUS.COMPLETED ? PAYMENT_STATUS.PAID : PAYMENT_STATUS.PENDING,
          txnId: status === BOOKING_STATUS.COMPLETED ? txnRef() : undefined,
          paidAt: status === BOOKING_STATUS.COMPLETED ? completedAt : undefined,
        },
        otp: {
          start: otpCode(),
          complete: otpCode(),
          startVerifiedAt: status === BOOKING_STATUS.COMPLETED ? when : undefined,
          completeVerifiedAt: status === BOOKING_STATUS.COMPLETED ? completedAt : undefined,
        },
        dispatch: {
          round: 1,
          radiusKm: randInt(3, 10),
          candidates: isExpired
            ? []
            : [
                {
                  worker: worker._id,
                  distanceKm: Number(rand(0.4, 8).toFixed(2)),
                  etaMins: randInt(8, 35),
                  score: Number(rand(0.5, 0.95).toFixed(3)),
                  response: 'accepted',
                  respondedAt: when,
                },
              ],
          acceptedAt: isExpired ? undefined : when,
        },
        timeline: [
          { status: BOOKING_STATUS.PENDING, by: 'customer', at: new Date(when.getTime() - 3600_000) },
        ],
        cancellation:
          status === BOOKING_STATUS.CANCELLED
            ? {
                by: pick(['customer', 'worker']),
                reason: pick([
                  'Plan changed',
                  'Found another option',
                  'Worker unavailable',
                  'Rescheduling to next week',
                ]),
                at: when,
              }
            : undefined,
        createdAt: new Date(when.getTime() - randInt(30, 240) * 60_000),
        updatedAt: completedAt,
      });
    }
  }

  const insertedBookings = await Booking.insertMany(bookings);
  log(`created ${insertedBookings.length} historical bookings`);

  /* 7 - reviews on ~70% of completed jobs --------------------------------- */
  const reviews = [];
  for (const booking of insertedBookings) {
    if (booking.status !== BOOKING_STATUS.COMPLETED || random() > 0.7) continue;

    // Ratings skew high, as they do on every real marketplace.
    const r = random();
    const rating = r < 0.55 ? 5 : r < 0.82 ? 4 : r < 0.93 ? 3 : r < 0.98 ? 2 : 1;

    reviews.push({
      booking: booking._id,
      customer: booking.customer,
      worker: booking.worker,
      service: booking.service,
      rating,
      tags: pickN(REVIEW_TAGS, randInt(1, 4)),
      comment: random() < 0.6 ? pick(REVIEW_COMMENTS) : undefined,
      createdAt: new Date(booking.updatedAt.getTime() + randInt(1, 48) * 3600_000),
    });
  }

  const insertedReviews = await Review.insertMany(reviews);
  await Promise.all(
    insertedReviews.map((rv) => Booking.updateOne({ _id: rv.booking }, { $set: { review: rv._id } })),
  );
  log(`created ${insertedReviews.length} reviews`);

  /* 8 - roll cooperative ledgers up from the generated history ------------- */
  for (const coop of coops) {
    const agg = await Booking.aggregate([
      { $match: { cooperative: coop._id, status: BOOKING_STATUS.COMPLETED } },
      {
        $group: {
          _id: null,
          jobs: { $sum: 1 },
          gross: { $sum: '$pricing.total' },
          commission: { $sum: '$pricing.coopCommission' },
        },
      },
    ]);
    const row = agg[0] || { jobs: 0, gross: 0, commission: 0 };

    const members = workers.filter((w) => String(w.cooperative) === String(coop._id));
    const verified = members.filter((w) => w.verification.status === VERIFICATION_STATUS.VERIFIED);
    const rated = members.filter((w) => w.rating.count > 0);

    coop.stats = {
      memberCount: members.length,
      verifiedCount: verified.length,
      jobsCompleted: row.jobs,
      grossVolume: Math.round(row.gross),
      commissionEarned: Math.round(row.commission),
      // Part of the pool has already gone out to members in past cycles.
      dividendsDistributed: Math.round(row.commission * coop.governance.dividendPoolPct * 0.45),
      avgRating: rated.length
        ? Number((rated.reduce((s, w) => s + w.rating.average, 0) / rated.length).toFixed(2))
        : 0,
    };
    await coop.save();
  }
  log('rolled up cooperative ledgers');

  /* 9 - one live in-flight booking, so the panels open with something on ---- */
  const liveCustomer = customers[0];
  const liveAddress = liveCustomer.addresses[0];
  const liveService = serviceBySkill.get('electrician');
  const liveCoop = coops[0];
  const livePkg = liveService.packages[0];

  // Deliberately the *last* online electrician, leaving the guaranteed ones free
  // for the dispatch demo and the smoke test.
  const onlineElectricians = verifiedWorkers.filter(
    (w) => w.skills.some((s) => s.skillTag === 'electrician') && w.availability.isOnline,
  );
  const liveWorker = onlineElectricians.length > 1 ? onlineElectricians.at(-1) : null;

  if (liveWorker) {
    const pricing = buildPricing({ basePrice: livePkg.price, cooperative: liveCoop });
    const live = await Booking.create({
      code: bookingCode(),
      customer: liveCustomer._id,
      worker: liveWorker._id,
      cooperative: liveCoop._id,
      service: liveService._id,
      serviceName: liveService.name,
      skillTag: 'electrician',
      packageName: livePkg.name,
      notes: 'Bedroom MCB keeps tripping when the AC starts.',
      type: BOOKING_TYPE.SCHEDULED,
      status: BOOKING_STATUS.ENROUTE,
      address: {
        label: liveAddress.label,
        line1: liveAddress.line1,
        landmark: liveAddress.landmark,
        city: liveAddress.city,
        pincode: liveAddress.pincode,
        zone: liveAddress.zone,
        location: liveAddress.location,
      },
      scheduledFor: new Date(Date.now() + 25 * 60_000),
      durationMins: livePkg.durationMins,
      pricing,
      payment: { method: 'upi', status: PAYMENT_STATUS.PENDING },
      otp: { start: otpCode(), complete: otpCode() },
      dispatch: {
        round: 1,
        radiusKm: 6,
        candidates: [
          {
            worker: liveWorker._id,
            distanceKm: 2.4,
            etaMins: 12,
            score: 0.88,
            response: 'accepted',
            respondedAt: new Date(),
          },
        ],
        acceptedAt: new Date(),
      },
      timeline: [
        { status: BOOKING_STATUS.PENDING, by: 'customer', at: new Date(Date.now() - 12 * 60_000) },
        { status: BOOKING_STATUS.DISPATCHING, by: 'system', at: new Date(Date.now() - 11 * 60_000) },
        { status: BOOKING_STATUS.ACCEPTED, by: 'worker', at: new Date(Date.now() - 9 * 60_000) },
        { status: BOOKING_STATUS.ENROUTE, by: 'worker', at: new Date(Date.now() - 4 * 60_000) },
      ],
    });

    liveWorker.availability.activeBooking = live._id;
    await liveWorker.save();

    await Notification.create({
      user: liveCustomer._id,
      type: 'booking_update',
      title: `${liveWorker.displayName} is on the way`,
      body: `Arriving in about 12 minutes - ${live.code}`,
      data: { bookingId: String(live._id), code: live.code },
    });

    log(`created a live in-flight booking (${live.code})`);
  }

  /* 10 - demo credentials -------------------------------------------------- */
  const demoWorker = verifiedWorkers.find(
    (w) => w.availability.isOnline && !w.availability.activeBooking,
  );

  const summary = {
    cooperatives: coops.length,
    services: services.length,
    workers: workers.length,
    verified: verifiedWorkers.length,
    customers: customers.length,
    admins: admins.length,
    bookings: insertedBookings.length,
    reviews: insertedReviews.length,
  };

  const credentials = {
    customer: { phone: '9876543210', password: 'customer123', name: customers[0].name },
    admin: { phone: '9876500001', password: 'admin123', name: admins[0].name },
    worker: demoWorker
      ? {
          phone: workerPhones.get(String(demoWorker._id)),
          password: 'worker123',
          name: demoWorker.displayName,
        }
      : null,
  };

  if (!quiet) {
    logger.success('seed complete');
    console.table(summary);
    console.log('\n  Demo logins\n');
    console.log(`  Customer  ${credentials.customer.phone}  customer123   ${credentials.customer.name}`);
    console.log(`  Admin     ${credentials.admin.phone}  admin123      ${credentials.admin.name}, ${coops[0].name}`);
    if (credentials.worker) {
      console.log(`  Worker    ${credentials.worker.phone}  worker123     ${credentials.worker.name}`);
    }
    console.log('');
  } else if (credentials.worker) {
    logger.info(
      `demo logins - customer 9876543210 | worker ${credentials.worker.phone} | admin 9876500001`,
    );
  }

  return { summary, credentials };
}

/* Run directly:  npm run seed  */
const isDirectRun = process.argv[1]?.replace(/\\/g, '/').endsWith('seed/seed.js');

if (isDirectRun) {
  const { connectDatabase, disconnectDatabase } = await import('../config/db.js');
  await connectDatabase();
  await runSeed();
  await disconnectDatabase();
  process.exit(0);
}
