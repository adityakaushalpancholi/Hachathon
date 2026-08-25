import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase, isEphemeral } from './config/db.js';
import { startScheduler, stopScheduler } from './services/scheduler.service.js';
import { runSeed } from './seed/seed.js';
import { purgeDemoData } from './seed/purge.js';
import { reconcileCompanyStats } from './seed/reconcile.js';
import { User } from './models/index.js';
import { env, assertProductionConfig } from './config/env.js';
import { hasOwners } from './services/owner.service.js';
import { warnIfNoGateway } from './services/payment.service.js';
import { logger } from './utils/logger.js';

/**
 * Demo data is only ever written to a database nobody could be relying on: an
 * in-memory one, which is discarded at exit, or an explicitly-requested empty
 * persistent one. The demo seed clears every collection, so the emptiness check
 * is what stands between a redeploy and someone's real bookings.
 */
async function shouldSeedDemo() {
  if (!env.seedDemo) return false;
  if (isEphemeral()) return true;
  return (await User.estimatedDocumentCount()) === 0;
}

async function bootstrap() {
  assertProductionConfig();

  await connectDatabase();

  // The catalogue is reference data and its seed only fills gaps, so it is safe
  // on every boot — including against a live database.
  if (env.seedOnBoot) await runSeed({ quiet: true, demo: false });

  if (await shouldSeedDemo()) {
    logger.warn('seeding demo data — fictional users, bookings and earnings');
    await runSeed({ quiet: true, demo: true });
  }

  // Runs after the seed so the two cannot fight over the same boot, and only
  // against a database still carrying the demo mark — see purge.js.
  if (env.purgeDemo) {
    const { purged } = await purgeDemoData();
    if (purged) {
      logger.warn('PURGE_DEMO ran — unset it now so a real signup never meets it');
    }
  }

  // Last, so it corrects drift left by anything above — including a purge that
  // ran on an earlier boot and left the counters behind.
  await reconcileCompanyStats();

  if (!hasOwners()) {
    logger.warn(
      'OWNER_PHONES is unset — nobody can hold the admin role. Set it to your mobile number to claim the admin panel.',
    );
  } else {
    logger.info(`admin authority: ${env.ownerPhones.length} owner number(s) configured`);
  }
  warnIfNoGateway();

  startScheduler();

  const app = createApp();
  const server = app.listen(env.port, () => {
    logger.success(`ShramSetu API listening on http://localhost:${env.port}`);
    logger.info(`panels: customer · worker · admin   |   env: ${env.nodeEnv}`);
  });

  const shutdown = async (signal) => {
    logger.warn(`${signal} received — shutting down`);
    stopScheduler();
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
    // Do not hang forever on a stuck connection.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (err) => logger.error('unhandled rejection', err));
}

bootstrap().catch((err) => {
  logger.error('failed to start:', err.message);
  console.error(err);
  process.exit(1);
});
