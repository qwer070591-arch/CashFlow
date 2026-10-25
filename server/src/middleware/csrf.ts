import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';

export function requireCsrf(allowedOrigins: ReadonlySet<string>): RequestHandler {
  return (request, response, next) => {
    if (!allowedOrigins.has(request.get('Origin') ?? '')) {
      response.status(403).json({ error: { code: 'ORIGIN_INVALID', message: '請從 CashFlow 網站重新操作。' } });
      return;
    }
    const supplied = request.get('X-CSRF-Token');
    const expected = request.session?.csrfToken;
    if (!supplied || !expected || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
      response.status(403).json({ error: { code: 'CSRF_INVALID', message: '請重新載入頁面後再試。' } });
      return;
    }
    next();
  };
}
