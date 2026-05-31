<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'

// Each test runs inside a sandboxed iframe to prevent cross-contamination
interface LabTest {
  id: string
  name: string
  description: string
  category: 'csp' | 'trusted-types' | 'coop-coep' | 'permissions' | 'storage' | 'network'
  code: string
  status: 'idle' | 'running' | 'pass' | 'fail' | 'warn'
  result?: string
  duration?: number
}

const tests = ref<LabTest[]>([
  {
    id: 'csp-inline',
    name: 'CSP Inline Script Block',
    description: 'Verifies that inline scripts are blocked by Content-Security-Policy',
    category: 'csp',
    code: `
      const script = document.createElement('script');
      script.textContent = 'window.__csp_inline_test = true';
      document.head.appendChild(script);
      return window.__csp_inline_test ? 'BLOCKED_FAILED' : 'BLOCKED_OK';
    `,
    status: 'idle',
  },
  {
    id: 'trusted-types-policy',
    name: 'Trusted Types Policy',
    description: 'Tests Trusted Types API availability and policy creation',
    category: 'trusted-types',
    code: `
      if (!window.trustedTypes) return 'UNSUPPORTED';
      try {
        const policy = trustedTypes.createPolicy('test-policy', {
          createHTML: (s) => s.replace(/<script/gi, '&lt;script'),
        });
        const safe = policy.createHTML('<b>safe</b>');
        return 'SUPPORTED: ' + (safe instanceof TrustedHTML ? 'TrustedHTML OK' : 'FAIL');
      } catch (e) {
        return 'ERROR: ' + e.message;
      }
    `,
    status: 'idle',
  },
  {
    id: 'coep-check',
    name: 'COEP / Cross-Origin Isolated',
    description: 'Checks Cross-Origin-Embedder-Policy and SharedArrayBuffer access',
    category: 'coop-coep',
    code: `
      const isolated = window.crossOriginIsolated;
      const sabAvail = typeof SharedArrayBuffer !== 'undefined';
      const atomicsAvail = typeof Atomics !== 'undefined';
      return JSON.stringify({ crossOriginIsolated: isolated, sharedArrayBuffer: sabAvail, atomics: atomicsAvail });
    `,
    status: 'idle',
  },
  {
    id: 'storage-partition',
    name: 'Storage Partitioning',
    description: 'Tests whether storage is partitioned (third-party context)',
    category: 'storage',
    code: `
      try {
        localStorage.setItem('__lab_test', Date.now().toString());
        const val = localStorage.getItem('__lab_test');
        localStorage.removeItem('__lab_test');
        return val ? 'ACCESSIBLE' : 'EMPTY';
      } catch(e) {
        return 'BLOCKED: ' + e.name;
      }
    `,
    status: 'idle',
  },
  {
    id: 'permission-query',
    name: 'Permission API Query',
    description: 'Tests if permissions.query is available and responsive',
    category: 'permissions',
    code: `
      if (!navigator.permissions) return 'UNSUPPORTED';
      const perms = ['geolocation', 'notifications', 'camera', 'microphone'];
      const results = await Promise.all(
        perms.map(p => navigator.permissions.query({ name: p }).then(s => s.state).catch(() => 'error'))
      );
      return JSON.stringify(Object.fromEntries(perms.map((p, i) => [p, results[i]])));
    `,
    status: 'idle',
  },
  {
    id: 'canvas-poison',
    name: 'Canvas Noise Injection',
    description: 'Detects if canvas output is being noised/poisoned by privacy extensions',
    category: 'csp',
    code: `
      const c = document.createElement('canvas');
      c.width = 200; c.height = 50;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(0, 0, 200, 50);
      ctx.font = '16px Arial';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('FP-Test-Canvas', 10, 30);
      const d1 = c.toDataURL();
      const d2 = c.toDataURL();
      return d1 === d2 ? 'CONSISTENT (no noise)' : 'INCONSISTENT (noise detected)';
    `,
    status: 'idle',
  },
  {
    id: 'webrtc-block',
    name: 'WebRTC ICE Leak Test',
    description: 'Attempts to gather ICE candidates to detect IP leaks',
    category: 'network',
    code: `
      if (!window.RTCPeerConnection) return 'WEBRTC_UNSUPPORTED';
      const ips = [];
      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      pc.createDataChannel('');
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await new Promise(r => {
        const t = setTimeout(r, 2000);
        pc.onicecandidate = e => {
          if (!e.candidate) { clearTimeout(t); r(); return; }
          const m = e.candidate.candidate.match(/([0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3})/g);
          if (m) ips.push(...m);
        };
      });
      pc.close();
      return ips.length > 0 ? 'LEAKED: ' + [...new Set(ips)].join(', ') : 'NO_LEAK';
    `,
    status: 'idle',
  },
  {
    id: 'font-enum',
    name: 'Local Font Access API',
    description: 'Tests the Local Font Access API (queryLocalFonts)',
    category: 'permissions',
    code: `
      if (!window.queryLocalFonts) return 'UNSUPPORTED';
      try {
        const fonts = await queryLocalFonts();
        return 'GRANTED: ' + fonts.length + ' fonts accessible';
      } catch (e) {
        return 'DENIED/ERROR: ' + e.message;
      }
    `,
    status: 'idle',
  },
  {
    id: 'timing-attack',
    name: 'High-Resolution Timer',
    description: 'Checks if high-resolution timing is available (for timing attacks)',
    category: 'coop-coep',
    code: `
      const precision = [];
      for (let i = 0; i < 100; i++) {
        const t = performance.now();
        const frac = t - Math.floor(t);
        precision.push(frac.toString().length);
      }
      const maxPrec = Math.max(...precision);
      const avgPrec = (precision.reduce((a, b) => a + b, 0) / precision.length).toFixed(1);
      return 'Max precision: ' + maxPrec + ' digits, avg: ' + avgPrec + (maxPrec > 10 ? ' (HIGH-RES)' : ' (REDUCED)');
    `,
    status: 'idle',
  },
  {
    id: 'worker-sab',
    name: 'SharedArrayBuffer Worker',
    description: 'Tests if SharedArrayBuffer can be passed to workers',
    category: 'coop-coep',
    code: `
      if (!window.crossOriginIsolated) return 'REQUIRES_COI';
      if (typeof SharedArrayBuffer === 'undefined') return 'SAB_UNAVAILABLE';
      try {
        const sab = new SharedArrayBuffer(16);
        const arr = new Int32Array(sab);
        Atomics.store(arr, 0, 42);
        const val = Atomics.load(arr, 0);
        return val === 42 ? 'SAB_OK: Atomics working' : 'SAB_FAIL';
      } catch (e) {
        return 'SAB_ERROR: ' + e.message;
      }
    `,
    status: 'idle',
  },
])

