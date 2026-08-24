import { Navigate, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth, HOME_FOR_ROLE } from '../context/AuthContext.jsx';
import { Spinner } from './UI.jsx';

/**
 * Panel gate.
 *
 * Reads the role the *server* assigned to this token (via `/auth/me`) and
 * refuses to mount a panel it does not match. This is a UX guard only — the
 * real boundary is `requireRole` on the API, which rejects a mismatched token
 * regardless of what the client renders.
 */
export default function RequireRole({ role, children }) {
  const { isAuthenticated, role: actual, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-navy-500">
          <Spinner size={26} />
          <p className="text-sm font-medium">Restoring your session…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Remember where they were headed so login can return them there.
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  const allowed = Array.isArray(role) ? role : [role];

  if (!allowed.includes(actual)) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
        <div className="mb-4 rounded-full bg-red-100 p-3.5 text-red-600">
          <ShieldAlert size={24} />
        </div>
        <h1 className="text-xl font-bold text-navy-900">This panel is not for your account</h1>
        <p className="mt-2 text-sm text-navy-500">
          You are signed in as a <strong className="text-navy-700">{actual}</strong>. The{' '}
          <strong className="text-navy-700">{allowed.join(' or ')}</strong> panel needs a different
          account.
        </p>
        <a href={HOME_FOR_ROLE[actual] ?? '/'} className="btn-primary mt-5">
          Go to my panel
        </a>
      </div>
    );
  }

  return children;
}
