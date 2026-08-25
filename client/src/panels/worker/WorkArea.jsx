import { useEffect, useState } from 'react';
import { MapPin, Crosshair, Check, AlertCircle, Radius } from 'lucide-react';
import { areas as areaApi, workerPanel } from '../../api/index.js';
import { useToast } from '../../context/ToastContext.jsx';
import { Spinner } from '../../components/UI.jsx';

/**
 * Where this professional works, and how far they will travel.
 *
 * Both were already stored and adjustable through the API, and neither had a
 * control anywhere — so everyone who signed up kept the coordinates
 * registration gave them, which is the *company's* address rather than their
 * own. A professional in Malad sat on the map in Dadar, outside their own
 * service radius of every customer near them, and simply never appeared in
 * anybody's search.
 *
 * The radius is the second half of the same answer: it is a hard filter in
 * ranking, not a preference, so someone covering a wide area has to be able to
 * say so or the reach they actually have is invisible.
 */
const RADII = [3, 5, 8, 12, 20, 30];

export default function WorkArea({ profile, onSaved }) {
  const [areas, setAreas] = useState([]);
  const [zone, setZone] = useState('');
  const [radius, setRadius] = useState(profile?.serviceRadiusKm ?? 8);
  const [coords, setCoords] = useState(null);
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const toast = useToast();

  useEffect(() => {
    let alive = true;
    areaApi
      .list()
      .then((list) => {
        if (!alive) return;
        setAreas(list);

        /* Pre-select whichever area the current pin is nearest to, so the
           control opens showing where they actually are rather than a blank
           field they have to interpret. */
        const at = profile?.location?.coordinates;
        if (at && list.length) {
          const nearest = list.reduce((best, a) => {
            const d = (a.lat - at[1]) ** 2 + (a.lng - at[0]) ** 2;
            return !best || d < best.d ? { ...a, d } : best;
          }, null);
          setZone(nearest.zone);
        } else {
          setZone(list[0]?.zone ?? '');
        }
      })
      .catch(() => alive && setError('Could not load service areas.'));
    return () => {
      alive = false;
    };
  }, [profile?.location?.coordinates]);

  const area = areas.find((a) => a.zone === zone);

  const locate = () => {
    if (!navigator.geolocation) {
      setError('This browser cannot share your location. Pick your area instead.');
      return;
    }
    setLocating(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
        toast.success('Location captured');
      },
      (err) => {
        setLocating(false);
        setError(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission was denied. Pick your area from the list instead.'
            : 'Could not get your location. Pick your area from the list instead.',
        );
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  const save = async () => {
    const location = coords ?? (area ? { lat: area.lat, lng: area.lng } : null);
    if (!location) {
      setError('Choose your area, or share your location.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await workerPanel.setAvailability({ location, serviceRadiusKm: Number(radius) });
      toast.success('Work area updated');
      setCoords(null);
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const changed =
    Boolean(coords) ||
    Number(radius) !== (profile?.serviceRadiusKm ?? 8) ||
    (area && profile?.baseArea && area.zone !== profile.baseArea);

  return (
    <section className="card-pad">
      <div className="flex items-center gap-2.5">
        <MapPin size={17} className="text-navy-700" />
        <h2 className="font-bold tracking-tight text-navy-900">Where you work</h2>
      </div>
      <p className="muted mt-1.5 text-sm">
        Customers only see you if their address falls inside your radius. Set this to where you
        actually start your day, not your company&rsquo;s office.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="work-zone" className="label">Base area</label>
          <select
            id="work-zone"
            value={zone}
            onChange={(e) => setZone(e.target.value)}
            className="select mt-1.5"
          >
            {areas.length === 0 && <option value="">Loading…</option>}
            {areas.map((a) => (
              <option key={a.zone} value={a.zone}>
                {a.zone} · {a.city}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="work-radius" className="label">How far you travel</label>
          <select
            id="work-radius"
            value={radius}
            onChange={(e) => setRadius(e.target.value)}
            className="select mt-1.5"
          >
            {RADII.map((r) => (
              <option key={r} value={r}>
                Within {r} km
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-navy-200 bg-navy-50/60 p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-navy-900">
              {coords ? 'Using your exact position' : 'Pin your exact position'}
            </p>
            <p className="muted mt-0.5 text-xs">
              {coords
                ? 'Jobs will be matched from this point.'
                : 'Optional. Otherwise the centre of your base area is used.'}
            </p>
          </div>
          <button
            type="button"
            onClick={locate}
            disabled={locating}
            className={coords ? 'btn-ghost btn-sm' : 'btn-outline btn-sm'}
          >
            {locating ? <Spinner size={14} /> : coords ? <Check size={14} /> : <Crosshair size={14} />}
            {coords ? 'Captured' : 'Use my location'}
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button onClick={save} disabled={busy || !changed} className="btn-primary disabled:opacity-50">
          {busy ? <Spinner size={16} /> : <Radius size={16} />} Save work area
        </button>
        {!changed && <span className="muted text-xs">Nothing to save yet.</span>}
      </div>
    </section>
  );
}
