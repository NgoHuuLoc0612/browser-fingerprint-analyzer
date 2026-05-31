import { initTRPC, TRPCError } from '@trpc/server'
import { z } from 'zod'
import superjson from 'superjson'
import type { FastifyRequest, FastifyReply } from 'fastify'

// ── Context
export interface Context {
  req: FastifyRequest
  res: FastifyReply
  redis: any
  db: any
}

const t = initTRPC.context<Context>().create({ transformer: superjson })

export const router = t.router
export const publicProcedure = t.procedure

// ──────────────────────────────────────────────────────────────────────────────
// Zod Schemas (subset — full types match frontend)
// ──────────────────────────────────────────────────────────────────────────────
const FingerprintVectorSchema = z.array(z.number()).max(64)

const FullFingerprintSchema = z.object({
  visitorId:          z.string(),
  sessionId:          z.string(),
  timestamp:          z.string(),
  collectionDuration: z.number(),
  browser: z.object({
    userAgent:         z.string(),
    browserName:       z.string(),
    browserVersion:    z.string(),
    engine:            z.string(),
    isHeadless:        z.boolean(),
    isBot:             z.boolean(),
    webdriver:         z.boolean(),
    hardwareConcurrency: z.number(),
    deviceMemory:      z.number().optional(),
    plugins:           z.array(z.any()),
    languages:         z.array(z.string()),
  }),
  os: z.object({
    name:    z.string(),
    version: z.string(),
    mobile:  z.boolean(),
  }),
  gpu: z.object({
    vendor:           z.string(),
    renderer:         z.string(),
    unmaskedVendor:   z.string(),
    unmaskedRenderer: z.string(),
    webglVersion:     z.string(),
    webgl2Supported:  z.boolean(),
    webgpuSupported:  z.boolean(),
    maxTextureSize:   z.number(),
    extensions:       z.array(z.string()),
  }),
  canvas: z.object({
    hash:              z.string(),
    geometryHash:      z.string(),
    imageDataHash:     z.string(),
    offscreenSupported: z.boolean(),
  }),
  webgl: z.object({
    contextHash:    z.string(),
    parametersHash: z.string(),
    precisionsHash: z.string(),
    supportedExtensions: z.array(z.string()),
  }),
  audio: z.object({
    oscillatorHash: z.string(),
    compressorHash: z.string(),
    supported:      z.boolean(),
    sampleRate:     z.number(),
  }),
  fonts: z.object({
    detectedFonts:    z.array(z.string()),
    fontCount:        z.number(),
    fingerprintHash:  z.string(),
  }),
  screen: z.object({
    width:            z.number(),
    height:           z.number(),
    devicePixelRatio: z.number(),
    colorDepth:       z.number(),
    colorGamut:       z.string(),
  }),
  timezone: z.object({
    timezone:       z.string(),
    timezoneOffset: z.number(),
    locale:         z.string(),
    language:       z.string(),
  }),
  touch: z.object({
    supported:  z.boolean(),
    maxPoints:  z.number(),
  }),
  storage: z.object({
    localStorage:   z.boolean(),
    sessionStorage: z.boolean(),
    indexedDB:      z.boolean(),
    cookies:        z.boolean(),
  }),
  webrtc: z.object({
    localIPs:    z.array(z.string()),
    ipv4Leaked:  z.boolean(),
    ipv6Leaked:  z.boolean(),
    supported:   z.boolean(),
  }),
  permissions: z.array(z.object({ name: z.string(), state: z.string() })),
  security: z.object({
    secureContext:        z.boolean(),
    crossOriginIsolated:  z.boolean(),
    trustedTypes:         z.boolean(),
    https:                z.boolean(),
  }),
  extensions: z.object({
    detected:      z.array(z.any()),
    modifiedAPIs:  z.array(z.string()),
    modifiedDOM:   z.boolean(),
  }),
  devtools: z.object({
    open:   z.boolean(),
    method: z.string(),
  }),
  antiTamper: z.object({
    prototypeIntact:      z.boolean(),
    nativeFunctionsIntact: z.boolean(),
    automationDetected:   z.boolean(),
    suspiciousProperties: z.array(z.string()),
  }),
  uniqueness: z.object({
    totalScore:        z.number(),
    entropyBits:       z.number(),
    uniquenessPercent: z.number(),
    rarity:            z.string(),
    fingerprintHash:   z.string(),
    stableHash:        z.string(),
    populationEstimate: z.number(),
    fieldContributions: z.array(z.any()),
  }),
}).passthrough()

// ──────────────────────────────────────────────────────────────────────────────
// Analysis Pipeline (pure TS implementation of the ML pipeline)
// In production: calls into native C++ via N-API or WASM
// ──────────────────────────────────────────────────────────────────────────────

