<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed } from 'vue'
import type { FullFingerprint } from '~/types/fingerprint'

const props = defineProps<{
  fingerprint: FullFingerprint | null
  selectedField?: string | null
}>()

const emit = defineEmits<{
  fieldSelect: [field: string]
}>()

const editorContainer = ref<HTMLDivElement | null>(null)
const searchQuery = ref('')
const activeFilter = ref<'all' | 'hashes' | 'scores' | 'flags'>('all')
const copyStatus = ref<'idle' | 'copied'>('idle')

let monaco: any = null
let editor: any = null

const filteredJSON = computed(() => {
  if (!props.fingerprint) return '{}'
  const fp = props.fingerprint

  if (activeFilter.value === 'hashes') {
    const hashes: Record<string, string> = {}
    function extractHashes(obj: any, prefix = '') {
      for (const [k, v] of Object.entries(obj ?? {})) {
        const path = prefix ? `${prefix}.${k}` : k
        if (typeof v === 'string' && (k.toLowerCase().includes('hash') || k.toLowerCase().includes('id'))) {
          hashes[path] = v
        } else if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
          extractHashes(v, path)
        }
      }
    }
    extractHashes(fp)
    return JSON.stringify(hashes, null, 2)
  }

  if (activeFilter.value === 'scores') {
    return JSON.stringify({
      uniqueness: fp.uniqueness,
      anomaly: fp.anomaly,
      identity: fp.identity,
    }, null, 2)
  }

  if (activeFilter.value === 'flags') {
    return JSON.stringify({
      isHeadless: fp.browser.isHeadless,
      isBot: fp.browser.isBot,
      webdriver: fp.browser.webdriver,
      automationDetected: fp.antiTamper.automationDetected,
      devtoolsOpen: fp.devtools.open,
      prototypeIntact: fp.antiTamper.prototypeIntact,
      nativeFunctionsIntact: fp.antiTamper.nativeFunctionsIntact,
      crossOriginIsolated: fp.security.crossOriginIsolated,
      secureContext: fp.security.secureContext,
      webrtcLeaks: fp.webrtc.localIPs,
      ipv4Leaked: fp.webrtc.ipv4Leaked,
      ipv6Leaked: fp.webrtc.ipv6Leaked,
      suspiciousProperties: fp.antiTamper.suspiciousProperties,
      riskFlags: fp.anomaly ? 'check analysis' : 'no analysis',
    }, null, 2)
  }

  return JSON.stringify(fp, null, 2)
})

const lineCount = computed(() => filteredJSON.value.split('\n').length)
const charCount = computed(() => filteredJSON.value.length)

async function initMonaco() {
  if (typeof window === 'undefined') return
  try {
    // Dynamic import of monaco
    const monacoModule = await import('monaco-editor')
    monaco = monacoModule

    // Define custom dark theme matching our design system
    monaco.editor.defineTheme('fingerprint-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'string.key.json',   foreground: '00d4ff', fontStyle: '' },
        { token: 'string.value.json', foreground: '00ff88' },
        { token: 'number',            foreground: 'ffb800' },
        { token: 'keyword.json',      foreground: '9945ff' },
        { token: 'delimiter.json',    foreground: '4a5568' },
        { token: 'string',            foreground: '00ff88' },
      ],
      colors: {
        'editor.background':              '#0c0f14',
        'editor.foreground':              '#e8eaf0',
        'editor.lineHighlightBackground': '#121620',
        'editor.selectionBackground':     '#00d4ff33',
        'editorLineNumber.foreground':    '#2d3748',
        'editorLineNumber.activeForeground': '#4a5568',
        'editor.findMatchBackground':     '#ffb80033',
        'editor.findMatchHighlightBackground': '#ffb80020',
        'editorBracketMatch.background':  '#00d4ff22',
        'editorBracketMatch.border':      '#00d4ff66',
        'scrollbar.shadow':               '#00000000',
        'scrollbarSlider.background':     '#00d4ff22',
        'scrollbarSlider.hoverBackground':'#00d4ff44',
        'scrollbarSlider.activeBackground':'#00d4ff66',
        'editorCursor.foreground':        '#00d4ff',
        'editor.wordHighlightBackground': '#9945ff22',
        'minimap.background':             '#050709',
      },
    })

    if (!editorContainer.value) return

    editor = monaco.editor.create(editorContainer.value, {
      value: filteredJSON.value,
      language: 'json',
      theme: 'fingerprint-dark',
      readOnly: true,
      minimap: { enabled: true, scale: 2, renderCharacters: false },
      scrollBeyondLastLine: false,
      renderLineHighlight: 'line',
      lineNumbers: 'on',
      folding: true,
      foldingHighlight: true,
      showFoldingControls: 'always',
      fontSize: 12,
      fontFamily: '"Space Mono", "Fira Code", monospace',
      fontLigatures: true,
      lineHeight: 20,
      letterSpacing: 0,
      padding: { top: 12, bottom: 12 },
      scrollbar: {
        vertical: 'auto',
        horizontal: 'auto',
        verticalScrollbarSize: 6,
        horizontalScrollbarSize: 6,
      },
      overviewRulerLanes: 0,
      hideCursorInOverviewRuler: true,
      bracketPairColorization: { enabled: true },
      guides: { bracketPairs: false, indentation: true },
      renderWhitespace: 'none',
      contextmenu: false,
      smoothScrolling: true,
      cursorBlinking: 'phase',
      cursorStyle: 'line',
      wordWrap: 'off',
      formatOnType: false,
      formatOnPaste: false,
      quickSuggestions: false,
      parameterHints: { enabled: false },
      suggestOnTriggerCharacters: false,
    })

    // Fold all top-level nodes except identity on load
    setTimeout(() => {
      editor.getAction('editor.foldLevel2')?.run()
    }, 200)

    // Search functionality
    watch(searchQuery, (q) => {
      if (!editor || !q) return
      editor.getAction('actions.find')?.run()
    })
  } catch (e) {
    console.warn('Monaco editor failed to load:', e)
  }
}

