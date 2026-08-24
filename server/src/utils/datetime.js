import { env } from '../config/env.js';

/**
 * Timezone-aware date parts.
 *
 * The reporting boundary is a *local* day, hour and weekday — a booking at
 * 23:30 IST belongs to that day's bucket, not the next one in UTC. MongoDB
 * aggregations get the same timezone passed explicitly (see forecast.service.js),
 * and these helpers keep the JavaScript side of the same calculation in step.
 * Mixing the two frames is what makes a "busiest hour" land in the small hours.
 */

const TZ = env.timezone;

const partsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hour12: false,
  weekday: 'short',
});

const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** { date: 'YYYY-MM-DD', hour: 0-23, weekday: 0-6 } in the reporting timezone. */
export function localParts(input = new Date()) {
  const parts = Object.fromEntries(
    partsFormatter.formatToParts(new Date(input)).map((p) => [p.type, p.value]),
  );

  // 'en-CA' renders hour 24 for midnight in some engines; normalise to 0.
  const hour = Number(parts.hour) % 24;

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour,
    weekday: WEEKDAY_INDEX[parts.weekday] ?? 0,
  };
}

export const localDateKey = (input = new Date()) => localParts(input).date;
export const localHour = (input = new Date()) => localParts(input).hour;
export const localWeekday = (input = new Date()) => localParts(input).weekday;

/** Descending run of local date keys, oldest first, for gap-filling a series. */
export function lastNDateKeys(n) {
  const keys = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    keys.push(localDateKey(new Date(Date.now() - i * 86400_000)));
  }
  return keys;
}

export { TZ };
