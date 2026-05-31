// ============================================================
// Core Fingerprint Types
// ============================================================

export interface BrowserInfo {
  userAgent: string
  vendor: string
  appVersion: string
  platform: string
  engine: string
  engineVersion: string
  browserName: string
  browserVersion: string
  isHeadless: boolean
  isBot: boolean
  webdriver: boolean
  languages: string[]
  cookieEnabled: boolean
  doNotTrack: string | null
  hardwareConcurrency: number
  deviceMemory: number | undefined
  maxTouchPoints: number
  pdfViewerEnabled: boolean
  plugins: PluginInfo[]
  mimeTypes: MimeTypeInfo[]
}

export interface PluginInfo {
  name: string
  filename: string
  description: string
  mimeTypes: string[]
}

export interface MimeTypeInfo {
  type: string
  suffixes: string
  description: string
}

export interface OSInfo {
  name: string
  version: string
  architecture: string
  platform: string
  touchDevice: boolean
  mobile: boolean
}

export interface GPUInfo {
  vendor: string
  renderer: string
  unmaskedVendor: string
  unmaskedRenderer: string
  webglVersion: string
  webgl2Supported: boolean
  webgpuSupported: boolean
  maxTextureSize: number
  maxViewportDims: [number, number]
  maxRenderbufferSize: number
  maxVertexAttribs: number
  maxVaryingVectors: number
  maxVertexUniformVectors: number
  maxFragmentUniformVectors: number
  extensions: string[]
  shadingLanguageVersion: string
  antialiasing: boolean
  redBits: number
  greenBits: number
  blueBits: number
  alphaBits: number
  depthBits: number
  stencilBits: number
  webgpuAdapterInfo?: WebGPUAdapterInfo
}

export interface WebGPUAdapterInfo {
  vendor: string
  architecture: string
  device: string
  description: string
  adapterType: string
  backendType: string
  maxBindGroups: number
  maxColorAttachments: number
  maxComputeWorkgroupSizeX: number
  maxComputeWorkgroupSizeY: number
  maxComputeWorkgroupSizeZ: number
  maxComputeInvocationsPerWorkgroup: number
  maxBufferSize: number
  maxTextureDimension2D: number
}

export interface CanvasFingerprint {
  dataURL: string
  hash: string
  geometry: string
  geometryHash: string
  textMetrics: TextMetricsData
  imageDataHash: string
  offscreenSupported: boolean
  workletSupported: boolean
}

export interface TextMetricsData {
  width: number
  actualBoundingBoxLeft: number
  actualBoundingBoxRight: number
  fontBoundingBoxAscent: number
  fontBoundingBoxDescent: number
  actualBoundingBoxAscent: number
  actualBoundingBoxDescent: number
}

export interface WebGLFingerprint {
  contextHash: string
  parametersHash: string
  vertexShaderHash: string
  fragmentShaderHash: string
  textureHash: string
  bufferHash: string
  glParameters: Record<string, unknown>
  supportedExtensions: string[]
  compressedTextureFormats: number[]
  precisionsHash: string
  shaderPrecisions: ShaderPrecision[]
}

export interface ShaderPrecision {
  shaderType: string
  precisionType: string
  rangeMin: number
  rangeMax: number
  precision: number
}

export interface AudioFingerprint {
  oscillatorHash: string
  compressorHash: string
  analyserHash: string
  dynamicsHash: string
  audioContextState: string
  sampleRate: number
  channelCount: number
  maxChannelCount: number
  numberOfInputs: number
  numberOfOutputs: number
  baseLatency: number
  outputLatency: number
  bufferHash: string
  supported: boolean
}

export interface FontInfo {
  detectedFonts: string[]
  fontCount: number
  systemFonts: string[]
  fingerprintHash: string
  measurementMethod: 'canvas' | 'span' | 'css'
}

export interface ScreenInfo {
  width: number
  height: number
  availWidth: number
  availHeight: number
  colorDepth: number
  pixelDepth: number
  devicePixelRatio: number
  orientation: string
  orientationAngle: number
  isHDR: boolean
  colorGamut: string
  dynamicRange: string
  screenX: number
  screenY: number
  outerWidth: number
  outerHeight: number
  innerWidth: number
  innerHeight: number
  aspectRatio: number
}

