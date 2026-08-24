import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import RequireRole from './components/RequireRole.jsx';
import PublicLayout from './layouts/PublicLayout.jsx';
import PanelLayout from './layouts/PanelLayout.jsx';
import { Spinner } from './components/UI.jsx';
import { CUSTOMER_NAV, WORKER_NAV, ADMIN_NAV } from './lib/nav.jsx';

/* Public pages load with the shell; panels are split per route so a customer
   never downloads the admin bundle. */
const Landing = lazy(() => import('./pages/Landing.jsx'));
const Login = lazy(() => import('./pages/Login.jsx'));
const Register = lazy(() => import('./pages/Register.jsx'));
const Browse = lazy(() => import('./pages/Browse.jsx'));
const ServiceDetail = lazy(() => import('./pages/ServiceDetail.jsx'));
const WorkerProfile = lazy(() => import('./pages/WorkerProfile.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));

// Customer panel
const CustomerHome = lazy(() => import('./panels/customer/CustomerHome.jsx'));
const NewBooking = lazy(() => import('./panels/customer/NewBooking.jsx'));
const BookingTracker = lazy(() => import('./panels/customer/BookingTracker.jsx'));
const MyBookings = lazy(() => import('./panels/customer/MyBookings.jsx'));
const Nearby = lazy(() => import('./panels/customer/Nearby.jsx'));

// Worker panel
const WorkerHome = lazy(() => import('./panels/worker/WorkerHome.jsx'));
const JobInbox = lazy(() => import('./panels/worker/JobInbox.jsx'));
const ActiveJob = lazy(() => import('./panels/worker/ActiveJob.jsx'));
const Earnings = lazy(() => import('./panels/worker/Earnings.jsx'));

// Admin panel
const AdminOverview = lazy(() => import('./panels/admin/AdminOverview.jsx'));
const Verification = lazy(() => import('./panels/admin/Verification.jsx'));
const Operations = lazy(() => import('./panels/admin/Operations.jsx'));
const Settlement = lazy(() => import('./panels/admin/Settlement.jsx'));
const Insights = lazy(() => import('./panels/admin/Insights.jsx'));

const PageLoader = () => (
  <div className="flex min-h-[50vh] items-center justify-center text-navy-400">
    <Spinner size={26} />
  </div>
);

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* ------------------------------ public ------------------------------ */}
        <Route element={<PublicLayout />}>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/browse" element={<Browse />} />
          <Route path="/service/:id" element={<ServiceDetail />} />
          <Route path="/worker/:id" element={<WorkerProfile />} />
        </Route>

        {/* --------------------------- CUSTOMER panel ------------------------- */}
        <Route
          path="/app"
          element={
            <RequireRole role="customer">
              <PanelLayout nav={CUSTOMER_NAV} panel="customer" />
            </RequireRole>
          }
        >
          <Route index element={<CustomerHome />} />
          <Route path="book" element={<NewBooking />} />
          <Route path="bookings" element={<MyBookings />} />
          <Route path="booking/:id" element={<BookingTracker />} />
          <Route path="nearby" element={<Nearby />} />
        </Route>

        {/* ---------------------------- WORKER panel -------------------------- */}
        <Route
          path="/work"
          element={
            <RequireRole role="worker">
              <PanelLayout nav={WORKER_NAV} panel="worker" />
            </RequireRole>
          }
        >
          <Route index element={<WorkerHome />} />
          <Route path="inbox" element={<JobInbox />} />
          <Route path="job/:id" element={<ActiveJob />} />
          <Route path="earnings" element={<Earnings />} />
        </Route>

        {/* ----------------------------- ADMIN panel -------------------------- */}
        <Route
          path="/admin"
          element={
            <RequireRole role="admin">
              <PanelLayout nav={ADMIN_NAV} panel="admin" />
            </RequireRole>
          }
        >
          <Route index element={<AdminOverview />} />
          <Route path="verification" element={<Verification />} />
          <Route path="operations" element={<Operations />} />
          <Route path="settlement" element={<Settlement />} />
          <Route path="insights" element={<Insights />} />
        </Route>

        <Route path="/dashboard" element={<Navigate to="/app" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
