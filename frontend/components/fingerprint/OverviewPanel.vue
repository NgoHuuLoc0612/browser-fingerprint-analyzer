<script setup lang="ts">
import type { FullFingerprint, FingerprintAnalysisOutput } from '~/types/fingerprint'

const props = defineProps<{
  fingerprint: FullFingerprint
  analysis: FingerprintAnalysisOutput | null
  riskFlags: string[]
}>()

const store = useFingerprintStore()

const riskColor = computed(() => {
  const s = props.analysis?.riskScore ?? 0
  if (s > 0.75) return '#ff3366'
  if (s > 0.50) return '#ff6633'
  if (s > 0.25) return '#ffb800'
  return '#00ff88'
})

const rarityColor = computed(() => {
  const r = props.fingerprint.uniqueness.rarity
  if (r === 'unique')    return '#9945ff'
  if (r === 'very_rare') return '#ff3366'
  if (r === 'rare')      return '#ffb800'
  if (r === 'uncommon')  return '#00d4ff'
  return '#8892a4'
})

const entropyPercent = computed(() =>
  Math.min(100, (props.fingerprint.uniqueness.entropyBits / 25) * 100)
)

const anomalyLabel = computed(() => {
  const a = props.analysis?.anomaly
  if (!a) return { text: 'N/A', cls: 'anomaly-badge normal' }
  if (a.label === 'normal')    return { text: 'Normal',    cls: 'anomaly-badge normal' }
  if (a.label === 'suspicious')return { text: 'Suspicious',cls: 'anomaly-badge warning' }
  if (a.label === 'bot')       return { text: 'Bot',       cls: 'anomaly-badge danger' }
  if (a.label === 'spoofed')   return { text: 'Spoofed',   cls: 'anomaly-badge danger' }
  return { text: a.label, cls: 'anomaly-badge warning' }
})

const quickStats = computed(() => [
  {
    label: 'Entropy',
    value: props.fingerprint.uniqueness.entropyBits.toFixed(2),
    unit: 'bits',
    color: '#00d4ff',
    icon: '⚡',
  },
  {
    label: 'Uniqueness',
    value: props.fingerprint.uniqueness.uniquenessPercent.toFixed(3),
    unit: '%',
    color: rarityColor.value,
    icon: '🔬',
  },
  {
    label: 'Risk Score',
    value: ((props.analysis?.riskScore ?? 0) * 100).toFixed(1),
    unit: '%',
    color: riskColor.value,
    icon: '⚠',
  },
  {
    label: 'Fonts',
    value: props.fingerprint.fonts.fontCount,
    unit: 'found',
    color: '#9945ff',
    icon: '🔤',
  },
  {
    label: 'Duration',
    value: (props.fingerprint.collectionDuration / 1000).toFixed(2),
    unit: 's',
    color: '#8892a4',
    icon: '⏱',
  },
  {
    label: 'Extensions',
    value: props.fingerprint.extensions.detected.length,
    unit: 'detected',
    color: props.fingerprint.extensions.detected.length > 0 ? '#ffb800' : '#00ff88',
    icon: '🧩',
  },
])

