import { defineStore } from 'pinia'
import type {
  FullFingerprint,
  CollectionProgress,
  CollectionPhase,
  FingerprintAnalysisOutput,
  HistoricalEntry,
  AnomalyDetectionResult,
  IdentityMatchResult,
  EntropyCluster,
} from '~/types/fingerprint'

interface FingerprintState {
  current: FullFingerprint | null
  history: HistoricalEntry[]
  analysis: FingerprintAnalysisOutput | null
  progress: CollectionProgress
  isCollecting: boolean
  isAnalyzing: boolean
  error: string | null
  activeTab: string
  selectedField: string | null
  viewMode: 'overview' | 'raw' | 'analysis' | 'history' | 'lab'
  theme: 'dark' | 'matrix'
  autoRefresh: boolean
  refreshInterval: number
  lastUpdated: string | null
  clustersData: EntropyCluster[]
  anomalyHistory: AnomalyDetectionResult[]
  identityChain: IdentityMatchResult[]
  riskFlags: string[]
  totalScansThisSession: number
}

export const useFingerprintStore = defineStore('fingerprint', {
  state: (): FingerprintState => ({
    current: null,
    history: [],
    analysis: null,
    progress: {
      phase: 'idle',
      percent: 0,
      message: 'Ready to analyze',
      startTime: 0,
      elapsed: 0,
    },
    isCollecting: false,
    isAnalyzing: false,
    error: null,
    activeTab: 'overview',
    selectedField: null,
    viewMode: 'overview',
    theme: 'dark',
    autoRefresh: false,
    refreshInterval: 60000,
    lastUpdated: null,
    clustersData: [],
    anomalyHistory: [],
    identityChain: [],
    riskFlags: [],
    totalScansThisSession: 0,
  }),

  getters: {
    // ── Risk assessment
    riskLevel: (state): 'low' | 'medium' | 'high' | 'critical' => {
      if (!state.current) return 'low'
      const score = state.analysis?.riskScore ?? 0
      if (score > 0.75) return 'critical'
      if (score > 0.5)  return 'high'
      if (score > 0.25) return 'medium'
      return 'low'
    },

    riskColor(): string {
      const lvl = this.riskLevel
      if (lvl === 'critical') return '#ff3366'
      if (lvl === 'high')     return '#ff6633'
      if (lvl === 'medium')   return '#ffb800'
      return '#00ff88'
    },

    // ── Entropy score 0–100
    entropyScore: (state): number => {
      const bits = state.current?.uniqueness?.entropyBits ?? 0
      return Math.min(100, Math.round((bits / 25) * 100))
    },

    // ── Summary stats
    summaryStats: (state) => {
      const fp = state.current
      if (!fp) return null
      return {
        browser: `${fp.browser.browserName} ${fp.browser.browserVersion}`,
        os: `${fp.os.name} ${fp.os.version}`,
        gpu: fp.gpu.unmaskedRenderer || fp.gpu.renderer,
        entropy: fp.uniqueness.entropyBits.toFixed(2),
        uniqueness: fp.uniqueness.uniquenessPercent.toFixed(4),
        rarity: fp.uniqueness.rarity,
        hash: fp.uniqueness.fingerprintHash,
        stableHash: fp.uniqueness.stableHash,
        fonts: fp.fonts.fontCount,
        extensions: fp.extensions.detected.length,
        webrtcLeaks: fp.webrtc.localIPs.length,
        isBot: fp.browser.isBot,
        isHeadless: fp.browser.isHeadless,
        crossOriginIsolated: fp.security.crossOriginIsolated,
        devtoolsOpen: fp.devtools.open,
        anomalous: state.analysis?.anomaly?.isAnomaly ?? false,
      }
    },

    // ── Field count by category
    fieldCounts: (state) => {
      const fp = state.current
      if (!fp) return {}
      return {
        browser: Object.keys(fp.browser).length,
        gpu: Object.keys(fp.gpu).length,
        canvas: Object.keys(fp.canvas).length,
        webgl: Object.keys(fp.webgl).length,
        audio: Object.keys(fp.audio).length,
        fonts: fp.fonts.fontCount,
        permissions: fp.permissions.length,
        webrtc: fp.webrtc.localIPs.length,
      }
    },

    // ── Serialized for Monaco editor
    rawJSON: (state): string => {
      if (!state.current) return '{}'
      return JSON.stringify(state.current, null, 2)
    },

    // ── Fingerprint vector (for ML/clustering)
    fingerprintVector: (state): number[] => {
      const fp = state.current
      if (!fp) return []

      const hashToNum = (h: string): number => parseInt(h.slice(0, 8), 16) / 0xffffffff

      return [
        fp.screen.width / 3840,
        fp.screen.height / 2160,
        fp.screen.devicePixelRatio / 4,
        fp.screen.colorDepth / 32,
        fp.browser.hardwareConcurrency / 32,
        (fp.browser.deviceMemory ?? 0) / 64,
        fp.browser.maxTouchPoints / 10,
        fp.fonts.fontCount / 200,
        fp.browser.plugins.length / 20,
        hashToNum(fp.canvas.hash),
        hashToNum(fp.webgl.contextHash),
        hashToNum(fp.audio.oscillatorHash),
        fp.gpu.maxTextureSize / 32768,
        fp.webrtc.localIPs.length / 5,
        fp.timezone.timezoneOffset / 720,
        fp.permissions.filter(p => p.state === 'granted').length / 20,
      ]
    },

    // ── Progress label
    progressLabel: (state): string => {
      const phase = state.progress.phase
      const labels: Record<CollectionPhase, string> = {
        idle: 'Ready',
        browser: 'Scanning Browser',
        gpu: 'Probing GPU',
        canvas: 'Canvas Fingerprint',
        webgl: 'WebGL Analysis',
        audio: 'Audio Fingerprint',
        fonts: 'Font Detection',
        network: 'Network Probes',
        security: 'Security Analysis',
        analysis: 'ML Analysis',
        complete: 'Complete',
        error: 'Error',
      }
      return labels[phase] ?? phase
    },
  },

  actions: {
    setProgress(progress: Partial<CollectionProgress>) {
      this.progress = { ...this.progress, ...progress }
    },

    setFingerprint(fp: FullFingerprint) {
      this.current = fp
      this.lastUpdated = new Date().toISOString()
      this.totalScansThisSession++

      // Add to history
      const entry: HistoricalEntry = {
        visitorId: fp.visitorId,
        timestamp: fp.timestamp,
        fingerprintHash: fp.uniqueness.fingerprintHash,
        anomalyScore: this.analysis?.anomaly?.reconstructionError ?? 0,
        riskScore: this.analysis?.riskScore ?? 0,
        browser: `${fp.browser.browserName} ${fp.browser.browserVersion}`,
        os: `${fp.os.name} ${fp.os.version}`,
        gpu: fp.gpu.unmaskedRenderer,
      }
      this.history.unshift(entry)
      if (this.history.length > 50) this.history.pop()
    },

    setAnalysis(analysis: FingerprintAnalysisOutput) {
      this.analysis = analysis

      // Track anomaly history
      if (analysis.anomaly) {
        this.anomalyHistory.push(analysis.anomaly)
        if (this.anomalyHistory.length > 20) this.anomalyHistory.shift()
      }

      // Compute risk flags
      const flags: string[] = []
      const fp = this.current
      if (!fp) return

      if (fp.browser.isHeadless) flags.push('HEADLESS_BROWSER')
      if (fp.browser.webdriver) flags.push('WEBDRIVER_DETECTED')
      if (fp.antiTamper.automationDetected) flags.push('AUTOMATION_DETECTED')
      if (fp.devtools.open) flags.push('DEVTOOLS_OPEN')
      if (fp.extensions.detected.length > 3) flags.push('MANY_EXTENSIONS')
      if (fp.webrtc.localIPs.length === 0) flags.push('WEBRTC_BLOCKED')
      if (!fp.audio.supported) flags.push('AUDIO_BLOCKED')
      if (fp.canvas.hash === 'unsupported') flags.push('CANVAS_BLOCKED')
      if (fp.antiTamper.suspiciousProperties.length > 2) flags.push('API_TAMPERING')
      if (analysis.anomaly?.isAnomaly) flags.push('ANOMALY_DETECTED')
      if (!fp.security.crossOriginIsolated) flags.push('NOT_CROSS_ORIGIN_ISOLATED')
      if (fp.browser.hardwareConcurrency === 0) flags.push('HW_CONCURRENCY_SPOOFED')

      this.riskFlags = flags
      analysis.flags = flags
    },

    setClusters(clusters: EntropyCluster[]) {
      this.clustersData = clusters
    },

    setTab(tab: string) {
      this.activeTab = tab
    },

    setViewMode(mode: FingerprintState['viewMode']) {
      this.viewMode = mode
    },

    setSelectedField(field: string | null) {
      this.selectedField = field
    },

    setError(err: string | null) {
      this.error = err
    },

    setCollecting(v: boolean) {
      this.isCollecting = v
    },

    setAnalyzing(v: boolean) {
      this.isAnalyzing = v
    },

    clearHistory() {
      this.history = []
      this.anomalyHistory = []
    },

    reset() {
      this.current = null
      this.analysis = null
      this.error = null
      this.riskFlags = []
      this.progress = {
        phase: 'idle',
        percent: 0,
        message: 'Ready to analyze',
        startTime: 0,
        elapsed: 0,
      }
    },
  },

  persist: process.client ? {
    storage: sessionStorage,
    paths: ['history', 'totalScansThisSession', 'theme'],
  } : false,
})
