import { asyncHandler } from '../utils/ApiError.js';
import { ok, created } from '../utils/respond.js';
import {
  createOrder,
  verifyPayment,
  handleWebhook,
  paymentConfig,
} from '../services/payment.service.js';
import { Payment } from '../models/index.js';

/**
 * What the client needs to decide whether to show a Pay button at all.
 *
 * `keyId` is a publishable identifier — Razorpay Checkout needs it in the
 * browser and it grants nothing on its own. The key *secret* never leaves the
 * server, and no route returns it.
 */
export const config = asyncHandler(async (_req, res) => ok(res, paymentConfig()));

export const order = asyncHandler(async (req, res) => {
  const { order: record, keyId, booking } = await createOrder({
    bookingId: req.body.bookingId,
    user: req.user,
  });

  return created(res, {
    orderId: record.orderId,
    amount: record.amount,
    currency: record.currency,
    keyId,
    booking: { id: booking._id, code: booking.code, total: booking.pricing.total },
    // Prefills Checkout so the customer is not retyping what we already hold.
    prefill: {
      name: req.user.name,
      contact: req.user.phone,
      email: req.user.email || undefined,
    },
  });
});

export const verify = asyncHandler(async (req, res) => {
  const { payment, booking } = await verifyPayment({
    orderId: req.body.razorpay_order_id,
    paymentId: req.body.razorpay_payment_id,
    signature: req.body.razorpay_signature,
    user: req.user,
  });

  return ok(res, {
    status: payment.status,
    paidAt: payment.paidAt,
    booking: booking ? { id: booking._id, code: booking.code, payment: booking.payment } : null,
  });
});

/**
 * Razorpay calls this directly, so there is no session to authenticate with —
 * the signature over the raw body is the credential. A failure here must not
 * leak detail, hence the flat acknowledgement either way.
 */
export const webhook = asyncHandler(async (req, res) => {
  const result = await handleWebhook({
    rawBody: req.body, // express.raw() — a Buffer, byte-for-byte as sent
    signature: req.get('x-razorpay-signature'),
  });

  return ok(res, result);
});

/** The customer's own payment history for one booking. */
export const forBooking = asyncHandler(async (req, res) => {
  const payments = await Payment.find({ booking: req.params.id, user: req.user._id })
    .select('-signature')
    .sort({ createdAt: -1 })
    .lean();

  return ok(res, payments);
});
