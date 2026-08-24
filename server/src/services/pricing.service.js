import { Booking, Worker } from '../models/index.js';
import { env } from '../config/env.js';
import { BOOKING_STATUS, BOOKING_TYPE } from '../config/constants.js';

/**
 * Demand-responsive pricing.
 *
 * The ratio that matters is live demand (open jobs in the zone for this skill)
 * against live supply (verified, online, unoccupied workers). Rapido and its
 * peers use the same signal; what differs here is the ceiling — the multiplier
 * is capped by the cooperative's `surgeCeiling`, voted on by members, and the
 * uplift flows to the worker's payout rather than to platform margin.
 */
export async function computeSurge({ skillTag, zone, city, cooperative }) {
  const since = new Date(Date.now() - 45 * 60_000);

  const [openDemand, availableSupply] = await Promise.all([
    Booking.countDocuments({
      skillTag,
      createdAt: { $gte: since },
      status: {
        $in: [BOOKING_STATUS.PENDING, BOOKING_STATUS.DISPATCHING, BOOKING_STATUS.ACCEPTED],
      },
      ...(zone ? { 'address.zone': zone } : {}),
    }),
    Worker.countDocuments({
      'skills.skillTag': skillTag,
      'verification.status': 'verified',
      'availability.isOnline': true,
      'availability.activeBooking': null,
      ...(city ? { city } : {}),
    }),
  ]);

  const ceiling = cooperative?.governance?.surgeCeiling ?? env.surgeMax;

  // No supply at all is not an excuse to price-gouge — hold at the ceiling.
  if (availableSupply === 0) {
    return { multiplier: openDemand > 0 ? ceiling : env.surgeMin, openDemand, availableSupply, reason: 'no_supply' };
  }

  const ratio = openDemand / availableSupply;

  // Below parity there is no scarcity; above it, scale gently (sqrt) so a single
  // extra booking cannot spike the price.
  let multiplier = ratio <= 1 ? env.surgeMin : env.surgeMin + Math.sqrt(ratio - 1) * 0.45;

  multiplier = Math.min(ceiling, Math.max(env.surgeMin, multiplier));
  multiplier = Math.round(multiplier * 20) / 20; // nearest 0.05, so it reads cleanly

  return {
    multiplier,
    openDemand,
    availableSupply,
    reason: multiplier > 1 ? 'high_demand' : 'normal',
  };
}

/** Coupon rules. In production these would be documents; the logic is unchanged. */
const COUPONS = {
  FIRST50: { type: 'percent', value: 0.5, cap: 150, label: 'First booking - 50% off' },
  COOP100: { type: 'flat', value: 100, label: 'Cooperative member credit' },
  MONSOON20: { type: 'percent', value: 0.2, cap: 200, label: 'Monsoon repair offer' },
};

export function applyCoupon(code, subtotal) {
  if (!code) return { discount: 0, couponCode: undefined, label: null };
  const coupon = COUPONS[code.toUpperCase()];
  if (!coupon) return { discount: 0, couponCode: undefined, label: null, invalid: true };

  const raw = coupon.type === 'percent' ? subtotal * coupon.value : coupon.value;
  const discount = Math.min(Math.round(raw), coupon.cap ?? raw, subtotal);
  return { discount, couponCode: code.toUpperCase(), label: coupon.label };
}

/**
 * Build the full price breakdown for a booking.
 *
 * Every rupee is accounted for and returned to the caller, because the
 * transparency of the split is the product: the customer sees exactly how much
 * reaches the worker, and how much the cooperative retains.
 */
export function buildPricing({
  basePrice,
  surgeMultiplier = 1,
  emergencySurcharge = 0,
  addOns = [],
  couponCode,
  cooperative,
}) {
  const base = Math.round(basePrice);
  const surgeAmount = Math.round(base * (surgeMultiplier - 1));
  const addOnTotal = addOns.reduce((sum, a) => sum + Number(a.price || 0), 0);

  const preDiscount = base + surgeAmount + emergencySurcharge + addOnTotal;
  const { discount, couponCode: applied, label } = applyCoupon(couponCode, preDiscount);
  const subtotal = preDiscount - discount;

  const commissionPct = cooperative?.governance?.commissionPct ?? env.coopCommissionPct;
  const platformFee = Math.round(subtotal * env.platformFeePct);
  const coopCommission = Math.round(subtotal * commissionPct);
  const workerPayout = subtotal - platformFee - coopCommission;

  return {
    base,
    surgeMultiplier,
    surgeAmount,
    emergencySurcharge,
    addOns,
    discount,
    couponCode: applied,
    couponLabel: label,
    subtotal,
    platformFee,
    coopCommission,
    workerPayout,
    total: subtotal, // customer pays subtotal; fees are deducted from it, not added
    currency: 'INR',
    // Surfaced verbatim in the UI's "where your money goes" panel.
    split: {
      workerPct: subtotal ? Math.round((workerPayout / subtotal) * 100) : 0,
      coopPct: subtotal ? Math.round((coopCommission / subtotal) * 100) : 0,
      platformPct: subtotal ? Math.round((platformFee / subtotal) * 100) : 0,
    },
  };
}

/** Cancellation fee ladder — free early, partial once a worker is committed. */
export function cancellationFee(booking) {
  const { status, pricing } = booking;
  if ([BOOKING_STATUS.PENDING, BOOKING_STATUS.DISPATCHING].includes(status)) return 0;
  if (status === BOOKING_STATUS.ACCEPTED) return Math.round(pricing.total * 0.05);
  if ([BOOKING_STATUS.ENROUTE, BOOKING_STATUS.ARRIVED].includes(status)) {
    return Math.round(pricing.total * 0.15); // compensates travel already made
  }
  return Math.round(pricing.total * 0.25);
}

export function emergencySurchargeFor(service, type) {
  if (type !== BOOKING_TYPE.EMERGENCY) return 0;
  return service.emergencySurcharge || Math.round(service.basePrice * 0.25);
}
