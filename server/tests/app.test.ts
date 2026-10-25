import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import type { Request, Response, NextFunction } from 'express';

const origin = 'http://127.0.0.1:5173';

describe('CashFlow API', () => {
  it('returns the required health response', async () => {
    const app = createApp({ CLIENT_ORIGIN: origin }, { check: vi.fn() });
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', service: 'cashflow-api' });
  });

  it('reports database health after a successful real-check interface call', async () => {
    const check = vi.fn().mockResolvedValue(undefined);
    const response = await request(createApp({ CLIENT_ORIGIN: origin }, { check })).get('/api/health/db');
    expect(check).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', service: 'cashflow-db' });
  });

  it('returns 503 without leaking database error details', async () => {
    const check = vi.fn().mockRejectedValue(new Error('postgresql://secret@localhost:5432'));
    const response = await request(createApp({ CLIENT_ORIGIN: origin }, { check })).get('/api/health/db');
    expect(response.status).toBe(503);
    expect(response.text).not.toContain('secret');
    expect(response.body.error.code).toBe('DATABASE_UNAVAILABLE');
  });

  it('recovers after a temporary database failure', async () => {
    const check = vi.fn().mockRejectedValueOnce(new Error('temporary outage')).mockResolvedValue(undefined);
    const app = createApp({ CLIENT_ORIGIN: origin }, { check });
    expect((await request(app).get('/api/health/db')).status).toBe(503);
    expect((await request(app).get('/api/health/db')).status).toBe(200);
    expect(check).toHaveBeenCalledTimes(2);
  });

  it('returns 404 for unknown paths', async () => {
    const response = await request(createApp({ CLIENT_ORIGIN: origin }, { check: vi.fn() })).get('/api/missing');
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('limits CORS to the configured client origin', async () => {
    const app = createApp({ CLIENT_ORIGIN: origin, NODE_ENV: 'development' }, { check: vi.fn() });
    const allowed = await request(app).get('/api/health').set('Origin', origin);
    const localhost = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');
    const other = await request(app).get('/api/health').set('Origin', 'https://other.example');
    expect(allowed.headers['access-control-allow-origin']).toBe(origin);
    expect(localhost.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
    expect(other.headers['access-control-allow-origin']).not.toBe('https://other.example');
  });

  it('returns a sanitized error for malformed JSON', async () => {
    const app = createApp({ CLIENT_ORIGIN: origin }, { check: vi.fn() });
    const response = await request(app).post('/api/health').set('Content-Type', 'application/json').send('{broken');
    expect(response.status).toBe(400);
    expect(response.text).not.toContain('{broken');
    expect(response.body.error.code).toBe('INVALID_JSON');
  });

  it('does not reveal unexpected error messages in 500 responses or logs', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    errorHandler(new Error('private-internal-detail'), {} as Request, { headersSent: false, status } as unknown as Response, vi.fn() as NextFunction);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({ error: { code: 'INTERNAL_ERROR', message: '伺服器暫時無法處理請求。' } });
    expect(JSON.stringify(log.mock.calls)).not.toContain('private-internal-detail');
    log.mockRestore();
  });
});

describe('environment validation', () => {
  it('accepts valid values and applies defaults', () => {
    const env = parseEnv({ DATABASE_URL: 'postgresql://user:pass@localhost:5432/cashflow', SESSION_SECRET: 'a'.repeat(48) });
    expect(env.PORT).toBe(3001);
    expect(env.CLIENT_ORIGIN).toBe(origin);
  });

  it('rejects missing database URL without printing its value', () => {
    expect(() => parseEnv({ PORT: '3001' })).toThrow('DATABASE_URL');
  });
});
