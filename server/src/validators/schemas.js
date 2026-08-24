import { z } from 'zod';
import {
  BOOKING_STATUS_LIST,
  BOOKING_TYPE,
  PAYMENT_METHOD,
  REVIEW_TAGS,
  LANGUAGES,
  ROLES,
} from '../config/constants.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'must be a valid id');
const phone = z.string().regex(/^[6-9]\d{9}$/, 'must be a 10-digit Indian mobile number');
const coerceNum = (schema) => z.preprocess((v) => (v === '' || v == null ? undefined : Number(v)), schema);
const coerceBool = z.preprocess(
  (v) => (typeof v === 'string' ? v === 'true' : v),
  z.boolean(),
);

const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const addressSchema = z.object({
  label: z.string().max(40).optional(),
  line1: z.string().min(3).max(200),
  landmark: z.string().max(120).optional(),
  city: z.string().min(2).max(80),
  state: z.string().max(80).optional(),
  pincode: z.string().regex(/^\d{6}$/).optional(),
  zone: z.string().max(60).optional(),
  location: locationSchema,
});

/* ------------------------------- auth ------------------------------- */

export const registerSchema = z.object({
  name: z.string().min(2).max(80),
  phone,
  email: z.string().email().optional(),
  password: z.string().min(6, 'password must be at least 6 characters').max(72),
  role: z.enum([ROLES.CUSTOMER, ROLES.WORKER]).default(ROLES.CUSTOMER),
  language: z.enum(LANGUAGES).optional(),
  // Worker sign-up extras
  cooperativeId: objectId.optional(),
  skillTags: z.array(z.string()).optional(),
  hourlyRate: z.number().min(0).optional(),
  experienceYears: z.number().min(0).max(60).optional(),
  location: locationSchema.optional(),
  city: z.string().optional(),
});

export const loginSchema = z.object({
  phone,
  password: z.string().min(1, 'password is required'),
});

export const otpRequestSchema = z.object({ phone });

export const otpVerifySchema = z.object({
  phone,
  code: z.string().regex(/^\d{4,8}$/, 'code must be the digits sent to your phone'),
  // Consulted only when the code registers a brand-new number.
  name: z.string().min(2).max(80).optional(),
});

export const updateProfileSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  email: z.string().email().optional(),
  language: z.enum(LANGUAGES).optional(),
  avatar: z.string().url().optional(),
});

export const addAddressSchema = addressSchema.extend({
  isDefault: z.boolean().optional(),
});

/* ----------------------------- services ----------------------------- */

export const listServicesQuery = z.object({
  q: z.string().max(80).optional(),
  category: z.string().max(60).optional(),
  emergency: coerceBool.optional(),
  page: coerceNum(z.number().int().min(1)).default(1),
  limit: coerceNum(z.number().int().min(1).max(50)).default(20),
});

/* ------------------------------ workers ----------------------------- */

export const nearbyQuery = z.object({
  lat: coerceNum(z.number().min(-90).max(90)),
  lng: coerceNum(z.number().min(-180).max(180)),
  skillTag: z.string().max(60).optional(),
  radiusKm: coerceNum(z.number().min(0.5).max(50)).default(8),
  limit: coerceNum(z.number().int().min(1).max(50)).default(20),
  online: coerceBool.optional(),
  emergency: coerceBool.optional(),
});

export const listWorkersQuery = z.object({
  q: z.string().max(80).optional(),
  skillTag: z.string().max(60).optional(),
  city: z.string().max(80).optional(),
  status: z.enum(['pending', 'verified', 'rejected', 'suspended']).optional(),
  minRating: coerceNum(z.number().min(0).max(5)).optional(),
  sort: z.enum(['rating', 'experience', 'jobs', 'rate_asc', 'rate_desc']).default('rating'),
  page: coerceNum(z.number().int().min(1)).default(1),
  limit: coerceNum(z.number().int().min(1).max(50)).default(12),
});

export const availabilitySchema = z.object({
  isOnline: z.boolean().optional(),
  acceptsEmergency: z.boolean().optional(),
  serviceRadiusKm: z.number().min(1).max(50).optional(),
  location: locationSchema.optional(),
});

export const verifyWorkerSchema = z.object({
  status: z.enum(['verified', 'rejected', 'suspended', 'pending']),
  note: z.string().max(500).optional(),
  backgroundCheckClear: z.boolean().optional(),
});

/* ----------------------------- bookings ----------------------------- */

export const quoteSchema = z.object({
  serviceId: objectId,
  packageName: z.string().max(80).optional(),
  location: locationSchema,
  zone: z.string().max(60).optional(),
  city: z.string().max(80).optional(),
  type: z.enum(Object.values(BOOKING_TYPE)).default(BOOKING_TYPE.STANDARD),
  couponCode: z.string().max(20).optional(),
  addOns: z.array(z.object({ name: z.string(), price: z.number().min(0) })).default([]),
});

export const createBookingSchema = z.object({
  serviceId: objectId,
  packageName: z.string().max(80).optional(),
  address: addressSchema,
  scheduledFor: z.string().datetime().optional(),
  type: z.enum(Object.values(BOOKING_TYPE)).default(BOOKING_TYPE.STANDARD),
  notes: z.string().max(500).optional(),
  couponCode: z.string().max(20).optional(),
  addOns: z.array(z.object({ name: z.string(), price: z.number().min(0) })).default([]),
  paymentMethod: z.enum(Object.values(PAYMENT_METHOD)).default(PAYMENT_METHOD.UPI),
  preferredWorkerId: objectId.optional(),
});

export const listBookingsQuery = z.object({
  status: z.enum(BOOKING_STATUS_LIST).optional(),
  live: coerceBool.optional(),
  page: coerceNum(z.number().int().min(1)).default(1),
  limit: coerceNum(z.number().int().min(1).max(50)).default(20),
});

export const otpSchema = z.object({
  code: z.string().regex(/^\d{4}$/, 'code must be 4 digits'),
});

export const cancelSchema = z.object({
  reason: z.string().min(3).max(300),
});

export const declineSchema = z.object({
  reason: z.string().max(200).optional(),
});

export const idParam = z.object({ id: objectId });

/* ------------------------------ reviews ----------------------------- */

export const createReviewSchema = z.object({
  bookingId: objectId,
  rating: z.number().int().min(1).max(5),
  tags: z.array(z.enum(REVIEW_TAGS)).max(7).default([]),
  comment: z.string().max(1000).optional(),
});

export const respondReviewSchema = z.object({
  text: z.string().min(1).max(500),
});

/* ----------------------------- insights ----------------------------- */

export const forecastQuery = z.object({
  skillTag: z.string().max(60).optional(),
  zone: z.string().max(60).optional(),
  horizonHours: coerceNum(z.number().int().min(1).max(72)).default(24),
});

export const trendQuery = z.object({
  days: coerceNum(z.number().int().min(1).max(90)).default(14),
});

/* ------------------------------ payouts ----------------------------- */

export const settlementSchema = z.object({
  cooperativeId: objectId,
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const paymentSchema = z.object({
  method: z.enum(Object.values(PAYMENT_METHOD)),
});

export { objectId, locationSchema, addressSchema };
