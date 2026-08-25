import { useEffect, useState } from 'react';
import { MapPin, Crosshair, AlertCircle, Check } from 'lucide-react';
import { areas as areaApi, auth as authApi } from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Spinner } from './UI.jsx';

/**
 * Add a service address.
 *
 * The API needs coordinates, not just a street — dispatch matches on distance,
 * so an address without a point on the map cannot be served. Two ways to supply
 * them, because neither works on its own: the device knows exactly where you
 * are but only if you grant permission and are actually standing there, while
 * the area list always works and is what demand forecasting buckets on anyway.
 *
 * Picking an area is the default, and "use my location" refines it. That order
 * matters — a form whose first action is a permission prompt reads as a
 * shakedown, and most people are booking for home while sitting somewhere else.
 */
export default function AddressForm({ onSaved, onCancel, compact = false }) {
  const [areas, setAreas] = useState([]);
  const [form, setForm] = useState({
    label: 'Home',
    line1: '',
    landmark: '',
    zone: '',
    isDefault: true,
  });
  const [coords, setCoords] = useState(null);
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const { refresh } = useAuth();
  const toast = useToast();

  useEffect(() => {
    let alive = true;
    areaApi
      .list()
      .then((list) => {
        if (!alive) return;
        setAreas(list);
        setForm((f) => ({ ...f, zone: f.zone || list[0]?.zone || '' }));
      })
      .catch(() => alive && setError('Could not load service areas. Please try again.'));
    return () => {
      alive = false;
    };
  }, []);

  const area = areas.find((a) => a.zone === form.zone);
  const set = (key) => (e) =>
    setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

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
        // Distinguish "you said no" from "it did not work" — the fixes differ.
        setError(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission was denied. Pick your area from the list instead.'
            : 'Could not get your location. Pick your area from the list instead.',
        );
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  const submit = async (e) => {
    e.preventDefault();
    setError(null);

    // GPS wins when present; otherwise the chosen area's centre stands in.
    const location = coords ?? (area ? { lat: area.lat, lng: area.lng } : null);
    if (!location) {
      setError('Choose your area, or share your location.');
      return;
    }

    setBusy(true);
    try {
      const addresses = await authApi.addAddress({
        label: form.label.trim() || 'Home',
        line1: form.line1.trim(),
        ...(form.landmark.trim() ? { landmark: form.landmark.trim() } : {}),
        city: area?.city ?? 'Mumbai',
        state: 'Maharashtra',
        ...(area?.pincode ? { pincode: area.pincode } : {}),
        ...(area?.zone ? { zone: area.zone } : {}),
        location,
        isDefault: form.isDefault,
      });

      // The session carries the address list, so it has to be re-read before
      // any screen reading `user.addresses` will see the new one.
      await refresh();
      toast.success('Address saved');
      onSaved?.(addresses);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className={compact ? 'space-y-4' : 'card-pad space-y-4'}>
      {!compact && (
        <div className="flex items-center gap-2.5">
          <MapPin size={17} className="text-navy-700" />
          <h2 className="font-bold tracking-tight text-navy-900">Add an address</h2>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="addr-label" className="label">Name this address</label>
          <input
            id="addr-label"
            value={form.label}
            onChange={set('label')}
            placeholder="Home, Office…"
            maxLength={40}
            className="input mt-1.5"
          />
        </div>

        <div>
          <label htmlFor="addr-zone" className="label">Area</label>
          <select id="addr-zone" value={form.zone} onChange={set('zone')} className="select mt-1.5">
            {areas.length === 0 && <option value="">Loading…</option>}
            {areas.map((a) => (
              <option key={a.zone} value={a.zone}>
                {a.zone} · {a.city} {a.pincode}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="addr-line1" className="label">Flat, building and street</label>
        <input
          id="addr-line1"
          value={form.line1}
          onChange={set('line1')}
          placeholder="Flat 402, Sunrise Apartments, Link Road"
          required
          minLength={3}
          maxLength={200}
          className="input mt-1.5"
        />
      </div>

      <div>
        <label htmlFor="addr-landmark" className="label">
          Landmark <span className="font-normal normal-case text-navy-400">(optional)</span>
        </label>
        <input
          id="addr-landmark"
          value={form.landmark}
          onChange={set('landmark')}
          placeholder="Opposite the metro station"
          maxLength={120}
          className="input mt-1.5"
        />
      </div>

      {/* ------------------------- optional precision ------------------------ */}
      <div className="rounded-lg border border-navy-200 bg-navy-50/60 p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-navy-900">
              {coords ? 'Using your exact location' : 'Pin your exact spot'}
            </p>
            <p className="muted mt-0.5 text-xs">
              {coords
                ? 'Professionals will be matched to this point rather than the area centre.'
                : 'Optional. Without it we use the centre of the area you picked.'}
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

      <label className="flex items-center gap-2.5 text-sm text-navy-700">
        <input
          type="checkbox"
          checked={form.isDefault}
          onChange={set('isDefault')}
          className="h-4 w-4 rounded border-navy-300"
        />
        Use this as my default address
      </label>

      {error && (
        <p className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy || !form.line1.trim() || (!form.zone && !coords)}
          className="btn-primary disabled:opacity-50"
        >
          {busy ? <Spinner size={16} /> : <MapPin size={16} />} Save address
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-ghost">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
