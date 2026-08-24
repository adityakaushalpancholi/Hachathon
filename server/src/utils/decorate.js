/**
 * Mongoose virtuals do not survive `.lean()` without an extra plugin, and we
 * want lean reads on every list endpoint. Rather than pay for full documents,
 * recompute the handful of derived fields the client actually renders.
 */
export function decorateWorker(w) {
  if (!w) return w;
  const offers = w.stats?.offersReceived ?? 0;
  const jobs = w.stats?.jobsCompleted ?? 0;

  return {
    ...w,
    acceptanceRate: offers ? Math.round(((w.stats.offersAccepted ?? 0) / offers) * 100) : 0,
    onTimeRate: jobs ? Math.round(((w.stats.onTimeCount ?? 0) / jobs) * 100) : 0,
    isBookable:
      w.verification?.status === 'verified' &&
      !!w.availability?.isOnline &&
      !w.availability?.activeBooking,
  };
}

export const decorateWorkers = (list) => list.map(decorateWorker);
