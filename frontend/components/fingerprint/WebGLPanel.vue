<script setup lang="ts">
import { ref, computed } from 'vue'
import type { GPUInfo, WebGLFingerprint } from '~/types/fingerprint'

const props = defineProps<{
  gpu: GPUInfo
  webgl: WebGLFingerprint
}>()

const extFilter = ref('')
const showAllParams = ref(false)
const activeSection = ref<'overview' | 'params' | 'extensions' | 'precision' | 'webgpu'>('overview')

const filteredExtensions = computed(() =>
  props.gpu.extensions.filter(e =>
    !extFilter.value || e.toLowerCase().includes(extFilter.value.toLowerCase())
  )
)

const extensionCategories = computed(() => {
  const cats: Record<string, string[]> = {
    'Draw & Render':    props.gpu.extensions.filter(e => /DRAW|MULTI|INSTANCE|INDIRECT/i.test(e)),
    'Texture':         props.gpu.extensions.filter(e => /TEXTURE|COMPRESSED|ANISO|S3TC|DXT|ASTC|ETC|PVRTC|RGTC|BPTC/i.test(e)),
    'Debug & Info':    props.gpu.extensions.filter(e => /DEBUG|INFO|RENDERER/i.test(e)),
    'Color & Blend':   props.gpu.extensions.filter(e => /COLOR|BLEND|FLOAT|HALF/i.test(e)),
    'Depth & Stencil': props.gpu.extensions.filter(e => /DEPTH|STENCIL/i.test(e)),
    'Transform':       props.gpu.extensions.filter(e => /TRANSFORM|FEEDBACK/i.test(e)),
    'Compute':         props.gpu.extensions.filter(e => /COMPUTE|SHADER_IMAGE|DISPATCH/i.test(e)),
    'Other':           [],
  }
  const categorised = new Set(Object.values(cats).flat())
  cats['Other'] = props.gpu.extensions.filter(e => !categorised.has(e))
  return cats
})

const glParamEntries = computed(() => {
  const entries = Object.entries(props.webgl.glParameters)
  if (!showAllParams.value) return entries.slice(0, 20)
  return entries
})

function paramValueStr(v: unknown): string {
  if (v === null || v === undefined) return 'N/A'
  if (Array.isArray(v)) return `[${v.join(', ')}]`
  return String(v)
}

function paramValueColor(v: unknown): string {
  if (v === null || v === undefined) return 'var(--text-muted)'
  if (typeof v === 'boolean') return v ? 'var(--accent-green)' : 'var(--accent-red)'
  if (typeof v === 'number' && v === 0) return 'var(--text-muted)'
  return 'var(--text-primary)'
}

// GPU score: composite metric
const gpuScore = computed(() => {
  let score = 0
  if (props.gpu.webgl2Supported) score += 25
  if (props.gpu.webgpuSupported) score += 30
  if (props.gpu.maxTextureSize >= 16384) score += 15
  else if (props.gpu.maxTextureSize >= 8192) score += 10
  else if (props.gpu.maxTextureSize >= 4096) score += 5
  score += Math.min(20, props.gpu.extensions.length * 0.3)
  if (props.gpu.antialiasing) score += 5
  if (props.gpu.unmaskedRenderer && props.gpu.unmaskedRenderer !== 'unknown') score += 5
  return Math.min(100, Math.round(score))
})
</script>

