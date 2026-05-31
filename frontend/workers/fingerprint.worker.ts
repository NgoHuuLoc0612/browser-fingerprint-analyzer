/// <reference lib="webworker" />
// Fingerprint Collection Worker — runs heavy collection off the main thread
// Uses OffscreenCanvas, SharedArrayBuffer for lock-free communication

import type {
  WorkerRequest,
  WorkerResponse,
  CanvasFingerprint,
  WebGLFingerprint,
  AudioFingerprint,
  FontInfo,
  ShaderPrecision,
} from '../types/fingerprint'

declare const self: DedicatedWorkerGlobalScope

// ──────────────────────────────────────────────────────────────────────────────
// Shared progress buffer (SharedArrayBuffer) layout:
//   [0] = phase index (Int32)
//   [1] = percent 0–100 (Int32)
// ──────────────────────────────────────────────────────────────────────────────
let progressBuffer: Int32Array | null = null

function reportProgress(step: string, percent: number): void {
  if (progressBuffer) {
    Atomics.store(progressBuffer, 1, percent)
  }
  const msg: WorkerResponse = { type: 'PROGRESS', payload: { step, percent } }
  self.postMessage(msg)
}

// ──────────────────────────────────────────────────────────────────────────────
// FNV-1a 32-bit hash (fast, no crypto needed)
// ──────────────────────────────────────────────────────────────────────────────
function fnv1a(str: string): string {
  let hash = 0x811c9dc5 >>> 0
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

function hashArray(arr: number[]): string {
  return fnv1a(arr.join(','))
}

// ──────────────────────────────────────────────────────────────────────────────
// Canvas Fingerprint — uses OffscreenCanvas when available
// ──────────────────────────────────────────────────────────────────────────────
async function collectCanvasFingerprint(): Promise<CanvasFingerprint> {
  reportProgress('canvas:init', 10)

  const W = 400, H = 150
  let ctx: OffscreenCanvasRenderingContext2D | null = null
  let offscreenSupported = false

  try {
    const oc = new OffscreenCanvas(W, H)
    ctx = oc.getContext('2d') as OffscreenCanvasRenderingContext2D
    offscreenSupported = true
  } catch {
    // OffscreenCanvas not available — return stub
    return {
      dataURL: '',
      hash: 'unsupported',
      geometry: '',
      geometryHash: 'unsupported',
      textMetrics: { width: 0, actualBoundingBoxLeft: 0, actualBoundingBoxRight: 0, fontBoundingBoxAscent: 0, fontBoundingBoxDescent: 0, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 },
      imageDataHash: 'unsupported',
      offscreenSupported: false,
      workletSupported: typeof CSS !== 'undefined' && 'paintWorklet' in CSS,
    }
  }

  if (!ctx) throw new Error('Failed to get 2D context')

  // ── Background
  ctx.fillStyle = '#1a1a2e'
  ctx.fillRect(0, 0, W, H)

  // ── Text rendering (font fingerprinting)
  const textSamples = [
    { text: 'BrowserFingerprint', font: '18px Arial', fill: '#00d4ff', x: 10, y: 30 },
    { text: 'Cwm fjordbank glyphs vext quiz', font: '14px Georgia', fill: '#00ff88', x: 10, y: 60 },
    { text: '狐狸跳过了懒狗 Ñoño', font: '13px Times New Roman', fill: '#ff3366', x: 10, y: 85 },
    { text: '①②③④⑤⑥⑦⑧⑨⑩', font: '12px Verdana', fill: '#ffb800', x: 10, y: 108 },
    { text: '🦊🔬🧬🔐💻🌐', font: '16px sans-serif', fill: '#9945ff', x: 10, y: 133 },
  ]

  for (const s of textSamples) {
    ctx.font = s.font
    ctx.fillStyle = s.fill
    ctx.fillText(s.text, s.x, s.y)
  }

  // ── Geometry
  ctx.beginPath()
  ctx.arc(320, 75, 40, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(0,212,255,0.6)'
  ctx.lineWidth = 2
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(260, 40)
  ctx.lineTo(380, 40)
  ctx.lineTo(380, 110)
  ctx.closePath()
  ctx.fillStyle = 'rgba(153,69,255,0.4)'
  ctx.fill()

  // ── Gradient
  const grad = ctx.createLinearGradient(0, H - 20, W, H)
  grad.addColorStop(0, 'rgba(0,212,255,0.3)')
  grad.addColorStop(0.5, 'rgba(0,255,136,0.3)')
  grad.addColorStop(1, 'rgba(255,51,102,0.3)')
  ctx.fillStyle = grad
  ctx.fillRect(0, H - 20, W, 20)

  // ── Shadow
  ctx.shadowColor = '#00d4ff'
  ctx.shadowBlur = 8
  ctx.fillStyle = '#00d4ff'
  ctx.fillRect(340, 20, 40, 4)
  ctx.shadowBlur = 0

  reportProgress('canvas:hash', 20)

  // Get pixel data
  const imageData = ctx.getImageData(0, 0, W, H)
  const pixels = Array.from(imageData.data)
  const imageDataHash = hashArray(pixels.slice(0, 1000)) // sample for speed

  // Text metrics
  ctx.font = '16px Arial'
  const tm = ctx.measureText('BrowserFingerprint')
  const textMetrics = {
    width: tm.width,
    actualBoundingBoxLeft: tm.actualBoundingBoxLeft,
    actualBoundingBoxRight: tm.actualBoundingBoxRight,
    fontBoundingBoxAscent: (tm as any).fontBoundingBoxAscent ?? 0,
    fontBoundingBoxDescent: (tm as any).fontBoundingBoxDescent ?? 0,
    actualBoundingBoxAscent: tm.actualBoundingBoxAscent,
    actualBoundingBoxDescent: tm.actualBoundingBoxDescent,
  }

  // Geometry-only canvas
  const goc = new OffscreenCanvas(200, 100)
  const gctx = goc.getContext('2d')!
  gctx.beginPath()
  gctx.arc(100, 50, 35, 0, Math.PI * 2)
  gctx.strokeStyle = '#fff'
  gctx.lineWidth = 1
  gctx.stroke()
  gctx.fillStyle = 'rgba(255,255,255,0.5)'
  gctx.fillRect(10, 10, 80, 40)
  const gPixels = Array.from(gctx.getImageData(0, 0, 200, 100).data)
  const geometryHash = hashArray(gPixels.slice(0, 500))

  // Convert to blob for dataURL
  let dataURL = ''
  try {
    const blob = await (new OffscreenCanvas(W, H) as any).convertToBlob({ type: 'image/png' })
    // Can't use FileReader in worker, use blob URL stub
    dataURL = `blob:hash:${imageDataHash}`
  } catch {
    dataURL = `data:hash:${imageDataHash}`
  }

  const combinedStr = [imageDataHash, geometryHash, JSON.stringify(textMetrics)].join('|')
  const hash = fnv1a(combinedStr)

  return {
    dataURL,
    hash,
    geometry: geometryHash,
    geometryHash,
    textMetrics,
    imageDataHash,
    offscreenSupported,
    workletSupported: false, // not accessible from worker
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// WebGL Fingerprint — runs in worker using OffscreenCanvas
// ──────────────────────────────────────────────────────────────────────────────
function collectWebGLFingerprint(): WebGLFingerprint {
  reportProgress('webgl:init', 5)

  let gl: WebGL2RenderingContext | WebGLRenderingContext | null = null
  let isWebGL2 = true

  try {
    const oc = new OffscreenCanvas(1, 1)
    gl = oc.getContext('webgl2') as WebGL2RenderingContext
    if (!gl) {
      gl = oc.getContext('webgl') as WebGLRenderingContext
      isWebGL2 = false
    }
  } catch {
    return _stubWebGL()
  }

  if (!gl) return _stubWebGL()

  reportProgress('webgl:params', 15)

  // ── Parameters collection
  const PARAMS: Record<string, number> = {
    MAX_TEXTURE_SIZE: gl.MAX_TEXTURE_SIZE,
    MAX_RENDERBUFFER_SIZE: gl.MAX_RENDERBUFFER_SIZE,
    MAX_VERTEX_ATTRIBS: gl.MAX_VERTEX_ATTRIBS,
    MAX_VARYING_VECTORS: gl.MAX_VARYING_VECTORS,
    MAX_VERTEX_UNIFORM_VECTORS: gl.MAX_VERTEX_UNIFORM_VECTORS,
    MAX_FRAGMENT_UNIFORM_VECTORS: gl.MAX_FRAGMENT_UNIFORM_VECTORS,
    MAX_TEXTURE_IMAGE_UNITS: gl.MAX_TEXTURE_IMAGE_UNITS,
    MAX_COMBINED_TEXTURE_IMAGE_UNITS: gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS,
    MAX_VERTEX_TEXTURE_IMAGE_UNITS: gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS,
    MAX_CUBE_MAP_TEXTURE_SIZE: gl.MAX_CUBE_MAP_TEXTURE_SIZE,
    ALIASED_LINE_WIDTH_RANGE: 0,
    ALIASED_POINT_SIZE_RANGE: 0,
    RED_BITS: gl.getParameter(gl.RED_BITS),
    GREEN_BITS: gl.getParameter(gl.GREEN_BITS),
    BLUE_BITS: gl.getParameter(gl.BLUE_BITS),
    ALPHA_BITS: gl.getParameter(gl.ALPHA_BITS),
    DEPTH_BITS: gl.getParameter(gl.DEPTH_BITS),
    STENCIL_BITS: gl.getParameter(gl.STENCIL_BITS),
    SUBPIXEL_BITS: gl.getParameter(gl.SUBPIXEL_BITS),
  }

  const glParameters: Record<string, unknown> = {}
  for (const [k, constVal] of Object.entries(PARAMS)) {
    try {
      glParameters[k] = gl.getParameter((gl as any)[k] ?? constVal)
    } catch {
      glParameters[k] = null
    }
  }

  // Viewport dims
  const viewportDims = gl.getParameter(gl.MAX_VIEWPORT_DIMS)
  glParameters['MAX_VIEWPORT_DIMS'] = viewportDims ? [viewportDims[0], viewportDims[1]] : [0, 0]
  glParameters['ALIASED_LINE_WIDTH_RANGE'] = Array.from(gl.getParameter(gl.ALIASED_LINE_WIDTH_RANGE) || [])
  glParameters['ALIASED_POINT_SIZE_RANGE'] = Array.from(gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) || [])

  // Extensions
  const extensions = gl.getSupportedExtensions() ?? []

  // Unmasked vendor/renderer
  const dbgExt = gl.getExtension('WEBGL_debug_renderer_info')

  // Compressed texture formats
  const compressedFormats = Array.from(gl.getParameter(gl.COMPRESSED_TEXTURE_FORMATS) ?? [])

  // ── Shader precision
  const shaderPrecisions: ShaderPrecision[] = []
  const shaderTypes = [gl.VERTEX_SHADER, gl.FRAGMENT_SHADER]
  const precisionTypes = [gl.LOW_FLOAT, gl.MEDIUM_FLOAT, gl.HIGH_FLOAT, gl.LOW_INT, gl.MEDIUM_INT, gl.HIGH_INT]
  const shaderTypeNames = ['VERTEX', 'FRAGMENT']
  const precisionNames = ['LOW_FLOAT', 'MEDIUM_FLOAT', 'HIGH_FLOAT', 'LOW_INT', 'MEDIUM_INT', 'HIGH_INT']

  for (let si = 0; si < shaderTypes.length; si++) {
    for (let pi = 0; pi < precisionTypes.length; pi++) {
      try {
        const p = gl.getShaderPrecisionFormat(shaderTypes[si], precisionTypes[pi])
        if (p) {
          shaderPrecisions.push({
            shaderType: shaderTypeNames[si],
            precisionType: precisionNames[pi],
            rangeMin: p.rangeMin,
            rangeMax: p.rangeMax,
            precision: p.precision,
          })
        }
      } catch { /* ignore */ }
    }
  }

  reportProgress('webgl:render', 25)

  // ── Render fingerprint scene
  const vs = `
    attribute vec4 a_position;
    attribute vec4 a_color;
    varying vec4 v_color;
    void main() {
      gl_Position = a_position;
      v_color = a_color;
      gl_PointSize = 3.0;
    }
  `
  const fs = `
    precision mediump float;
    varying vec4 v_color;
    void main() {
      float d = distance(gl_FragCoord.xy, vec2(0.5));
      gl_FragColor = v_color * (1.0 - d * 0.5);
    }
  `

  let contextHash = 'render_failed'
  let vertexShaderHash = fnv1a(vs)
  let fragmentShaderHash = fnv1a(fs)

  try {
    const vShader = gl.createShader(gl.VERTEX_SHADER)!
    gl.shaderSource(vShader, vs)
    gl.compileShader(vShader)

    const fShader = gl.createShader(gl.FRAGMENT_SHADER)!
    gl.shaderSource(fShader, fs)
    gl.compileShader(fShader)

    const prog = gl.createProgram()!
    gl.attachShader(prog, vShader)
    gl.attachShader(prog, fShader)
    gl.linkProgram(prog)
    gl.useProgram(prog)

    const positions = new Float32Array([
      0, 0.5, 0, 1, -0.5, -0.5, 0, 1, 0.5, -0.5, 0, 1,
      -0.3, 0.8, 0, 1, 0.3, 0.8, 0, 1,
    ])
    const colors = new Float32Array([
      0, 0.82, 1, 1, 0, 1, 0.53, 1, 1, 0.2, 0.4, 1,
      0.6, 0.27, 1, 1, 1, 0.72, 0, 1,
    ])

    const posBuf = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf)
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW)

    const posLoc = gl.getAttribLocation(prog, 'a_position')
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 4, gl.FLOAT, false, 0, 0)

    const colBuf = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, colBuf)
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW)

    const colLoc = gl.getAttribLocation(prog, 'a_color')
    gl.enableVertexAttribArray(colLoc)
    gl.vertexAttribPointer(colLoc, 4, gl.FLOAT, false, 0, 0)

    gl.clearColor(0.02, 0.04, 0.08, 1.0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.drawArrays(gl.POINTS, 3, 2)

    const pixels = new Uint8Array(4 * 4 * 4)
    gl.readPixels(0, 0, 4, 4, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
    contextHash = hashArray(Array.from(pixels))
  } catch (e) {
    contextHash = fnv1a('render_error:' + String(e))
  }

  // ── Texture fingerprint
  let textureHash = 'unsupported'
  try {
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    const texData = new Uint8Array([255, 0, 128, 255, 64, 200, 32, 255, 192, 64, 255, 255, 0, 128, 64, 255])
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 2, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, texData)
    gl.generateMipmap(gl.TEXTURE_2D)
    textureHash = hashArray(Array.from(texData))
  } catch { /* ignore */ }

  const precisionsHash = fnv1a(JSON.stringify(shaderPrecisions))
  const parametersHash = fnv1a(JSON.stringify(glParameters))

  return {
    contextHash,
    parametersHash,
    vertexShaderHash,
    fragmentShaderHash,
    textureHash,
    bufferHash: fnv1a(contextHash + parametersHash),
    glParameters,
    supportedExtensions: extensions,
    compressedTextureFormats: compressedFormats as number[],
    precisionsHash,
    shaderPrecisions,
  }
}

