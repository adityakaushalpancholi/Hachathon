/**
 * Booking status presentation, kept in one place so the customer's tracker, the
 * worker's job card and the admin's operations table all speak identically.
 */
export const STATUS_META = {
  pending: { label: 'Finding a member', cls: 'badge-amber', step: 0 },
  dispatching: { label: 'Offering to members', cls: 'badge-amber', step: 1 },
  accepted: { label: 'Accepted', cls: 'badge-coop', step: 2 },
  enroute: { label: 'On the way', cls: 'badge-saffron', step: 3 },
  arrived: { label: 'Arrived', cls: 'badge-saffron', step: 4 },
  in_progress: { label: 'Work in progress', cls: 'badge-saffron', step: 5 },
  completed: { label: 'Completed', cls: 'badge-coop', step: 6 },
  cancelled: { label: 'Cancelled', cls: 'badge-red', step: -1 },
  expired: { label: 'No member found', cls: 'badge-red', step: -1 },
};

/** The happy path, rendered as the tracker's stepper. */
export const TRACK_STEPS = [
  { key: 'pending', label: 'Requested' },
  { key: 'dispatching', label: 'Matching' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'enroute', label: 'On the way' },
  { key: 'arrived', label: 'Arrived' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'completed', label: 'Done' },
];

export const isLive = (status) =>
  ['dispatching', 'accepted', 'enroute', 'arrived', 'in_progress'].includes(status);

export const isTerminal = (status) => ['completed', 'cancelled', 'expired'].includes(status);

/** Which action a worker can take next, given the job's state. */
export const NEXT_WORKER_ACTION = {
  accepted: { key: 'enroute', label: 'Start travelling', tone: 'primary' },
  enroute: { key: 'arrived', label: "I've arrived", tone: 'primary' },
  arrived: { key: 'start', label: 'Start work (needs code)', tone: 'coop' },
  in_progress: { key: 'complete', label: 'Complete job (needs code)', tone: 'coop' },
};

/** Review tags, with the phrasing customers actually see. */
export const REVIEW_TAG_LABELS = {
  punctual: 'On time',
  polite: 'Polite',
  skilled: 'Skilled',
  clean_work: 'Clean work',
  fair_price: 'Fair price',
  well_equipped: 'Well equipped',
  explained_clearly: 'Explained clearly',
};

export const CANCEL_REASONS = [
  'My plans changed',
  'Booked by mistake',
  'Found someone else',
  'Price is too high',
  'Need a different time slot',
];

export const WORKER_DECLINE_REASONS = [
  'Too far from me',
  'Already committed',
  'Outside my skill set',
  'Not enough time before my next job',
];

export const BADGE_LABELS = {
  coop_verified: 'Coop verified',
  top_rated: 'Top rated',
  master_craftsman: 'Master craftsman',
  quick_responder: 'Quick responder',
};
