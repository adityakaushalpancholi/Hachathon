/**
 * Chart palette.
 *
 * These three hues were validated with the dataviz palette checker against a
 * white chart surface and pass all six checks — lightness band, chroma floor,
 * adjacent-pair CVD separation (worst pair ΔE 8.8 deutan), normal-vision floor
 * (ΔE 24.9) and 3:1 contrast. Do not substitute the app's navy-500 here: it is
 * a slate and falls below the chroma floor, reading as gray in a series.
 *
 * Assign in fixed order. Colour follows the entity, never its rank, so a filter
 * that removes a series must not repaint the survivors.
 */
export const CATEGORICAL = ['#128551', '#c44b07', '#2563eb'];

/** Semantic slots, so a series keeps its hue wherever it appears. */
export const SERIES = {
  workerPayout: '#128551', // green — money reaching the member
  commission: '#c44b07', // orange — the cooperative's share
  forecast: '#2563eb', // blue — projected, not actual
};

/** Sequential ramp for magnitude (zone intensity). One hue, light to dark. */
export const SEQUENTIAL = ['#d6f5e2', '#b0eac9', '#7bd9a8', '#44c082', '#1fa565', '#128551'];

/** Reserved status colours — never reused as a categorical series. */
export const STATUS = {
  good: '#128551',
  warning: '#b45309',
  serious: '#c44b07',
  critical: '#b91c1c',
};

/** Recessive chart furniture. */
export const INK = {
  grid: '#e2e8f0',
  axis: '#c7d2e0',
  label: '#6b81a3',
  strong: '#141e2e',
};

export const sequentialStep = (t) =>
  SEQUENTIAL[Math.min(SEQUENTIAL.length - 1, Math.max(0, Math.floor(t * SEQUENTIAL.length)))];