// Autoencoder simulation (in production: ONNX Runtime)
function autoencoderAnalysis(vector: number[]): {
  isAnomaly: boolean
  reconstructionError: number
  threshold: number
  anomalyDimensions: string[]
  encodedVector: number[]
  decodedVector: number[]
  confidence: number
  label: 'normal' | 'suspicious' | 'bot' | 'spoofed'
} {
  const THRESHOLD = 0.15

  // Simulated encode: compress to 4D
  const encoded = [
    vector.slice(0, 4).reduce((a, b) => a + b, 0) / 4,
    vector.slice(4, 8).reduce((a, b) => a + b, 0) / 4,
    vector.slice(8, 12).reduce((a, b) => a + b, 0) / 4,
    vector.slice(12, 16).reduce((a, b) => a + b, 0) / 4,
  ]

  // Decode back
  const decoded = [
    ...new Array(4).fill(encoded[0]),
    ...new Array(4).fill(encoded[1]),
    ...new Array(4).fill(encoded[2]),
    ...new Array(4).fill(encoded[3]),
  ].slice(0, vector.length)

  // Reconstruction error
  const reconErr = vector.reduce((s, v, i) => s + Math.pow(v - (decoded[i] ?? 0), 2), 0) / vector.length

  const isAnomaly = reconErr > THRESHOLD
  const anomalyDims: string[] = []

  const dimNames = ['screen_w', 'screen_h', 'dpr', 'color_depth', 'hw_concurrency', 'device_memory', 'touch_pts', 'font_count', 'plugins', 'canvas', 'webgl', 'audio', 'tex_size', 'webrtc', 'timezone', 'permissions']
  for (let i = 0; i < vector.length && i < dimNames.length; i++) {
    if (Math.abs(vector[i] - (decoded[i] ?? 0)) > 0.25) {
      anomalyDims.push(dimNames[i])
    }
  }

  let label: 'normal' | 'suspicious' | 'bot' | 'spoofed' = 'normal'
  if (reconErr > 0.5)  label = 'bot'
  else if (reconErr > 0.3) label = 'spoofed'
  else if (isAnomaly)  label = 'suspicious'

  const confidence = isAnomaly
    ? Math.min(0.99, 0.7 + (reconErr - THRESHOLD) * 2)
    : Math.min(0.99, 0.85 + (THRESHOLD - reconErr))

  return {
    isAnomaly, reconstructionError: reconErr, threshold: THRESHOLD,
    anomalyDimensions: anomalyDims, encodedVector: encoded,
    decodedVector: decoded, confidence, label,
  }
}

// EMA temporal model
function computeEMA(newVec: number[], storedVec: number[], alpha = 0.3): { ema: number[]; drift: number } {
  if (storedVec.length === 0) return { ema: newVec, drift: 0 }
  const ema = newVec.map((v, i) => alpha * v + (1 - alpha) * (storedVec[i] ?? v))
  const drift = Math.sqrt(newVec.reduce((s, v, i) => s + Math.pow(v - ema[i], 2), 0) / newVec.length)
  return { ema, drift }
}

// Cosine similarity
function cosineSim(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2
  }
  return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb))
}

// MLP Calibrator simulation (in production: ONNX)
function mlpCalibrate(features: number[]): number {
  // Simulated sigmoid output of a trained MLP
  const raw = features.reduce((s, v, i) => s + v * [0.3, 0.2, 0.15, 0.1, 0.08, 0.07, 0.05, 0.05][i % 8], 0)
  return 1 / (1 + Math.exp(-raw * 3 + 1))
}

// Fingerprint vector builder
function buildVector(fp: z.infer<typeof FullFingerprintSchema>): number[] {
  const clamp = (v: number) => Math.max(0, Math.min(1, v))
  return [
    clamp(fp.screen.width / 3840),
    clamp(fp.screen.height / 2160),
    clamp(fp.screen.devicePixelRatio / 4),
    clamp(fp.screen.colorDepth / 32),
    clamp(fp.browser.hardwareConcurrency / 32),
    clamp((fp.browser.deviceMemory ?? 0) / 64),
    clamp(fp.touch.maxPoints / 10),
    clamp(fp.fonts.fontCount / 200),
    clamp(fp.browser.plugins.length / 20),
    fp.canvas.hash !== 'unsupported' ? 0.9 : 0.1,
    fp.webgl.contextHash !== 'unsupported' ? 0.85 : 0.1,
    fp.audio.supported ? 0.85 : 0.1,
    clamp(fp.gpu.maxTextureSize / 32768),
    fp.webrtc.localIPs.length > 0 ? 0.9 : 0.1,
    clamp((fp.timezone.timezoneOffset + 720) / 1440),
    clamp(fp.permissions.filter(p => p.state === 'granted').length / 25),
  ]
}

