import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import session from 'express-session';
import type { Store } from 'express-session';
import type { AppEnv } from './config/env.js';
import type { Database } from './lib/database.js';
import { createHealthRouter } from './routes/health.js';
import { errorHandler, notFound } from './middleware/error-handler.js';
import { createAuthRouter } from './routes/auth.js';
import { createCategoryRouter } from './routes/categories.js';
import { createTransactionRouter } from './routes/transactions.js';
import { createAnalyticsRouter } from './routes/analytics.js';
import { createBudgetRouter } from './routes/budgets.js';
import { createUserRouter } from './routes/users.js';
import type { PrismaClient } from './generated/prisma/client.js';

export type AuthServices = { prisma: PrismaClient; store: Store; secret: string };
export const SESSION_COOKIE_NAME = 'cashflow.sid';

export function createApp(env: Pick<AppEnv, 'CLIENT_ORIGIN'> & Partial<Pick<AppEnv, 'NODE_ENV'>>, database: Pick<Database, 'check'>, auth?: AuthServices) {
  const app = express();
  const clientOrigin = new URL(env.CLIENT_ORIGIN);
  const allowedOrigins = new Set([clientOrigin.origin]);
  if (env.NODE_ENV === 'development' && clientOrigin.protocol === 'http:' &&
    (clientOrigin.hostname === 'localhost' || clientOrigin.hostname === '127.0.0.1')) {
    const other = new URL(clientOrigin.origin);
    other.hostname = clientOrigin.hostname === 'localhost' ? '127.0.0.1' : 'localhost';
    allowedOrigins.add(other.origin);
  }
  app.disable('x-powered-by');
  if (env.NODE_ENV === 'production') app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: [...allowedOrigins], credentials: true, allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'Accept'], exposedHeaders: ['X-Export-Count'] }));
  app.use('/api', (_request, response, next) => { response.setHeader('Cache-Control', 'private, no-store'); next(); });
  app.use(express.json({ limit: '100kb' }));
  app.use('/api/health', createHealthRouter(database));
  if (auth) {
    const middleware = session({
      name: SESSION_COOKIE_NAME,
      secret: auth.secret,
      store: auth.store,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: env.NODE_ENV === 'production',
        path: '/',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    });
    app.use((request, response, next) => middleware(request, response, (error) => {
      if (error) {
        response.status(503).json({ error: { code: 'DATABASE_UNAVAILABLE', message: '資料庫目前無法連線。' } });
        return;
      }
      next();
    }));
    app.use('/api/auth', createAuthRouter(auth.prisma, allowedOrigins, SESSION_COOKIE_NAME));
    app.use('/api/users', createUserRouter(auth.prisma, allowedOrigins, SESSION_COOKIE_NAME));
    app.use('/api/categories', createCategoryRouter(auth.prisma, allowedOrigins));
    app.use('/api/transactions', createTransactionRouter(auth.prisma, allowedOrigins));
    app.use('/api/analytics', createAnalyticsRouter(auth.prisma));
    app.use('/api/budgets', createBudgetRouter(auth.prisma, allowedOrigins));
  }
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
