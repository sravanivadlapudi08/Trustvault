import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function resolveDatabaseUrl(): string {
  const envUrl = process.env.DATABASE_URL;

  // 1. If an external database (PostgreSQL / MySQL) is configured, use it directly
  if (envUrl && !envUrl.startsWith('file:')) {
    return envUrl;
  }

  // 2. If running on Vercel serverless / AWS Lambda (read-only filesystem)
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const tmpDbPath = path.join('/tmp', 'dev.db');
    if (!fs.existsSync(tmpDbPath)) {
      const candidates = [
        path.join(process.cwd(), 'prisma', 'dev.db'),
        path.join(process.cwd(), 'dev.db'),
        path.resolve('./prisma/dev.db'),
        path.resolve('./dev.db'),
      ];
      const source = candidates.find((c) => fs.existsSync(c));
      if (source) {
        try {
          fs.copyFileSync(source, tmpDbPath);
        } catch (e) {
          console.error('[TrustVault] Failed to copy seed database to /tmp:', e);
        }
      }
    }
    return `file:${tmpDbPath}`;
  }

  // 3. Local development environment: resolve absolute path to dev.db
  const candidates = [
    path.resolve(process.cwd(), 'prisma', 'dev.db'),
    path.resolve(process.cwd(), 'dev.db'),
  ];
  const existing = candidates.find((c) => fs.existsSync(c));
  if (existing) {
    return `file:${existing}`;
  }

  return envUrl || `file:${path.resolve(process.cwd(), 'prisma', 'dev.db')}`;
}

function getPrismaClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    const dbUrl = resolveDatabaseUrl();
    globalForPrisma.prisma = new PrismaClient({
      datasources: {
        db: {
          url: dbUrl,
        },
      },
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
  }
  return globalForPrisma.prisma;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(target, prop, receiver) {
    const client = getPrismaClient();
    const value = Reflect.get(client, prop, receiver);
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  },
});

export default prisma;

