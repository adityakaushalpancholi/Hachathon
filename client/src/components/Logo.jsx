import { Link } from 'react-router-dom';

/**
 * ShramSetu — "labour bridge". The mark is two spans meeting: the arc of a
 * bridge over a link, drawn so it reads at 28px in a navbar.
 */
export function LogoMark({ size = 32, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="8" className="fill-navy-900" />
      <path
        d="M7 21c0-5 4-8.5 9-8.5s9 3.5 9 8.5"
        className="stroke-coop-400"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path d="M7 21h18" className="stroke-saffron-400" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="16" cy="9" r="2.5" className="fill-saffron-400" />
    </svg>
  );
}

export default function Logo({ to = '/', size = 32, showText = true, className = '' }) {
  const content = (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} />
      {showText && (
        <span className="flex flex-col leading-none">
          <span className="text-[15px] font-extrabold tracking-tight text-navy-900">
            Shram<span className="text-coop-600">Setu</span>
          </span>
          <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-navy-400">
            Home services
          </span>
        </span>
      )}
    </span>
  );

  return to ? <Link to={to}>{content}</Link> : content;
}
