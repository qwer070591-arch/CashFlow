import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { Pool } from 'pg';
import { parseEnv } from './config/env.js';
import { createDatabase } from './lib/database.js';

config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });
const env = parseEnv();
const database = createDatabase(env.DATABASE_URL);
const sessionPool = new Pool({ connectionString: env.DATABASE_URL });
sessionPool.on('error', () => { console.error('PostgreSQL session pool connection failed'); });
const PgStore = connectPgSimple(session);
const store = new PgStore({ pool: sessionPool, createTableIfMissing: false, pruneSessionInterval: 15 * 60, errorLog: () => { console.error('PostgreSQL session cleanup failed'); } });
const app = createApp(env, database, { prisma: database.prisma, store, secret: env.SESSION_SECRET });
const server = app.listen(env.PORT, env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1', () => {
  console.info(`CashFlow API listening on http://127.0.0.1:${env.PORT}`);
});

let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  server.close(async () => {
    await database.disconnect();
    await sessionPool.end();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
