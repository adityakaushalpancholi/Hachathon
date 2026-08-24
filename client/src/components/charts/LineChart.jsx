import { useState, useMemo, useId } from 'react';
import { INK } from './tokens.js';

/**
 * Line/area chart with a crosshair tooltip.
 *
 * One series only — this renders a forecast, and a second scale on the same
 * axes would be a dual-axis chart. Two measures of different scale belong in
 * two charts, never one.
 *
 * `data`: [{ label, value, confidence? }]
 */
export default function LineChart({
  data,
  color = '#2563eb',
  height = 200,
  format = (v) => v,
  showArea = true,
  showConfidence = false,
  emptyMessage = 'No data yet',
}) {
  const [hover, setHover] = useState(null);
  const gradId = useId();

  const W = 600;
  const H = 200;
  const PAD = { top: 12, right: 8, bottom: 8, left: 8 };

  const { points, path, areaPath, max } = useMemo(() => {
    if (!data?.length) return { points: [], path: '', areaPath: '', max: 1 };

    const maxV = Math.max(...data.map((d) => d.value), 1);
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;

    const pts = data.map((d, i) => ({
      ...d,
      x: PAD.left + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW),
      y: PAD.top + innerH - (d.value / maxV) * innerH,
    }));

    const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const area = `${line} L${pts.at(-1).x.toFixed(1)},${H - PAD.bottom} L${pts[0].x.toFixed(1)},${H - PAD.bottom} Z`;

    return { points: pts, path: line, areaPath: area, max: maxV };
  }, [data]);

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

  const active = hover != null ? points[hover] : null;

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    // Snap to the nearest point rather than interpolating — the reader is
    // asking about a specific hour, not a position on the line.
    let nearest = 0;
    let best = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(p.x - x);
      if (d < best) {
        best = d;
        nearest = i;
      }
    });
    setHover(nearest);
  };

  return (
    <figure className="w-full">
      <div className="relative" style={{ height }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="h-full w-full"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          role="img"
          aria-label="Trend chart"
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.18" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Recessive gridlines */}
          {[0, 0.5, 1].map((g) => (
            <line
              key={g}
              x1={PAD.left}
              x2={W - PAD.right}
              y1={PAD.top + (H - PAD.top - PAD.bottom) * g}
              y2={PAD.top + (H - PAD.top - PAD.bottom) * g}
              stroke={INK.grid}
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {showArea && <path d={areaPath} fill={`url(#${gradId})`} />}

          <path
            d={path}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />

          {/* Crosshair */}
          {active && (
            <>
              <line
                x1={active.x}
                x2={active.x}
                y1={PAD.top}
                y2={H - PAD.bottom}
                stroke={INK.axis}
                strokeWidth="1"
                strokeDasharray="3 3"
                vectorEffect="non-scaling-stroke"
              />
              {/* 2px surface ring so the marker reads over the line */}
              <circle cx={active.x} cy={active.y} r="5" fill="#fff" />
              <circle cx={active.x} cy={active.y} r="4" fill={color} />
            </>
          )}
        </svg>

        {/* Tooltip in HTML, so text is not scaled by preserveAspectRatio="none" */}
        {active && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-navy-200 bg-white px-2.5 py-2 shadow-lift"
            style={{
              left: `${(active.x / W) * 100}%`,
              top: 0,
            }}
          >
            <p className="text-[11px] font-bold text-navy-900">{active.label}</p>
            <p className="tnum mt-0.5 flex items-center gap-1.5 whitespace-nowrap text-[11px] text-navy-600">
              <span className="h-2 w-2 rounded-sm" style={{ background: color }} />
              {format(active.value)}
            </p>
            {showConfidence && active.confidence != null && (
              <p className="mt-0.5 text-[10px] text-navy-400">{active.confidence}% confidence</p>
            )}
          </div>
        )}
      </div>

      <div className="mt-1.5 flex">
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
    </figure>
  );
}
