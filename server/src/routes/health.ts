import { Router } from 'express';
import type { Database } from '../lib/database.js';

export function createHealthRouter(database: Pick<Database, 'check'>) {
  const router = Router();

  router.get('/', (_request, response) => {
    response.json({ status: 'ok', service: 'cashflow-api' });
  });

  router.get('/db', async (_request, response) => {
    try {
      await database.check();
      response.json({ status: 'ok', service: 'cashflow-db' });
    } catch {
      response.status(503).json({
        error: { code: 'DATABASE_UNAVAILABLE', message: '資料庫目前無法連線。' },
      });
    }
  });

  return router;
}