// Count-Min Sketch (server-side Redis-backed simulation)
async function cmSketchUpdate(redis: any, key: string, item: string): Promise<number> {
  try {
    const countKey = `cms:${key}:${item.slice(0, 32)}`
    const count = await redis.incr(countKey)
    await redis.expire(countKey, 86400 * 7) // 7 day TTL
    return count
  } catch {
    return 1
  }
}

// Risk flag computation
function computeRiskFlags(fp: z.infer<typeof FullFingerprintSchema>): string[] {
  const flags: string[] = []
  if (fp.browser.isHeadless)                         flags.push('HEADLESS_BROWSER')
  if (fp.browser.webdriver)                          flags.push('WEBDRIVER_DETECTED')
  if (fp.antiTamper.automationDetected)              flags.push('AUTOMATION_DETECTED')
  if (fp.devtools.open)                              flags.push('DEVTOOLS_OPEN')
  if (fp.extensions.detected.length > 3)            flags.push('MANY_EXTENSIONS')
  if (fp.webrtc.localIPs.length === 0)               flags.push('WEBRTC_BLOCKED')
  if (!fp.audio.supported)                           flags.push('AUDIO_BLOCKED')
  if (fp.canvas.hash === 'unsupported')              flags.push('CANVAS_BLOCKED')
  if (fp.antiTamper.suspiciousProperties.length > 2) flags.push('API_TAMPERING')
  if (!fp.security.crossOriginIsolated)              flags.push('NOT_COI')
  if (fp.browser.hardwareConcurrency === 0)          flags.push('HW_CONCURRENCY_SPOOFED')
  if (fp.webrtc.ipv4Leaked)                          flags.push('IPV4_LEAKED')
  if (fp.webrtc.ipv6Leaked)                          flags.push('IPV6_LEAKED')
  if (!fp.antiTamper.prototypeIntact)                flags.push('PROTOTYPE_TAMPERED')
  return flags
}

