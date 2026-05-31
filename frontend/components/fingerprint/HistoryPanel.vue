<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { HistoricalEntry } from '~/types/fingerprint'

const props = defineProps<{
  history: HistoricalEntry[]
  currentHash?: string
}>()

const emit = defineEmits<{
  select: [entry: HistoricalEntry]
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const selectedIdx = ref<number | null>(null)
let animId: number | null = null

// ── Draw temporal drift sparkline using Canvas2D
function drawDriftChart(canvas: HTMLCanvasElement, entries: HistoricalEntry[]) {
  const ctx = canvas.getContext('2d')
  if (!ctx || entries.length < 2) return

  const W = canvas.width  = canvas.clientWidth
  const H = canvas.height = canvas.clientHeight
  ctx.clearRect(0, 0, W, H)

  const risks  = entries.map(e => e.riskScore)
  const anomalies = entries.map(e => e.anomalyScore)
  const maxR = Math.max(...risks, 1)
  const maxA = Math.max(...anomalies, 1)
  const n = entries.length

  function xOf(i: number) { return (i / (n - 1)) * W }
  function yOf(v: number, max: number) { return H - (v / max) * H * 0.85 - H * 0.05 }

  // ── Grid lines
  ctx.strokeStyle = 'rgba(0,212,255,0.06)'
  ctx.lineWidth = 1
  for (let g = 0; g <= 4; g++) {
    const y = H * 0.05 + (H * 0.85 / 4) * g
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
  }

  // ── Risk score area
  ctx.beginPath()
  ctx.moveTo(xOf(0), H)
  for (let i = 0; i < n; i++) ctx.lineTo(xOf(i), yOf(risks[i], maxR))
  ctx.lineTo(xOf(n - 1), H)
  ctx.closePath()
  const grad = ctx.createLinearGradient(0, 0, 0, H)
  grad.addColorStop(0, 'rgba(255,51,102,0.3)')
  grad.addColorStop(1, 'rgba(255,51,102,0.02)')
  ctx.fillStyle = grad
  ctx.fill()

  // ── Risk line
  ctx.beginPath()
  ctx.moveTo(xOf(0), yOf(risks[0], maxR))
  for (let i = 1; i < n; i++) {
    const cx = (xOf(i - 1) + xOf(i)) / 2
    ctx.bezierCurveTo(cx, yOf(risks[i - 1], maxR), cx, yOf(risks[i], maxR), xOf(i), yOf(risks[i], maxR))
  }
  ctx.strokeStyle = '#ff3366'
  ctx.lineWidth = 1.5
  ctx.stroke()

  // ── Anomaly score line
  ctx.beginPath()
  ctx.moveTo(xOf(0), yOf(anomalies[0], maxA))
  for (let i = 1; i < n; i++) {
    const cx = (xOf(i - 1) + xOf(i)) / 2
    ctx.bezierCurveTo(cx, yOf(anomalies[i - 1], maxA), cx, yOf(anomalies[i], maxA), xOf(i), yOf(anomalies[i], maxA))
  }
  ctx.strokeStyle = '#ffb800'
  ctx.lineWidth = 1
  ctx.setLineDash([3, 3])
  ctx.stroke()
  ctx.setLineDash([])

  // ── Data points
  for (let i = 0; i < n; i++) {
    const x = xOf(i)
    const y = yOf(risks[i], maxR)
    const isSelected = selectedIdx.value === i
    const isCurrent = entries[i].fingerprintHash === props.currentHash

    ctx.beginPath()
    ctx.arc(x, y, isSelected ? 5 : isCurrent ? 4 : 3, 0, Math.PI * 2)
    ctx.fillStyle = entries[i].anomalyScore > 0.15
      ? '#ff3366'
      : entries[i].riskScore > 0.5
        ? '#ffb800'
        : '#00ff88'
    ctx.fill()

    if (isSelected || isCurrent) {
      ctx.beginPath()
      ctx.arc(x, y, 8, 0, Math.PI * 2)
      ctx.strokeStyle = isCurrent ? '#00d4ff' : '#ffb800'
      ctx.lineWidth = 1
      ctx.stroke()
    }
  }
}

// ── Click detection on canvas
function handleCanvasClick(e: MouseEvent) {
  if (!canvasRef.value || props.history.length < 2) return
  const rect = canvasRef.value.getBoundingClientRect()
  const x = e.clientX - rect.left
  const W = canvasRef.value.clientWidth
  const n = props.history.length
  const xOf = (i: number) => (i / (n - 1)) * W
  let nearest = 0, nearestD = Infinity
  for (let i = 0; i < n; i++) {
    const d = Math.abs(xOf(i) - x)
    if (d < nearestD) { nearestD = d; nearest = i }
  }
  if (nearestD < 30) {
    selectedIdx.value = nearest
    emit('select', props.history[nearest])
  }
}

// ── Stats
const stats = computed(() => {
  const h = props.history
  if (h.length === 0) return null
  const avgRisk = h.reduce((s, e) => s + e.riskScore, 0) / h.length
  const anomalyCount = h.filter(e => e.anomalyScore > 0.15).length
  const uniqueHashes = new Set(h.map(e => e.fingerprintHash)).size
  const uniqueBrowsers = new Set(h.map(e => e.browser)).size
  return { avgRisk, anomalyCount, uniqueHashes, uniqueBrowsers, total: h.length }
})

// ── Re-draw on history change
let drawScheduled = false
function scheduleDraw() {
  if (drawScheduled) return
  drawScheduled = true
  requestAnimationFrame(() => {
    drawScheduled = false
    if (canvasRef.value && props.history.length > 0) {
      drawDriftChart(canvasRef.value, [...props.history].reverse())
    }
  })
}

watch(() => [props.history, selectedIdx.value], scheduleDraw, { deep: true })

onMounted(() => {
  scheduleDraw()
  window.addEventListener('resize', scheduleDraw)
})
onUnmounted(() => {
  window.removeEventListener('resize', scheduleDraw)
  if (animId) cancelAnimationFrame(animId)
})
</script>

<template>
  <div class="space-y-4">
    <!-- Summary stats -->
    <div v-if="stats" class="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div class="panel text-center py-3">
        <div class="font-mono text-2xl font-bold text-accent-cyan">{{ stats.total }}</div>
        <div class="metric-label mt-1">Total Scans</div>
      </div>
      <div class="panel text-center py-3">
        <div class="font-mono text-2xl font-bold" :style="{ color: stats.anomalyCount > 0 ? 'var(--accent-red)' : 'var(--accent-green)' }">
          {{ stats.anomalyCount }}
        </div>
        <div class="metric-label mt-1">Anomalies</div>
      </div>
      <div class="panel text-center py-3">
        <div class="font-mono text-2xl font-bold text-accent-purple">{{ stats.uniqueHashes }}</div>
        <div class="metric-label mt-1">Unique Hashes</div>
      </div>
      <div class="panel text-center py-3">
        <div class="font-mono text-2xl font-bold text-accent-amber">
          {{ (stats.avgRisk * 100).toFixed(1) }}%
        </div>
        <div class="metric-label mt-1">Avg Risk</div>
      </div>
    </div>

    <!-- Temporal drift chart -->
    <div class="panel-elevated">
      <div class="section-header">
        <span class="section-title">Temporal Drift</span>
        <div class="ml-auto flex items-center gap-4 text-xs font-mono">
          <span class="flex items-center gap-1.5">
            <span class="inline-block w-4 h-0.5 bg-accent-red rounded" />
            Risk Score
          </span>
          <span class="flex items-center gap-1.5">
            <span class="inline-block w-4 border-t border-dashed border-accent-amber" />
            Anomaly Score
          </span>
        </div>
      </div>
      <div class="relative h-32 mt-2">
        <canvas
          ref="canvasRef"
          class="w-full h-full cursor-crosshair"
          @click="handleCanvasClick"
        />
        <div v-if="history.length < 2" class="absolute inset-0 flex items-center justify-center text-text-muted font-mono text-xs">
          Need 2+ scans to show drift
        </div>
      </div>
    </div>

    <!-- History list -->
    <div class="space-y-2">
      <div class="section-header">
        <span class="section-title">Scan Log</span>
        <span class="font-mono text-xs text-text-muted ml-auto">{{ history.length }} entries</span>
      </div>

      <div v-if="history.length === 0" class="panel text-center py-8">
        <div class="text-text-muted font-mono text-sm">No history yet — run a scan first</div>
      </div>

      <div
        v-for="(entry, idx) in history"
        :key="entry.visitorId"
        class="panel cursor-pointer transition-all duration-200 hover:border-border-strong"
        :class="{
          'border-accent-cyan/40 bg-bg-elevated/50': entry.fingerprintHash === currentHash,
          'border-accent-red/30': entry.anomalyScore > 0.15 && entry.fingerprintHash !== currentHash,
          'ring-1 ring-accent-amber/40': selectedIdx === (history.length - 1 - idx),
        }"
        @click="selectedIdx = history.length - 1 - idx; emit('select', entry)"
      >
        <div class="flex items-center gap-3">
          <!-- Status indicator -->
          <div
            class="w-2 h-2 rounded-full shrink-0"
            :style="{
              background: entry.anomalyScore > 0.15 ? 'var(--accent-red)'
                : entry.riskScore > 0.5 ? 'var(--accent-amber)'
                : 'var(--accent-green)',
              boxShadow: `0 0 6px ${entry.anomalyScore > 0.15 ? 'var(--accent-red)' : entry.riskScore > 0.5 ? 'var(--accent-amber)' : 'var(--accent-green)'}`,
            }"
          />

          <!-- Main info -->
          <div class="flex-1 grid grid-cols-2 md:grid-cols-5 gap-x-4 gap-y-1 text-xs font-mono min-w-0">
            <div>
              <div class="text-text-muted">Hash</div>
              <div class="text-accent-cyan truncate">{{ entry.fingerprintHash }}</div>
            </div>
            <div>
              <div class="text-text-muted">Browser</div>
              <div class="text-text-primary truncate">{{ entry.browser }}</div>
            </div>
            <div class="hidden md:block">
              <div class="text-text-muted">OS</div>
              <div class="text-text-secondary truncate">{{ entry.os }}</div>
            </div>
            <div>
              <div class="text-text-muted">Risk</div>
              <div
                :style="{
                  color: entry.riskScore > 0.7 ? 'var(--accent-red)'
                    : entry.riskScore > 0.4 ? 'var(--accent-amber)'
                    : 'var(--accent-green)'
                }"
              >
                {{ (entry.riskScore * 100).toFixed(1) }}%
              </div>
            </div>
            <div>
              <div class="text-text-muted">Time</div>
              <div class="text-text-muted">{{ new Date(entry.timestamp).toLocaleTimeString() }}</div>
            </div>
          </div>

          <!-- Current badge -->
          <div v-if="entry.fingerprintHash === currentHash" class="anomaly-badge normal shrink-0">current</div>
          <div v-else-if="entry.anomalyScore > 0.15" class="anomaly-badge danger shrink-0">anomaly</div>
        </div>
      </div>
    </div>
  </div>
</template>
