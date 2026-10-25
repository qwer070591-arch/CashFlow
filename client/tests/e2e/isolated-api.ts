import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { config } from 'dotenv';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { Pool } from 'pg';
import { test as base, expect } from '@playwright/test';
import { createApp } from '../../../server/src/app';
import { parseEnv } from '../../../server/src/config/env';
import { createDatabase } from '../../../server/src/lib/database';

config({ path: '.env' });

export const test = base.extend<object, { apiPort: number }>({
  // Playwright requires object destructuring for fixture dependencies, even when none are used.
  // eslint-disable-next-line no-empty-pattern
  apiPort: [async ({}, use) => {
    const env = parseEnv();
    const database = createDatabase(env.DATABASE_URL);
    const pool = new Pool({ connectionString: env.DATABASE_URL });
    const Store = connectPgSimple(session);
    const store = new Store({ pool, createTableIfMissing: false, pruneSessionInterval: false });
    const app = createApp(env, database, { prisma: database.prisma, store, secret: env.SESSION_SECRET });
    const server = createServer(app);
    try {
      await database.check();
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      await use((server.address() as AddressInfo).port);
    } finally {
      if (server.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await database.disconnect();
      await pool.end();
    }
  }, { scope: 'worker' }],
  page: async ({ page, apiPort }, use) => {
    await page.route('**/api/**', async (route) => {
      const url = new URL(route.request().url());
      const response = await route.fetch({ url: `http://127.0.0.1:${apiPort}${url.pathname}${url.search}` });
      await route.fulfill({ response });
    });
    await use(page);
  },
});

export { expect };
