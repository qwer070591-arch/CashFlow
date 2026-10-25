import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '../generated/prisma/client.js';

export const notFound: RequestHandler = (_request, response) => {
  response.status(404).json({ error: { code: 'NOT_FOUND', message: '找不到此 API 路徑。' } });
};

export const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  if (response.headersSent) return;
  if (error instanceof SyntaxError && 'status' in error && error.status === 400) {
    response.status(400).json({ error: { code: 'INVALID_JSON', message: '請求內容不是有效的 JSON。' } });
    return;
  }
  if (error instanceof Prisma.PrismaClientInitializationError ||
    (error instanceof Prisma.PrismaClientKnownRequestError && error.code.startsWith('P1')) ||
    (error instanceof Error && /^(ECONNREFUSED|ECONNRESET|ETIMEDOUT)$/.test((error as NodeJS.ErrnoException).code ?? ''))) {
    response.status(503).json({ error: { code: 'DATABASE_UNAVAILABLE', message: '資料庫目前無法連線。' } });
    return;
  }
  console.error('API request failed', { errorType: error instanceof Error ? error.name : 'unknown' });
  response.status(500).json({ error: { code: 'INTERNAL_ERROR', message: '伺服器暫時無法處理請求。' } });
};
