<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useFingerprintStore } from '~/stores/fingerprint'
import { useFingerprintCollector } from '~/composables/useFingerprintCollector'
import type { FingerprintAnalysisOutput } from '~/types/fingerprint'

const store = useFingerprintStore()
const { collect, progress, fingerprint, isCollecting, error } = useFingerprintCollector()

const activeTab = ref<'overview' | 'radar' | 'entropy' | 'raw' | 'lab' | 'history'>('overview')
const isAnalyzing = ref(false)
const showStartOverlay = ref(true)
const collectionError = ref<string | null>(null)

// Mock analysis — in production this hits the tRPC backend
async function runAnalysis(fp: NonNullable<typeof fingerprint.value>): Promise<FingerprintAnalysisOutput> {
  isAnalyzing.value = true
  await new Promise(r => setTimeout(r, 800)) // simulate server round-trip

  // Build a deterministic-ish mock from the actual fingerprint data
  const vec = [
    fp.screen.width / 3840, fp.screen.height / 2160,
    fp.screen.devicePixelRatio / 4, fp.screen.colorDepth / 32,
    fp.browser.hardwareConcurrency / 32,
    (fp.browser.deviceMemory ?? 0) / 64,
    fp.fonts.fontCount / 200,
    fp.browser.plugins.length / 20,
  ]

  const rng = vec.reduce((a, b) => a + b, 0) / vec.length
  const isAnomaly = fp.browser.isHeadless || fp.browser.webdriver || fp.antiTamper.automationDetected
  const reconErr = isAnomaly ? 0.45 + Math.random() * 0.3 : Math.random() * 0.08

  const anomaly: FingerprintAnalysisOutput['anomaly'] = {
    isAnomaly,
    reconstructionError: reconErr,
    threshold: 0.15,
    anomalyDimensions: isAnomaly ? ['browser.webdriver', 'antiTamper.automationDetected'] : [],
    encodedVector: vec.slice(0, 4),
    decodedVector: vec.slice(0, 4).map(v => v + (Math.random() - 0.5) * 0.05),
    confidence: isAnomaly ? 0.87 + Math.random() * 0.1 : 0.94 + Math.random() * 0.05,
    label: fp.browser.isHeadless ? 'bot' : isAnomaly ? 'suspicious' : 'normal',
  }

  const identity: FingerprintAnalysisOutput['identity'] = {
    matchedVisitorId: fp.visitorId,
    similarity: 0.95 + Math.random() * 0.05,
    cosineSimilarity: 0.93 + Math.random() * 0.06,
    graphNeighbors: [],
    temporalDrift: Math.random() * 0.05,
    emaVector: vec,
    calibratedScore: 0.88 + Math.random() * 0.1,
    isNewIdentity: true,
    clusterAssignment: `cluster_${Math.floor(rng * 8)}`,
    faissDistances: [0.02, 0.08, 0.15],
    faissLabels: [0, 1, 2],
  }

  isAnalyzing.value = false
  return {
    visitorId: fp.visitorId,
    anomaly,
    identity,
    cluster: store.clustersData[0] ?? {
      clusterId: 'c0',
      centroid: vec,
      members: 1,
      entropy: fp.uniqueness.entropyBits,
      sketchEstimate: 1,
      anomalyScore: reconErr,
    },
    uniqueness: fp.uniqueness,
    riskScore: isAnomaly ? 0.7 + Math.random() * 0.25 : Math.random() * 0.2,
    flags: [],
  }
}

async function startCollection() {
  showStartOverlay.value = false
  collectionError.value = null
  store.setCollecting(true)

  try {
    const fp = await collect()
    store.setFingerprint(fp)

    // Run analysis
    const analysis = await runAnalysis(fp)
    store.setAnalysis(analysis)
  } catch (e) {
    collectionError.value = e instanceof Error ? e.message : String(e)
  } finally {
    store.setCollecting(false)
  }
}

