import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Check, ChevronLeft, ChevronRight, MapPin, Clock, Zap, Tag, CreditCard,
  Banknote, Smartphone, Loader2, AlertCircle,
} from 'lucide-react';
import { bookings as bookingApi, services as serviceApi, workers as workerApi } from '../../api/index.js';
import { useApi } from '../../hooks/useApi.js';
import { Async, Avatar, RatingStars, Spinner, EmptyState, SectionHeader } from '../../components/UI.jsx';
import { serviceIcon, tone } from '../../lib/icons.jsx';
import { inr, mins, formatDate } from '../../lib/format.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import PriceBreakdown from './PriceBreakdown.jsx';
import AddressForm from '../../components/AddressForm.jsx';

const STEPS = ['Service', 'When & where', 'Confirm'];

const PAYMENT_METHODS = [
  { value: 'upi', label: 'UPI', icon: Smartphone },
  { value: 'card', label: 'Card', icon: CreditCard },
  { value: 'cash', label: 'Cash', icon: Banknote },
];

/** Slot grid — the next 7 days at 30-minute-rounded hours. */
const buildSlots = () => {
  const days = [];
  for (let d = 0; d < 7; d += 1) {
    const date = new Date();
    date.setDate(date.getDate() + d);
    date.setMinutes(0, 0, 0);
    days.push(date);
  }
  return days;
};

const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];