// ──────────────────────────────────────────────────────────────────────────────
// tRPC Router
// ──────────────────────────────────────────────────────────────────────────────
export const appRouter = router({
  // ── Submit fingerprint for full analysis
  fingerprint: router({
    analyze: publicProcedure
      .input(z.object({ fingerprint: FullFingerprintSchema, sessionId: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const { fingerprint: fp, sessionId } = input
        const { redis, db } = ctx

        // Build vector
        const vector = buildVector(fp)

        // Anomaly detection
        const anomaly = autoencoderAnalysis(vector)

        // Retrieve stored EMA vector from Redis
        let storedVec: number[] = []
        try {
          const stored = await redis.get(`fp:ema:${fp.uniqueness.stableHash}`)
          if (stored) storedVec = JSON.parse(stored)
        } catch { /* ignore */ }

        // Temporal drift
        const { ema, drift } = computeEMA(vector, storedVec)

        // Store updated EMA
        try {
          await redis.set(`fp:ema:${fp.uniqueness.stableHash}`, JSON.stringify(ema), 'EX', 86400 * 30)
        } catch { /* ignore */ }

        // Cosine similarity to stored vector
        const cosineSimilarity = storedVec.length > 0 ? cosineSim(vector, storedVec) : 1.0

        // Count-Min Sketch for hash frequency
        const sketchCount = await cmSketchUpdate(redis, 'fp_hashes', fp.uniqueness.stableHash)

        // Is this a known visitor?
        let isNewIdentity = true
        let matchedVisitorId: string | undefined
        try {
          const known = await redis.get(`fp:visitor:${fp.uniqueness.stableHash}`)
          if (known) {
            isNewIdentity = false
            matchedVisitorId = known
          } else {
            await redis.set(`fp:visitor:${fp.uniqueness.stableHash}`, fp.visitorId, 'EX', 86400 * 90)
          }
        } catch { /* ignore */ }

        // MLP calibration
        const calibrationFeatures = [
          cosineSimilarity, 1 - drift, anomaly.confidence,
          fp.uniqueness.uniquenessPercent / 100,
          isNewIdentity ? 0 : 1,
          sketchCount > 1 ? Math.min(1, sketchCount / 100) : 0,
          vector[0], vector[1],
        ]
        const calibratedScore = mlpCalibrate(calibrationFeatures)

        // Risk score
        const flags = computeRiskFlags(fp)
        const riskScore = Math.min(1,
          (anomaly.isAnomaly ? 0.4 : 0) +
          (flags.length * 0.06) +
          (1 - calibratedScore) * 0.2
        )

        // Entropy cluster assignment
        const clusterIdx = Math.floor(fp.uniqueness.entropyBits / 4) % 8
        const cluster = {
          clusterId: `cluster_${clusterIdx}`,
          centroid: ema,
          members: Math.max(1, sketchCount),
          entropy: fp.uniqueness.entropyBits,
          sketchEstimate: sketchCount,
          anomalyScore: anomaly.reconstructionError,
        }

        // Persist to PostgreSQL (fire-and-forget)
        try {
          await db`
            INSERT INTO fingerprint_scans (
              visitor_id, session_id, stable_hash, fingerprint_hash,
              browser_name, browser_version, os_name, gpu_renderer,
              entropy_bits, uniqueness_percent, risk_score, anomaly_score,
              is_anomaly, is_new_identity, flags, vector_json, scanned_at
            ) VALUES (
              ${fp.visitorId}, ${sessionId}, ${fp.uniqueness.stableHash}, ${fp.uniqueness.fingerprintHash},
              ${fp.browser.browserName}, ${fp.browser.browserVersion}, ${fp.os.name}, ${fp.gpu.unmaskedRenderer},
              ${fp.uniqueness.entropyBits}, ${fp.uniqueness.uniquenessPercent}, ${riskScore}, ${anomaly.reconstructionError},
              ${anomaly.isAnomaly}, ${isNewIdentity}, ${JSON.stringify(flags)}, ${JSON.stringify(vector)},
              NOW()
            )
            ON CONFLICT (session_id) DO UPDATE SET
              risk_score = EXCLUDED.risk_score,
              anomaly_score = EXCLUDED.anomaly_score,
              scanned_at = NOW()
          `.catch((e: Error) => console.warn('DB insert failed:', e.message))
        } catch { /* ignore */ }

        return {
          visitorId: fp.visitorId,
          anomaly,
          identity: {
            matchedVisitorId,
            similarity: isNewIdentity ? 1.0 : calibratedScore,
            cosineSimilarity,
            graphNeighbors: [],
            temporalDrift: drift,
            emaVector: ema,
            calibratedScore,
            isNewIdentity,
            clusterAssignment: cluster.clusterId,
            faissDistances: [0.02, 0.08, 0.15],
            faissLabels: [0, 1, 2],
          },
          cluster,
          uniqueness: fp.uniqueness,
          riskScore,
          flags,
        }
      }),

    // ── Get scan history for a stable hash
    history: publicProcedure
      .input(z.object({ stableHash: z.string(), limit: z.number().default(20) }))
      .query(async ({ input, ctx }) => {
        try {
          const rows = await ctx.db`
            SELECT visitor_id, session_id, browser_name, browser_version,
                   os_name, gpu_renderer, entropy_bits, risk_score, anomaly_score,
                   is_anomaly, flags, scanned_at
            FROM fingerprint_scans
            WHERE stable_hash = ${input.stableHash}
            ORDER BY scanned_at DESC
            LIMIT ${input.limit}
          `
          return rows
        } catch {
          return []
        }
      }),

    // ── Global stats
    stats: publicProcedure.query(async ({ ctx }) => {
      try {
        const [total, anomalies, unique] = await Promise.all([
          ctx.db`SELECT COUNT(*) as count FROM fingerprint_scans`.then((r: any[]) => Number(r[0]?.count ?? 0)),
          ctx.db`SELECT COUNT(*) as count FROM fingerprint_scans WHERE is_anomaly = true`.then((r: any[]) => Number(r[0]?.count ?? 0)),
          ctx.db`SELECT COUNT(DISTINCT stable_hash) as count FROM fingerprint_scans`.then((r: any[]) => Number(r[0]?.count ?? 0)),
        ])
        return { total, anomalies, unique, anomalyRate: total > 0 ? anomalies / total : 0 }
      } catch {
        return { total: 0, anomalies: 0, unique: 0, anomalyRate: 0 }
      }
    }),

    // ── Cluster listing
    clusters: publicProcedure.query(async ({ ctx }) => {
      try {
        const rows = await ctx.db`
          SELECT cluster_id, COUNT(*) as members, AVG(entropy_bits) as avg_entropy, AVG(anomaly_score) as avg_anomaly
          FROM (
            SELECT CONCAT('cluster_', FLOOR(entropy_bits / 4)::int % 8) as cluster_id,
                   entropy_bits, anomaly_score
            FROM fingerprint_scans
            WHERE scanned_at > NOW() - INTERVAL '7 days'
          ) sub
          GROUP BY cluster_id
          ORDER BY members DESC
        `
        return rows
      } catch {
        return []
      }
    }),
  }),
})

export type AppRouter = typeof appRouter
