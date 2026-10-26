import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

export function createDatabase(databaseUrl: string) {
  const adapter = new PrismaPg({ connectionString: databaseUrl, max: 5 });
  const prisma = new PrismaClient({ adapter });
  return {
    prisma,
    async check(): Promise<void> {
      await prisma.$queryRaw`SELECT 1`;
    },
    async disconnect(): Promise<void> {
      await prisma.$disconnect();
    },
  };
}

export type Database = ReturnType<typeof createDatabase>;
