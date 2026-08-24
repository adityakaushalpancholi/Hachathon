import { asyncHandler } from '../utils/ApiError.js';
import { ok } from '../utils/respond.js';
import {
  forecastDemand,
  hourlyProfile,
  weekdayProfile,
  workforceGaps,
  revenueTrend,
  zoneHeatmap,
} from '../services/forecast.service.js';
import { computeSurge } from '../services/pricing.service.js';
import { Service } from '../models/index.js';

export const demandForecast = asyncHandler(async (req, res) =>
  ok(res, await forecastDemand(req.query)),
);

export const profiles = asyncHandler(async (req, res) => {
  const [hourly, weekday] = await Promise.all([
    hourlyProfile({ skillTag: req.query.skillTag, zone: req.query.zone }),
    weekdayProfile({ skillTag: req.query.skillTag }),
  ]);
  return ok(res, { hourly, weekday });
});

export const gaps = asyncHandler(async (req, res) => ok(res, await workforceGaps(req.query)));

export const trend = asyncHandler(async (req, res) => ok(res, await revenueTrend(req.query)));

export const zones = asyncHandler(async (req, res) => ok(res, await zoneHeatmap(req.query)));

/**
 * Live surge board — current multiplier per skill, with the demand/supply counts
 * that produced it. Published openly rather than hidden, so members can see the
 * same pricing signal the algorithm sees.
 */
export const surgeBoard = asyncHandler(async (req, res) => {
  const services = await Service.find({ isActive: true }).select('name skillTag icon').lean();

  const rows = await Promise.all(
    services.map(async (svc) => {
      const surge = await computeSurge({ skillTag: svc.skillTag, zone: req.query.zone });
      return {
        service: svc.name,
        skillTag: svc.skillTag,
        icon: svc.icon,
        multiplier: surge.multiplier,
        openDemand: surge.openDemand,
        availableSupply: surge.availableSupply,
        reason: surge.reason,
      };
    }),
  );

  return ok(res, rows.sort((a, b) => b.multiplier - a.multiplier));
});
