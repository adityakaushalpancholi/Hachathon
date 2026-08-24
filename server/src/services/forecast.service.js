import { Booking, Worker, Service } from '../models/index.js';
import { BOOKING_STATUS } from '../config/constants.js';

/**
 * Demand intelligence, computed with MongoDB aggregation over the booking
 * history. No ML dependency: the signal in this domain is overwhelmingly
 * seasonal (hour-of-day and day-of-week), so an additive decomposition of those
 * two factors against a moving baseline predicts as well as anything heavier —
 * and, unlike a black-box model, a cooperative's members can audit it.
 */

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Hourly demand profile (0-23) for a skill, as a multiplier of the mean hour. */
export async function hourlyProfile({ skillTag, zone, days = 30 }) {
  const since = new Date(Date.now() - days * 86400_000);

  const rows = await Booking.aggregate([
    {
      $match: {
        createdAt: { $gte: since },
        status: { $ne: BOOKING_STATUS.EXPIRED },
        ...(skillTag ? { skillTag } : {}),
        ...(zone ? { 'address.zone': zone } : {}),
      },
    },
    { $group: { _id: { $hour: '$scheduledFor' }, count: { $sum: 1 } } },
  ]);

  const byHour = new Map(rows.map((r) => [r._id, r.count]));
  const counts = HOURS.map((h) => byHour.get(h) || 0);
  const total = counts.reduce((a, b) => a + b, 0);
  const mean = total / 24 || 1;

  return HOURS.map((hour) => ({
    hour,
    label: `${String(hour).padStart(2, '0')}:00`,
    bookings: counts[hour],
    index: Math.round((counts[hour] / mean) * 100) / 100, // 1.0 = an average hour
  }));
}

/** Day-of-week profile. */
export async function weekdayProfile({ skillTag, days = 60 }) {
  const since = new Date(Date.now() - days * 86400_000);

  const rows = await Booking.aggregate([
    {
      $match: {
        createdAt: { $gte: since },
        status: { $ne: BOOKING_STATUS.EXPIRED },
        ...(skillTag ? { skillTag } : {}),
      },
    },
    { $group: { _id: { $dayOfWeek: '$scheduledFor' }, count: { $sum: 1 } } },
  ]);

  const byDay = new Map(rows.map((r) => [r._id - 1, r.count])); // $dayOfWeek is 1-indexed
  const counts = DAY_NAMES.map((_, i) => byDay.get(i) || 0);
  const mean = counts.reduce((a, b) => a + b, 0) / 7 || 1;

  return DAY_NAMES.map((day, i) => ({
    day,
    dayIndex: i,
    bookings: counts[i],
    index: Math.round((counts[i] / mean) * 100) / 100,
  }));
}

/**
 * Forecast the next `horizonHours` for a skill, by multiplying a recent
 * volume baseline through the hour-of-day and day-of-week indices.
 */
export async function forecastDemand({ skillTag, zone, horizonHours = 24 }) {
  const [hourly, weekday] = await Promise.all([
    hourlyProfile({ skillTag, zone }),
    weekdayProfile({ skillTag }),
  ]);

  const since = new Date(Date.now() - 14 * 86400_000);
  const recent = await Booking.countDocuments({
    createdAt: { $gte: since },
    ...(skillTag ? { skillTag } : {}),
    ...(zone ? { 'address.zone': zone } : {}),
  });
  const baselinePerHour = recent / (14 * 24);

  const points = [];
  for (let i = 1; i <= horizonHours; i += 1) {
    const at = new Date(Date.now() + i * 3600_000);
    const hIdx = hourly[at.getHours()].index;
    const dIdx = weekday[at.getDay()].index;
    const expected = baselinePerHour * hIdx * dIdx;

    points.push({
      at: at.toISOString(),
      hour: at.getHours(),
      label: `${String(at.getHours()).padStart(2, '0')}:00`,
      expectedBookings: Math.round(expected * 10) / 10,
      // Confidence decays across the horizon — say so rather than implying precision.
      confidence: Math.round(Math.max(0.35, 0.92 - i * 0.02) * 100),
    });
  }

  const peak = points.reduce((a, b) => (b.expectedBookings > a.expectedBookings ? b : a), points[0]);

  return { skillTag, zone, baselinePerHour: Math.round(baselinePerHour * 100) / 100, points, peak };
}

/**
 * Supply-gap analysis — where the cooperative should recruit or retrain.
 * Compares forecast demand against the verified workforce, per skill.
 */
