import { Prisma } from '../generated/prisma/client.js';
import { z } from 'zod';

export const uuid = z.uuid();
export const entryType = z.enum(['INCOME', 'EXPENSE']);
export const amount = z.string().regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/).refine((value) => new Prisma.Decimal(value).greaterThan(0));
export const transactionDate = z.string().regex(/^(?!0000)\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
});
export const errorBody = (code: string, message: string) => ({ error: { code, message } });
export const isPrismaError = (error: unknown, code: string) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