// Update editor content when fingerprint or filter changes
watch(filteredJSON, (newVal) => {
  if (editor) {
    const model = editor.getModel()
    if (model) {
      model.setValue(newVal)
      setTimeout(() => {
        if (editor) editor.getAction('editor.foldLevel2')?.run()
      }, 100)
    }
  }
})

// Jump to selected field
watch(() => props.selectedField, (field) => {
  if (!editor || !field) return
  const model = editor.getModel()
  if (!model) return
  const text = model.getValue()
  const idx = text.indexOf(`"${field}"`)
  if (idx < 0) return
  const pos = model.getPositionAt(idx)
  editor.revealLineInCenter(pos.lineNumber)
  editor.setPosition(pos)
})

async function copyToClipboard() {
  try {
    await navigator.clipboard.writeText(filteredJSON.value)
    copyStatus.value = 'copied'
    setTimeout(() => { copyStatus.value = 'idle' }, 2000)
  } catch { /* ignore */ }
}

function downloadJSON() {
  const blob = new Blob([filteredJSON.value], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `fingerprint_${props.fingerprint?.uniqueness.fingerprintHash ?? 'unknown'}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function foldAll() {
  editor?.getAction('editor.foldAll')?.run()
}

function unfoldAll() {
  editor?.getAction('editor.unfoldAll')?.run()
}

onMounted(() => {
  initMonaco()
})

onUnmounted(() => {
  editor?.dispose()
})
</script>

<template>
  <div class="flex flex-col h-full gap-3">
    <!-- Toolbar -->
    <div class="flex items-center gap-3 flex-wrap">
      <!-- Filter tabs -->
      <div class="tab-bar">
        <button
          v-for="f in ['all', 'hashes', 'scores', 'flags'] as const"
          :key="f"
          :class="['tab-item', activeFilter === f ? 'active' : '']"
          @click="activeFilter = f"
        >
          {{ f }}
        </button>
      </div>

      <!-- Search -->
      <div class="relative flex-1 min-w-48">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search fields..."
          class="w-full bg-bg-surface border border-border rounded px-3 py-1.5 text-xs font-mono text-text-primary placeholder-text-muted focus:border-accent-cyan focus:outline-none transition-colors"
        />
        <span class="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted text-xs">⌘F</span>
      </div>

      <!-- Action buttons -->
      <div class="flex items-center gap-2">
        <button class="btn-ghost text-xs flex items-center gap-1.5" @click="foldAll">
          <span>▶</span> Fold All
        </button>
        <button class="btn-ghost text-xs flex items-center gap-1.5" @click="unfoldAll">
          <span>▼</span> Expand All
        </button>
        <button class="btn-ghost text-xs flex items-center gap-1.5" @click="copyToClipboard">
          <span>{{ copyStatus === 'copied' ? '✓' : '⎘' }}</span>
          {{ copyStatus === 'copied' ? 'Copied!' : 'Copy' }}
        </button>
        <button class="btn-ghost text-xs flex items-center gap-1.5" @click="downloadJSON">
          <span>↓</span> Export
        </button>
      </div>
    </div>

    <!-- Stats bar -->
    <div class="flex items-center gap-4 text-xs font-mono text-text-muted px-1">
      <span>{{ lineCount.toLocaleString() }} lines</span>
      <span>{{ charCount.toLocaleString() }} chars</span>
      <span>{{ (charCount / 1024).toFixed(1) }} KB</span>
      <span class="ml-auto" style="color: var(--accent-cyan)">JSON · UTF-8 · Read-only</span>
    </div>

    <!-- Monaco editor container -->
    <div
      ref="editorContainer"
      class="flex-1 rounded-lg overflow-hidden border border-border min-h-0"
      style="min-height: 400px;"
    />

    <!-- Fallback if Monaco fails -->
    <div v-if="!editorContainer" class="panel flex-1 overflow-auto">
      <pre class="font-mono text-xs text-text-secondary whitespace-pre-wrap break-all">{{ filteredJSON }}</pre>
    </div>
  </div>
</template>
