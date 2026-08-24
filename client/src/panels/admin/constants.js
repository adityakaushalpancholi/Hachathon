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
    body: 'Demand is outrunning the members you have. Requests are going unmatched.',
  },
  train_existing_members: {
    label: 'Retrain members',
    cls: 'badge-amber',
    body: 'Under pressure. Cross-training existing members is faster than recruiting.',
  },
  balanced: {
    label: 'Balanced',
    cls: 'badge-coop',
    body: 'Supply is keeping pace with demand.',
  },
  oversupplied: {
    label: 'Oversupplied',
    cls: 'badge-navy',
    body: 'More members than work. Consider marketing this trade, or redeploying members.',
  },
};
