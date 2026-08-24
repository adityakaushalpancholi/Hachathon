import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import Logo from '../components/Logo.jsx';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <Logo />
      <div className="mt-8 rounded-full bg-navy-100 p-4 text-navy-400">
        <Compass size={26} />
      </div>
      <h1 className="mt-5 text-2xl font-bold tracking-tight text-navy-900">
        There is nothing at this address
      </h1>
      <p className="muted mt-2 max-w-sm">
        The page may have moved, or the link may be incomplete.
      </p>
      <div className="mt-6 flex gap-2">
        <Link to="/" className="btn-primary">
          Back to home
        </Link>
        <Link to="/browse" className="btn-outline">
          Browse services
        </Link>
      </div>
    </div>
  );
}