const fieldGroups = computed(() => [
  {
    label: 'Browser',
    icon: '🌐',
    fields: [
      ['Name', `${props.fingerprint.browser.browserName} ${props.fingerprint.browser.browserVersion}`],
      ['Engine', `${props.fingerprint.browser.engine} ${props.fingerprint.browser.engineVersion}`],
      ['Platform', props.fingerprint.browser.platform],
      ['Headless', props.fingerprint.browser.isHeadless ? '⚠ YES' : 'No'],
      ['WebDriver', props.fingerprint.browser.webdriver ? '⚠ YES' : 'No'],
      ['Languages', props.fingerprint.browser.languages.slice(0, 3).join(', ')],
      ['Plugins', props.fingerprint.browser.plugins.length],
      ['HW Concurrency', props.fingerprint.browser.hardwareConcurrency],
      ['Device Memory', props.fingerprint.browser.deviceMemory != null ? `${props.fingerprint.browser.deviceMemory} GB` : 'Unknown'],
      ['PDF Viewer', props.fingerprint.browser.pdfViewerEnabled ? 'Yes' : 'No'],
    ],
  },
  {
    label: 'Operating System',
    icon: '💻',
    fields: [
      ['Name', `${props.fingerprint.os.name} ${props.fingerprint.os.version}`],
      ['Architecture', props.fingerprint.os.architecture],
      ['Mobile', props.fingerprint.os.mobile ? 'Yes' : 'No'],
      ['Touch Device', props.fingerprint.os.touchDevice ? 'Yes' : 'No'],
    ],
  },
  {
    label: 'GPU',
    icon: '🎮',
    fields: [
      ['Vendor', props.fingerprint.gpu.vendor],
      ['Renderer', props.fingerprint.gpu.renderer.slice(0, 50)],
      ['Unmasked Vendor', props.fingerprint.gpu.unmaskedVendor || 'N/A'],
      ['Unmasked Renderer', (props.fingerprint.gpu.unmaskedRenderer || 'N/A').slice(0, 50)],
      ['WebGL Version', props.fingerprint.gpu.webglVersion],
      ['WebGPU', props.fingerprint.gpu.webgpuSupported ? '✓ Supported' : 'Not supported'],
      ['Max Texture', `${props.fingerprint.gpu.maxTextureSize}px`],
      ['GLSL Version', props.fingerprint.gpu.shadingLanguageVersion.slice(0, 40)],
      ['Extensions', props.fingerprint.gpu.extensions.length],
      ['Antialiasing', props.fingerprint.gpu.antialiasing ? 'Yes' : 'No'],
    ],
  },
  {
    label: 'Screen',
    icon: '🖥',
    fields: [
      ['Resolution', `${props.fingerprint.screen.width}×${props.fingerprint.screen.height}`],
      ['Available', `${props.fingerprint.screen.availWidth}×${props.fingerprint.screen.availHeight}`],
      ['DPR', props.fingerprint.screen.devicePixelRatio],
      ['Color Depth', `${props.fingerprint.screen.colorDepth}-bit`],
      ['Color Gamut', props.fingerprint.screen.colorGamut],
      ['HDR', props.fingerprint.screen.isHDR ? 'Yes' : 'No'],
      ['Orientation', props.fingerprint.screen.orientation],
      ['Viewport', `${props.fingerprint.screen.innerWidth}×${props.fingerprint.screen.innerHeight}`],
    ],
  },
  {
    label: 'Canvas & Audio',
    icon: '🎨',
    fields: [
      ['Canvas Hash', props.fingerprint.canvas.hash],
      ['Canvas (Geo)', props.fingerprint.canvas.geometryHash],
      ['OffscreenCanvas', props.fingerprint.canvas.offscreenSupported ? '✓' : '✗'],
      ['Audio Hash', props.fingerprint.audio.oscillatorHash],
      ['Compressor Hash', props.fingerprint.audio.compressorHash],
      ['Sample Rate', props.fingerprint.audio.sampleRate ? `${props.fingerprint.audio.sampleRate} Hz` : 'N/A'],
      ['Channels', props.fingerprint.audio.channelCount || 'N/A'],
      ['Audio Supported', props.fingerprint.audio.supported ? '✓' : '✗'],
    ],
  },
  {
    label: 'Timezone & Locale',
    icon: '🕒',
    fields: [
      ['Timezone', props.fingerprint.timezone.timezone],
      ['UTC Offset', `UTC${props.fingerprint.timezone.timezoneOffset >= 0 ? '+' : ''}${props.fingerprint.timezone.timezoneOffset / 60}h`],
      ['Locale', props.fingerprint.timezone.locale],
      ['Language', props.fingerprint.timezone.language],
      ['DST Active', props.fingerprint.timezone.dstActive ? 'Yes' : 'No'],
      ['Hour Format', props.fingerprint.timezone.hour12 ? '12h' : '24h'],
      ['Week Start', ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][props.fingerprint.timezone.weekStart] ?? 'Unknown'],
      ['JS Drift', `${(props.fingerprint.timezone.jsTimeDrift ?? 0).toFixed(3)} ms`],
    ],
  },
  {
    label: 'Storage & Cookies',
    icon: '🗄',
    fields: [
      ['LocalStorage', props.fingerprint.storage.localStorage ? '✓' : '✗'],
      ['SessionStorage', props.fingerprint.storage.sessionStorage ? '✓' : '✗'],
      ['IndexedDB', props.fingerprint.storage.indexedDB ? '✓' : '✗'],
      ['Cookies', props.fingerprint.storage.cookies ? '✓' : '✗'],
      ['ServiceWorker', props.fingerprint.storage.serviceWorker ? '✓' : '✗'],
      ['Cache API', props.fingerprint.storage.cacheAPI ? '✓' : '✗'],
      ['Persistent', props.fingerprint.storage.persistentStorage ? '✓' : '✗'],
      ['Quota', props.fingerprint.storage.quota ? `${(props.fingerprint.storage.quota / 1e9).toFixed(2)} GB` : 'N/A'],
      ['Usage', props.fingerprint.storage.usage ? `${(props.fingerprint.storage.usage / 1e6).toFixed(2)} MB` : 'N/A'],
    ],
  },
  {
    label: 'WebRTC',
    icon: '📡',
    fields: [
      ['Local IPs', props.fingerprint.webrtc.localIPs.join(', ') || 'None (blocked)'],
      ['IPv4 Leaked', props.fingerprint.webrtc.ipv4Leaked ? '⚠ YES' : 'No'],
      ['IPv6 Leaked', props.fingerprint.webrtc.ipv6Leaked ? '⚠ YES' : 'No'],
      ['mDNS Enabled', props.fingerprint.webrtc.mDNSEnabled ? 'Yes' : 'No'],
      ['Supported', props.fingerprint.webrtc.supported ? '✓' : '✗'],
      ['Media Devices', props.fingerprint.webrtc.mediaDevices.length],
    ],
  },
  {
    label: 'Security',
    icon: '🔐',
    fields: [
      ['Secure Context', props.fingerprint.security.secureContext ? '✓' : '✗'],
      ['HTTPS', props.fingerprint.security.https ? '✓' : '✗'],
      ['Cross-Origin Isolated', props.fingerprint.security.crossOriginIsolated ? '✓' : '✗'],
      ['COEP', props.fingerprint.security.coep ? '✓' : '✗'],
      ['COOP', props.fingerprint.security.coop ? '✓' : '✗'],
      ['Trusted Types', props.fingerprint.security.trustedTypes ? '✓' : '✗'],
      ['SRI Supported', props.fingerprint.security.sriSupported ? '✓' : '✗'],
    ],
  },
])