<template>
  <div class="space-y-4">
    <!-- GPU Score Banner -->
    <div class="panel-elevated relative overflow-hidden">
      <div class="absolute inset-0 opacity-10"
        style="background: radial-gradient(ellipse at left, #9945ff, transparent 60%), radial-gradient(ellipse at right, #00d4ff, transparent 60%)" />

      <div class="relative grid grid-cols-2 md:grid-cols-4 gap-6">
        <div>
          <div class="metric-label">GPU Score</div>
          <div class="metric-value" :style="{ color: gpuScore > 70 ? 'var(--accent-green)' : gpuScore > 40 ? 'var(--accent-amber)' : 'var(--accent-red)' }">
            {{ gpuScore }}<span class="text-sm text-text-muted">/100</span>
          </div>
        </div>
        <div>
          <div class="metric-label">API Level</div>
          <div class="metric-value text-accent-cyan">
            {{ gpu.webgpuSupported ? 'WebGPU' : gpu.webgl2Supported ? 'WebGL2' : 'WebGL1' }}
          </div>
        </div>
        <div>
          <div class="metric-label">Max Texture</div>
          <div class="metric-value text-accent-purple">{{ gpu.maxTextureSize.toLocaleString() }}px</div>
        </div>
        <div>
          <div class="metric-label">Extensions</div>
          <div class="metric-value text-accent-amber">{{ gpu.extensions.length }}</div>
        </div>
      </div>
    </div>

    <!-- Section tabs -->
    <div class="tab-bar w-fit">
      <button v-for="s in ['overview','params','extensions','precision','webgpu'] as const"
        :key="s" :class="['tab-item', activeSection === s ? 'active' : '']"
        @click="activeSection = s">
        {{ s.charAt(0).toUpperCase() + s.slice(1) }}
      </button>
    </div>

    <!-- ── Overview -->
    <div v-if="activeSection === 'overview'" class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="panel space-y-1">
        <div class="section-header"><span class="section-title">Renderer Info</span></div>
        <div class="data-row"><span class="data-key">Vendor</span><span class="data-val">{{ gpu.vendor }}</span></div>
        <div class="data-row"><span class="data-key">Renderer</span><span class="data-val text-xs">{{ gpu.renderer }}</span></div>
        <div class="data-row"><span class="data-key">Unmasked Vendor</span>
          <span class="data-val" :style="{ color: gpu.unmaskedVendor !== 'unknown' ? 'var(--accent-cyan)' : 'var(--text-muted)' }">
            {{ gpu.unmaskedVendor || 'Masked' }}
          </span>
        </div>
        <div class="data-row"><span class="data-key">Unmasked Renderer</span>
          <span class="data-val text-xs" :style="{ color: gpu.unmaskedRenderer !== 'unknown' ? 'var(--accent-green)' : 'var(--text-muted)' }">
            {{ gpu.unmaskedRenderer || 'Masked' }}
          </span>
        </div>
        <div class="data-row"><span class="data-key">GLSL Version</span><span class="data-val text-xs">{{ gpu.shadingLanguageVersion }}</span></div>
        <div class="data-row"><span class="data-key">WebGL Version</span><span class="data-val">{{ gpu.webglVersion }}</span></div>
        <div class="data-row"><span class="data-key">WebGL 2.0</span>
          <span class="data-val" :style="{ color: gpu.webgl2Supported ? 'var(--accent-green)' : 'var(--accent-red)' }">
            {{ gpu.webgl2Supported ? '✓' : '✗' }}
          </span>
        </div>
        <div class="data-row"><span class="data-key">Antialiasing</span>
          <span class="data-val" :style="{ color: gpu.antialiasing ? 'var(--accent-green)' : 'var(--text-muted)' }">
            {{ gpu.antialiasing ? '✓' : '✗' }}
          </span>
        </div>
      </div>

      <div class="panel space-y-1">
        <div class="section-header"><span class="section-title">Framebuffer Bits</span></div>
        <div v-for="[label, val] in [['Red', gpu.redBits],['Green', gpu.greenBits],['Blue', gpu.blueBits],['Alpha', gpu.alphaBits],['Depth', gpu.depthBits],['Stencil', gpu.stencilBits]]"
          :key="label" class="data-row">
          <span class="data-key">{{ label }}</span>
          <div class="flex items-center gap-2">
            <div class="progress-bar w-24">
              <div class="progress-fill" :style="{ width: `${(Number(val) / 32) * 100}%`, background: 'var(--accent-cyan)' }" />
            </div>
            <span class="data-val w-8">{{ val }}-bit</span>
          </div>
        </div>

        <div class="section-header mt-3"><span class="section-title">Fingerprint Hashes</span></div>
        <div class="data-row"><span class="data-key">Context Hash</span>
          <span class="data-val text-accent-cyan font-mono">{{ webgl.contextHash }}</span>
        </div>
        <div class="data-row"><span class="data-key">Params Hash</span>
          <span class="data-val font-mono">{{ webgl.parametersHash }}</span>
        </div>
        <div class="data-row"><span class="data-key">Precision Hash</span>
          <span class="data-val font-mono">{{ webgl.precisionsHash }}</span>
        </div>
        <div class="data-row"><span class="data-key">Texture Hash</span>
          <span class="data-val font-mono">{{ webgl.textureHash }}</span>
        </div>
        <div class="data-row"><span class="data-key">Vertex Shader</span>
          <span class="data-val font-mono">{{ webgl.vertexShaderHash }}</span>
        </div>
        <div class="data-row"><span class="data-key">Fragment Shader</span>
          <span class="data-val font-mono">{{ webgl.fragmentShaderHash }}</span>
        </div>
      </div>
    </div>

    <!-- ── Parameters -->
    <div v-else-if="activeSection === 'params'" class="panel">
      <div class="section-header">
        <span class="section-title">GL Parameters</span>
        <span class="font-mono text-xs text-text-muted ml-auto">{{ Object.keys(webgl.glParameters).length }} params</span>
      </div>
      <table class="data-table w-full mt-2">
        <thead>
          <tr>
            <th>Parameter</th>
            <th class="text-right">Value</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="[k, v] in glParamEntries" :key="k">
            <td class="text-accent-cyan">{{ k }}</td>
            <td class="text-right" :style="{ color: paramValueColor(v) }">{{ paramValueStr(v) }}</td>
          </tr>
        </tbody>
      </table>
      <button v-if="!showAllParams && Object.keys(webgl.glParameters).length > 20"
        class="btn-ghost text-xs mt-3 w-full"
        @click="showAllParams = true">
        Show all {{ Object.keys(webgl.glParameters).length }} parameters ↓
      </button>
    </div>

    <!-- ── Extensions -->
    <div v-else-if="activeSection === 'extensions'" class="space-y-3">
      <div class="flex gap-3">
        <input v-model="extFilter" type="text" placeholder="Filter extensions..."
          class="flex-1 bg-bg-surface border border-border rounded px-3 py-1.5 text-xs font-mono text-text-primary placeholder-text-muted focus:border-accent-cyan focus:outline-none" />
        <div class="font-mono text-xs text-text-muted self-center">
          {{ filteredExtensions.length }} / {{ gpu.extensions.length }}
        </div>
      </div>

      <!-- Categorised view -->
      <div v-if="!extFilter" class="space-y-3">
        <div v-for="[cat, exts] in Object.entries(extensionCategories)" :key="cat">
          <div v-if="exts.length > 0">
            <div class="font-mono text-xs text-text-muted uppercase tracking-widest mb-2">
              {{ cat }} ({{ exts.length }})
            </div>
            <div class="flex flex-wrap gap-1.5">
              <span v-for="ext in exts" :key="ext"
                class="badge bg-bg-elevated border border-border font-mono text-xs text-text-secondary hover:text-text-primary hover:border-border-strong transition-colors">
                {{ ext }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Filtered flat list -->
      <div v-else class="flex flex-wrap gap-1.5">
        <span v-for="ext in filteredExtensions" :key="ext"
          class="badge bg-bg-elevated border border-border font-mono text-xs text-text-secondary">
          {{ ext }}
        </span>
      </div>
    </div>

    <!-- ── Shader Precision -->
    <div v-else-if="activeSection === 'precision'" class="panel">
      <div class="section-header"><span class="section-title">Shader Precision Formats</span></div>
      <table class="data-table w-full mt-2">
        <thead>
          <tr>
            <th>Shader</th>
            <th>Precision</th>
            <th class="text-right">Range Min</th>
            <th class="text-right">Range Max</th>
            <th class="text-right">Precision</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in webgl.shaderPrecisions" :key="`${p.shaderType}-${p.precisionType}`">
            <td>
              <span class="badge text-xs" :style="{
                background: p.shaderType === 'VERTEX' ? 'rgba(0,212,255,0.1)' : 'rgba(153,69,255,0.1)',
                color: p.shaderType === 'VERTEX' ? 'var(--accent-cyan)' : 'var(--accent-purple)',
                border: `1px solid ${p.shaderType === 'VERTEX' ? 'rgba(0,212,255,0.2)' : 'rgba(153,69,255,0.2)'}`,
              }">{{ p.shaderType }}</span>
            </td>
            <td class="font-mono text-text-secondary">{{ p.precisionType }}</td>
            <td class="text-right font-mono">{{ p.rangeMin }}</td>
            <td class="text-right font-mono">{{ p.rangeMax }}</td>
            <td class="text-right font-mono" :style="{ color: p.precision > 0 ? 'var(--accent-green)' : 'var(--text-muted)' }">
              {{ p.precision }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ── WebGPU -->
    <div v-else-if="activeSection === 'webgpu'">
      <div v-if="!gpu.webgpuSupported" class="panel text-center py-8">
        <div class="text-3xl mb-3">🚫</div>
        <div class="font-mono text-text-muted">WebGPU not supported in this browser</div>
        <div class="font-mono text-xs text-text-muted mt-2">Requires Chrome 113+ / Edge 113+ / Safari 18+</div>
      </div>
      <div v-else-if="gpu.webgpuAdapterInfo" class="panel space-y-1">
        <div class="section-header">
          <div class="status-dot active" />
          <span class="section-title">WebGPU Adapter</span>
          <span class="anomaly-badge normal ml-auto">Active</span>
        </div>
        <div class="data-row"><span class="data-key">Vendor</span><span class="data-val text-accent-cyan">{{ gpu.webgpuAdapterInfo.vendor }}</span></div>
        <div class="data-row"><span class="data-key">Architecture</span><span class="data-val">{{ gpu.webgpuAdapterInfo.architecture || 'N/A' }}</span></div>
        <div class="data-row"><span class="data-key">Device</span><span class="data-val">{{ gpu.webgpuAdapterInfo.device || 'N/A' }}</span></div>
        <div class="data-row"><span class="data-key">Description</span><span class="data-val">{{ gpu.webgpuAdapterInfo.description || 'N/A' }}</span></div>

        <div class="section-header mt-4"><span class="section-title">Limits</span></div>
        <div v-for="[k, v] in [
          ['Max Bind Groups',              gpu.webgpuAdapterInfo.maxBindGroups],
          ['Max Color Attachments',        gpu.webgpuAdapterInfo.maxColorAttachments],
          ['Max Texture Dimension 2D',     gpu.webgpuAdapterInfo.maxTextureDimension2D],
          ['Max Buffer Size',              gpu.webgpuAdapterInfo.maxBufferSize],
          ['Compute WG Size X',           gpu.webgpuAdapterInfo.maxComputeWorkgroupSizeX],
          ['Compute WG Size Y',           gpu.webgpuAdapterInfo.maxComputeWorkgroupSizeY],
          ['Compute WG Size Z',           gpu.webgpuAdapterInfo.maxComputeWorkgroupSizeZ],
          ['Compute Invocations/WG',       gpu.webgpuAdapterInfo.maxComputeInvocationsPerWorkgroup],
        ]" :key="String(k)" class="data-row">
          <span class="data-key">{{ k }}</span>
          <span class="data-val">{{ Number(v).toLocaleString() }}</span>
        </div>
      </div>
      <div v-else class="panel">
        <div class="text-text-muted font-mono text-sm">WebGPU supported but adapter info unavailable</div>
      </div>
    </div>
  </div>
</template>
