import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function isPostgresSchema(): boolean {
  try {
    const schemaPath = path.resolve(process.cwd(), 'prisma', 'schema.prisma');
    if (fs.existsSync(schemaPath)) {
      const content = fs.readFileSync(schemaPath, 'utf8');
      return content.includes('provider = "postgresql"');
    }
  } catch {}
  return false;
}

function resolveDatabaseUrl(): string {
  const envUrl = process.env.DATABASE_URL;

  // Case 1: Schema is configured for PostgreSQL
  if (isPostgresSchema()) {
    if (envUrl && (envUrl.startsWith('postgresql://') || envUrl.startsWith('postgres://'))) {
      return envUrl;
    }
    return envUrl || '';
  }

  // Case 2: Schema is SQLite (default). The URL MUST start with "file:".
  // On Vercel / AWS Lambda (read-only filesystem), copy seed dev.db to /tmp/dev.db
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
          console.log('[TrustVault] Copied seed database to /tmp/dev.db');
        } catch (e) {
          console.error('[TrustVault] Failed to copy seed database to /tmp:', e);
        }
      }
    }
    return `file:${tmpDbPath}`;
  }

  // Case 3: Local development with SQLite
  // In Prisma, schema.prisma resolves "file:./dev.db" relative to the "prisma" directory.
  const prismaDbPath = path.resolve(process.cwd(), 'prisma', 'dev.db');
  if (fs.existsSync(prismaDbPath)) {
    return `file:${prismaDbPath}`;
  }

  const rootDbPath = path.resolve(process.cwd(), 'dev.db');
  if (fs.existsSync(rootDbPath)) {
    return `file:${rootDbPath}`;
  }

  return `file:${prismaDbPath}`;
}

function getPrismaClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    const dbUrl = resolveDatabaseUrl();

    // CRITICAL: Overwrite process.env.DATABASE_URL before creating PrismaClient
    // so Prisma's schema validator (evaluating `url = env("DATABASE_URL")`)
    // matches the required protocol (e.g. `file:` for SQLite).
    process.env.DATABASE_URL = dbUrl;

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