const activeCategory = ref<string>('all')
const runningAll = ref(false)
const iframeRef = ref<HTMLIFrameElement | null>(null)

const categories = [
  { id: 'all', label: 'All Tests' },
  { id: 'csp', label: 'CSP' },
  { id: 'trusted-types', label: 'Trusted Types' },
  { id: 'coop-coep', label: 'COOP/COEP' },
  { id: 'permissions', label: 'Permissions' },
  { id: 'storage', label: 'Storage' },
  { id: 'network', label: 'Network' },
]

const filteredTests = computed(() => {
  if (activeCategory.value === 'all') return tests.value
  return tests.value.filter(t => t.category === activeCategory.value)
})

const passCount = computed(() => tests.value.filter(t => t.status === 'pass').length)
const failCount = computed(() => tests.value.filter(t => t.status === 'fail').length)
const warnCount = computed(() => tests.value.filter(t => t.status === 'warn').length)

function sandboxedRun(code: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout')), 5000)

    // Create sandboxed iframe
    const iframe = document.createElement('iframe')
    iframe.sandbox.add('allow-scripts')
    iframe.style.display = 'none'
    document.body.appendChild(iframe)

    const messageId = Math.random().toString(36).slice(2)

    const handler = (e: MessageEvent) => {
      if (e.data?.id !== messageId) return
      window.removeEventListener('message', handler)
      clearTimeout(timeout)
      document.body.removeChild(iframe)
      if (e.data.error) reject(new Error(e.data.error))
      else resolve(e.data.result)
    }
    window.addEventListener('message', handler)

    // Inject runner into iframe
    const src = `
      <!DOCTYPE html><html><body><script>
      (async () => {
        try {
          const fn = new Function(${JSON.stringify(`return (async () => { ${code} })()`)});
          const result = await fn();
          parent.postMessage({ id: ${JSON.stringify(messageId)}, result: String(result ?? 'undefined') }, '*');
        } catch (e) {
          parent.postMessage({ id: ${JSON.stringify(messageId)}, error: e.message }, '*');
        }
      })();
      <\/script></body></html>
    `
    iframe.srcdoc = src
  })
}

