import crypto from 'node:crypto';
import { Payment, Booking } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { BOOKING_STATUS, PAYMENT_METHOD, PAYMENT_STATUS } from '../config/constants.js';

const RAZORPAY_API = 'https://api.razorpay.com/v1';

/** Rupees to paise. The gateway counts in the smallest unit and so do we. */
const toPaise = (rupees) => Math.round(Number(rupees) * 100);

const authHeader = () =>
  `Basic ${Buffer.from(`${env.razorpay.keyId}:${env.razorpay.keySecret}`).toString('base64')}`;

/** Is the gateway usable at all? Checked before every call so the error is clear. */
export const paymentsEnabled = () => env.razorpay.configured;

function requireGateway() {
  if (!paymentsEnabled()) {
    throw new ApiError(
      503,
      'Online payment is not configured on this deployment. Pay the professional directly on completion.',
    );
  }
}

/**
 * Talk to Razorpay over plain fetch rather than the SDK.
 *
 * Two endpoints and an HMAC check is the whole surface used here, and a
 * dependency that ships its own HTTP stack and retry policy is more to audit
 * than it saves. Node has had `fetch` built in since 18.
 */
async function callRazorpay(path, { method = 'POST', body } = {}) {
  let response;
  try {
    response = await fetch(`${RAZORPAY_API}${path}`, {
      method,
      headers: {
        Authorization: authHeader(),
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    // A network fault is ours to report honestly — never a silent "paid".
    logger.error('razorpay request failed', err.message);
    throw new ApiError(502, 'Could not reach the payment gateway. Please try again.');
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload?.error?.description || 'The payment gateway rejected the request';
    logger.error(`razorpay ${path} → ${response.status}: ${message}`);
    throw new ApiError(response.status === 400 ? 400 : 502, message);
  }

  return payload;
}

/**
 * Open an order for a booking.
 *
 * The amount comes from the stored booking, never from the request body — a
 * client that could name its own price would be the whole vulnerability. An
 * existing unpaid order is reused rather than duplicated, so a customer who
 * reloads the checkout does not leave a trail of dangling orders.
 */
export async function createOrder({ bookingId, user }) {
  requireGateway();

  const booking = await Booking.findOne({ _id: bookingId, customer: user._id });
  if (!booking) throw ApiError.notFound('Booking not found');

  if (booking.payment?.status === PAYMENT_STATUS.PAID) {
    throw ApiError.badRequest('This booking is already paid');
  }
  if (booking.status === BOOKING_STATUS.CANCELLED) {
    throw ApiError.badRequest('This booking was cancelled');
  }

  const amount = toPaise(booking.pricing.total);
  if (amount <= 0) throw ApiError.badRequest('This booking has nothing to pay');

  const existing = await Payment.findOne({
    booking: booking._id,
    status: PAYMENT_STATUS.CREATED,
    amount,
  });
  if (existing) {
    return { order: existing, keyId: env.razorpay.keyId, booking };
  }

  const order = await callRazorpay('/orders', {
    body: {
      amount,
      currency: 'INR',
      // Razorpay caps this at 40 characters and requires uniqueness.
      receipt: booking.code.slice(0, 40),
      notes: { bookingId: String(booking._id), bookingCode: booking.code },
    },
  });

  const record = await Payment.create({
    booking: booking._id,
    user: user._id,
    amount,
    currency: 'INR',
    orderId: order.id,
    status: PAYMENT_STATUS.CREATED,
  });

  return { order: record, keyId: env.razorpay.keyId, booking };
}

/**
 * Verify the signature Checkout hands back, and only then mark the booking paid.
 *
 * This is the load-bearing step. Checkout runs in the customer's browser, so
 * everything it returns is attacker-controlled; what makes it trustworthy is
 * the HMAC, which only someone holding the key secret can produce. Comparing it
 * with `timingSafeEqual` keeps the comparison from leaking the expected value
 * one byte at a time.
 */
export async function verifyPayment({ orderId, paymentId, signature, user }) {
  requireGateway();

  const record = await Payment.findOne({ orderId, user: user._id });
  if (!record) throw ApiError.notFound('No such payment');

  const expected = crypto
    .createHmac('sha256', env.razorpay.keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  const given = Buffer.from(String(signature ?? ''), 'utf8');
  const want = Buffer.from(expected, 'utf8');

  const valid = given.length === want.length && crypto.timingSafeEqual(given, want);

  if (!valid) {
    record.status = PAYMENT_STATUS.FAILED;
    record.failureReason = 'Signature did not verify';
    await record.save();
    throw ApiError.badRequest('This payment could not be verified');
  }

  record.paymentId = paymentId;
  record.signature = signature;
  record.status = PAYMENT_STATUS.PAID;
  record.paidAt = new Date();
  await record.save();

  const booking = await Booking.findById(record.booking);
  if (booking) {
    booking.payment.status = PAYMENT_STATUS.PAID;
    booking.payment.method = PAYMENT_METHOD.RAZORPAY;
    booking.payment.txnId = paymentId;
    booking.payment.paidAt = record.paidAt;
    await booking.save();
  }

  return { payment: record, booking };
}

/**
 * Razorpay's own callback, verified against the webhook secret.
 *
 * The browser can be closed the instant after paying, so the redirect back is
 * not a reliable notification. This is the path that is actually guaranteed to
 * arrive, which is why it is allowed to settle a booking on its own.
 */
export async function handleWebhook({ rawBody, signature }) {
  if (!env.razorpay.webhookSecret) {
    throw new ApiError(503, 'No webhook secret is configured');
  }

  const expected = crypto
    .createHmac('sha256', env.razorpay.webhookSecret)
    .update(rawBody)
    .digest('hex');

  const given = Buffer.from(String(signature ?? ''), 'utf8');
  const want = Buffer.from(expected, 'utf8');

  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) {
    throw ApiError.unauthorized('Webhook signature did not verify');
  }

  const event = JSON.parse(rawBody.toString('utf8'));
  const entity = event?.payload?.payment?.entity;
  if (!entity?.order_id) return { handled: false };

  const record = await Payment.findOne({ orderId: entity.order_id });
  if (!record) return { handled: false };

  // Never walk a settled payment backwards on a late or duplicated event.
  if (record.status === PAYMENT_STATUS.PAID && event.event !== 'refund.processed') {
    return { handled: true, duplicate: true };
  }

  if (event.event === 'payment.captured') {
    record.status = PAYMENT_STATUS.PAID;
    record.paymentId = entity.id;
    record.method = entity.method;
    record.paidAt = new Date();
    await Booking.updateOne(
      { _id: record.booking },
      {
        $set: {
          'payment.status': PAYMENT_STATUS.PAID,
          'payment.method': PAYMENT_METHOD.RAZORPAY,
          'payment.txnId': entity.id,
          'payment.paidAt': record.paidAt,
        },
      },
    );
  } else if (event.event === 'payment.failed') {
    record.status = PAYMENT_STATUS.FAILED;
    record.failureReason = entity.error_description?.slice(0, 300) || 'Payment failed';
  } else if (event.event === 'refund.processed') {
    record.status = PAYMENT_STATUS.REFUNDED;
    record.refundedAt = new Date();
  }

  await record.save();
  return { handled: true };
}

/** Told to the client on boot so it can hide what it cannot offer. */
export function paymentConfig() {
  return {
    enabled: paymentsEnabled(),
    provider: 'razorpay',
    keyId: env.razorpay.keyId || null,
    currency: 'INR',
  };
}

export function warnIfNoGateway() {
  if (!paymentsEnabled()) {
    logger.warn(
      'RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET unset — online payment is disabled; bookings settle on completion',
    );
  }
}
