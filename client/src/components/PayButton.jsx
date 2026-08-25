import { useCallback, useEffect, useState } from 'react';
import { CreditCard, CheckCircle2, AlertCircle } from 'lucide-react';
import { payments as paymentApi } from '../api/index.js';
import { useToast } from '../context/ToastContext.jsx';
import { Spinner } from './UI.jsx';
import { inr } from '../lib/format.js';

const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

/**
 * Load Razorpay Checkout once per page, on demand.
 *
 * Deliberately not a `<script>` in index.html: most visits never reach a payment
 * screen, and a third-party script on every page load is both a performance
 * cost and a tracking surface nobody asked for. Resolving the same promise for
 * concurrent callers keeps two buttons from racing to inject two tags.
 */
let checkoutPromise = null;

function loadCheckout() {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (checkoutPromise) return checkoutPromise;

  checkoutPromise = new Promise((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = CHECKOUT_SRC;
    tag.async = true;
    tag.onload = () =>
      window.Razorpay
        ? resolve(window.Razorpay)
        : reject(new Error('Checkout loaded but did not initialise'));
    tag.onerror = () => {
      // Let a later attempt retry rather than caching the failure forever.
      checkoutPromise = null;
      reject(new Error('Could not reach the payment gateway'));
    };
    document.head.appendChild(tag);
  });

  return checkoutPromise;
}

/**
 * Pay for a booking.
 *
 * Renders nothing at all when the deployment has no gateway keys — an
 * always-disabled button that never explains itself is worse than no button,
 * and those deployments settle in cash on completion instead.
 */
export default function PayButton({ booking, onPaid, className = '' }) {
  const [config, setConfig] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const toast = useToast();

  useEffect(() => {
    let alive = true;
    paymentApi
      .config()
      .then((c) => alive && setConfig(c))
      .catch(() => alive && setConfig({ enabled: false }));
    return () => {
      alive = false;
    };
  }, []);

  const pay = useCallback(async () => {
    setError(null);
    setBusy(true);

    try {
      const [Razorpay, order] = await Promise.all([
        loadCheckout(),
        paymentApi.createOrder(booking._id),
      ]);

      await new Promise((resolve) => {
        const checkout = new Razorpay({
          key: order.keyId,
          amount: order.amount,
          currency: order.currency,
          name: 'ShramSetu',
          description: `${booking.service?.name ?? 'Service'} · ${booking.code}`,
          order_id: order.orderId,
          prefill: order.prefill,
          theme: { color: '#0f2740' },

          handler: async (response) => {
            try {
              // The gateway's word is not enough on its own — the server checks
              // the signature before anything is marked paid.
              const result = await paymentApi.verify(response);
              toast.success('Payment received');
              onPaid?.(result);
            } catch (err) {
              setError(err.message);
            } finally {
              resolve();
            }
          },

          modal: {
            // Closing the sheet is not a failure, just an abandoned attempt.
            ondismiss: () => resolve(),
          },
        });

        checkout.on('payment.failed', (response) => {
          setError(response?.error?.description ?? 'The payment did not go through');
          resolve();
        });

        checkout.open();
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, [booking, onPaid, toast]);

  if (!config?.enabled) return null;

  if (booking.payment?.status === 'paid') {
    return (
      <p className={`flex items-center gap-2 text-sm font-semibold text-coop-700 ${className}`}>
        <CheckCircle2 size={16} /> Paid {inr(booking.pricing?.total)}
      </p>
    );
  }

  return (
    <div className={className}>
      <button onClick={pay} disabled={busy} className="btn-primary w-full justify-center py-2.5">
        {busy ? <Spinner size={16} /> : <CreditCard size={16} />}
        Pay {inr(booking.pricing?.total)}
      </button>

      {error && (
        <p className="mt-2 flex items-start gap-2 text-xs text-red-700">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}

      <p className="muted mt-2 text-center text-xs">
        Card, UPI or netbanking · or pay cash on completion
      </p>
    </div>
  );
}