async function runTest(test: LabTest) {
  test.status = 'running'
  test.result = undefined
  const t0 = performance.now()

  try {
    const result = await sandboxedRun(test.code)
    test.duration = Math.round(performance.now() - t0)
    test.result = result

    // Classify result
    if (result.includes('ERROR') || result.includes('FAIL') || result.includes('LEAKED')) {
      test.status = 'fail'
    } else if (result.includes('UNSUPPORTED') || result.includes('REQUIRES') || result.includes('BLOCKED_FAILED') || result.includes('INCONSISTENT')) {
      test.status = 'warn'
    } else {
      test.status = 'pass'
    }
  } catch (e) {
    test.duration = Math.round(performance.now() - t0)
    test.result = `Error: ${e instanceof Error ? e.message : String(e)}`
    test.status = 'fail'
  }
}

async function runAll() {
  runningAll.value = true
  for (const test of filteredTests.value) {
    await runTest(test)
    await new Promise(r => setTimeout(r, 100)) // slight delay between tests
  }
  runningAll.value = false
}

function resetAll() {
  for (const test of tests.value) {
    test.status = 'idle'
    test.result = undefined
    test.duration = undefined
  }
}

function statusColor(status: LabTest['status']): string {
  if (status === 'pass')    return 'var(--accent-green)'
  if (status === 'fail')    return 'var(--accent-red)'
  if (status === 'warn')    return 'var(--accent-amber)'
  if (status === 'running') return 'var(--accent-cyan)'
  return 'var(--text-muted)'
}

function statusIcon(status: LabTest['status']): string {
  if (status === 'pass')    return '✓'
  if (status === 'fail')    return '✗'
  if (status === 'warn')    return '⚠'
  if (status === 'running') return '⟳'
  return '○'
}

function categoryColor(cat: LabTest['category']): string {
  const map: Record<string, string> = {
    'csp':          'var(--accent-cyan)',
    'trusted-types':'var(--accent-purple)',
    'coop-coep':    'var(--accent-green)',
    'permissions':  'var(--accent-amber)',
    'storage':      '#00d4ff',
    'network':      'var(--accent-red)',
  }
  return map[cat] ?? 'var(--text-muted)'
}
</script>

