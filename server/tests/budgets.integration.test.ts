import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';
import { createDatabase } from '../src/lib/database.js';

config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });
const env = parseEnv();
const database = createDatabase(env.DATABASE_URL);
const pool = new Pool({ connectionString: env.DATABASE_URL });
const Store = connectPgSimple(session);
const store = new Store({ pool, createTableIfMissing: false, pruneSessionInterval: false });
const app = createApp(env, database, { prisma: database.prisma, store, secret: env.SESSION_SECRET });
const a = request.agent(app);
const b = request.agent(app);
const ids: string[] = [];
const password = 'Budget-Test-2026!';

async function csrf(agent: typeof a) { return (await agent.get('/api/auth/csrf').expect(200)).body.csrfToken as string; }
function write(agent: typeof a, method: 'post' | 'patch' | 'delete', path: string, token: string, body?: object) {
  const call = agent[method](path).set('Origin', env.CLIENT_ORIGIN).set('X-CSRF-Token', token);
  return body ? call.send(body) : call;
}
async function account(agent: typeof a) {
  const email = `budget-${randomUUID()}@example.test`;
  const registered = await write(agent, 'post', '/api/auth/register', await csrf(agent), { name: 'Budget Test', email, password });
  expect(registered.status).toBe(201);
  ids.push(registered.body.user.id);
  expect((await write(agent, 'post', '/api/auth/login', await csrf(agent), { email, password })).status).toBe(200);
  return csrf(agent);
}
async function category(agent: typeof a, token: string, name: string, type: 'INCOME' | 'EXPENSE' = 'EXPENSE') {
  const result = await write(agent, 'post', '/api/categories', token, { name, type });
  expect(result.status).toBe(201);
  return result.body.category.id as string;
}
async function transaction(agent: typeof a, token: string, categoryId: string, amount: string, date = '2026-10-01', type: 'INCOME' | 'EXPENSE' = 'EXPENSE') {
  const result = await write(agent, 'post', '/api/transactions', token, { categoryId, amount, type, transactionDate: date, description: 'Budget integration' });
  expect(result.status).toBe(201);
  return result.body.transaction.id as string;
}

beforeAll(async () => { await database.check(); });
afterAll(async () => {
  for (const id of ids) {
    await database.prisma.session.deleteMany({ where: { sess: { path: ['userId'], equals: id } } });
    await database.prisma.user.delete({ where: { id } });
  }
  await database.disconnect();
  await pool.end();
});