function flagClass(flag: string): string {
  if (flag.includes('DETECTED') || flag.includes('OPEN') || flag.includes('LEAKED') || flag.includes('SPOOFED') || flag.includes('TAMPERING')) {
    return 'anomaly-badge danger'
  }
  if (flag.includes('BLOCKED') || flag.includes('MANY')) {
    return 'anomaly-badge warning'
  }
  return 'anomaly-badge warning'
}
</script>

<template>
  <div class="space-y-5">
    <!-- ── Quick stats bar -->
    <div class="grid grid-cols-3 md:grid-cols-6 gap-3">
      <div
        v-for="stat in quickStats" :key="stat.label"
        class="panel flex flex-col items-center justify-center text-center py-3 gap-1 relative overflow-hidden"
      >
        <div class="absolute inset-0 opacity-5" :style="{ background: `radial-gradient(circle at center, ${stat.color}, transparent 70%)` }" />
        <div class="text-lg">{{ stat.icon }}</div>
        <div class="font-mono text-xl font-bold" :style="{ color: stat.color }">
          {{ stat.value }}
        </div>
        <div class="text-xs font-mono text-text-muted uppercase tracking-widest">{{ stat.label }}</div>
        <div class="text-xs font-mono" :style="{ color: stat.color, opacity: 0.7 }">{{ stat.unit }}</div>
      </div>
    </div>

    <!-- ── Identity & Anomaly summary -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <!-- Fingerprint Hash Card -->
      <div class="panel-elevated space-y-3">
        <div class="section-header">
          <div class="status-dot active" />
          <span class="section-title">Fingerprint Identity</span>
        </div>
        <div class="space-y-2">
          <div class="data-row">
            <span class="data-key">Visitor ID</span>
            <span class="data-val font-mono text-accent-cyan text-xs">{{ fingerprint.visitorId }}</span>
          </div>
          <div class="data-row">
            <span class="data-key">Fingerprint Hash</span>
            <span class="data-val text-accent-cyan">{{ fingerprint.uniqueness.fingerprintHash }}</span>
          </div>
          <div class="data-row">
            <span class="data-key">Stable Hash</span>
            <span class="data-val text-text-secondary">{{ fingerprint.uniqueness.stableHash }}</span>
          </div>
          <div class="data-row">
            <span class="data-key">Rarity</span>
            <span class="data-val font-bold uppercase" :style="{ color: rarityColor }">
              {{ fingerprint.uniqueness.rarity.replace('_', ' ') }}
            </span>
          </div>
          <div class="data-row">
            <span class="data-key">1-in-N Estimate</span>
            <span class="data-val">
              {{ fingerprint.uniqueness.populationEstimate.toLocaleString() }}
            </span>
          </div>
          <div class="data-row">
            <span class="data-key">Collected At</span>
            <span class="data-val">{{ new Date(fingerprint.timestamp).toLocaleTimeString() }}</span>
          </div>
          <div class="data-row">
            <span class="data-key">Collection Time</span>
            <span class="data-val">{{ fingerprint.collectionDuration }}ms</span>
          </div>
        </div>

        <!-- Entropy bar -->
        <div class="mt-3 space-y-1">
          <div class="flex justify-between text-xs font-mono">
            <span class="text-text-muted">Entropy Score</span>
            <span style="color: var(--accent-cyan)">{{ fingerprint.uniqueness.entropyBits.toFixed(2) }} bits</span>
          </div>
          <div class="progress-bar">
            <div
              class="progress-fill"
              :style="{ width: `${entropyPercent}%`, background: `linear-gradient(to right, var(--accent-cyan), var(--accent-green))` }"
            />
          </div>
        </div>
      </div>

      <!-- Anomaly / Risk Card -->
      <div class="panel-elevated space-y-3">
        <div class="section-header">
          <div :class="analysis?.anomaly?.isAnomaly ? 'status-dot error' : 'status-dot active'" />
          <span class="section-title">Anomaly Detection</span>
          <div class="ml-auto" :class="anomalyLabel.cls">{{ anomalyLabel.text }}</div>
        </div>

        <div v-if="analysis?.anomaly" class="space-y-2">
          <div class="data-row">
            <span class="data-key">Label</span>
            <span class="data-val uppercase font-bold" :style="{ color: analysis.anomaly.isAnomaly ? 'var(--accent-red)' : 'var(--accent-green)' }">
              {{ analysis.anomaly.label }}
            </span>
          </div>
          <div class="data-row">
            <span class="data-key">Reconstruction Err</span>
            <span class="data-val">{{ analysis.anomaly.reconstructionError.toFixed(6) }}</span>
          </div>
          <div class="data-row">
            <span class="data-key">Threshold</span>
            <span class="data-val">{{ analysis.anomaly.threshold.toFixed(6) }}</span>
          </div>
          <div class="data-row">
            <span class="data-key">Confidence</span>
            <span class="data-val" :style="{ color: analysis.anomaly.confidence > 0.8 ? 'var(--accent-green)' : 'var(--accent-amber)' }">
              {{ (analysis.anomaly.confidence * 100).toFixed(1) }}%
            </span>
          </div>
          <div v-if="analysis.anomaly.anomalyDimensions.length > 0" class="data-row">
            <span class="data-key">Anomaly Dims</span>
            <span class="data-val text-accent-red">{{ analysis.anomaly.anomalyDimensions.join(', ') }}</span>
          </div>
        </div>
        <div v-else class="text-text-muted font-mono text-xs">No analysis result yet</div>

        <!-- Risk flags -->
        <div v-if="riskFlags.length > 0" class="mt-3">
          <div class="text-xs font-mono text-text-muted mb-2 uppercase tracking-widest">Risk Flags</div>
          <div class="flex flex-wrap gap-1.5">
            <span
              v-for="flag in riskFlags" :key="flag"
              :class="flagClass(flag)"
              class="text-xs"
            >
              {{ flag.replace(/_/g, ' ') }}
            </span>
          </div>
        </div>
        <div v-else class="text-accent-green font-mono text-xs">✓ No risk flags</div>

        <!-- Identity match -->
        <div v-if="analysis?.identity" class="mt-3 pt-3 border-t border-border/50">
          <div class="text-xs font-mono text-text-muted mb-2 uppercase tracking-widest">Identity Match</div>
          <div class="space-y-1.5">
            <div class="data-row">
              <span class="data-key">Is New Identity</span>
              <span class="data-val" :style="{ color: analysis.identity.isNewIdentity ? 'var(--accent-cyan)' : 'var(--accent-amber)' }">
                {{ analysis.identity.isNewIdentity ? 'New Visitor' : 'Returning' }}
              </span>
            </div>
            <div class="data-row">
              <span class="data-key">Similarity</span>
              <span class="data-val">{{ (analysis.identity.similarity * 100).toFixed(2) }}%</span>
            </div>
            <div class="data-row">
              <span class="data-key">Cosine Sim</span>
              <span class="data-val">{{ analysis.identity.cosineSimilarity.toFixed(6) }}</span>
            </div>
            <div class="data-row">
              <span class="data-key">Temporal Drift</span>
              <span class="data-val">{{ analysis.identity.temporalDrift.toFixed(4) }}</span>
            </div>
            <div class="data-row">
              <span class="data-key">Calibrated Score</span>
              <span class="data-val" :style="{ color: analysis.identity.calibratedScore > 0.8 ? 'var(--accent-green)' : 'var(--accent-amber)' }">
                {{ (analysis.identity.calibratedScore * 100).toFixed(2) }}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Field Groups Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      <div
        v-for="group in fieldGroups"
        :key="group.label"
        class="panel space-y-1"
      >
        <div class="section-header">
          <span class="text-base">{{ group.icon }}</span>
          <span class="section-title">{{ group.label }}</span>
        </div>
        <div
          v-for="[key, value] in group.fields"
          :key="String(key)"
          class="data-row"
        >
          <span class="data-key">{{ key }}</span>
          <span
            class="data-val"
            :class="{
              'text-accent-red!': String(value).startsWith('⚠'),
              'text-accent-green!': String(value) === '✓',
              'text-accent-red!': String(value) === '✗',
            }"
          >
            {{ value }}
          </span>
        </div>
      </div>
    </div>

    <!-- ── Permissions Table -->
    <div class="panel">
      <div class="section-header">
        <span class="text-base">🔒</span>
        <span class="section-title">Permission States</span>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2 mt-2">
        <div
          v-for="perm in fingerprint.permissions"
          :key="perm.name"
          class="flex items-center justify-between px-3 py-1.5 rounded-md text-xs font-mono"
          :class="{
            'bg-accent-green/10 border border-accent-green/20': perm.state === 'granted',
            'bg-accent-red/10 border border-accent-red/20': perm.state === 'denied',
            'bg-bg-elevated border border-border': perm.state === 'prompt',
            'bg-bg-surface border border-border/50 opacity-50': perm.state === 'unsupported',
          }"
        >
          <span class="text-text-secondary">{{ perm.name.replace(/-/g, ' ') }}</span>
          <span
            :class="{
              'text-accent-green': perm.state === 'granted',
              'text-accent-red': perm.state === 'denied',
              'text-accent-amber': perm.state === 'prompt',
              'text-text-muted': perm.state === 'unsupported',
            }"
          >
            {{ perm.state }}
          </span>
        </div>
      </div>
    </div>

    <!-- ── Entropy Contribution Table -->
    <div class="panel">
      <div class="section-header">
        <span class="text-base">📊</span>
        <span class="section-title">Entropy Contributions</span>
      </div>
      <table class="data-table w-full mt-2">
        <thead>
          <tr>
            <th>Field</th>
            <th>Value (Truncated)</th>
            <th>Entropy Bits</th>
            <th>Contribution</th>
            <th>Weight</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="fc in fingerprint.uniqueness.fieldContributions"
            :key="fc.field"
            class="hover:bg-bg-overlay transition-colors"
          >
            <td class="font-mono text-text-accent">{{ fc.field }}</td>
            <td class="font-mono text-text-muted max-w-xs truncate">{{ String(fc.value).slice(0, 32) }}</td>
            <td>
              <span class="font-mono" style="color: var(--accent-cyan)">
                {{ fc.entropyBits.toFixed(2) }}
              </span>
            </td>
            <td>
              <div class="flex items-center gap-2">
                <div class="progress-bar flex-1" style="min-width: 60px">
                  <div
                    class="progress-fill"
                    :style="{
                      width: `${fc.contribution * 100}%`,
                      background: 'linear-gradient(to right, var(--accent-cyan), var(--accent-purple))',
                    }"
                  />
                </div>
                <span class="font-mono text-xs text-text-muted w-12 text-right">
                  {{ (fc.contribution * 100).toFixed(1) }}%
                </span>
              </div>
            </td>
            <td>
              <span class="font-mono text-xs" :style="{ color: fc.entropyBits > 7 ? 'var(--accent-green)' : fc.entropyBits > 4 ? 'var(--accent-amber)' : 'var(--text-muted)' }">
                {{ fc.entropyBits > 7 ? 'HIGH' : fc.entropyBits > 4 ? 'MED' : 'LOW' }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ── Extension & DevTools Detection -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="panel space-y-2">
        <div class="section-header">
          <span class="text-base">🧩</span>
          <span class="section-title">Extension Detection</span>
        </div>
        <div v-if="fingerprint.extensions.detected.length === 0" class="text-accent-green font-mono text-xs">
          ✓ No known extensions detected
        </div>
        <div v-else class="space-y-1.5">
          <div
            v-for="ext in fingerprint.extensions.detected"
            :key="ext.name"
            class="ext-indicator w-full justify-between"
          >
            <span>{{ ext.name }}</span>
            <span class="text-accent-amber">{{ (ext.confidence * 100).toFixed(0) }}% confidence</span>
          </div>
        </div>
        <div v-if="fingerprint.extensions.modifiedAPIs.length > 0" class="mt-2">
          <div class="text-xs font-mono text-text-muted mb-1">Modified APIs:</div>
          <div class="flex flex-wrap gap-1">
            <span
              v-for="api in fingerprint.extensions.modifiedAPIs"
              :key="api"
              class="badge bg-accent-red/10 text-accent-red border border-accent-red/20"
            >{{ api }}</span>
          </div>
        </div>
      </div>

      <div class="panel space-y-2">
        <div class="section-header">
          <span class="text-base">🛡</span>
          <span class="section-title">Anti-Tamper & DevTools</span>
        </div>
        <div :class="fingerprint.devtools.open ? 'devtools-warning' : 'hidden'">
          ⚠ DevTools detected via: {{ fingerprint.devtools.method }}
        </div>
        <div class="space-y-1">
          <div class="data-row">
            <span class="data-key">DevTools Open</span>
            <span class="data-val" :style="{ color: fingerprint.devtools.open ? 'var(--accent-amber)' : 'var(--accent-green)' }">
              {{ fingerprint.devtools.open ? '⚠ Yes' : 'No' }}
            </span>
          </div>
          <div class="data-row">
            <span class="data-key">Method</span>
            <span class="data-val">{{ fingerprint.devtools.method || 'N/A' }}</span>
          </div>
          <div class="data-row">
            <span class="data-key">Prototype Intact</span>
            <span class="data-val" :style="{ color: fingerprint.antiTamper.prototypeIntact ? 'var(--accent-green)' : 'var(--accent-red)' }">
              {{ fingerprint.antiTamper.prototypeIntact ? '✓' : '✗ TAMPERED' }}
            </span>
          </div>
          <div class="data-row">
            <span class="data-key">Native Fns Intact</span>
            <span class="data-val" :style="{ color: fingerprint.antiTamper.nativeFunctionsIntact ? 'var(--accent-green)' : 'var(--accent-red)' }">
              {{ fingerprint.antiTamper.nativeFunctionsIntact ? '✓' : '✗ MODIFIED' }}
            </span>
          </div>
          <div class="data-row">
            <span class="data-key">Automation</span>
            <span class="data-val" :style="{ color: fingerprint.antiTamper.automationDetected ? 'var(--accent-red)' : 'var(--accent-green)' }">
              {{ fingerprint.antiTamper.automationDetected ? '⚠ DETECTED' : 'None detected' }}
            </span>
          </div>
          <div v-if="fingerprint.antiTamper.suspiciousProperties.length > 0" class="data-row">
            <span class="data-key">Suspicious Props</span>
            <span class="data-val text-accent-amber">{{ fingerprint.antiTamper.suspiciousProperties.join(', ') }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
