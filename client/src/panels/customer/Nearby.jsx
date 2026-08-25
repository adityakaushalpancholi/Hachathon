import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Radar, Zap, Navigation } from 'lucide-react';
import { workers as workerApi, services as serviceApi } from '../../api/index.js';
import { useApi } from '../../hooks/useApi.js';
import { Async, SectionHeader, ChipRow, EmptyState, Avatar, RatingStars } from '../../components/UI.jsx';
import WorkerCard from '../../components/WorkerCard.jsx';
import { inr, km } from '../../lib/format.js';
import { useAuth } from '../../context/AuthContext.jsx';

const RADII = [3, 5, 8, 15, 25];

export default function Nearby() {
  const { user } = useAuth();
  const home = user?.addresses?.find((a) => a.isDefault) ?? user?.addresses?.[0];

  const [skillTag, setSkillTag] = useState(null);
  const [radiusKm, setRadiusKm] = useState(8);
  const [onlineOnly, setOnlineOnly] = useState(true);
  const [hovered, setHovered] = useState(null);

  const center = home?.location?.coordinates;

  const { data: allServices } = useApi(() => serviceApi.list({ limit: 50 }), []);

  const { data, loading, error, reload } = useApi(
    () =>
      workerApi.nearby({
        lat: center[1],
        lng: center[0],
        radiusKm,
        skillTag: skillTag || undefined,
        online: onlineOnly || undefined,
        limit: 40,
      }),
    [center?.[0], center?.[1], radiusKm, skillTag, onlineOnly],
    { enabled: Boolean(center), pollMs: 25_000 },
  );

  const workers = data ?? [];

  if (!home) {
    return (
      <EmptyState
        icon={MapPin}
        title="No address on file"
        hint="Add a service address to see which professionals are working near you."
      />
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Members near you"
        hint={`Live positions around ${home.zone ?? home.city}. Updates every 25 seconds.`}
      />

      {/* ------------------------------ filters ---------------------------- */}
      <div className="space-y-3">
        <ChipRow
          options={(allServices ?? []).map((s) => ({ value: s.skillTag, label: s.name }))}
          value={skillTag}
          onChange={setSkillTag}
          allLabel="All trades"
        />

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-navy-500">
              Within
            </span>
            {RADII.map((r) => (
              <button
                key={r}
                onClick={() => setRadiusKm(r)}
                className={`tnum badge border transition ${
                  radiusKm === r
                    ? 'border-navy-900 bg-navy-900 text-white'
                    : 'border-navy-200 bg-white text-navy-600 hover:border-navy-300'
                }`}
              >
                {r} km
              </button>
            ))}
          </div>

          <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm font-medium text-navy-700">
            <input
              type="checkbox"
              checked={onlineOnly}
              onChange={(e) => setOnlineOnly(e.target.checked)}
              className="h-4 w-4 accent-coop-600"
            />
            Available right now
          </label>
        </div>
      </div>

      <Async loading={loading} error={error} data={data} onRetry={reload}>
        <div className="grid gap-6 lg:grid-cols-5">
          {/* ------------------------------ map --------------------------- */}
          <div className="lg:col-span-3">
            <ProximityMap
              center={center}
              radiusKm={radiusKm}
              workers={workers}
              hovered={hovered}
              onHover={setHovered}
              homeLabel={home.zone ?? home.label}
            />

            <p className="muted mt-3">
              Positions are projected from each member&rsquo;s live coordinates. The rings mark{' '}
              {Math.round(radiusKm / 3)} km, {Math.round((radiusKm * 2) / 3)} km and {radiusKm} km.
            </p>
          </div>

          {/* ----------------------------- list --------------------------- */}
          <div className="lg:col-span-2">
            <div className="mb-3 flex items-baseline justify-between">
              <p className="text-sm font-bold text-navy-900">
                {workers.length} member{workers.length === 1 ? '' : 's'}, best match first
              </p>
              {workers.length > 0 && (
                // The list is ordered by match score, not distance, so the
                // closest member is not necessarily the first row.
                <p className="tnum text-xs text-navy-500">
                  Nearest {km(Math.min(...workers.map((w) => w.distanceKm)))}
                </p>
              )}
            </div>

            {workers.length === 0 ? (
              <EmptyState
                icon={Radar}
                title="Nobody in range"
                hint="Try a wider radius, or turn off the availability filter."
              />
            ) : (
              <div className="max-h-[560px] space-y-2.5 overflow-y-auto pr-1">
                {workers.map((w, i) => (
                  <button
                    key={w._id}
                    onMouseEnter={() => setHovered(w._id)}
                    onMouseLeave={() => setHovered(null)}
                    className={`card flex w-full items-center gap-3 p-3 text-left transition ${
                      hovered === w._id ? 'ring-2 ring-coop-500' : 'hover:shadow-lift'
                    }`}
                  >
                    <span className="tnum flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-navy-900 text-[10px] font-bold text-white">
                      {i + 1}
                    </span>

                    <Avatar name={w.displayName} src={w.photo} size={36} />

                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/worker/${w._id}`}
                        className="block truncate text-sm font-bold text-navy-900 hover:text-coop-700"
                      >
                        {w.displayName}
                      </Link>
                      <div className="mt-0.5 flex items-center gap-2">
                        <RatingStars value={w.rating?.average ?? 0} size={11} showValue={false} />
                        <span className="tnum text-xs text-navy-500">
                          {km(w.distanceKm)} · {w.etaMins} min
                        </span>
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="tnum text-sm font-bold text-navy-900">{inr(w.hourlyRate)}</p>
                      {w.availability?.acceptsEmergency && (
                        <Zap size={12} className="ml-auto mt-0.5 text-saffron-500" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </Async>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Proximity map.
 *
 * Rather than embed a tile provider, this projects real lat/lng into a local
 * plane using an equirectangular projection scaled by the search radius. At
 * city scale the distortion is negligible, and the result is a genuine spatial
 * view driven entirely by the same coordinates the dispatch engine ranks on.
 */
function ProximityMap({ center, radiusKm, workers, hovered, onHover, homeLabel }) {
  const SIZE = 400;
  const R = SIZE / 2 - 10;

  const points = useMemo(() => {
    const [clng, clat] = center;
    const latKm = 111;
    const lngKm = 111 * Math.cos((clat * Math.PI) / 180);

    return workers.map((w) => {
      const [lng, lat] = w.location.coordinates;
      // East is +x, north is −y (SVG's y axis grows downward).
      const dxKm = (lng - clng) * lngKm;
      const dyKm = (lat - clat) * latKm;

      const scale = R / radiusKm;
      let x = SIZE / 2 + dxKm * scale;
      let y = SIZE / 2 - dyKm * scale;

      // Clamp anything just outside the viewport onto the rim rather than
      // dropping it — the list and the map must agree on the count.
      const dist = Math.hypot(x - SIZE / 2, y - SIZE / 2);
      if (dist > R) {
        const k = R / dist;
        x = SIZE / 2 + (x - SIZE / 2) * k;
        y = SIZE / 2 + (y - SIZE / 2) * k;
      }

      return { ...w, x, y };
    });
  }, [center, workers, radiusKm]);

  const rings = [radiusKm / 3, (radiusKm * 2) / 3, radiusKm];

  return (
    <div className="card overflow-hidden bg-navy-950">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full" role="img" aria-label="Map of nearby professionals">
        <defs>
          <radialGradient id="glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#1fa565" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#1fa565" stopOpacity="0" />
          </radialGradient>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M40 0H0V40" fill="none" stroke="#1e2c40" strokeWidth="1" />
          </pattern>
        </defs>

        <rect width={SIZE} height={SIZE} fill="#0b1220" />
        <rect width={SIZE} height={SIZE} fill="url(#grid)" />
        <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="url(#glow)" />

        {/* Distance rings */}
        {rings.map((r, i) => (
          <g key={i}>
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={(r / radiusKm) * R}
              fill="none"
              stroke="#2b3d56"
              strokeWidth="1"
              strokeDasharray={i === rings.length - 1 ? '0' : '3 4'}
            />
            <text
              x={SIZE / 2 + (r / radiusKm) * R - 4}
              y={SIZE / 2 - 5}
              fill="#4a6285"
              fontSize="9"
              textAnchor="end"
              fontFamily="ui-monospace, monospace"
            >
              {r < 10 ? r.toFixed(1) : Math.round(r)}km
            </text>
          </g>
        ))}

        {/* Cardinal ticks */}
        {['N', 'E', 'S', 'W'].map((d, i) => {
          const angle = (i * Math.PI) / 2 - Math.PI / 2;
          return (
            <text
              key={d}
              x={SIZE / 2 + Math.cos(angle) * (R + 2)}
              y={SIZE / 2 + Math.sin(angle) * (R + 2) + 3}
              fill="#374d6b"
              fontSize="9"
              fontWeight="700"
              textAnchor="middle"
            >
              {d}
            </text>
          );
        })}

        {/* Members */}
        {points.map((p, i) => {
          const active = hovered === p._id;
          const free = p.availability?.isOnline && !p.availability?.activeBooking;

          return (
            <g
              key={p._id}
              onMouseEnter={() => onHover(p._id)}
              onMouseLeave={() => onHover(null)}
              className="cursor-pointer"
            >
              {active && (
                <circle cx={p.x} cy={p.y} r="14" fill="#1fa565" opacity="0.25" />
              )}
              <circle
                cx={p.x}
                cy={p.y}
                r={active ? 8 : 6}
                fill={free ? '#44c082' : '#6b81a3'}
                stroke="#0b1220"
                strokeWidth="2"
                className="transition-all"
              />
              <text
                x={p.x}
                y={p.y + 2.5}
                fill="#0b1220"
                fontSize="7"
                fontWeight="800"
                textAnchor="middle"
                className="pointer-events-none"
              >
                {i + 1}
              </text>

              {active && (
                <g className="pointer-events-none">
                  <rect
                    x={Math.min(Math.max(p.x - 52, 4), SIZE - 108)}
                    y={p.y - 34}
                    width="104"
                    height="22"
                    rx="5"
                    fill="#141e2e"
                    stroke="#2b3d56"
                  />
                  <text
                    x={Math.min(Math.max(p.x - 52, 4), SIZE - 108) + 52}
                    y={p.y - 19}
                    fill="#e2e8f0"
                    fontSize="9.5"
                    fontWeight="600"
                    textAnchor="middle"
                  >
                    {p.displayName.length > 16 ? `${p.displayName.slice(0, 15)}…` : p.displayName}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* Home */}
        <g>
          <circle cx={SIZE / 2} cy={SIZE / 2} r="16" fill="#fb8210" opacity="0.2" />
          <circle cx={SIZE / 2} cy={SIZE / 2} r="7" fill="#fb8210" stroke="#0b1220" strokeWidth="2.5" />
          <text
            x={SIZE / 2}
            y={SIZE / 2 + 26}
            fill="#ffc170"
            fontSize="10"
            fontWeight="700"
            textAnchor="middle"
          >
            {homeLabel}
          </text>
        </g>
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-navy-800 px-4 py-3 text-xs text-navy-300">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-saffron-500" /> You
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-coop-400" /> Free now
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-navy-400" /> On a job
        </span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-navy-400">
          <Navigation size={11} /> {workers.length} shown
        </span>
      </div>
    </div>
  );
}
