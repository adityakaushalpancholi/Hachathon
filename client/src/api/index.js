import { http } from './client.js';

/**
 * Endpoint map, grouped by the panel that consumes it.
 *
 * Every call here mirrors a real route on the Express API; there is no mock
 * layer and no localStorage persistence. The grouping is deliberate — it makes
 * the access boundary between the three panels visible in the client too.
 */

/* --------------------------------- auth ---------------------------------- */

export const auth = {
  register: (payload) => http.post('/auth/register', payload, { auth: false }),
  login: (phone, password) => http.post('/auth/login', { phone, password }, { auth: false }),

  // Requires the current password, so a borrowed session cannot lock the owner out.
  changePassword: (payload) => http.post('/auth/password', payload),

  me: () => http.get('/auth/me'),
  updateProfile: (payload) => http.patch('/auth/me', payload),
  addAddress: (payload) => http.post('/auth/addresses', payload),
  deleteAddress: (id) => http.del(`/auth/addresses/${id}`),
};

/* ------------------------- public / shared reads -------------------------- */

export const services = {
  list: (params) => http.get('/services', { params, auth: false }),
  categories: () => http.get('/services/categories', { auth: false }),
  get: (id) => http.get(`/services/${id}`, { auth: false }),
  reviews: (id) => http.get(`/services/${id}/reviews`, { auth: false }),
};

export const workers = {
  list: (params) => http.get('/workers', { params, auth: false }),
  get: (id) => http.get(`/workers/${id}`, { auth: false }),
  nearby: (params) => http.get('/workers/nearby', { params, auth: false }),
};

/** Where the service operates. Public — the address form needs it before sign-in. */
export const areas = {
  list: () => http.get('/areas', { auth: false }),
};

export const cooperatives = {
  list: (params) => http.get('/cooperatives', { params, auth: false }),
  get: (id) => http.get(`/cooperatives/${id}`, { auth: false }),
};

export const notifications = {
  list: () => http.get('/notifications'),
  markRead: (id) => http.post(`/notifications/${id}/read`),
  markAllRead: () => http.post('/notifications/read-all'),
};

export const insights = {
  forecast: (params) => http.get('/insights/forecast', { params }),
  profiles: (params) => http.get('/insights/profiles', { params }),
  gaps: () => http.get('/insights/gaps'),
  trend: (params) => http.get('/insights/trend', { params }),
  zones: (params) => http.get('/insights/zones', { params }),
  surge: (params) => http.get('/insights/surge', { params }),
};

/* ----------------------------- CUSTOMER panel ----------------------------- */

export const bookings = {
  dashboard: () => http.get('/bookings/dashboard'),
  list: (params) => http.get('/bookings', { params }),
  get: (id) => http.get(`/bookings/${id}`),
  track: (id) => http.get(`/bookings/${id}/track`),
  quote: (payload) => http.post('/bookings/quote', payload),
  create: (payload) => http.post('/bookings', payload),
  cancel: (id, reason) => http.post(`/bookings/${id}/cancel`, { reason }),
  retry: (id) => http.post(`/bookings/${id}/retry`),
  pay: (id, method) => http.post(`/bookings/${id}/pay`, { method }),
  sos: (id) => http.post(`/bookings/${id}/sos`),
};

export const reviews = {
  mine: () => http.get('/reviews/mine'),
  forWorker: (id) => http.get(`/reviews/worker/${id}`, { auth: false }),
  create: (payload) => http.post('/reviews', payload),
};

/* ------------------------------ WORKER panel ------------------------------ */

export const workerPanel = {
  dashboard: () => http.get('/workers/me/dashboard'),
  earnings: () => http.get('/workers/me/earnings'),
  offers: () => http.get('/workers/me/offers'),
  setAvailability: (payload) => http.patch('/workers/me/availability', payload),
  updateProfile: (payload) => http.patch('/workers/me/profile', payload),
  pingLocation: (location) => http.post('/workers/me/location', { location }),

  accept: (id) => http.post(`/workers/me/offers/${id}/accept`),
  decline: (id, reason) => http.post(`/workers/me/offers/${id}/decline`, { reason }),

  enroute: (id) => http.post(`/workers/me/jobs/${id}/enroute`),
  arrived: (id) => http.post(`/workers/me/jobs/${id}/arrived`),
  start: (id, code) => http.post(`/workers/me/jobs/${id}/start`, { code }),
  complete: (id, code) => http.post(`/workers/me/jobs/${id}/complete`, { code }),
  cancelJob: (id, reason) => http.post(`/workers/me/jobs/${id}/cancel`, { reason }),

  respondToReview: (id, text) => http.post(`/workers/me/reviews/${id}/respond`, { text }),
};

/* ------------------------------- ADMIN panel ------------------------------ */

export const admin = {
  overview: () => http.get('/admin/overview'),
  workers: (params) => http.get('/admin/workers', { params }),
  setVerification: (id, payload) => http.patch(`/admin/workers/${id}/verification`, payload),
  reviewDocument: (id, docId, payload) => http.patch(`/admin/workers/${id}/documents/${docId}`, payload),

  bookings: (params) => http.get('/admin/bookings', { params }),

  sos: () => http.get('/admin/sos'),
  resolveSos: (id, reason) => http.post(`/admin/sos/${id}/resolve`, { reason }),

  previewSettlement: (payload) => http.post('/admin/settlements/preview', payload ?? {}),
  runSettlement: (payload) => http.post('/admin/settlements/run', payload ?? {}),
  payouts: () => http.get('/admin/payouts'),
  approvePayout: (id) => http.post(`/admin/payouts/${id}/approve`),

  workforce: () => http.get('/admin/workforce'),
  heatmap: (params) => http.get('/admin/heatmap', { params }),
  flaggedReviews: () => http.get('/admin/reviews/flagged'),
};

/* ----------------------------- DATABASE panel ----------------------------- */
/* Owner-only. Every route here is refused with 403 for an admin who is not on
   the deployment's OWNER_PHONES list, so the UI gate is a convenience, not the
   control.                                                                    */

/**
 * Razorpay. `config` is public so the client can decide whether to render a Pay
 * button before anyone signs in; `verify` is what actually settles a booking,
 * and the server checks the gateway's signature rather than trusting this call.
 */
export const payments = {
  config: () => http.get('/payments/config', { auth: false }),
  createOrder: (bookingId) => http.post('/payments/order', { bookingId }),
  verify: (payload) => http.post('/payments/verify', payload),
  forBooking: (id) => http.get(`/payments/booking/${id}`),
};

export const database = {
  overview: () => http.get('/database'),
  config: () => http.get('/database/config'),
  list: (collection, params) => http.get(`/database/${collection}`, { params }),
  get: (collection, id) => http.get(`/database/${collection}/${id}`),
  indexes: (collection) => http.get(`/database/${collection}/indexes`),
  remove: (collection, id) => http.del(`/database/${collection}/${id}`),
};

export { ApiError, tokenStore, onUnauthorized } from './client.js';
