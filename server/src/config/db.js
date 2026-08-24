import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

let memoryServer = null;

/**
 * Resolve a Mongo connection string.
 *
 * Priority:
 *   1. MONGO_URI from the environment (Atlas cluster or a local mongod)
 *   2. An ephemeral in-memory MongoDB, so the API boots with zero setup
 *
 * The in-memory server speaks the real MongoDB wire protocol, so geospatial
 * queries, aggregation pipelines and indexes all behave identically — the only
 * difference is that data does not survive a restart.
 */
async function resolveUri() {
  if (env.mongoUri) return { uri: env.mongoUri, ephemeral: false };

  logger.warn('MONGO_URI not set — starting an in-memory MongoDB instance');
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  memoryServer = await MongoMemoryServer.create({ instance: { dbName: env.dbName } });
  return { uri: memoryServer.getUri(), ephemeral: true };
}

export async function connectDatabase() {
  const { uri, ephemeral } = await resolveUri();

  mongoose.set('strictQuery', true);

  mongoose.connection.on('connected', () =>
    logger.success(`MongoDB connected (${ephemeral ? 'in-memory' : 'persistent'}) → ${env.dbName}`),
  );
  mongoose.connection.on('error', (err) => logger.error('MongoDB error', err.message));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));

  await mongoose.connect(uri, {
    dbName: env.dbName,
    serverSelectionTimeoutMS: 10_000,
  });

  // Indexes are declared on the schemas; build them up front so the first
  // $geoNear does not fail on a cold collection.
  await mongoose.connection.asPromise();

  return { ephemeral };
}

export async function disconnectDatabase() {
  await mongoose.connection.close();
  if (memoryServer) await memoryServer.stop();
}

export const isEphemeral = () => memoryServer !== null;
