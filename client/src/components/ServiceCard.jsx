import { Link } from 'react-router-dom';
import { Star, Zap as Bolt, ArrowRight } from 'lucide-react';
import { serviceIcon, tone } from '../lib/icons.jsx';
import { inr } from '../lib/format.js';

export default function ServiceCard({ service, to }) {
  const Icon = serviceIcon(service.icon);
  const t = tone(service.heroColor);
  const cheapest = service.packages?.length
    ? Math.min(...service.packages.map((p) => p.price))
    : service.basePrice;

  return (
    <Link
      to={to ?? `/service/${service._id}`}
      className="card group flex flex-col p-5 transition hover:-translate-y-0.5 hover:shadow-lift"
    >
      <div className="flex items-start justify-between gap-3">
        <div className={`rounded-xl p-2.5 ${t.bg} ${t.text}`}>
          <Icon size={20} />
        </div>
        {service.emergencyAvailable && (
          <span className="badge-saffron">
            <Bolt size={11} /> 24×7
          </span>
        )}
      </div>

      <h3 className="mt-3.5 font-bold tracking-tight text-navy-900">{service.name}</h3>
      <p className="mt-1 line-clamp-2 text-sm leading-snug text-navy-500">{service.tagline}</p>

      <div className="mt-4 flex items-end justify-between gap-2 border-t border-navy-100 pt-3.5">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-navy-400">From</p>
          <p className="tnum text-lg font-bold text-navy-900">{inr(cheapest)}</p>
        </div>

        <div className="flex flex-col items-end gap-1">
          {service.stats?.avgRating > 0 && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-navy-600">
              <Star size={12} className="fill-amber-400 text-amber-400" />
              {service.stats.avgRating.toFixed(1)}
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-coop-700 opacity-0 transition group-hover:opacity-100">
            Book <ArrowRight size={12} />
          </span>
        </div>
      </div>
    </Link>
  );
}
