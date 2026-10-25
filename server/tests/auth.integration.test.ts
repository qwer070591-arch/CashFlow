import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';
import { createDatabase } from '../src/lib/database.js';

config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });
const env = parseEnv();
const origin = env.CLIENT_ORIGIN;
const database = createDatabase(env.DATABASE_URL);
const pool = new Pool({ connectionString: env.DATABASE_URL });
const PgStore = connectPgSimple(session);
const store = new PgStore({ pool, createTableIfMissing: false, pruneSessionInterval: false });
const app = createApp(env, database, { prisma: database.prisma, store, secret: env.SESSION_SECRET });
const unique = randomUUID().slice(0, 8);
const emailA = `phase2-${unique}@example.test`;
const emailB = `phase2-other-${unique}@example.test`;
const password = 'Correct-horse-2026!';
const createdIds: string[] = [];
const agent = request.agent(app);
const other = request.agent(app);

async function csrf(client = agent) {
  const response = await client.get('/api/auth/csrf').expect(200);
  return response.body.csrfToken as string;
}
async function post(client: typeof agent, path: string, token: string, body?: object) {
  return client.post(path).set('Origin', origin).set('X-CSRF-Token', token).send(body ?? {});
}
function cookie(response: request.Response) {
  return (response.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
}
function sid(value: string) {
  return decodeURIComponent(value.split('=')[1]!).slice(2).split('.')[0]!;
}

beforeAll(async () => { await database.check(); });
afterAll(async () => {
  for (const id of createdIds) {
    await database.prisma.session.deleteMany({ where: { sess: { path: ['userId'], equals: id } } });
    await database.prisma.user.deleteMany({ where: { id } });
  }
  await database.disconnect();
  await pool.end();
});

describe('real PostgreSQL authentication', () => {
  it('rejects missing CSRF and invalid input', async () => {
    expect((await agent.post('/api/auth/register').set('Origin', origin).send({ name: 'A', email: emailA, password })).status).toBe(403);
    const token = await csrf();
    expect((await post(agent, '/api/auth/register', 'invalid-token', { name: 'A', email: emailA, password })).status).toBe(403);
    expect((await post(agent, '/api/auth/register', token, { name: 'A', email: 'invalid', password })).status).toBe(400);
    expect((await post(agent, '/api/auth/register', token, { name: 'A', email: emailA, password: 'short' })).status).toBe(400);
    expect((await post(agent, '/api/auth/register', token, { name: 'A', email: emailA, password, admin: true })).status).toBe(400);
    expect((await agent.post('/api/auth/register').set('X-CSRF-Token', token).send({ name: 'A', email: emailA, password })).status).toBe(403);
  });

  it('accepts a localhost browser origin only in development', async () => {
    const development = createApp({ ...env, NODE_ENV: 'development' }, database, { prisma: database.prisma, store, secret: env.SESSION_SECRET });
    const local = request.agent(development);
    const token = await csrf(local);
    const accepted = await local.post('/api/auth/register').set('Origin', 'http://localhost:5173').set('X-CSRF-Token', token).send({ name: 'A', email: 'invalid', password });
    expect(accepted.status).toBe(400);
    expect(accepted.body.error.code).toBe('VALIDATION_ERROR');
    const rejected = await local.post('/api/auth/register').set('Origin', 'https://other.example').set('X-CSRF-Token', token).send({ name: 'A', email: emailA, password });
    expect(rejected.status).toBe(403);
    expect(rejected.body.error.code).toBe('ORIGIN_INVALID');

  });

  it('registers normalized email, stores Argon2id, and rejects duplicates', async () => {
    const token = await csrf();
    const response = await post(agent, '/api/auth/register', token, { name: '測試會員', email: ` ${emailA.toUpperCase()} `, password });
    expect(response.status).toBe(201);
    createdIds.push(response.body.user.id);
    expect(response.body.user).toEqual({ id: expect.any(String), name: '測試會員', email: emailA, preferredCurrency: 'TWD' });
    expect(response.text).not.toContain(password);
    expect(response.text).not.toContain('passwordHash');
    const saved = await database.prisma.user.findUniqueOrThrow({ where: { id: response.body.user.id } });
    expect(saved.passwordHash).toMatch(/^\$argon2id\$/);
    expect(saved.passwordHash).not.toContain(password);
    const duplicate = await post(agent, '/api/auth/register', token, { name: 'Duplicate', email: emailA, password });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('EMAIL_EXISTS');
  });

  it('gives identical errors for wrong password and unknown email', async () => {
    const token = await csrf();
    const wrong = await post(agent, '/api/auth/login', token, { email: emailA, password: 'wrong-password' });
    const missing = await post(agent, '/api/auth/login', token, { email: `missing-${unique}@example.test`, password });
    expect(wrong.status).toBe(401);
    expect(missing.status).toBe(401);
    expect(wrong.body).toEqual(missing.body);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });

  it('regenerates session ID, isolates users, and revokes logout', async () => {
    const oldCookie = cookie(await agent.get('/api/auth/csrf'));
    const login = await post(agent, '/api/auth/login', await csrf(), { email: emailA, password });
    expect(login.status).toBe(200);
    const newCookie = cookie(login);
    const setCookie = (login.headers['set-cookie'] as unknown as string[])[0]!;
    expect(sid(newCookie)).not.toBe(sid(oldCookie));
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/SameSite=Lax/);
    expect(setCookie).toMatch(/Expires=/);
    expect(setCookie).not.toMatch(/Domain=/);
    expect(login.text).not.toContain(password);
    expect((await request(app).get('/api/auth/me').set('Cookie', oldCookie)).status).toBe(401);
    expect((await agent.get('/api/auth/me')).body.user.email).toBe(emailA);
    expect((await other.get('/api/auth/me')).status).toBe(401);

    const second = await post(other, '/api/auth/register', await csrf(other), { name: '另一位', email: emailB, password });
    expect(second.status).toBe(201);
    createdIds.push(second.body.user.id);
    expect((await post(other, '/api/auth/login', await csrf(other), { email: emailB, password })).status).toBe(200);
    expect((await other.get('/api/auth/me')).body.user.email).toBe(emailB);
    expect((await agent.get('/api/auth/me')).body.user.email).toBe(emailA);
    expect((await agent.get(`/api/auth/me?userId=${second.body.user.id}`)).body.user.email).toBe(emailA);

    const noCsrf = await agent.post('/api/auth/logout').set('Origin', origin);
    expect(noCsrf.status).toBe(403);
    expect((await agent.get('/api/auth/me')).status).toBe(200);
    const logout = await post(agent, '/api/auth/logout', await csrf());
    expect(logout.status).toBe(204);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set('Cookie', newCookie)).status).toBe(401);
    expect((await other.get('/api/auth/me')).status).toBe(200);
    await database.prisma.user.delete({ where: { id: second.body.user.id } });
    expect((await other.get('/api/auth/me')).status).toBe(401);
  });

  it('refuses expired sessions', async () => {
    const response = await post(agent, '/api/auth/login', await csrf(), { email: emailA, password });
    expect(response.status).toBe(200);
    await database.prisma.session.update({ where: { sid: sid(cookie(response)) }, data: { expire: new Date(Date.now() - 1000) } });
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });

  it('limits login attempts', async () => {
    const limited = request.agent(createApp(env, database, { prisma: database.prisma, store, secret: env.SESSION_SECRET }));
    const token = await csrf(limited);
    let lastStatus = 0;
    for (let i = 0; i < 11; i++) {
      lastStatus = (await post(limited, '/api/auth/login', token, { email: emailA, password: 'bad' })).status;
    }
    expect(lastStatus).toBe(429);
  });

  it('marks production cookies Secure behind a trusted HTTPS proxy', async () => {
    const production = createApp({ ...env, NODE_ENV: 'production' }, database, { prisma: database.prisma, store, secret: env.SESSION_SECRET });
    const invalidOrigin = await request(production).post('/api/auth/register').set('Origin', 'http://localhost:5173').send({});
    expect(invalidOrigin.status).toBe(403);
    expect(invalidOrigin.body.error.code).toBe('ORIGIN_INVALID');
    const response = await request(production).get('/api/auth/csrf').set('X-Forwarded-Proto', 'https');
    expect(response.status).toBe(200);
    expect((response.headers['set-cookie'] as unknown as string[])[0]).toMatch(/Secure/);
  });
});
