import type { RequestHandler } from 'express';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    csrfToken?: string;
  }
}

export const requireAuth: RequestHandler = (request, response, next) => {
  if (!request.session?.userId) {
    response.status(401).json({ error: { code: 'UNAUTHORIZED', message: '請先登入。' } });
    return;
  }
  next();
};

// Protected queries must use this server-derived ID, never an ID supplied by the client.
export function currentUserId(request: Parameters<RequestHandler>[0]): string {
  if (!request.session?.userId) throw new Error('Authentication required');
  return request.session.userId;
}
