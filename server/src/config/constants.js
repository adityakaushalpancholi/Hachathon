export const ROLES = Object.freeze({
  CUSTOMER: 'customer',
  WORKER: 'worker',
  ADMIN: 'admin',
});

export const VERIFICATION_STATUS = Object.freeze({
  PENDING: 'pending',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
  SUSPENDED: 'suspended',
});

/**
 * Booking lifecycle.
 *
 *   pending ──▶ dispatching ──▶ accepted ──▶ enroute ──▶ arrived
 *                    │                                      │
 *                    ▼                                      ▼
 *                 expired                              in_progress ──▶ completed
 *
 * Any pre-completion state can transition to `cancelled`.
 */
export const BOOKING_STATUS = Object.freeze({
  PENDING: 'pending',
  DISPATCHING: 'dispatching',
  ACCEPTED: 'accepted',
  ENROUTE: 'enroute',
  ARRIVED: 'arrived',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
});

export const BOOKING_STATUS_LIST = Object.values(BOOKING_STATUS);

export const TERMINAL_STATUSES = [
  BOOKING_STATUS.COMPLETED,
  BOOKING_STATUS.CANCELLED,
  BOOKING_STATUS.EXPIRED,
];

/** Legal forward transitions, enforced in the booking service. */
export const STATUS_TRANSITIONS = Object.freeze({
  [BOOKING_STATUS.PENDING]: [BOOKING_STATUS.DISPATCHING, BOOKING_STATUS.CANCELLED],
  [BOOKING_STATUS.DISPATCHING]: [
    BOOKING_STATUS.ACCEPTED,
    BOOKING_STATUS.EXPIRED,
    BOOKING_STATUS.CANCELLED,
  ],
  [BOOKING_STATUS.ACCEPTED]: [BOOKING_STATUS.ENROUTE, BOOKING_STATUS.CANCELLED],
  [BOOKING_STATUS.ENROUTE]: [BOOKING_STATUS.ARRIVED, BOOKING_STATUS.CANCELLED],
  [BOOKING_STATUS.ARRIVED]: [BOOKING_STATUS.IN_PROGRESS, BOOKING_STATUS.CANCELLED],
  [BOOKING_STATUS.IN_PROGRESS]: [BOOKING_STATUS.COMPLETED],
  [BOOKING_STATUS.COMPLETED]: [],
  [BOOKING_STATUS.CANCELLED]: [],
  [BOOKING_STATUS.EXPIRED]: [BOOKING_STATUS.DISPATCHING],
});

export const BOOKING_TYPE = Object.freeze({
  STANDARD: 'standard',
  SCHEDULED: 'scheduled',
  EMERGENCY: 'emergency',
});

export const PAYMENT_METHOD = Object.freeze({
  RAZORPAY: 'razorpay', // card / UPI / netbanking, collected by the gateway
  CASH: 'cash',
  WALLET: 'wallet',
});

export const PAYMENT_STATUS = Object.freeze({
  /** No payment attempt yet — the default for a fresh booking. */
  PENDING: 'pending',
  /** An order exists at the gateway; the customer has not finished paying. */
  CREATED: 'created',
  PAID: 'paid',
  REFUNDED: 'refunded',
  FAILED: 'failed',
});

export const NOTIFICATION_TYPE = Object.freeze({
  JOB_OFFER: 'job_offer',
  BOOKING_UPDATE: 'booking_update',
  PAYMENT: 'payment',
  VERIFICATION: 'verification',
  PAYOUT: 'payout',
  SYSTEM: 'system',
  SOS: 'sos',
});

export const LANGUAGES = ['en', 'hi', 'mr', 'ta', 'bn'];

/** Review tags customers can pick, Urban-Company style. */
export const REVIEW_TAGS = [
  'punctual',
  'polite',
  'skilled',
  'clean_work',
  'fair_price',
  'well_equipped',
  'explained_clearly',
];
