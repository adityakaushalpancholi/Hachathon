import {
  LayoutDashboard, CalendarCheck, MapPin, PlusCircle,
  Inbox, Wrench, Wallet,
  ShieldCheck, Activity, Banknote, TrendingUp,
} from 'lucide-react';

/**
 * Panel navigation. Each panel's routes are declared once here and consumed by
 * both the sidebar and the mobile tab bar, so they can never drift apart.
 */

export const CUSTOMER_NAV = [
  { to: '/app', end: true, label: 'Overview', icon: LayoutDashboard },
  { to: '/app/book', label: 'Book a service', icon: PlusCircle },
  { to: '/app/bookings', label: 'My bookings', icon: CalendarCheck },
  { to: '/app/nearby', label: 'Nearby members', icon: MapPin },
];

export const WORKER_NAV = [
  { to: '/work', end: true, label: 'Today', icon: LayoutDashboard },
  { to: '/work/inbox', label: 'Job offers', icon: Inbox, badgeKey: 'offers' },
  { to: '/work/earnings', label: 'Earnings', icon: Wallet },
];

export const ADMIN_NAV = [
  { to: '/admin', end: true, label: 'Overview', icon: LayoutDashboard },
  { to: '/admin/verification', label: 'Verification', icon: ShieldCheck, badgeKey: 'pending' },
  { to: '/admin/operations', label: 'Operations', icon: Activity },
  { to: '/admin/settlement', label: 'Settlement', icon: Banknote },
  { to: '/admin/insights', label: 'Insights', icon: TrendingUp },
];

export const PANEL_META = {
  customer: { title: 'Customer', accent: 'navy', icon: LayoutDashboard },
  worker: { title: 'Member', accent: 'coop', icon: Wrench },
  admin: { title: 'Cooperative Board', accent: 'saffron', icon: ShieldCheck },
};