export interface TimezoneLocaleInfo {
  timezone: string
  timezoneOffset: number
  locale: string
  language: string
  languages: string[]
  dateFormat: string
  timeFormat: string
  numberFormat: string
  currencyFormat: string
  weekStart: number
  hour12: boolean
  dstActive: boolean
  ntpOffset?: number
  jsTimeDrift?: number
}

export interface TouchInfo {
  supported: boolean
  maxPoints: number
  touchEvent: boolean
  pointerEvent: boolean
  forceTouch: boolean
  touchAction: boolean
}

export interface StorageInfo {
  localStorage: boolean
  sessionStorage: boolean
  indexedDB: boolean
  webSQL: boolean
  cookies: boolean
  serviceWorker: boolean
  cacheAPI: boolean
  storageEstimate?: StorageEstimate
  quota?: number
  usage?: number
  persistentStorage: boolean
}

export interface WebRTCLeak {
  localIPs: string[]
  publicIP?: string
  iceServersReachable: boolean
  mediaDevices: MediaDeviceInfo[]
  supported: boolean
  mDNSEnabled: boolean
  ipv4Leaked: boolean
  ipv6Leaked: boolean
}

export interface MediaDeviceInfo {
  kind: string
  label: string
  deviceId: string
  groupId: string
}

export interface PermissionState {
  name: string
  state: 'granted' | 'denied' | 'prompt' | 'error' | 'unsupported'
}

export interface SecurityFeatures {
  trustedTypes: boolean
  cspLevel: number
  coep: boolean
  coop: boolean
  crossOriginIsolated: boolean
  secureContext: boolean
  https: boolean
  hsts: boolean
  sriSupported: boolean
  cspNonce: boolean
}

export interface ExtensionDetection {
  detected: DetectedExtension[]
  score: number
  modifiedAPIs: string[]
  injectedScripts: string[]
  modifiedDOM: boolean
}

export interface DetectedExtension {
  name: string
  confidence: number
  indicator: string
}

export interface DevToolsDetection {
  open: boolean
  method: string
  widthThreshold: boolean
  heightThreshold: boolean
  firebug: boolean
  devtoolsExtension: boolean
  consoleModified: boolean
}

export interface AntiTamper {
  prototypeIntact: boolean
  nativeFunctionsIntact: boolean
  timingConsistent: boolean
  stackDepthNormal: boolean
  suspiciousProperties: string[]
  automationDetected: boolean
}

// ============================================================
// Analysis Types
// ============================================================

export interface EntropyCluster {
  clusterId: string
  centroid: number[]
  members: number
  entropy: number
  sketchEstimate: number
  anomalyScore: number
}

export interface AnomalyDetectionResult {
  isAnomaly: boolean
  reconstructionError: number
  threshold: number
  anomalyDimensions: string[]
  encodedVector: number[]
  decodedVector: number[]
  confidence: number
  label: 'normal' | 'suspicious' | 'bot' | 'spoofed'
}

export interface IdentityMatchResult {
  matchedVisitorId?: string
  similarity: number
  cosineSimilarity: number
  graphNeighbors: GraphNode[]
  temporalDrift: number
  emaVector: number[]
  calibratedScore: number
  isNewIdentity: boolean
  clusterAssignment: string
  faissDistances: number[]
  faissLabels: number[]
}

export interface GraphNode {
  visitorId: string
  similarity: number
  firstSeen: string
  lastSeen: string
  visitCount: number
  drift: number
}

export interface FingerprintUniqueness {
  totalScore: number
  entropyBits: number
  uniquenessPercent: number
  rarity: 'common' | 'uncommon' | 'rare' | 'very_rare' | 'unique'
  fieldContributions: FieldContribution[]
  populationEstimate: number
  fingerprintHash: string
  stableHash: string
  sessionHash: string
}

export interface FieldContribution {
  field: string
  entropyBits: number
  contribution: number
  value: string
}

// ============================================================
// Full Fingerprint
// ============================================================