export default function NewBooking() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();

  const [step, setStep] = useState(0);
  const [serviceId, setServiceId] = useState(params.get('serviceId') || '');
  const [packageName, setPackageName] = useState(params.get('package') || '');
  const [preferredWorkerId, setPreferredWorkerId] = useState(params.get('worker') || '');
  const [isEmergency, setIsEmergency] = useState(params.get('emergency') === '1');

  const [addressId, setAddressId] = useState(user?.addresses?.[0]?._id ?? '');
  const [notes, setNotes] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('upi');

  const days = useMemo(buildSlots, []);
  const [day, setDay] = useState(0);
  const [hour, setHour] = useState(null);

  const [quote, setQuote] = useState(null);
  const [quoting, setQuoting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const { data: services, loading: servicesLoading } = useApi(() => serviceApi.list({ limit: 30 }), []);
  const service = (services ?? []).find((s) => s._id === serviceId);
  const address = user?.addresses?.find((a) => a._id === addressId) ?? user?.addresses?.[0];

  // Default to the most-booked package once a service is chosen.
  useEffect(() => {
    if (!service || packageName) return;
    const popular = service.packages.find((p) => p.popular) ?? service.packages[0];
    if (popular) setPackageName(popular.name);
  }, [service, packageName]);

  // Preferred worker, if the customer arrived from a profile page.
  const { data: preferredWorker } = useApi(
    () => workerApi.get(preferredWorkerId),
    [preferredWorkerId],
    { enabled: Boolean(preferredWorkerId) },
  );

  /**
   * Live quote. Re-priced whenever anything that affects the total changes, so
   * the surge multiplier and the payout split are never stale by the time the
   * customer presses Confirm.
   */
  useEffect(() => {
    if (!serviceId || !address) return undefined;

    let cancelled = false;
    setQuoting(true);

    bookingApi
      .quote({
        serviceId,
        packageName: packageName || undefined,
        location: {
          lat: address.location.coordinates[1],
          lng: address.location.coordinates[0],
        },
        zone: address.zone,
        city: address.city,
        type: isEmergency ? 'emergency' : 'scheduled',
        couponCode: appliedCoupon || undefined,
      })
      .then((q) => !cancelled && setQuote(q))
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setQuoting(false));

    return () => {
      cancelled = true;
    };
  }, [serviceId, packageName, addressId, isEmergency, appliedCoupon, address]);

  const scheduledFor = useMemo(() => {
    if (isEmergency) return new Date();
    if (hour == null) return null;
    const d = new Date(days[day]);
    d.setHours(hour, 0, 0, 0);
    return d;
  }, [days, day, hour, isEmergency]);

  const canAdvance = [
    Boolean(serviceId && packageName),
    Boolean(address && (isEmergency || scheduledFor)),
    Boolean(quote),
  ][step];

  const submit = async () => {
    setError(null);
    setSubmitting(true);

    try {
      const booking = await bookingApi.create({
        serviceId,
        packageName: packageName || undefined,
        address: {
          label: address.label,
          line1: address.line1,
          landmark: address.landmark,
          city: address.city,
          pincode: address.pincode,
          zone: address.zone,
          location: {
            lat: address.location.coordinates[1],
            lng: address.location.coordinates[0],
          },
        },
        scheduledFor: scheduledFor?.toISOString(),
        type: isEmergency ? 'emergency' : 'scheduled',
        notes: notes || undefined,
        couponCode: appliedCoupon || undefined,
        paymentMethod,
        preferredWorkerId: preferredWorkerId || undefined,
      });

      toast.success(`Booking ${booking.code} created — finding a member now`);
      navigate(`/app/booking/${booking._id}`);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  /* The address form is rendered here rather than linked to: this is the first
     screen a new customer reaches, and bouncing them to settings to come back
     afterwards loses whatever they were trying to book. */
  if (!user?.addresses?.length) {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <SectionHeader
          title="Where should we come?"
          hint="We match you to whoever is nearest and free, so we need a location first. This is saved to your account — you only do it once."
        />
        <AddressForm />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      {/* ------------------------------ stepper ---------------------------- */}
      <ol className="mb-8 flex items-center gap-2">
        {STEPS.map((label, i) => (
          <li key={label} className="flex flex-1 items-center gap-2">
            <button
              onClick={() => i < step && setStep(i)}
              disabled={i > step}
              className={`flex items-center gap-2 rounded-lg px-2 py-1 transition ${
                i < step ? 'cursor-pointer hover:bg-navy-100' : 'cursor-default'
              }`}
            >
              <span
                className={`tnum flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  i < step
                    ? 'bg-coop-600 text-white'
                    : i === step
                      ? 'bg-navy-900 text-white'
                      : 'bg-navy-200 text-navy-500'
                }`}
              >
                {i < step ? <Check size={14} /> : i + 1}
              </span>
              <span
                className={`hidden text-sm font-semibold sm:block ${
                  i <= step ? 'text-navy-900' : 'text-navy-400'
                }`}
              >
                {label}
              </span>
            </button>
            {i < STEPS.length - 1 && (
              <span className={`h-0.5 flex-1 rounded ${i < step ? 'bg-coop-500' : 'bg-navy-200'}`} />
            )}
          </li>
        ))}
      </ol>

      {/* ------------------------------- steps ----------------------------- */}
      {step === 0 && (
        <StepService
          services={services}
          loading={servicesLoading}
          serviceId={serviceId}
          setServiceId={(id) => {
            setServiceId(id);
            setPackageName('');
          }}
          service={service}
          packageName={packageName}
          setPackageName={setPackageName}
          isEmergency={isEmergency}
          setIsEmergency={setIsEmergency}
          preferredWorker={preferredWorker}
          clearPreferred={() => setPreferredWorkerId('')}
        />
      )}

      {step === 1 && (
        <StepWhenWhere
          addresses={user.addresses}
          addressId={address?._id}
          setAddressId={setAddressId}
          days={days}
          day={day}
          setDay={setDay}
          hour={hour}
          setHour={setHour}
          isEmergency={isEmergency}
          notes={notes}
          setNotes={setNotes}
        />
      )}

      {step === 2 && (
        <StepConfirm
          service={service}
          packageName={packageName}
          address={address}
          scheduledFor={scheduledFor}
          isEmergency={isEmergency}
          quote={quote}
          quoting={quoting}
          couponCode={couponCode}
          setCouponCode={setCouponCode}
          applyCoupon={() => setAppliedCoupon(couponCode.trim().toUpperCase())}
          appliedCoupon={appliedCoupon}
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          preferredWorker={preferredWorker}
          notes={notes}
        />
      )}

      {error && (
        <div className="mt-5 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ------------------------------ actions ---------------------------- */}
      <div className="mt-8 flex items-center justify-between gap-3 border-t border-navy-100 pt-5">
        <button
          onClick={() => (step === 0 ? navigate(-1) : setStep((s) => s - 1))}
          className="btn-outline"
          disabled={submitting}
        >
          <ChevronLeft size={15} /> {step === 0 ? 'Cancel' : 'Back'}
        </button>

        {step < 2 ? (
          <button onClick={() => setStep((s) => s + 1)} disabled={!canAdvance} className="btn-primary">
            Continue <ChevronRight size={15} />
          </button>
        ) : (
          <button onClick={submit} disabled={!canAdvance || submitting} className="btn-coop">
            {submitting ? <Spinner size={16} /> : <Check size={16} />}
            {submitting ? 'Creating…' : `Confirm · ${inr(quote?.pricing?.total)}`}
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------- step one --------------------------------- */

function StepService({
  services, loading, serviceId, setServiceId, service,
  packageName, setPackageName, isEmergency, setIsEmergency,
  preferredWorker, clearPreferred,
}) {
  return (
    <div className="space-y-6">
      {preferredWorker && (
        <div className="card flex items-center gap-3 border-coop-200 bg-coop-50 p-4">
          <Avatar name={preferredWorker.displayName} size={40} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-coop-900">
              Requesting {preferredWorker.displayName}
            </p>
            <p className="text-xs text-coop-700">
              The job goes only to them first, then out to others if they do not respond.
            </p>
          </div>
          <button onClick={clearPreferred} className="btn-ghost btn-sm shrink-0">
            Clear
          </button>
        </div>
      )}

      <div>
        <h2 className="panel-title mb-3">What do you need?</h2>

        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton h-16 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {(services ?? []).map((s) => {
              const Icon = serviceIcon(s.icon);
              const t = tone(s.heroColor);
              const active = s._id === serviceId;

              return (
                <button
                  key={s._id}
                  onClick={() => setServiceId(s._id)}
                  className={`flex items-center gap-3 rounded-xl border-2 p-3.5 text-left transition ${
                    active
                      ? 'border-navy-900 bg-navy-900 text-white'
                      : 'border-navy-100 bg-white hover:border-navy-300'
                  }`}
                >
                  <span className={`rounded-lg p-2 ${active ? 'bg-white/10 text-coop-400' : `${t.bg} ${t.text}`}`}>
                    <Icon size={17} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{s.name}</span>
                    <span className={`tnum block text-xs ${active ? 'text-navy-300' : 'text-navy-500'}`}>
                      from {inr(s.basePrice)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {service && (
        <div>
          <h2 className="panel-title mb-3">Pick a package</h2>
          <div className="space-y-2.5">
            {service.packages.map((pkg) => {
              const active = pkg.name === packageName;
              return (
                <button
                  key={pkg.name}
                  onClick={() => setPackageName(pkg.name)}
                  className={`flex w-full items-start gap-3 rounded-xl border-2 p-4 text-left transition ${
                    active ? 'border-coop-600 bg-coop-50' : 'border-navy-100 bg-white hover:border-navy-300'
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                      active ? 'border-coop-600 bg-coop-600' : 'border-navy-300'
                    }`}
                  >
                    {active && <Check size={12} className="text-white" />}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-navy-900">{pkg.name}</span>
                      {pkg.popular && <span className="badge-coop">Most booked</span>}
                    </span>
                    <span className="mt-0.5 block text-sm text-navy-600">{pkg.description}</span>
                    <span className="mt-1 inline-flex items-center gap-1.5 text-xs text-navy-500">
                      <Clock size={11} /> {mins(pkg.durationMins)}
                    </span>
                  </span>

                  <span className="tnum shrink-0 text-lg font-bold text-navy-900">
                    {inr(pkg.price)}
                  </span>
                </button>
              );
            })}
          </div>

          {service.emergencyAvailable && (
            <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-xl border-2 border-saffron-200 bg-saffron-50 p-4">
              <input
                type="checkbox"
                checked={isEmergency}
                onChange={(e) => setIsEmergency(e.target.checked)}
                className="h-4 w-4 accent-saffron-600"
              />
              <Zap size={18} className="shrink-0 text-saffron-600" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-saffron-900">
                  Book as an emergency
                </span>
                <span className="block text-xs text-saffron-700">
                  Dispatched immediately over a wider radius, to professionals who opted into emergency
                  work. Adds {inr(service.emergencySurcharge)}.
                </span>
              </span>
            </label>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------- step two --------------------------------- */

function StepWhenWhere({
  addresses, addressId, setAddressId, days, day, setDay,
  hour, setHour, isEmergency, notes, setNotes,
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="panel-title mb-3">Where?</h2>
        <div className="space-y-2.5">
          {addresses.map((a) => {
            const active = a._id === addressId;
            return (
              <button
                key={a._id}
                onClick={() => setAddressId(a._id)}
                className={`flex w-full items-start gap-3 rounded-xl border-2 p-4 text-left transition ${
                  active ? 'border-navy-900 bg-navy-50' : 'border-navy-100 bg-white hover:border-navy-300'
                }`}
              >
                <MapPin size={17} className={`mt-0.5 shrink-0 ${active ? 'text-navy-900' : 'text-navy-400'}`} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="font-bold text-navy-900">{a.label}</span>
                    {a.zone && <span className="badge-navy">{a.zone}</span>}
                  </span>
                  <span className="mt-0.5 block text-sm text-navy-600">{a.line1}</span>
                  {a.landmark && (
                    <span className="block text-xs text-navy-400">{a.landmark}</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {isEmergency ? (
        <div className="card flex items-center gap-3 border-saffron-200 bg-saffron-50 p-4">
          <Zap size={20} className="shrink-0 text-saffron-600" />
          <div>
            <p className="text-sm font-bold text-saffron-900">Dispatching immediately</p>
            <p className="text-xs text-saffron-700">
              Emergency jobs skip slot selection — we start offering as soon as you confirm.
            </p>
          </div>
        </div>
      ) : (
        <div>
          <h2 className="panel-title mb-3">When?</h2>

          <div className="no-scrollbar -mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1">
            {days.map((d, i) => (
              <button
                key={i}
                onClick={() => setDay(i)}
                className={`flex shrink-0 flex-col items-center rounded-xl border-2 px-4 py-2.5 transition ${
                  day === i ? 'border-navy-900 bg-navy-900 text-white' : 'border-navy-100 bg-white hover:border-navy-300'
                }`}
              >
                <span className={`text-[10px] font-bold uppercase ${day === i ? 'text-navy-300' : 'text-navy-400'}`}>
                  {i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-IN', { weekday: 'short' })}
                </span>
                <span className="tnum mt-0.5 text-sm font-bold">{formatDate(d)}</span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {HOURS.map((h) => {
              const slot = new Date(days[day]);
              slot.setHours(h, 0, 0, 0);
              const past = slot < new Date();

              return (
                <button
                  key={h}
                  onClick={() => setHour(h)}
                  disabled={past}
                  className={`tnum rounded-lg border-2 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:border-navy-100 disabled:bg-navy-50 disabled:text-navy-300 ${
                    hour === h
                      ? 'border-coop-600 bg-coop-600 text-white'
                      : 'border-navy-100 bg-white text-navy-700 hover:border-navy-300'
                  }`}
                >
                  {h > 12 ? `${h - 12}:00 pm` : `${h}:00 ${h === 12 ? 'pm' : 'am'}`}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <label htmlFor="notes" className="label">
          Anything the professional should know? <span className="font-normal normal-case">(optional)</span>
        </label>
        <textarea
          id="notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. The MCB trips only when the AC starts. Third floor, no lift."
          className="input resize-none"
          maxLength={500}
        />
      </div>
    </div>
  );
}

/* ------------------------------ step three -------------------------------- */

function StepConfirm({
  service, packageName, address, scheduledFor, isEmergency, quote, quoting,
  couponCode, setCouponCode, applyCoupon, appliedCoupon,
  paymentMethod, setPaymentMethod, preferredWorker, notes,
}) {
  const Icon = serviceIcon(service?.icon);

  return (
    <div className="space-y-5">
      <div className="card-pad">
        <h2 className="panel-title mb-4">Review your booking</h2>

        <div className="flex items-start gap-3.5">
          <span className="shrink-0 rounded-xl bg-navy-100 p-3 text-navy-700">
            <Icon size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-navy-900">{service?.name}</p>
            <p className="text-sm text-navy-600">{packageName}</p>
            {isEmergency && (
              <span className="badge-saffron mt-1.5">
                <Zap size={11} /> Emergency
              </span>
            )}
          </div>
        </div>

        <dl className="mt-4 space-y-2.5 border-t border-navy-100 pt-4 text-sm">
          <div className="flex gap-3">
            <dt className="flex w-24 shrink-0 items-center gap-1.5 text-navy-500">
              <Clock size={13} /> When
            </dt>
            <dd className="font-medium text-navy-900">
              {isEmergency
                ? 'As soon as a member accepts'
                : scheduledFor?.toLocaleString('en-IN', {
                    weekday: 'short', day: 'numeric', month: 'short',
                    hour: 'numeric', minute: '2-digit', hour12: true,
                  })}
            </dd>
          </div>

          <div className="flex gap-3">
            <dt className="flex w-24 shrink-0 items-center gap-1.5 text-navy-500">
              <MapPin size={13} /> Where
            </dt>
            <dd className="min-w-0 font-medium text-navy-900">
              {address?.line1}
              <span className="block text-xs font-normal text-navy-500">
                {address?.zone}, {address?.city}
              </span>
            </dd>
          </div>

          {preferredWorker && (
            <div className="flex gap-3">
              <dt className="w-24 shrink-0 text-navy-500">Professional</dt>
              <dd className="flex items-center gap-2 font-medium text-navy-900">
                <Avatar name={preferredWorker.displayName} size={22} />
                {preferredWorker.displayName}
                <RatingStars value={preferredWorker.rating?.average ?? 0} size={11} showValue={false} />
              </dd>
            </div>
          )}

          {notes && (
            <div className="flex gap-3">
              <dt className="w-24 shrink-0 text-navy-500">Note</dt>
              <dd className="text-navy-700">{notes}</dd>
            </div>
          )}
        </dl>
      </div>

      {/* ------------------------------ coupon --------------------------- */}
      <div className="card-pad">
        <label htmlFor="coupon" className="label">
          <Tag size={12} className="mr-1 inline" /> Have an offer code?
        </label>
        <div className="flex gap-2">
          <input
            id="coupon"
            value={couponCode}
            onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
            placeholder="FIRST50"
            className="input flex-1 font-mono uppercase"
          />
          <button onClick={applyCoupon} disabled={!couponCode.trim()} className="btn-outline shrink-0">
            Apply
          </button>
        </div>

        {appliedCoupon && quote?.pricing?.discount > 0 && (
          <p className="mt-2 text-sm font-medium text-coop-700">
            {appliedCoupon} applied — you save {inr(quote.pricing.discount)}
          </p>
        )}
        {appliedCoupon && quote?.pricing?.discount === 0 && (
          <p className="mt-2 text-sm font-medium text-red-600">
            {appliedCoupon} is not a valid code.
          </p>
        )}

        <p className="muted mt-2">Try FIRST50, COOP100 or MONSOON20.</p>
      </div>

      {/* ------------------------------ payment -------------------------- */}
      <div className="card-pad">
        <p className="label">Pay by</p>
        <div className="grid grid-cols-3 gap-2">
          {PAYMENT_METHODS.map((m) => (
            <button
              key={m.value}
              onClick={() => setPaymentMethod(m.value)}
              className={`flex flex-col items-center gap-1.5 rounded-xl border-2 py-3 transition ${
                paymentMethod === m.value
                  ? 'border-navy-900 bg-navy-900 text-white'
                  : 'border-navy-100 bg-white text-navy-600 hover:border-navy-300'
              }`}
            >
              <m.icon size={18} />
              <span className="text-xs font-bold">{m.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ----------------------------- pricing --------------------------- */}
      {quoting && !quote ? (
        <div className="card-pad flex items-center justify-center gap-2 text-navy-400">
          <Loader2 size={16} className="animate-spin" /> Pricing your booking…
        </div>
      ) : (
        quote && <PriceBreakdown quote={quote} refreshing={quoting} />
      )}
    </div>
  );
}