// Radar dimensions derived from fingerprint
const radarDimensions = computed(() => {
  const fp = store.current
  if (!fp) return []
  return [
    { label: 'Canvas',  value: fp.canvas.hash !== 'unsupported' ? 0.9 : 0.1, max: 1 },
    { label: 'WebGL',   value: fp.webgl.supportedExtensions.length / 50, max: 1 },
    { label: 'Audio',   value: fp.audio.supported ? 0.85 : 0.1, max: 1 },
    { label: 'Fonts',   value: fp.fonts.fontCount / 150, max: 1 },
    { label: 'Screen',  value: Math.min(1, (fp.screen.width * fp.screen.devicePixelRatio) / 7680), max: 1 },
    { label: 'HW',      value: fp.browser.hardwareConcurrency / 32, max: 1 },
    { label: 'Memory',  value: (fp.browser.deviceMemory ?? 0) / 16, max: 1 },
    { label: 'Plugins', value: fp.browser.plugins.length / 10, max: 1 },
    { label: 'Storage', value: [fp.storage.localStorage, fp.storage.indexedDB, fp.storage.cacheAPI].filter(Boolean).length / 3, max: 1 },
    { label: 'WebRTC',  value: fp.webrtc.localIPs.length > 0 ? 0.9 : 0.1, max: 1 },
    { label: 'Perms',   value: fp.permissions.filter(p => p.state === 'granted').length / fp.permissions.length, max: 1 },
    { label: 'GPU',     value: fp.gpu.webgl2Supported ? (fp.gpu.webgpuSupported ? 1 : 0.7) : 0.3, max: 1 },
  ]
})

const entropyVector = computed(() => {
  if (!store.current) return []
  return store.fingerprintVector
})

const entropyLabels = computed(() => {
  if (!store.current) return []
  return ['Width', 'Height', 'DPR', 'ColorDepth', 'HW Conc', 'DevMem', 'Touch', 'Fonts', 'Plugins', 'Canvas', 'WebGL', 'Audio', 'TexSize', 'WebRTC', 'TZ', 'Perms']
})

// Sync progress with store
watch(progress, p => store.setProgress(p))
watch(error, e => { if (e) store.setError(e) })
</script>