export interface FullFingerprint {
  visitorId: string
  sessionId: string
  timestamp: string
  collectionDuration: number
  browser: BrowserInfo
  os: OSInfo
  gpu: GPUInfo
  canvas: CanvasFingerprint
  webgl: WebGLFingerprint
  audio: AudioFingerprint
  fonts: FontInfo
  screen: ScreenInfo
  timezone: TimezoneLocaleInfo
  touch: TouchInfo
  storage: StorageInfo
  webrtc: WebRTCLeak
  permissions: PermissionState[]
  security: SecurityFeatures
  extensions: ExtensionDetection
  devtools: DevToolsDetection
  antiTamper: AntiTamper
  uniqueness: FingerprintUniqueness
  anomaly?: AnomalyDetectionResult
  identity?: IdentityMatchResult
  cluster?: EntropyCluster
}

// ============================================================
// Worker Message Types
// ============================================================

export type WorkerRequest =
  | { type: 'COLLECT_CANVAS'; payload: null }
  | { type: 'COLLECT_WEBGL'; payload: null }
  | { type: 'COLLECT_AUDIO'; payload: null }
  | { type: 'COLLECT_FONTS'; payload: { fontList: string[] } }
  | { type: 'COMPUTE_HASH'; payload: { data: string } }
  | { type: 'ENTROPY_CLUSTER'; payload: { vectors: number[][]; k: number } }
  | { type: 'COSINE_SIMILARITY'; payload: { a: number[]; b: number[] } }
  | { type: 'ANOMALY_DETECT'; payload: { vector: number[] } }

export type WorkerResponse =
  | { type: 'CANVAS_RESULT'; payload: CanvasFingerprint }
  | { type: 'WEBGL_RESULT'; payload: WebGLFingerprint }
  | { type: 'AUDIO_RESULT'; payload: AudioFingerprint }
  | { type: 'FONTS_RESULT'; payload: FontInfo }
  | { type: 'HASH_RESULT'; payload: { hash: string } }
  | { type: 'CLUSTER_RESULT'; payload: EntropyCluster[] }
  | { type: 'SIMILARITY_RESULT'; payload: { similarity: number } }
  | { type: 'ANOMALY_RESULT'; payload: AnomalyDetectionResult }
  | { type: 'ERROR'; payload: { message: string; stack?: string } }
  | { type: 'PROGRESS'; payload: { step: string; percent: number } }

// ============================================================
// WASM Module Types
// ============================================================

export interface WASMModule {
  computeCosineSimilarity(a: Float32Array, b: Float32Array): number
  countMinSketchInsert(item: string): void
  countMinSketchQuery(item: string): number
  computeEntropy(values: Float32Array): number
  kmeansCluster(data: Float32Array, k: number, n: number, dim: number): Int32Array
  buildCSRGraph(edges: Int32Array, weights: Float32Array, n: number): Uint8Array
  traverseGraph(graphData: Uint8Array, startNode: number, maxDepth: number): Int32Array
  computeEMA(values: Float32Array, alpha: number): Float32Array
  ready: Promise<void>
}

// ============================================================
// TRPC Router Types
// ============================================================

export interface FingerprintSubmitInput {
  fingerprint: FullFingerprint
  sessionId: string
}

export interface FingerprintAnalysisOutput {
  visitorId: string
  anomaly: AnomalyDetectionResult
  identity: IdentityMatchResult
  cluster: EntropyCluster
  uniqueness: FingerprintUniqueness
  riskScore: number
  flags: string[]
}

export interface HistoricalEntry {
  visitorId: string
  timestamp: string
  fingerprintHash: string
  anomalyScore: number
  riskScore: number
  browser: string
  os: string
  gpu: string
}

// ============================================================
// Store Types
// ============================================================

export type CollectionPhase =
  | 'idle'
  | 'browser'
  | 'gpu'
  | 'canvas'
  | 'webgl'
  | 'audio'
  | 'fonts'
  | 'network'
  | 'security'
  | 'analysis'
  | 'complete'
  | 'error'

export interface CollectionProgress {
  phase: CollectionPhase
  percent: number
  message: string
  startTime: number
  elapsed: number
}
