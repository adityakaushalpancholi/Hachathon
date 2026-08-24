/**
 * Remove seeded demo people from a database, from a terminal.
 *
 *   npm run purge:demo            report what is there, delete nothing
 *   npm run purge:demo -- --yes   actually delete
 *   npm run purge:demo -- --yes --force   delete even without the demo mark
 *
 * Reads MONGO_URI from server/.env, so point that at the database you mean.
 * The dry run is the default because the alternative — a flag-less command that
 * deletes every account — is the kind of tool that eventually deletes the wrong
 * database.
 */
import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { hasDemoData, purgeDemoData } from './purge.js';
import { User, Booking } from '../models/index.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const yes = process.argv.includes('--yes');
const force = process.argv.includes('--force');

await connectDatabase();

const users = await User.countDocuments();
const bookings = await Booking.countDocuments();
const marked = await hasDemoData();

logger.info(`database: ${env.dbName} · ${users} users · ${bookings} bookings`);
logger.info(marked ? 'demo seed mark: present' : 'demo seed mark: absent');

if (!yes) {
  logger.warn('dry run — nothing deleted. Re-run with --yes to purge.');
} else if (!marked && !force) {
  logger.error('no demo mark found; refusing to delete. Pass --force if you are certain.');
  process.exitCode = 1;
} else {
  await purgeDemoData({ force });
  logger.success('done — the service catalogue and cooperatives were kept');
}

await disconnectDatabase();