<template>
  <div class="space-y-4">
    <!-- Header stats -->
    <div class="flex items-center gap-4 flex-wrap">
      <div class="flex-1">
        <h3 class="font-mono text-sm font-bold text-text-accent uppercase tracking-wider mb-1">
          Sandboxed Security Lab
        </h3>
        <p class="text-xs text-text-muted font-mono">
          Tests run inside sandboxed iframes with <code class="text-accent-cyan">sandbox="allow-scripts"</code>
          to prevent side-effects. Results reflect the current browser's security posture.
        </p>
      </div>
      <div class="flex items-center gap-3 text-xs font-mono">
        <span style="color: var(--accent-green)">✓ {{ passCount }} pass</span>
        <span style="color: var(--accent-amber)">⚠ {{ warnCount }} warn</span>
        <span style="color: var(--accent-red)">✗ {{ failCount }} fail</span>
      </div>
    </div>

    <!-- Controls -->
    <div class="flex items-center gap-3 flex-wrap">
      <div class="tab-bar">
        <button
          v-for="cat in categories"
          :key="cat.id"
          :class="['tab-item', activeCategory === cat.id ? 'active' : '']"
          @click="activeCategory = cat.id"
        >
          {{ cat.label }}
        </button>
      </div>
      <div class="ml-auto flex gap-2">
        <button
          class="btn-primary text-xs py-1.5 px-4"
          :disabled="runningAll"
          @click="runAll"
        >
          {{ runningAll ? '⟳ Running...' : '▶ Run All' }}
        </button>
        <button class="btn-ghost text-xs" @click="resetAll">Reset</button>
      </div>
    </div>

    <!-- Test cards -->
    <div class="grid grid-cols-1 xl:grid-cols-2 gap-3">
      <div
        v-for="test in filteredTests"
        :key="test.id"
        class="panel relative overflow-hidden"
        :class="{ 'border-accent-green/40': test.status === 'pass', 'border-accent-red/40': test.status === 'fail', 'border-accent-amber/40': test.status === 'warn' }"
      >
        <!-- Status glow -->
        <div
          v-if="test.status !== 'idle'"
          class="absolute inset-0 opacity-5 pointer-events-none"
          :style="{ background: `radial-gradient(circle at top left, ${statusColor(test.status)}, transparent 60%)` }"
        />

        <!-- Header -->
        <div class="flex items-start justify-between gap-3 mb-3">
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-0.5">
              <!-- Category badge -->
              <span
                class="badge text-xs py-0 px-1.5"
                :style="{ color: categoryColor(test.category), border: `1px solid ${categoryColor(test.category)}33`, background: `${categoryColor(test.category)}11` }"
              >
                {{ test.category }}
              </span>
              <!-- Status icon -->
              <span
                class="font-mono font-bold"
                :style="{ color: statusColor(test.status) }"
              >
                {{ statusIcon(test.status) }}
              </span>
            </div>
            <div class="font-mono text-sm font-bold text-text-primary">{{ test.name }}</div>
            <div class="text-xs text-text-muted mt-0.5">{{ test.description }}</div>
          </div>
          <button
            class="shrink-0 btn-ghost text-xs px-3 py-1"
            :disabled="test.status === 'running' || runningAll"
            @click="runTest(test)"
          >
            {{ test.status === 'running' ? '⟳' : '▶ Run' }}
          </button>
        </div>

        <!-- Result -->
        <div v-if="test.result" class="mt-2">
          <div
            class="font-mono text-xs px-3 py-2 rounded border overflow-auto max-h-20"
            :style="{
              background: `${statusColor(test.status)}11`,
              borderColor: `${statusColor(test.status)}33`,
              color: statusColor(test.status),
            }"
          >
            {{ test.result }}
          </div>
          <div class="text-xs font-mono text-text-muted mt-1 text-right">
            {{ test.duration }}ms
          </div>
        </div>

        <!-- Code preview (collapsed) -->
        <details class="mt-2">
          <summary class="text-xs font-mono text-text-muted cursor-pointer hover:text-text-secondary transition-colors">
            View test code
          </summary>
          <pre class="text-xs font-mono text-text-secondary mt-2 bg-bg-base rounded p-2 overflow-auto max-h-40">{{ test.code.trim() }}</pre>
        </details>
      </div>
    </div>

    <!-- Security Report Summary -->
    <div v-if="passCount + failCount + warnCount > 0" class="panel">
      <div class="section-header">
        <span class="text-base">📋</span>
        <span class="section-title">Security Report</span>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
        <div class="text-center">
          <div class="font-mono text-3xl font-bold" style="color: var(--accent-green)">{{ passCount }}</div>
          <div class="text-xs font-mono text-text-muted uppercase tracking-widest mt-1">Passed</div>
        </div>
        <div class="text-center">
          <div class="font-mono text-3xl font-bold" style="color: var(--accent-amber)">{{ warnCount }}</div>
          <div class="text-xs font-mono text-text-muted uppercase tracking-widest mt-1">Warning</div>
        </div>
        <div class="text-center">
          <div class="font-mono text-3xl font-bold" style="color: var(--accent-red)">{{ failCount }}</div>
          <div class="text-xs font-mono text-text-muted uppercase tracking-widest mt-1">Failed</div>
        </div>
        <div class="text-center">
          <div class="font-mono text-3xl font-bold" style="color: var(--accent-cyan)">
            {{ tests.filter(t => t.status !== 'idle').length }}
          </div>
          <div class="text-xs font-mono text-text-muted uppercase tracking-widest mt-1">Total Run</div>
        </div>
      </div>
    </div>
  </div>
</template>
