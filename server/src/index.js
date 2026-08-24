import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase, isEphemeral } from './config/db.js';
import { startScheduler, stopScheduler } from './services/scheduler.service.js';
import { runSeed } from './seed/seed.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';

async function bootstrap() {
  await connectDatabase();

  // An in-memory database starts empty every time, so seed it or the panels
  // would open onto a blank app.
  if (isEphemeral() && env.seedOnBoot) {
    logger.info('seeding ephemeral database…');
    await runSeed({ quiet: true });
  }

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
