import { useState, useId } from 'react';
import { INK } from './tokens.js';

/**
 * Vertical bar chart, single-series or stacked.
 *
 * Marks are thin with 4px rounded tops anchored to the baseline; stacked
 * segments carry a 2px surface gap so adjacent fills never merge. Values are
 * direct-labelled only on the extremes — never one number per bar.
 *
 * `series`: [{ key, label, color }]
 * `data`:   [{ label, [key]: number, ... }]
 */
export default function BarChart({
  data,
  series,
  height = 200,
  format = (v) => v,
  yLabel,
  highlightMax = true,
  emptyMessage = 'No data yet',
}) {
  const [hover, setHover] = useState(null);
  const clipId = useId();

  if (!data?.length) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center rounded-lg border border-dashed border-navy-200 text-sm text-navy-400"
      >
        {emptyMessage}
      </div>
    );
  }

  const totals = data.map((d) => series.reduce((s, ser) => s + (Number(d[ser.key]) || 0), 0));
  const max = Math.max(...totals, 1);
  const maxIdx = totals.indexOf(Math.max(...totals));

  // Geometry in percentage space, so the chart is fluid without a resize observer.
  const slot = 100 / data.length;
  const barW = Math.min(60, slot * 0.62);

  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  return (
    <figure className="w-full">
      <div className="relative" style={{ height }}>
        {/* Recessive gridlines with a value axis */}
        <div className="absolute inset-0 flex flex-col-reverse justify-between">
          {gridLines.map((g) => (
            <div key={g} className="flex items-center gap-2">
              <span
                className="tnum w-12 shrink-0 text-right text-[10px] tabular-nums"
                style={{ color: INK.label }}
              >
                {g === 0 ? '' : format(Math.round(max * g))}
              </span>
              <span className="h-px flex-1" style={{ background: INK.grid }} />
            </div>
          ))}
        </div>

        {/* Bars */}
        <div className="absolute inset-0 ml-14 flex items-end">
          {data.map((d, i) => {
            const total = totals[i];
            const isHover = hover === i;
            const isMax = highlightMax && i === maxIdx && total > 0;

            return (
              <div
                key={i}
                className="relative flex h-full flex-1 cursor-pointer items-end justify-center"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                <div
                  className="relative flex flex-col-reverse transition-opacity"
                  style={{
                    width: `${barW}%`,
                    height: `${(total / max) * 100}%`,
                    minHeight: total > 0 ? 3 : 0,
                    opacity: hover == null || isHover ? 1 : 0.45,
                  }}
                >
                  {series.map((ser, si) => {
                    const v = Number(d[ser.key]) || 0;
                    if (!v) return null;
                    const isTop = si === series.length - 1 || !series.slice(si + 1).some((s) => d[s.key]);

                    return (
                      <div
                        key={ser.key}
                        style={{
                          height: `${(v / total) * 100}%`,
                          background: ser.color,
                          // 2px surface gap between stacked segments
                          marginTop: si > 0 ? 2 : 0,
                          borderTopLeftRadius: isTop ? 4 : 0,
                          borderTopRightRadius: isTop ? 4 : 0,
                        }}
                      />
                    );
                  })}
                </div>

                {/* Direct label on the peak only */}
                {isMax && !isHover && (
                  <span
                    className="tnum pointer-events-none absolute -top-1 text-[10px] font-bold"
                    style={{
                      bottom: `calc(${(total / max) * 100}% + 4px)`,
                      top: 'auto',
                      color: INK.strong,
                    }}
                  >
                    {format(total)}
                  </span>
                )}

                {/* Hover tooltip */}
                {isHover && (
                  <div
                    className="pointer-events-none absolute bottom-full z-10 mb-2 min-w-max -translate-x-1/2 rounded-lg border border-navy-200 bg-white px-2.5 py-2 shadow-lift"
                    style={{ left: '50%' }}
                  >
                    <p className="text-[11px] font-bold text-navy-900">{d.label}</p>
                    {series.map((ser) => (
                      <p
                        key={ser.key}
                        className="mt-0.5 flex items-center gap-1.5 whitespace-nowrap text-[11px] text-navy-600"
                      >
                        <span
                          className="h-2 w-2 shrink-0 rounded-sm"
                          style={{ background: ser.color }}
                        />
                        {ser.label}
                        <span className="tnum ml-auto pl-2 font-semibold text-navy-900">
                          {format(Number(d[ser.key]) || 0)}
                        </span>
                      </p>
                    ))}
                    {series.length > 1 && (
                      <p className="tnum mt-1 border-t border-navy-100 pt-1 text-[11px] font-bold text-navy-900">
                        Total {format(total)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* X axis — thinned so labels never collide */}
      <div className="ml-14 mt-1.5 flex">
        {data.map((d, i) => {
          const every = Math.ceil(data.length / 8);
          return (
            <span
              key={i}
              className="flex-1 truncate text-center text-[10px]"
              style={{ color: INK.label }}
            >
              {i % every === 0 ? d.label : ''}
            </span>
          );
        })}
      </div>

      {/* Legend — always present for 2+ series, never for one */}
      {series.length > 1 && (
        <figcaption className="ml-14 mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {series.map((ser) => (
            <span key={ser.key} className="flex items-center gap-1.5 text-xs text-navy-600">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: ser.color }} />
              {ser.label}
            </span>
          ))}
        </figcaption>
      )}

      {yLabel && (
        <p className="ml-14 mt-1 text-[10px]" style={{ color: INK.label }}>
          {yLabel}
        </p>
      )}
    </figure>
  );
}
