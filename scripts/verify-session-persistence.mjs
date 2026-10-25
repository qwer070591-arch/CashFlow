/* global fetch, setTimeout */
import { randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { config } from 'dotenv';
import { createDatabase } from '../server/dist/lib/database.js';

config({ path: '.env' });
if (!process.env.DATABASE_URL || !process.env.CLIENT_ORIGIN) throw new Error('CashFlow environment is missing');
const docker = 'C:\\Users\\USER\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin\\docker.exe';
const database = createDatabase(process.env.DATABASE_URL);
const email = `persistence-${randomUUID().slice(0, 8)}@example.test`;
const password = 'Persistence-test-2026!';
const base = 'http://127.0.0.1:3012';
let userId;
let cookie = '';
let stopped = false;
let server;

async function startApi() {
  server = spawn(process.execPath, ['server/dist/index.js'], { cwd: process.cwd(), env: { ...process.env, PORT: '3012' }, stdio: 'ignore' });
  for (let attempt = 0; attempt < 50; attempt++) {
    if (server.exitCode !== null) throw new Error('Isolated API process exited');
    try {
      if ((await fetch(`${base}/api/health`)).status === 200) return;
    } catch { /* wait for the isolated API to listen */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Isolated API did not start');
}
async function stopApi() {
  if (!server || server.exitCode !== null) return;
  const exited = new Promise((resolve) => server.once('exit', resolve));
  server.kill();
  await exited;
  server = undefined;
}

async function api(path, method = 'GET', body, csrfToken) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(method === 'POST' ? { Origin: process.env.CLIENT_ORIGIN, 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
}
function compose(...args) {
  execFileSync(docker, ['compose', ...args], { cwd: process.cwd(), stdio: 'pipe', timeout: 120_000 });
}
function assert(condition, label) {
  if (!condition) throw new Error(label);
  console.log(`PASS ${label}`);
}

try {
  await startApi();
  let csrf = (await api('/api/auth/csrf')).body.csrfToken;
  const registered = await api('/api/auth/register', 'POST', { name: '持久性測試', email, password }, csrf);
  assert(registered.status === 201, 'register with real PostgreSQL');
  userId = registered.body.user.id;
  csrf = (await api('/api/auth/csrf')).body.csrfToken;
  const loggedIn = await api('/api/auth/login', 'POST', { email, password }, csrf);
  assert(loggedIn.status === 200, 'login');
  assert((await api('/api/auth/me')).status === 200, 'session before restart');

  await stopApi();
  await startApi();
  assert((await api('/api/auth/me')).status === 200, 'session survives API process restart');

  compose('stop', 'postgres');
  stopped = true;
  const unavailable = await api('/api/auth/me');
  assert(unavailable.status === 503, 'session store failure rejects access with 503');
  compose('up', '-d', '--wait', 'postgres');
  stopped = false;
  assert((await api('/api/auth/me')).status === 200, 'session survives PostgreSQL restart');
  csrf = (await api('/api/auth/csrf')).body.csrfToken;
  assert((await api('/api/auth/logout', 'POST', undefined, csrf)).status === 204, 'logout');
  assert((await api('/api/auth/me')).status === 401, 'old session revoked');
} finally {
  if (stopped) compose('up', '-d', '--wait', 'postgres');
  if (userId) {
    await database.prisma.session.deleteMany({ where: { sess: { path: ['userId'], equals: userId } } });
    await database.prisma.user.delete({ where: { id: userId } });
  }
  await database.disconnect();
  await stopApi();
}
