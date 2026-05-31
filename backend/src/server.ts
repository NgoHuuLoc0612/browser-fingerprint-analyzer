import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify'
import Redis from 'ioredis'
import postgres from 'postgres'
import { appRouter } from './routers/app.router.js'
import type { Context } from './routers/app.router.js'

const isDev = process.env.NODE_ENV !== 'production'

const db = postgres(process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/fingerprint_db', {
  max: 20,
  idle_timeout: 30,
  connect_timeout: 10,
  onnotice: () => {},
})

const redis = new Redis({
  host:     process.env.REDIS_HOST ?? 'localhost',
  port:     Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD ?? undefined,
  lazyConnect: true,
  enableOfflineQueue: true,
  maxRetriesPerRequest: 3,
})

redis.on('error', (err) => {
  console.warn('[Redis] Error:', err.message)
})

async function bootstrapDB() {
  try {
    await db`
      CREATE TABLE IF NOT EXISTS fingerprint_scans (
        id               BIGSERIAL PRIMARY KEY,
        visitor_id       TEXT NOT NULL,
        session_id       TEXT NOT NULL UNIQUE,
        stable_hash      TEXT NOT NULL,
        fingerprint_hash TEXT NOT NULL,
        browser_name     TEXT,
        browser_version  TEXT,
        os_name          TEXT,
        gpu_renderer     TEXT,
        entropy_bits     DOUBLE PRECISION DEFAULT 0,
        uniqueness_percent DOUBLE PRECISION DEFAULT 0,
        risk_score       DOUBLE PRECISION DEFAULT 0,
        anomaly_score    DOUBLE PRECISION DEFAULT 0,
        is_anomaly       BOOLEAN DEFAULT false,
        is_new_identity  BOOLEAN DEFAULT true,
        flags            JSONB DEFAULT '[]',
        vector_json      JSONB DEFAULT '[]',
        scanned_at       TIMESTAMPTZ DEFAULT NOW(),
        created_at       TIMESTAMPTZ DEFAULT NOW()
      )
    `
    await db`CREATE INDEX IF NOT EXISTS idx_fp_stable_hash  ON fingerprint_scans(stable_hash)`
    await db`CREATE INDEX IF NOT EXISTS idx_fp_visitor_id   ON fingerprint_scans(visitor_id)`
    await db`CREATE INDEX IF NOT EXISTS idx_fp_scanned_at   ON fingerprint_scans(scanned_at DESC)`
    console.log('[DB] Schema bootstrapped')
  } catch (e) {
    console.warn('[DB] Schema bootstrap skipped:', (e as Error).message)
  }
}

async function buildServer() {
  const app = Fastify({
    logger: {
      level: isDev ? 'info' : 'warn',
      transport: isDev ? { target: 'pino-pretty', options: { colorize: true } } : undefined,
    },
    trustProxy: true,
    bodyLimit: 4 * 1024 * 1024,
  })

  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
  })

  await app.register(cors, {
    origin: [
      'http://localhost:3000',
      'http://localhost:3001',
      ...(process.env.CORS_ORIGINS?.split(',') ?? []),
    ],
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-ID'],
  })

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  })

  await app.register(fastifyTRPCPlugin, {
    prefix: '/trpc',
    useWSS: false,
    trpcOptions: {
      router: appRouter,
      createContext: ({ req, res }): Context => ({ req, res, redis, db }),
      onError: ({ path, error }) => {
        if (isDev) console.error(`[tRPC] ${path}:`, error)
      },
    },
  })

  app.get('/health', async (req, reply) => {
    const checks: Record<string, string> = {
      server: 'ok',
      database: 'unknown',
      redis: 'unknown',
      timestamp: new Date().toISOString(),
      uptime: String(process.uptime()),
    }
    try { await db`SELECT 1`; checks.database = 'ok' } catch { checks.database = 'error' }
    try { await redis.ping(); checks.redis = 'ok' } catch { checks.redis = 'error' }
    return reply.status(checks.database === 'ok' ? 200 : 503).send(checks)
  })

  app.get('/stats', async (req, reply) => {
    try {
      const [scans, anomalies] = await Promise.all([
        db`SELECT COUNT(*) as count FROM fingerprint_scans`.then((r: any[]) => Number(r[0]?.count ?? 0)),
        db`SELECT COUNT(*) as count FROM fingerprint_scans WHERE is_anomaly = true`.then((r: any[]) => Number(r[0]?.count ?? 0)),
      ])
      return { scans, anomalies, anomalyRate: scans > 0 ? anomalies / scans : 0 }
    } catch { return { scans: 0, anomalies: 0, anomalyRate: 0 } }
  })

  return app
}

async function main() {
  console.log('[Server] Starting Browser Fingerprint Analyzer backend...')
  try {
    await redis.connect()
    console.log('[Redis] Connected')
  } catch (e) {
    console.warn('[Redis] Connection failed — running without Redis:', (e as Error).message)
  }
  await bootstrapDB()
  const app = await buildServer()
  const port = Number(process.env.PORT ?? 3001)
  const host = process.env.HOST ?? '0.0.0.0'
  try {
    await app.listen({ port, host })
    console.log(`[Server] Listening on http://${host}:${port}`)
    console.log(`[Server] tRPC endpoint: http://${host}:${port}/trpc`)
    console.log(`[Server] Health check: http://${host}:${port}/health`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

process.on('SIGTERM', async () => { await redis.quit().catch(() => {}); await db.end().catch(() => {}); process.exit(0) })
process.on('SIGINT',  async () => { await redis.quit().catch(() => {}); await db.end().catch(() => {}); process.exit(0) })

main().catch(console.error)