function _stubWebGL(): WebGLFingerprint {
  return {
    contextHash: 'unsupported',
    parametersHash: 'unsupported',
    vertexShaderHash: 'unsupported',
    fragmentShaderHash: 'unsupported',
    textureHash: 'unsupported',
    bufferHash: 'unsupported',
    glParameters: {},
    supportedExtensions: [],
    compressedTextureFormats: [],
    precisionsHash: 'unsupported',
    shaderPrecisions: [],
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Font Detection — canvas-based width measurement
// ──────────────────────────────────────────────────────────────────────────────
function collectFonts(fontList: string[]): FontInfo {
  reportProgress('fonts:init', 5)

  // Reference widths using generic fonts
  const testString = 'mmmmmmmmmmlli'
  const testSize = '72px'
  const baseFonts = ['monospace', 'sans-serif', 'serif']

  let detectedFonts: string[] = []

  try {
    const oc = new OffscreenCanvas(300, 100)
    const ctx = oc.getContext('2d') as OffscreenCanvasRenderingContext2D

    // Measure baseline widths
    const baseWidths: Record<string, number> = {}
    for (const base of baseFonts) {
      ctx.font = `${testSize} ${base}`
      baseWidths[base] = ctx.measureText(testString).width
    }

    // Check each font
    let checked = 0
    for (const font of fontList) {
      checked++
      if (checked % 50 === 0) {
        reportProgress(`fonts:check:${checked}`, Math.floor((checked / fontList.length) * 40))
      }

      let detected = false
      for (const base of baseFonts) {
        ctx.font = `${testSize} '${font}',${base}`
        const w = ctx.measureText(testString).width
        if (w !== baseWidths[base]) {
          detected = true
          break
        }
      }
      if (detected) detectedFonts.push(font)
    }
  } catch {
    detectedFonts = []
  }

  reportProgress('fonts:hash', 45)

  const fingerprintHash = fnv1a(detectedFonts.sort().join(','))

  return {
    detectedFonts,
    fontCount: detectedFonts.length,
    systemFonts: detectedFonts,
    fingerprintHash,
    measurementMethod: 'canvas',
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// K-means clustering (pure JS, in-worker)
// ──────────────────────────────────────────────────────────────────────────────
function kmeansCluster(data: number[][], k: number, maxIter = 50): number[][] {
  const n = data.length
  const dim = data[0].length
  if (n === 0 || dim === 0 || k <= 0) return []

  // Random initialization
  let centroids: number[][] = []
  const used = new Set<number>()
  while (centroids.length < Math.min(k, n)) {
    const idx = Math.floor(Math.random() * n)
    if (!used.has(idx)) {
      used.add(idx)
      centroids.push([...data[idx]])
    }
  }

  let assignments = new Array(n).fill(0)

  for (let iter = 0; iter < maxIter; iter++) {
    // Assign
    let changed = false
    for (let i = 0; i < n; i++) {
      let minDist = Infinity
      let best = 0
      for (let c = 0; c < centroids.length; c++) {
        let dist = 0
        for (let d = 0; d < dim; d++) {
          const diff = data[i][d] - centroids[c][d]
          dist += diff * diff
        }
        if (dist < minDist) { minDist = dist; best = c }
      }
      if (assignments[i] !== best) { assignments[i] = best; changed = true }
    }
    if (!changed) break

    // Update centroids
    const newCentroids = Array.from({ length: centroids.length }, () => new Array(dim).fill(0))
    const counts = new Array(centroids.length).fill(0)
    for (let i = 0; i < n; i++) {
      const c = assignments[i]
      counts[c]++
      for (let d = 0; d < dim; d++) newCentroids[c][d] += data[i][d]
    }
    for (let c = 0; c < centroids.length; c++) {
      if (counts[c] > 0) {
        for (let d = 0; d < dim; d++) newCentroids[c][d] /= counts[c]
        centroids[c] = newCentroids[c]
      }
    }
  }

  return centroids
}

// Count-Min Sketch (pure JS)
class CountMinSketch {
  private table: number[][]
  private hashes: number
  private width: number

  constructor(width = 1024, hashes = 4) {
    this.width = width
    this.hashes = hashes
    this.table = Array.from({ length: hashes }, () => new Array(width).fill(0))
  }

  private _hash(item: string, seed: number): number {
    let h = seed * 2654435761 >>> 0
    for (let i = 0; i < item.length; i++) {
      h ^= item.charCodeAt(i)
      h = Math.imul(h, 16777619) >>> 0
    }
    return h % this.width
  }

  insert(item: string): void {
    for (let i = 0; i < this.hashes; i++) {
      this.table[i][this._hash(item, i * 7 + 13)]++
    }
  }

  query(item: string): number {
    let min = Infinity
    for (let i = 0; i < this.hashes; i++) {
      min = Math.min(min, this.table[i][this._hash(item, i * 7 + 13)])
    }
    return min === Infinity ? 0 : min
  }
}

// Global sketch instance
const globalSketch = new CountMinSketch(2048, 5)

// ──────────────────────────────────────────────────────────────────────────────
// Cosine similarity (SIMD-accelerated path would use WASM; JS fallback here)
// ──────────────────────────────────────────────────────────────────────────────
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom === 0 ? 0 : dot / denom
}

// ──────────────────────────────────────────────────────────────────────────────
// Shannon entropy
// ──────────────────────────────────────────────────────────────────────────────
function shannonEntropy(values: number[]): number {
  const total = values.reduce((s, v) => s + v, 0)
  if (total === 0) return 0
  return -values.reduce((h, v) => {
    if (v <= 0) return h
    const p = v / total
    return h + p * Math.log2(p)
  }, 0)
}

// ──────────────────────────────────────────────────────────────────────────────
// Main message handler
// ──────────────────────────────────────────────────────────────────────────────
self.onmessage = async (event: MessageEvent<WorkerRequest & { sharedBuffer?: SharedArrayBuffer }>) => {
  const { type, payload } = event.data

  // Init shared buffer if provided
  if ((event.data as any).sharedBuffer) {
    progressBuffer = new Int32Array((event.data as any).sharedBuffer)
  }

  try {
    switch (type) {
      case 'COLLECT_CANVAS': {
        const result = await collectCanvasFingerprint()
        self.postMessage({ type: 'CANVAS_RESULT', payload: result } satisfies WorkerResponse)
        break
      }

      case 'COLLECT_WEBGL': {
        const result = collectWebGLFingerprint()
        self.postMessage({ type: 'WEBGL_RESULT', payload: result } satisfies WorkerResponse)
        break
      }

      case 'COLLECT_FONTS': {
        const result = collectFonts((payload as any).fontList)
        self.postMessage({ type: 'FONTS_RESULT', payload: result } satisfies WorkerResponse)
        break
      }

      case 'COMPUTE_HASH': {
        const hash = fnv1a((payload as any).data)
        self.postMessage({ type: 'HASH_RESULT', payload: { hash } } satisfies WorkerResponse)
        break
      }

      case 'ENTROPY_CLUSTER': {
        const { vectors, k } = payload as any
        const centroids = kmeansCluster(vectors, k)

        // Build cluster result
        const clusters = centroids.map((centroid, i) => {
          const key = centroid.map(v => v.toFixed(3)).join(',')
          globalSketch.insert(key)
          const entropy = shannonEntropy(centroid.map(v => Math.abs(v)))
          return {
            clusterId: fnv1a(`cluster_${i}_${key}`),
            centroid,
            members: Math.max(1, Math.floor(vectors.length / k)),
            entropy,
            sketchEstimate: globalSketch.query(key),
            anomalyScore: Math.random() * 0.3, // placeholder — real score from ONNX
          }
        })

        self.postMessage({ type: 'CLUSTER_RESULT', payload: clusters } satisfies WorkerResponse)
        break
      }

      case 'COSINE_SIMILARITY': {
        const { a, b } = payload as any
        const similarity = cosineSimilarity(a, b)
        self.postMessage({ type: 'SIMILARITY_RESULT', payload: { similarity } } satisfies WorkerResponse)
        break
      }

      default:
        self.postMessage({
          type: 'ERROR',
          payload: { message: `Unknown message type: ${type}` },
        } satisfies WorkerResponse)
    }
  } catch (err) {
    self.postMessage({
      type: 'ERROR',
      payload: {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      },
    } satisfies WorkerResponse)
  }
}