export async function workforceGaps({ city } = {}) {
  const since = new Date(Date.now() - 30 * 86400_000);

  const [demandRows, supplyRows, services] = await Promise.all([
    Booking.aggregate([
      { $match: { createdAt: { $gte: since }, ...(city ? { 'address.city': city } : {}) } },
      {
        $group: {
          _id: '$skillTag',
          bookings: { $sum: 1 },
          revenue: { $sum: '$pricing.total' },
          unmatched: {
            $sum: { $cond: [{ $in: ['$status', [BOOKING_STATUS.EXPIRED, BOOKING_STATUS.PENDING]] }, 1, 0] },
          },
        },
      },
    ]),
    Worker.aggregate([
      { $match: { 'verification.status': 'verified', ...(city ? { city } : {}) } },
      { $unwind: '$skills' },
      {
        $group: {
          _id: '$skills.skillTag',
          workers: { $sum: 1 },
          online: { $sum: { $cond: ['$availability.isOnline', 1, 0] } },
          avgRating: { $avg: '$rating.average' },
        },
      },
    ]),
    Service.find({ isActive: true }).select('name skillTag icon category').lean(),
  ]);

  const demand = new Map(demandRows.map((r) => [r._id, r]));
  const supply = new Map(supplyRows.map((r) => [r._id, r]));

  return services
    .map((svc) => {
      const d = demand.get(svc.skillTag) || { bookings: 0, revenue: 0, unmatched: 0 };
      const s = supply.get(svc.skillTag) || { workers: 0, online: 0, avgRating: 0 };

      const loadPerWorker = s.workers ? d.bookings / s.workers : d.bookings;
      const unmatchedRate = d.bookings ? d.unmatched / d.bookings : 0;

      // Two independent signals of scarcity: how loaded each member is, and how
      // often a request found nobody at all.
      const pressure = Math.min(1, loadPerWorker / 25) * 0.6 + unmatchedRate * 0.4;

      let recommendation = 'balanced';
      if (pressure > 0.6) recommendation = 'recruit_urgently';
      else if (pressure > 0.35) recommendation = 'train_existing_members';
      else if (d.bookings > 0 && loadPerWorker < 3) recommendation = 'oversupplied';

      return {
        skillTag: svc.skillTag,
        service: svc.name,
        icon: svc.icon,
        category: svc.category,
        bookings30d: d.bookings,
        revenue30d: Math.round(d.revenue),
        unmatched: d.unmatched,
        unmatchedRate: Math.round(unmatchedRate * 100),
        workers: s.workers,
        online: s.online,
        avgRating: Math.round((s.avgRating || 0) * 10) / 10,
        loadPerWorker: Math.round(loadPerWorker * 10) / 10,
        pressure: Math.round(pressure * 100),
        recommendation,
        suggestedHires: recommendation === 'recruit_urgently' ? Math.ceil(loadPerWorker / 12) : 0,
      };
    })
    .sort((a, b) => b.pressure - a.pressure);
}

/** Revenue and volume trend, bucketed by day. */
export async function revenueTrend({ days = 14, cooperative } = {}) {
  const since = new Date(Date.now() - days * 86400_000);

  const rows = await Booking.aggregate([
    {
      $match: {
        createdAt: { $gte: since },
        status: BOOKING_STATUS.COMPLETED,
        ...(cooperative ? { cooperative } : {}),
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        bookings: { $sum: 1 },
        gross: { $sum: '$pricing.total' },
        workerPayout: { $sum: '$pricing.workerPayout' },
        commission: { $sum: '$pricing.coopCommission' },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Fill gaps so the chart has a point for every day, not just active ones.
  const byDate = new Map(rows.map((r) => [r._id, r]));
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
    const row = byDate.get(d);
    out.push({
      date: d,
      bookings: row?.bookings ?? 0,
      gross: Math.round(row?.gross ?? 0),
      workerPayout: Math.round(row?.workerPayout ?? 0),
      commission: Math.round(row?.commission ?? 0),
    });
  }
  return out;
}

/** Zone leaderboard — where demand concentrates. */
export async function zoneHeatmap({ days = 30 } = {}) {
  const since = new Date(Date.now() - days * 86400_000);

  const rows = await Booking.aggregate([
    { $match: { createdAt: { $gte: since }, 'address.zone': { $ne: null } } },
    {
      $group: {
        _id: '$address.zone',
        bookings: { $sum: 1 },
        revenue: { $sum: '$pricing.total' },
        avgSurge: { $avg: '$pricing.surgeMultiplier' },
        topSkill: { $first: '$skillTag' },
        lng: { $avg: { $arrayElemAt: ['$address.location.coordinates', 0] } },
        lat: { $avg: { $arrayElemAt: ['$address.location.coordinates', 1] } },
      },
    },
    { $sort: { bookings: -1 } },
    { $limit: 20 },
  ]);

  const max = rows[0]?.bookings || 1;

  return rows.map((r) => ({
    zone: r._id,
    bookings: r.bookings,
    revenue: Math.round(r.revenue),
    avgSurge: Math.round((r.avgSurge || 1) * 100) / 100,
    topSkill: r.topSkill,
    intensity: Math.round((r.bookings / max) * 100),
    center: [r.lng, r.lat],
  }));
}
