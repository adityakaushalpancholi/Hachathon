import mongoose from 'mongoose';

/**
 * Service catalogue entry.
 *
 * Modelled on Urban Company's category → service → package hierarchy: a customer
 * picks a fixed-scope package with a known price rather than negotiating an
 * hourly rate, which is what makes the pricing legible up front.
 */
const packageSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    price: { type: Number, required: true, min: 0 },
    durationMins: { type: Number, required: true, min: 15 },
    includes: { type: [String], default: [] },
    excludes: { type: [String], default: [] },
    popular: { type: Boolean, default: false },
  },
  { _id: true },
);

const serviceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    category: { type: String, required: true, trim: true, index: true },
    skillTag: { type: String, required: true, trim: true, index: true },
    tagline: { type: String, trim: true },
    description: { type: String, trim: true },
    icon: { type: String, default: 'wrench' },
    heroColor: { type: String, default: 'coop' },

    basePrice: { type: Number, required: true, min: 0 },
    unit: { type: String, enum: ['per_job', 'per_hour', 'per_visit'], default: 'per_job' },
    baseDurationMins: { type: Number, default: 60 },

    packages: { type: [packageSchema], default: [] },

    // Shown to the customer before booking, and to the worker as a job checklist.
    checklist: { type: [String], default: [] },
    // Tools the worker is expected to bring.
    equipment: { type: [String], default: [] },

    emergencyAvailable: { type: Boolean, default: false },
    emergencySurcharge: { type: Number, default: 0 },

    stats: {
      bookings: { type: Number, default: 0 },
      avgRating: { type: Number, default: 0 },
      activeWorkers: { type: Number, default: 0 },
    },

    displayOrder: { type: Number, default: 100 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

serviceSchema.index({ name: 'text', description: 'text', category: 'text', skillTag: 'text' });
serviceSchema.index({ isActive: 1, displayOrder: 1 });

export const Service = mongoose.model('Service', serviceSchema);
