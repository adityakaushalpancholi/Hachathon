import { TrendingUp, Info, Loader2 } from 'lucide-react';
import { inr, pct } from '../../lib/format.js';

/**
 * The full price breakdown, including where each rupee ends up.
 *
 * Showing the payout split *before* the customer commits is the product's
 * central claim made checkable — the same numbers the settlement run will use
 * later are visible here, at booking time.
 */
export default function PriceBreakdown({ quote, refreshing }) {
  const pricing = quote.pricing;
  const surge = quote.surge;

  /**
   * `split` is a derived convenience the quote endpoint returns; a stored
   * booking carries only the amounts. Recompute it here rather than persisting
   * it on the document, so the percentages can never drift from the rupees.
   */
  const p = {
    ...pricing,
    split: pricing.split ?? {
      workerPct: pricing.subtotal ? Math.round((pricing.workerPayout / pricing.subtotal) * 100) : 0,
      coopPct: pricing.subtotal ? Math.round((pricing.coopCommission / pricing.subtotal) * 100) : 0,
      platformPct: pricing.subtotal ? Math.round((pricing.platformFee / pricing.subtotal) * 100) : 0,
    },
  };

  const lines = [
    { label: quote.package?.name ?? 'Base price', value: p.base },
    surge?.multiplier > 1 && {
      label: `Demand pricing ×${surge.multiplier}`,
      value: p.surgeAmount,
      tone: 'saffron',
      hint: `${surge.openDemand} open requests vs ${surge.availableSupply} available members`,
    },
    p.emergencySurcharge > 0 && {
      label: 'Emergency surcharge',
      value: p.emergencySurcharge,
      tone: 'saffron',
    },
    ...(p.addOns ?? []).map((a) => ({ label: a.name, value: a.price })),
    p.discount > 0 && {
      label: p.couponLabel ?? `Offer ${p.couponCode}`,
      value: -p.discount,
      tone: 'coop',
    },
  ].filter(Boolean);

  return (
    <div className="card overflow-hidden">
      <div className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="panel-title">Price</h3>
          {refreshing && <Loader2 size={14} className="animate-spin text-navy-400" />}
        </div>

        <dl className="space-y-2.5 text-sm">
          {lines.map((l, i) => (
            <div key={i}>
              <div className="flex items-baseline justify-between gap-4">
                <dt
                  className={
                    l.tone === 'coop'
                      ? 'text-coop-700'
                      : l.tone === 'saffron'
                        ? 'text-saffron-700'
                        : 'text-navy-600'
                  }
                >
                  {l.label}
                </dt>
                <dd
                  className={`tnum shrink-0 font-semibold ${
                    l.tone === 'coop'
                      ? 'text-coop-700'
                      : l.tone === 'saffron'
                        ? 'text-saffron-700'
                        : 'text-navy-900'
                  }`}
                >
                  {l.value < 0 ? `− ${inr(-l.value)}` : inr(l.value)}
                </dd>
              </div>
              {l.hint && <p className="mt-0.5 text-xs text-navy-400">{l.hint}</p>}
            </div>
          ))}

          <div className="flex items-baseline justify-between gap-4 border-t border-navy-100 pt-3">
            <dt className="text-base font-bold text-navy-900">You pay</dt>
            <dd className="tnum text-2xl font-bold text-navy-900">{inr(p.total)}</dd>
          </div>
        </dl>
      </div>

      {/* ------------------------ ownership split ------------------------ */}
      <div className="border-t border-coop-200 bg-coop-50 p-5">
        <div className="mb-3 flex items-center gap-2">
          <TrendingUp size={15} className="text-coop-700" />
          <h4 className="text-sm font-bold text-coop-900">Where this money goes</h4>
        </div>

        {/* Proportional bar — width is the share, so the visual matches the number. */}
        <div className="flex h-7 overflow-hidden rounded-lg">
          <div
            className="flex items-center justify-center bg-coop-600 text-[11px] font-bold text-white"
            style={{ width: `${p.split.workerPct}%` }}
          >
            {p.split.workerPct}%
          </div>
          <div
            className="flex items-center justify-center bg-navy-700 text-[10px] font-bold text-white"
            style={{ width: `${p.split.coopPct}%` }}
          >
            {p.split.coopPct > 5 ? `${p.split.coopPct}%` : ''}
          </div>
          <div className="bg-navy-300" style={{ width: `${p.split.platformPct}%` }} />
        </div>

        <dl className="mt-3.5 space-y-2 text-sm">
          <div className="flex items-baseline justify-between">
            <dt className="flex items-center gap-2 text-coop-900">
              <span className="h-2.5 w-2.5 rounded-sm bg-coop-600" />
              To the member who does the work
            </dt>
            <dd className="tnum font-bold text-coop-900">{inr(p.workerPayout)}</dd>
          </div>

          <div className="flex items-baseline justify-between">
            <dt className="flex items-center gap-2 text-coop-800">
              <span className="h-2.5 w-2.5 rounded-sm bg-navy-700" />
              Cooperative ({pct(p.split.coopPct)})
            </dt>
            <dd className="tnum font-semibold text-coop-800">{inr(p.coopCommission)}</dd>
          </div>

          <div className="flex items-baseline justify-between">
            <dt className="flex items-center gap-2 text-coop-800">
              <span className="h-2.5 w-2.5 rounded-sm bg-navy-300" />
              Platform running cost
            </dt>
            <dd className="tnum font-semibold text-coop-800">{inr(p.platformFee)}</dd>
          </div>
        </dl>

        <p className="mt-3.5 flex items-start gap-2 border-t border-coop-200 pt-3 text-xs leading-relaxed text-coop-800">
          <Info size={13} className="mt-0.5 shrink-0" />
          <span>
            Forty percent of the cooperative&rsquo;s share returns to members as a dividend at the
            end of the settlement period. On an investor-owned app, roughly {inr(Math.round(p.total * 0.25))}{' '}
            of this booking would leave as platform margin.
          </span>
        </p>
      </div>
    </div>
  );
}