it('keeps monthly and category budgets precise, isolated, and current with transactions', async () => {
  const tokenA = await account(a);
  const tokenB = await account(b);
  const first = await category(a, tokenA, 'Meals');
  const second = await category(a, tokenA, 'Travel');
  const third = await category(a, tokenA, 'Shopping');
  const fourth = await category(a, tokenA, 'Housing');
  const unused = await category(a, tokenA, 'Unused');
  const incomeCategory = await category(a, tokenA, 'Salary', 'INCOME');
  const foreign = await category(b, tokenB, 'Meals');

  expect((await request(app).get('/api/budgets')).status).toBe(401);
  expect((await request(app).get('/api/budgets/summary')).status).toBe(401);
  expect((await a.post('/api/budgets').set('Origin', env.CLIENT_ORIGIN).send({ month: '2026-10', amount: '300.00', categoryId: null })).status).toBe(403);
  const empty = await a.get('/api/budgets/summary?month=2026-10').expect(200);
  expect(empty.body).toMatchObject({ overallBudget: null, totalExpense: '0.00', nearLimitCount: 0, overBudgetCount: 0, categoryBudgets: [] });
  for (const payload of [
    { month: '2026-13', categoryId: null, amount: '1.00' },
    { month: '2026-00', categoryId: null, amount: '1.00' },
    { month: '2026-10', categoryId: null, amount: '0' },
    { month: '2026-10', categoryId: null, amount: '-1.00' },
    { month: '2026-10', categoryId: null, amount: '1e2' },
    { month: '2026-10', categoryId: null, amount: '10000000000000000.00' },
    { month: '2026-10', categoryId: null, amount: 'NaN' },
    { month: '2026-10', categoryId: null, amount: 'Infinity' },
  ]) expect((await write(a, 'post', '/api/budgets', tokenA, payload)).status).toBe(400);
  expect((await write(a, 'post', '/api/budgets', tokenA, { month: '2026-10', categoryId: incomeCategory, amount: '100.00' })).status).toBe(400);
  expect((await write(a, 'post', '/api/budgets', tokenA, { month: '2026-10', categoryId: foreign, amount: '100.00' })).status).toBe(400);
  expect((await a.get('/api/budgets?month=2026-13')).status).toBe(400);

  const overall = await write(a, 'post', '/api/budgets', tokenA, { month: '2026-10', categoryId: null, amount: '300.00' });
  expect(overall.status).toBe(201);
  expect(overall.body.budget).toMatchObject({ categoryId: null, spent: '0.00', remaining: '300.00', status: 'NORMAL' });
  const overallId = overall.body.budget.id as string;
  expect((await write(a, 'post', '/api/budgets', tokenA, { month: '2026-10', categoryId: null, amount: '500.00' })).status).toBe(409);
  const simultaneous = await Promise.all([
    write(a, 'post', '/api/budgets', tokenA, { month: '2026-12', categoryId: null, amount: '10.00' }),
    write(a, 'post', '/api/budgets', tokenA, { month: '2026-12', categoryId: null, amount: '20.00' }),
  ]);
  expect(simultaneous.map((result) => result.status).sort()).toEqual([201, 409]);
  const categoryIds = [first, second, third, fourth, unused];
  const budgetIds: string[] = [];
  for (const categoryId of categoryIds) {
    const created = await write(a, 'post', '/api/budgets', tokenA, { month: '2026-10', categoryId, amount: '100.00' });
    expect(created.status).toBe(201);
    budgetIds.push(created.body.budget.id);
  }
  expect((await write(a, 'post', '/api/budgets', tokenA, { month: '2026-10', categoryId: first, amount: '1.00' })).status).toBe(409);
  expect((await write(b, 'post', '/api/budgets', tokenB, { month: '2026-10', categoryId: foreign, amount: '100.00' })).status).toBe(201);
  expect((await b.get('/api/budgets?month=2026-10')).body.budgets).toHaveLength(1);
  expect((await b.get(`/api/budgets/${overallId}`)).status).toBe(404);
  expect((await write(b, 'patch', `/api/budgets/${overallId}`, tokenB, { amount: '1.00' })).status).toBe(404);
  expect((await write(b, 'delete', `/api/budgets/${overallId}`, tokenB)).status).toBe(404);

  for (let index = 0; index < 25; index += 1) await transaction(a, tokenA, first, '0.10', index === 0 ? '2026-10-31' : '2026-10-01');
  const movable = await transaction(a, tokenA, first, '77.49', '2026-10-31');
  await transaction(a, tokenA, second, '80.00');
  await transaction(a, tokenA, third, '100.00');
  await transaction(a, tokenA, fourth, '120.00');
  await transaction(a, tokenA, incomeCategory, '9999.00', '2026-10-01', 'INCOME');
  await transaction(a, tokenA, first, '50.00', '2026-11-01');
  const summary = await a.get('/api/budgets/summary?month=2026-10').expect(200);
  expect(summary.body).toMatchObject({ totalExpense: '379.99', nearLimitCount: 1, atLimitCount: 1, overBudgetCount: 1 });
  expect(summary.body.overallBudget).toMatchObject({ spent: '379.99', remaining: '-79.99', status: 'OVER_BUDGET' });
  const statuses = new Map<string, { spent: string; usagePercent: string; status: string }>(summary.body.categoryBudgets.map((item: { categoryId: string; spent: string; usagePercent: string; status: string }) => [item.categoryId, item]));
  expect(statuses.get(first)).toMatchObject({ spent: '79.99', usagePercent: '79.99', status: 'NORMAL' });
  expect(statuses.get(second)).toMatchObject({ spent: '80.00', usagePercent: '80.00', status: 'NEAR_LIMIT' });
  expect(statuses.get(third)).toMatchObject({ spent: '100.00', usagePercent: '100.00', status: 'AT_LIMIT' });
  expect(statuses.get(fourth)).toMatchObject({ spent: '120.00', usagePercent: '120.00', status: 'OVER_BUDGET' });
  expect((await a.get(`/api/budgets/${overallId}`).expect(200)).body.budget.spent).toBe('379.99');
  expect((await a.get('/api/budgets?month=2026-10').expect(200)).body.budgets).toHaveLength(6);
  expect((await b.get('/api/budgets/summary?month=2026-10').expect(200)).body.totalExpense).toBe('0.00');
  expect((await write(a, 'delete', `/api/categories/${unused}`, tokenA)).status).toBe(409);
  expect((await write(a, 'patch', `/api/categories/${unused}`, tokenA, { name: 'Renamed' })).status).toBe(200);
  const renamed = await a.get('/api/budgets/summary?month=2026-10').expect(200);
  expect(renamed.body.categoryBudgets.find((item: { categoryId: string }) => item.categoryId === unused).category.name).toBe('Renamed');

  expect((await write(a, 'patch', `/api/budgets/${overallId}`, tokenA, { month: '2026-11' })).status).toBe(400);
  expect((await write(a, 'patch', `/api/budgets/${overallId}`, tokenA, { amount: '400.00' })).status).toBe(200);
  expect((await a.get(`/api/budgets/${overallId}`)).body.budget.remaining).toBe('20.01');
  expect((await write(a, 'patch', `/api/transactions/${movable}`, tokenA, { transactionDate: '2026-11-01' })).status).toBe(200);
  expect((await a.get('/api/budgets/summary?month=2026-10')).body.totalExpense).toBe('302.50');
  expect((await a.get('/api/budgets/summary?month=2026-11')).body.totalExpense).toBe('127.49');
  expect((await write(a, 'patch', `/api/transactions/${movable}`, tokenA, { transactionDate: '2026-10-01', categoryId: second })).status).toBe(200);
  const moved = await a.get('/api/budgets/summary?month=2026-10').expect(200);
  expect(moved.body.categoryBudgets.find((item: { categoryId: string }) => item.categoryId === first).spent).toBe('2.50');
  expect(moved.body.categoryBudgets.find((item: { categoryId: string }) => item.categoryId === second).spent).toBe('157.49');
  expect((await write(a, 'delete', `/api/budgets/${budgetIds[4]}`, 'invalid')).status).toBe(403);
  expect((await write(a, 'delete', `/api/budgets/${budgetIds[4]}`, tokenA)).status).toBe(204);
  expect((await a.get(`/api/budgets/${budgetIds[4]}`)).status).toBe(404);
  expect((await write(a, 'delete', `/api/categories/${unused}`, tokenA)).status).toBe(204);
  expect((await write(a, 'delete', `/api/budgets/${overallId}`, tokenA)).status).toBe(204);
  const withoutOverall = await a.get('/api/budgets/summary?month=2026-10').expect(200);
  expect(withoutOverall.body).toMatchObject({ overallBudget: null, totalExpense: '379.99' });
  expect((await database.prisma.transaction.count({ where: { userId: ids[0] } }))).toBe(31);
});