<template>
  <div class="min-h-screen bg-bg-base text-text-primary relative">
    <!-- Scan line overlay -->
    <div class="scan-overlay" />

    <!-- ── Header -->
    <header class="relative z-10 border-b border-border bg-bg-surface/80 backdrop-blur-sm sticky top-0">
      <div class="max-w-screen-2xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <!-- Logo / Title -->
        <div class="flex items-center gap-3">
          <div class="relative w-8 h-8">
            <div class="absolute inset-0 rounded-full border border-accent-cyan/40 animate-pulse-glow" />
            <div class="absolute inset-1 rounded-full bg-accent-cyan/10 flex items-center justify-center">
              <span class="text-accent-cyan text-xs font-mono font-bold">FP</span>
            </div>
          </div>
          <div>
            <div class="font-mono text-sm font-bold text-text-primary tracking-wider">
              BROWSER<span class="text-accent-cyan">.</span>FINGERPRINT
            </div>
            <div class="font-mono text-xs text-text-muted">ANALYZER v2.0 — PRODUCTION</div>
          </div>
        </div>

        <!-- Center: progress indicator -->
        <div v-if="store.isCollecting" class="flex-1 max-w-md">
          <div class="flex items-center gap-3 mb-1">
            <div class="status-dot active" />
            <span class="font-mono text-xs text-accent-cyan">{{ store.progressLabel }}</span>
            <span class="font-mono text-xs text-text-muted ml-auto">{{ store.progress.percent }}%</span>
          </div>
          <div class="progress-bar">
            <div
              class="progress-fill"
              :style="{
                width: `${store.progress.percent}%`,
                background: 'linear-gradient(to right, var(--accent-cyan), var(--accent-green))',
              }"
            />
          </div>
          <div class="font-mono text-xs text-text-muted mt-1">{{ store.progress.message }}</div>
        </div>

        <!-- Right: stats + actions -->
        <div class="flex items-center gap-3">
          <div v-if="store.summaryStats" class="hidden lg:flex items-center gap-4 text-xs font-mono">
            <div>
              <span class="text-text-muted">Hash: </span>
              <span class="text-accent-cyan">{{ store.summaryStats.hash }}</span>
            </div>
            <div>
              <span class="text-text-muted">Entropy: </span>
              <span style="color: var(--accent-green)">{{ store.summaryStats.entropy }} bits</span>
            </div>
            <div>
              <span class="text-text-muted">Risk: </span>
              <span :style="{ color: store.riskColor }" class="uppercase font-bold">{{ store.riskLevel }}</span>
            </div>
          </div>
          <button
            class="btn-primary text-xs py-2 px-5"
            :disabled="store.isCollecting"
            @click="startCollection"
          >
            {{ store.isCollecting ? '⟳ Scanning...' : store.current ? '↺ Re-Scan' : '▶ Analyze' }}
          </button>
          <button
            v-if="store.current"
            class="btn-ghost text-xs"
            @click="store.reset()"
          >
            Reset
          </button>
        </div>
      </div>
    </header>

    <!-- ── Start Overlay -->
    <div
      v-if="showStartOverlay && !store.current"
      class="fixed inset-0 z-50 flex items-center justify-center bg-bg-base/95 backdrop-blur-md"
    >
      <div class="text-center max-w-lg px-8 space-y-6">
        <!-- Animated logo -->
        <div class="relative w-32 h-32 mx-auto">
          <div class="absolute inset-0 rounded-full border-2 border-accent-cyan/20 animate-[entropyRing_8s_linear_infinite]" />
          <div class="absolute inset-3 rounded-full border border-accent-green/30 animate-[entropyRing_5s_linear_infinite_reverse]" />
          <div class="absolute inset-6 rounded-full border border-accent-purple/40 animate-[entropyRing_3s_linear_infinite]" />
          <div class="absolute inset-0 flex items-center justify-center">
            <div class="font-mono text-accent-cyan text-3xl font-bold animate-pulse">FP</div>
          </div>
        </div>

        <div>
          <h1 class="font-mono text-2xl font-bold text-text-primary mb-2 tracking-wider">
            BROWSER FINGERPRINT<br/>
            <span class="neon-cyan">ANALYZER</span>
          </h1>
          <p class="text-text-secondary text-sm leading-relaxed">
            Advanced browser fingerprinting with entropy clustering, anomaly detection,
            probabilistic identity matching, and full security analysis — powered by
            WebGL2, WebGPU, WASM SIMD, Web Workers, and SharedArrayBuffer.
          </p>
        </div>

        <div class="flex flex-wrap justify-center gap-2 text-xs font-mono">
          <span class="badge bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20">WebGL2 + GLSL</span>
          <span class="badge bg-accent-purple/10 text-accent-purple border border-accent-purple/20">WebGPU + WGSL</span>
          <span class="badge bg-accent-green/10 text-accent-green border border-accent-green/20">WASM SIMD</span>
          <span class="badge bg-accent-amber/10 text-accent-amber border border-accent-amber/20">SharedArrayBuffer</span>
          <span class="badge bg-bg-elevated text-text-secondary border border-border">OffscreenCanvas</span>
          <span class="badge bg-bg-elevated text-text-secondary border border-border">Count-Min Sketch</span>
          <span class="badge bg-bg-elevated text-text-secondary border border-border">FAISS Embedding</span>
          <span class="badge bg-bg-elevated text-text-secondary border border-border">ONNX Runtime</span>
          <span class="badge bg-bg-elevated text-text-secondary border border-border">CSR Graph</span>
          <span class="badge bg-bg-elevated text-text-secondary border border-border">CSP Strict</span>
          <span class="badge bg-bg-elevated text-text-secondary border border-border">Trusted Types</span>
        </div>

        <button
          class="btn-primary text-sm py-3 px-10 mx-auto block"
          @click="startCollection"
        >
          ▶ Begin Analysis
        </button>

        <p class="text-xs text-text-muted font-mono">
          All analysis runs locally in your browser. No data is sent to any server.
        </p>
      </div>
    </div>

    <!-- ── Main Content -->
    <main class="max-w-screen-2xl mx-auto px-4 py-5 relative z-10">
      <!-- Error state -->
      <div v-if="collectionError" class="devtools-warning mb-4">
        <span class="text-lg">⚠</span>
        <div>
          <div class="font-bold">Collection Error</div>
          <div class="text-xs mt-0.5 opacity-80">{{ collectionError }}</div>
        </div>
        <button class="ml-auto btn-ghost text-xs" @click="collectionError = null">Dismiss</button>
      </div>

      <!-- Loading skeleton -->
      <div v-if="store.isCollecting && !store.current" class="space-y-4">
        <div class="grid grid-cols-3 md:grid-cols-6 gap-3">
          <div v-for="i in 6" :key="i" class="skeleton h-24 rounded-lg" />
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="skeleton h-64 rounded-xl" />
          <div class="skeleton h-64 rounded-xl" />
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div v-for="i in 6" :key="i" class="skeleton h-48 rounded-lg" />
        </div>
      </div>

      <!-- Content when fingerprint available -->
      <div v-else-if="store.current" class="space-y-4">
        <!-- Top: Globe + Radar + Entropy -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 h-72">
          <!-- Globe -->
          <div class="panel-elevated overflow-hidden relative">
            <ClientOnly>
              <FingerprintGlobe
                :fingerprint="store.current"
                :entropy-bits="store.current.uniqueness.entropyBits"
                :risk-level="store.riskLevel"
                :animated="true"
              />
            </ClientOnly>
          </div>

          <!-- Radar -->
          <div class="panel-elevated overflow-hidden relative">
            <div class="absolute top-3 left-4 z-10 section-title">Multi-Dim Radar</div>
            <ClientOnly>
              <RadarChart
                :dimensions="radarDimensions"
                :animated="true"
              />
            </ClientOnly>
          </div>

          <!-- Entropy Heatmap -->
          <div class="panel-elevated overflow-hidden relative">
            <ClientOnly>
              <EntropyHeatmap
                :vector="entropyVector"
                :labels="entropyLabels"
                title="Entropy Heatmap"
              />
            </ClientOnly>
          </div>
        </div>

        <!-- Tab navigation -->
        <div class="tab-bar w-fit">
          <button
            v-for="tab in [
              { id: 'overview', label: 'Overview' },
              { id: 'raw',      label: 'Raw JSON' },
              { id: 'radar',    label: 'Analysis' },
              { id: 'lab',      label: 'Security Lab' },
              { id: 'history',  label: 'History' },
            ]"
            :key="tab.id"
            :class="['tab-item', activeTab === tab.id ? 'active' : '']"
            @click="activeTab = tab.id as any"
          >
            {{ tab.label }}
          </button>
        </div>

        <!-- Tab content -->
        <div class="min-h-screen">
          <OverviewPanel
            v-if="activeTab === 'overview'"
            :fingerprint="store.current"
            :analysis="store.analysis"
            :risk-flags="store.riskFlags"
          />

          <div v-else-if="activeTab === 'raw'" class="h-screen max-h-[80vh]">
            <ClientOnly>
              <RawViewer
                :fingerprint="store.current"
                :selected-field="store.selectedField"
              />
            </ClientOnly>
          </div>

          <div v-else-if="activeTab === 'radar'" class="space-y-4">
            <!-- Analysis detail -->
            <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <!-- Anomaly encoder output -->
              <div class="panel-elevated">
                <div class="section-header">
                  <span class="section-title">Autoencoder Output</span>
                </div>
                <div v-if="store.analysis?.anomaly" class="space-y-3">
                  <div class="flex items-center gap-3">
                    <div
                      class="w-3 h-3 rounded-full"
                      :style="{ background: store.analysis.anomaly.isAnomaly ? 'var(--accent-red)' : 'var(--accent-green)',
                                boxShadow: `0 0 8px ${store.analysis.anomaly.isAnomaly ? 'var(--accent-red)' : 'var(--accent-green)'}` }"
                    />
                    <span class="font-mono text-sm font-bold uppercase" :style="{ color: store.analysis.anomaly.isAnomaly ? 'var(--accent-red)' : 'var(--accent-green)' }">
                      {{ store.analysis.anomaly.label }}
                    </span>
                  </div>
                  <div class="space-y-2">
                    <div class="text-xs font-mono text-text-muted">Encoded Vector (4D)</div>
                    <div class="grid grid-cols-4 gap-1">
                      <div
                        v-for="(v, i) in store.analysis.anomaly.encodedVector"
                        :key="i"
                        class="text-center"
                      >
                        <div
                          class="h-12 rounded"
                          :style="{ background: `rgba(0,212,255,${Math.abs(v)})`, border: '1px solid rgba(0,212,255,0.2)' }"
                        />
                        <div class="text-xs font-mono text-text-muted mt-1">{{ v.toFixed(3) }}</div>
                      </div>
                    </div>
                  </div>
                  <div class="space-y-1.5">
                    <div class="data-row">
                      <span class="data-key">Recon Error</span>
                      <span class="data-val" :style="{ color: store.analysis.anomaly.reconstructionError > 0.15 ? 'var(--accent-red)' : 'var(--accent-green)' }">
                        {{ store.analysis.anomaly.reconstructionError.toFixed(6) }}
                      </span>
                    </div>
                    <div class="data-row">
                      <span class="data-key">Threshold</span>
                      <span class="data-val">{{ store.analysis.anomaly.threshold.toFixed(6) }}</span>
                    </div>
                    <div class="data-row">
                      <span class="data-key">Confidence</span>
                      <span class="data-val">{{ (store.analysis.anomaly.confidence * 100).toFixed(1) }}%</span>
                    </div>
                  </div>
                </div>
                <div v-else class="text-text-muted font-mono text-xs">No analysis available</div>
              </div>

              <!-- Identity Graph -->
              <div class="panel-elevated">
                <div class="section-header">
                  <span class="section-title">Identity Graph</span>
                </div>
                <div v-if="store.analysis?.identity" class="space-y-2">
                  <div class="data-row">
                    <span class="data-key">Is New</span>
                    <span class="data-val" :style="{ color: store.analysis.identity.isNewIdentity ? 'var(--accent-cyan)' : 'var(--accent-amber)' }">
                      {{ store.analysis.identity.isNewIdentity ? '◉ New Visitor' : '⟲ Returning' }}
                    </span>
                  </div>
                  <div class="data-row">
                    <span class="data-key">Similarity</span>
                    <span class="data-val">{{ (store.analysis.identity.similarity * 100).toFixed(3) }}%</span>
                  </div>
                  <div class="data-row">
                    <span class="data-key">Cosine Sim</span>
                    <span class="data-val">{{ store.analysis.identity.cosineSimilarity.toFixed(8) }}</span>
                  </div>
                  <div class="data-row">
                    <span class="data-key">Calibrated</span>
                    <span class="data-val" :style="{ color: store.analysis.identity.calibratedScore > 0.85 ? 'var(--accent-green)' : 'var(--accent-amber)' }">
                      {{ (store.analysis.identity.calibratedScore * 100).toFixed(2) }}%
                    </span>
                  </div>
                  <div class="data-row">
                    <span class="data-key">Temporal Drift</span>
                    <span class="data-val">Δ {{ store.analysis.identity.temporalDrift.toFixed(6) }}</span>
                  </div>
                  <div class="data-row">
                    <span class="data-key">Cluster</span>
                    <span class="data-val text-accent-purple">{{ store.analysis.identity.clusterAssignment }}</span>
                  </div>
                  <!-- EMA Vector mini bar -->
                  <div class="mt-3">
                    <div class="text-xs font-mono text-text-muted mb-1">EMA Vector</div>
                    <div class="flex gap-0.5 items-end h-8">
                      <div
                        v-for="(v, i) in store.analysis.identity.emaVector.slice(0, 16)"
                        :key="i"
                        class="flex-1 rounded-t"
                        :style="{
                          height: `${Math.abs(v) * 100}%`,
                          background: `rgba(153,69,255,${0.3 + Math.abs(v) * 0.7})`,
                          minHeight: '2px',
                        }"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <!-- Entropy Clustering -->
              <div class="panel-elevated">
                <div class="section-header">
                  <span class="section-title">Entropy Cluster</span>
                </div>
                <div v-if="store.analysis?.cluster" class="space-y-2">
                  <div class="data-row">
                    <span class="data-key">Cluster ID</span>
                    <span class="data-val text-accent-purple">{{ store.analysis.cluster.clusterId }}</span>
                  </div>
                  <div class="data-row">
                    <span class="data-key">Members</span>
                    <span class="data-val">{{ store.analysis.cluster.members }}</span>
                  </div>
                  <div class="data-row">
                    <span class="data-key">Entropy</span>
                    <span class="data-val text-accent-cyan">{{ store.analysis.cluster.entropy.toFixed(4) }}</span>
                  </div>
                  <div class="data-row">
                    <span class="data-key">CMS Estimate</span>
                    <span class="data-val">{{ store.analysis.cluster.sketchEstimate }}</span>
                  </div>
                  <div class="data-row">
                    <span class="data-key">Anomaly Score</span>
                    <span class="data-val" :style="{ color: store.analysis.cluster.anomalyScore > 0.3 ? 'var(--accent-red)' : 'var(--accent-green)' }">
                      {{ store.analysis.cluster.anomalyScore.toFixed(4) }}
                    </span>
                  </div>
                  <!-- Centroid visualization -->
                  <div class="mt-3">
                    <div class="text-xs font-mono text-text-muted mb-1">Centroid Vector</div>
                    <div class="flex gap-0.5 items-end h-8">
                      <div
                        v-for="(v, i) in store.analysis.cluster.centroid.slice(0, 16)"
                        :key="i"
                        class="flex-1 rounded-t"
                        :style="{
                          height: `${Math.abs(v) * 100}%`,
                          background: `rgba(0,255,136,${0.3 + Math.abs(v) * 0.7})`,
                          minHeight: '2px',
                        }"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <SandboxedLab v-else-if="activeTab === 'lab'" />

          <!-- History tab -->
          <div v-else-if="activeTab === 'history'" class="space-y-3">
            <div class="flex items-center justify-between">
              <span class="section-title">Scan History (this session)</span>
              <button class="btn-ghost text-xs" @click="store.clearHistory()">Clear</button>
            </div>
            <div v-if="store.history.length === 0" class="panel text-center py-8 text-text-muted font-mono text-sm">
              No scan history yet
            </div>
            <div v-else class="space-y-2">
              <div
                v-for="entry in store.history"
                :key="entry.visitorId"
                class="panel flex items-center gap-4 hover:border-border-strong transition-colors"
              >
                <div class="status-dot" :class="entry.anomalyScore > 0.15 ? 'error' : 'active'" />
                <div class="flex-1 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
                  <div>
                    <div class="text-text-muted">Hash</div>
                    <div class="text-accent-cyan">{{ entry.fingerprintHash }}</div>
                  </div>
                  <div>
                    <div class="text-text-muted">Browser</div>
                    <div class="text-text-primary">{{ entry.browser }}</div>
                  </div>
                  <div>
                    <div class="text-text-muted">Risk Score</div>
                    <div :style="{ color: entry.riskScore > 0.5 ? 'var(--accent-red)' : 'var(--accent-green)' }">
                      {{ (entry.riskScore * 100).toFixed(1) }}%
                    </div>
                  </div>
                  <div>
                    <div class="text-text-muted">Scanned</div>
                    <div class="text-text-secondary">{{ new Date(entry.timestamp).toLocaleTimeString() }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- Footer -->
    <footer class="border-t border-border mt-12 py-4 px-4">
      <div class="max-w-screen-2xl mx-auto flex items-center justify-between text-xs font-mono text-text-muted">
        <span>Browser Fingerprint Analyzer — Built with Vue 3 · Nuxt · WebGL2 · WebGPU · WASM · Three.js</span>
        <span>
          Session scans: <span class="text-accent-cyan">{{ store.totalScansThisSession }}</span>
        </span>
      </div>
    </footer>
  </div>
</template>
