/** Status filters offered on the operations table. */
export const BOOKING_FILTERS = [
  { value: 'dispatching', label: 'Matching' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'expired', label: 'Unmatched' },
];

/** How a workforce recommendation is presented to the board. */
export const RECOMMENDATION_META = {
  recruit_urgently: {
    label: 'Recruit now',
    cls: 'badge-red',
    body: 'Demand is outrunning the professionals you have. Requests are going unmatched.',
  },
  train_existing_members: {
    label: 'Retrain staff',
    cls: 'badge-amber',
    body: 'Under pressure. Cross-training the professionals you have is faster than recruiting.',
  },
  balanced: {
    label: 'Balanced',
    cls: 'badge-coop',
    body: 'Supply is keeping pace with demand.',
  },
  oversupplied: {
    label: 'Oversupplied',
    cls: 'badge-navy',
    body: 'More professionals than work. Consider marketing this trade, or redeploying them.',
  },
};
