import { randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { config } from 'dotenv';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { Pool } from 'pg';
import request from 'supertest';
import { createApp } from '../server/dist/app.js';
import { parseEnv } from '../server/dist/config/env.js';
import { createDatabase } from '../server/dist/lib/database.js';
import { Prisma } from '../server/dist/generated/prisma/client.js';

config({ path: '.env' });
const env = parseEnv();
const database = createDatabase(env.DATABASE_URL);
const pool = new Pool({ connectionString: env.DATABASE_URL });
const Store = connectPgSimple(session);
const store = new Store({ pool, createTableIfMissing: false, pruneSessionInterval: false });
const app = createApp(env, database, { prisma: database.prisma, store, secret: env.SESSION_SECRET });
const agent = request.agent(app);
const email = `perf-${randomBytes(8).toString('hex')}@example.test`;
const password = `Performance-${randomBytes(15).toString('base64url')}`;
let userId;

function percentiles(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  return { medianMs: Number(sorted[Math.floor(sorted.length / 2)].toFixed(1)), p95Ms: Number(sorted[Math.ceil(sorted.length * 0.95) - 1].toFixed(1)) };
}

async function measure(name, path) {
  const samples = [];
  for (let index = 0; index < 11; index += 1) {
    const start = performance.now();
    const result = await agent.get(path);
    const elapsed = performance.now() - start;
    if (result.status !== 200) throw new Error(`${name} returned HTTP ${result.status}`);
    if (index > 0) samples.push(elapsed);
  }
  return { name, ...percentiles(samples) };
}

try {
  await database.check();
  const csrf = (await agent.get('/api/auth/csrf').expect(200)).body.csrfToken;
  const registered = await agent.post('/api/auth/register').set('Origin', env.CLIENT_ORIGIN).set('X-CSRF-Token', csrf)
    .send({ name: 'Performance Audit', email, password }).expect(201);
  userId = registered.body.user.id;
  const loginCsrf = (await agent.get('/api/auth/csrf').expect(200)).body.csrfToken;
  await agent.post('/api/auth/login').set('Origin', env.CLIENT_ORIGIN).set('X-CSRF-Token', loginCsrf)
    .send({ email, password }).expect(200);
  const category = await database.prisma.category.create({ data: { userId, name: 'Sample', type: 'EXPENSE', color: '#174f3c', icon: 'folder' } });
  await database.prisma.transaction.createMany({ data: Array.from({ length: 500 }, (_, index) => ({
    userId, categoryId: category.id, type: 'EXPENSE', amount: new Prisma.Decimal('0.10'),
    transactionDate: new Date(`2026-10-${String(index % 25 + 1).padStart(2, '0')}T00:00:00.000Z`),
    description: `Audit transaction ${index}`,
  })) });
  await database.prisma.budget.create({ data: { userId, categoryId: null, month: new Date('2026-10-01T00:00:00.000Z'), amount: new Prisma.Decimal('100.00') } });

  const metrics = [];
  metrics.push(await measure('transactions page', '/api/transactions?page=1&pageSize=20&startDate=2026-10-01&endDate=2026-10-31'));
  metrics.push(await measure('analytics summary', '/api/analytics/summary?startDate=2026-10-01&endDate=2026-10-31'));
  metrics.push(await measure('analytics trends', '/api/analytics/trends?startDate=2026-10-01&endDate=2026-10-31'));
  metrics.push(await measure('analytics categories', '/api/analytics/categories?startDate=2026-10-01&endDate=2026-10-31'));
  metrics.push(await measure('budget summary', '/api/budgets/summary?month=2026-10'));
  metrics.push(await measure('CSV export', '/api/transactions/export?startDate=2026-10-01&endDate=2026-10-31'));

  const plan = await database.prisma.$queryRaw`EXPLAIN (FORMAT JSON) SELECT id FROM "Transaction" WHERE "userId" = ${userId}::uuid AND "transactionDate" BETWEEN '2026-10-01'::date AND '2026-10-31'::date ORDER BY "transactionDate" DESC LIMIT 20`;
  const root = plan[0]['QUERY PLAN'][0].Plan;
  const nodes = [];
  function walk(node) { nodes.push(node['Node Type'] + (node['Index Name'] ? ` (${node['Index Name']})` : '')); for (const child of node.Plans ?? []) walk(child); }
  walk(root);
  process.stdout.write(JSON.stringify({ dataset: '500 synthetic transactions, one isolated user', runsPerEndpoint: 10, metrics, queryPlanNodes: nodes }, null, 2) + '\n');
} finally {
  if (userId) {
    await database.prisma.session.deleteMany({ where: { sess: { path: ['userId'], equals: userId } } });
    await database.prisma.user.delete({ where: { id: userId } });
  }
  await database.disconnect();
  await pool.end();
}
