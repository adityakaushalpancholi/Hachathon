import {
  Zap, Droplet, Sparkles, Wind, Hammer, PaintRoller, Bug, BookOpen, Wrench,
} from 'lucide-react';

/**
 * The service catalogue stores an icon *name* rather than a component, so the
 * database stays framework-agnostic. This is the one place that resolves them.
 */
const ICONS = {
  zap: Zap,
  droplet: Droplet,
  sparkles: Sparkles,
  wind: Wind,
  hammer: Hammer,
  'paint-roller': PaintRoller,
  bug: Bug,
  'book-open': BookOpen,
  wrench: Wrench,
};

export const serviceIcon = (name) => ICONS[name] ?? Wrench;

/** Accent classes per service, keyed off the catalogue's `heroColor`. */
export const HERO_TONE = {
  coop: { bg: 'bg-coop-100', text: 'text-coop-700', ring: 'ring-coop-200' },
  navy: { bg: 'bg-navy-100', text: 'text-navy-700', ring: 'ring-navy-200' },
  saffron: { bg: 'bg-saffron-100', text: 'text-saffron-700', ring: 'ring-saffron-200' },
};

export const tone = (key) => HERO_TONE[key] ?? HERO_TONE.navy;
