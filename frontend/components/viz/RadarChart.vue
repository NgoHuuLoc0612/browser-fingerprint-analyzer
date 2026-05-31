<script setup lang="ts">
/**
 * Radar chart rendered with WebGPU + WGSL.
 * Falls back to SVG canvas if WebGPU is unavailable.
 */
import { onMounted, onUnmounted, ref, watch } from 'vue'

const props = defineProps<{
  dimensions: { label: string; value: number; max?: number }[]
  color?: string
  animated?: boolean
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const svgRef    = ref<SVGSVGElement | null>(null)
const useWebGPU = ref(false)

// WebGPU state
let gpuDevice:   GPUDevice | null       = null
let gpuContext:  GPUCanvasContext | null = null
let pipeline:    GPURenderPipeline | null = null
let vertBuf:     GPUBuffer | null = null
let uniformBuf:  GPUBuffer | null = null
let animId:      number | null = null
let startTime = Date.now()

// ──────────────────────────────────────────────────────────────────────────────
// WGSL Shaders
// ──────────────────────────────────────────────────────────────────────────────
const WGSL_SHADER = `
struct Uniforms {
  time:       f32,
  numDims:    f32,
  resolution: vec2f,
}

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0)       uv:       vec2f,
}

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> values: array<f32>;

@vertex
fn vs_main(@builtin(vertex_index) vi: u32) -> VertexOutput {
  var positions = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f( 1.0, -1.0), vec2f(-1.0,  1.0),
    vec2f(-1.0,  1.0), vec2f( 1.0, -1.0), vec2f( 1.0,  1.0),
  );
  var out: VertexOutput;
  out.position = vec4f(positions[vi], 0.0, 1.0);
  out.uv       = positions[vi] * 0.5 + 0.5;
  return out;
}

fn rgb(r: f32, g: f32, b: f32) -> vec3f { return vec3f(r, g, b); }

fn sdLine(p: vec2f, a: vec2f, b: vec2f) -> f32 {
  let pa = p - a;
  let ba = b - a;
  let h  = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let uv     = in.uv;
  let center = vec2f(0.5, 0.5);
  let p      = (uv - center) * 2.0;
  let t      = u.time;
  let n      = i32(u.numDims);

  var col    = rgb(0.02, 0.04, 0.06);

  let accentCyan   = rgb(0.0,  0.831, 1.0);
  let accentGreen  = rgb(0.0,  1.0,   0.533);
  let accentPurple = rgb(0.6,  0.271, 1.0);
  let gridColor    = rgb(0.05, 0.08,  0.13);

  // ── Grid rings
  for (var ring = 1; ring <= 5; ring++) {
    let r  = f32(ring) * 0.18;
    let d  = abs(length(p) - r);
    let gw = 0.004 + sin(t * 0.5) * 0.001;
    if (d < gw) {
      let alpha = 1.0 - d / gw;
      col = mix(col, gridColor, alpha * 0.8);
    }
  }

  // ── Axis lines
  if (n > 0) {
    for (var i = 0; i < n; i++) {
      let angle = f32(i) * 6.283185 / f32(n) - 1.5708;
      let dir   = vec2f(cos(angle), sin(angle));
      let d     = sdLine(p, vec2f(0.0), dir * 0.9);
      if (d < 0.006) {
        col = mix(col, accentCyan * 0.4, (0.006 - d) / 0.006);
      }
    }
  }

  // ── Radar polygon (filled + outline)
  if (n > 0) {
    // Compute angular position of fragment
    let angle_p = atan2(p.y, p.x);
    let len_p   = length(p);

    // Find which sector we're in
    var inPolygon = false;
    var onEdge    = false;
    var edgeDist  = 1.0;

    for (var i = 0; i < n; i++) {
      let j = (i + 1) % n;

      let a1 = f32(i) * 6.283185 / f32(n) - 1.5708;
      let a2 = f32(j) * 6.283185 / f32(n) - 1.5708;

      let v1_raw = values[i];
      let v2_raw = values[j];
      let v1 = clamp(v1_raw, 0.0, 1.0) * 0.88;
      let v2 = clamp(v2_raw, 0.0, 1.0) * 0.88;

      let pt1 = vec2f(cos(a1) * v1, sin(a1) * v1);
      let pt2 = vec2f(cos(a2) * v2, sin(a2) * v2);

      // Edge distance
      let d = sdLine(p, pt1, pt2);
      if (d < edgeDist) {
        edgeDist = d;
        let pulse = 0.006 + sin(t * 2.0) * 0.001;
        onEdge = d < pulse;
      }

      // Point-in-triangle (center, pt1, pt2) test
      let d1 = (p.x  - pt2.x) * (vec2f(0.0) - pt2).y - (vec2f(0.0) - pt2).x * (p.y  - pt2.y);
      let d2 = (pt1.x - pt2.x) * (p.y - pt2.y)        - (p.x  - pt2.x) * (pt1.y - pt2.y);
      let has_neg = (d1 < 0.0) || (d2 < 0.0);
      let has_pos = (d1 > 0.0) || (d2 > 0.0);
      if (!(has_neg && has_pos)) { inPolygon = true; }
    }

    // Fill
    if (inPolygon) {
      let fillAlpha = 0.25 + sin(t * 1.5) * 0.04;
      col = mix(col, accentCyan, fillAlpha);
    }

    // Edge glow
    if (onEdge) {
      let glowStr = 1.0 - edgeDist / 0.007;
      col = mix(col, accentGreen, glowStr * 0.9);
      col += accentCyan * glowStr * 0.3;
    }
  }

  // ── Center dot
  let centerDist = length(p);
  if (centerDist < 0.025) {
    let glow = 1.0 - centerDist / 0.025;
    col = mix(col, accentCyan, glow);
  }

  // ── Vertex dots
  if (n > 0) {
    for (var i = 0; i < n; i++) {
      let a  = f32(i) * 6.283185 / f32(n) - 1.5708;
      let v  = clamp(values[i], 0.0, 1.0) * 0.88;
      let pt = vec2f(cos(a) * v, sin(a) * v);
      let d  = length(p - pt);
      let pulse = 0.02 + sin(t * 3.0 + f32(i)) * 0.004;
      if (d < pulse) {
        let glow = 1.0 - d / pulse;
        col = mix(col, accentGreen, glow * 0.9);
      }
    }
  }

  // ── Vignette
  let vign = 1.0 - smoothstep(0.6, 1.2, length(p));
  col *= vign;

  return vec4f(col, 1.0);
}
`

async function initWebGPU(canvas: HTMLCanvasElement) {
  try {
    if (!('gpu' in navigator)) throw new Error('WebGPU not supported')

    const adapter = await (navigator as any).gpu.requestAdapter()
    if (!adapter) throw new Error('No GPU adapter')

    gpuDevice  = await adapter.requestDevice()
    gpuContext = canvas.getContext('webgpu') as GPUCanvasContext
    if (!gpuContext) throw new Error('No WebGPU context')

    const format = (navigator as any).gpu.getPreferredCanvasFormat()
    gpuContext.configure({ device: gpuDevice, format, alphaMode: 'premultiplied' })

    const shaderModule = gpuDevice.createShaderModule({ code: WGSL_SHADER })

    // Uniform buffer: time(f32) + numDims(f32) + resolution(vec2f) = 16 bytes
    uniformBuf = gpuDevice.createBuffer({
      size:  16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })

    // Values buffer: up to 32 f32 values = 128 bytes
    vertBuf = gpuDevice.createBuffer({
      size:  128,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    })

    const bindGroupLayout = gpuDevice.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
      ],
    })

    pipeline = gpuDevice.createRenderPipeline({
      layout: gpuDevice.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
      vertex: {
        module:     shaderModule,
        entryPoint: 'vs_main',
      },
      fragment: {
        module:     shaderModule,
        entryPoint: 'fs_main',
        targets: [{ format }],
      },
      primitive: { topology: 'triangle-list' },
    })

    ;(pipeline as any).__bindGroupLayout = bindGroupLayout

    useWebGPU.value = true
    renderWebGPU()
  } catch (e) {
    // Fall back to SVG
    useWebGPU.value = false
  }
}

function renderWebGPU() {
  animId = requestAnimationFrame(renderWebGPU)
  if (!gpuDevice || !gpuContext || !pipeline || !uniformBuf || !vertBuf || !canvasRef.value) return

  const canvas = canvasRef.value
  const W = canvas.clientWidth || 400
  const H = canvas.clientHeight || 400
  if ((canvas as any).width !== W) (canvas as any).width = W
  if ((canvas as any).height !== H) (canvas as any).height = H

  const t       = (Date.now() - startTime) / 1000
  const dims    = props.dimensions
  const n       = Math.min(dims.length, 32)
  const values  = new Float32Array(32)
  for (let i = 0; i < n; i++) {
    const d   = dims[i]
    const max = d.max ?? 1
    values[i] = Math.min(1, d.value / max)
  }

  // Write uniforms
  const uData = new Float32Array([t, n, W, H])
  gpuDevice.queue.writeBuffer(uniformBuf, 0, uData)
  gpuDevice.queue.writeBuffer(vertBuf, 0, values)

  const bindGroup = gpuDevice.createBindGroup({
    layout: (pipeline as any).__bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: uniformBuf } },
      { binding: 1, resource: { buffer: vertBuf } },
    ],
  })

  const cmdEncoder  = gpuDevice.createCommandEncoder()
  const passEncoder = cmdEncoder.beginRenderPass({
    colorAttachments: [{
      view:       gpuContext.getCurrentTexture().createView(),
      clearValue: { r: 0.02, g: 0.04, b: 0.06, a: 1.0 },
      loadOp:     'clear',
      storeOp:    'store',
    }],
  })

  passEncoder.setPipeline(pipeline)
  passEncoder.setBindGroup(0, bindGroup)
  passEncoder.draw(6, 1, 0, 0)
  passEncoder.end()

  gpuDevice.queue.submit([cmdEncoder.finish()])
}

// ── SVG Fallback
function svgPoints(dims: typeof props.dimensions, scale = 90): string {
  return dims.map((d, i) => {
    const angle = (i / dims.length) * Math.PI * 2 - Math.PI / 2
    const r     = (d.value / (d.max ?? 1)) * scale
    return `${100 + Math.cos(angle) * r},${100 + Math.sin(angle) * r}`
  }).join(' ')
}

function axisEnd(i: number, total: number, r = 95): { x: number; y: number } {
  const angle = (i / total) * Math.PI * 2 - Math.PI / 2
  return { x: 100 + Math.cos(angle) * r, y: 100 + Math.sin(angle) * r }
}

function labelPos(i: number, total: number): { x: number; y: number } {
  const angle = (i / total) * Math.PI * 2 - Math.PI / 2
  const r = 108
  return { x: 100 + Math.cos(angle) * r, y: 100 + Math.sin(angle) * r }
}

const rings = [18, 36, 54, 72, 90]

onMounted(async () => {
  if (!canvasRef.value) return
  await initWebGPU(canvasRef.value)
})

onUnmounted(() => {
  if (animId !== null) cancelAnimationFrame(animId)
  gpuDevice?.destroy()
})
</script>

<template>
  <div class="relative w-full h-full flex items-center justify-center">
    <!-- WebGPU canvas -->
    <canvas
      v-show="useWebGPU"
      ref="canvasRef"
      class="w-full h-full"
      style="display:block;"
    />

    <!-- SVG Fallback -->
    <svg
      v-show="!useWebGPU"
      ref="svgRef"
      viewBox="0 0 200 200"
      class="w-full h-full"
      xmlns="http://www.w3.org/2000/svg"
    >
      <!-- Background -->
      <rect width="200" height="200" fill="#050709" />

      <!-- Grid rings -->
      <circle
        v-for="r in rings" :key="r"
        cx="100" cy="100" :r="r"
        fill="none"
        stroke="rgba(0,212,255,0.08)"
        stroke-width="0.5"
      />

      <!-- Axis lines -->
      <line
        v-for="(_, i) in dimensions" :key="`ax${i}`"
        x1="100" y1="100"
        :x2="axisEnd(i, dimensions.length).x"
        :y2="axisEnd(i, dimensions.length).y"
        stroke="rgba(0,212,255,0.15)"
        stroke-width="0.5"
      />

      <!-- Radar polygon -->
      <polygon
        v-if="dimensions.length > 0"
        :points="svgPoints(dimensions)"
        fill="rgba(0,212,255,0.15)"
        stroke="#00d4ff"
        stroke-width="1.5"
        stroke-linejoin="round"
      />

      <!-- Vertex dots -->
      <circle
        v-for="(d, i) in dimensions" :key="`vx${i}`"
        :cx="axisEnd(i, dimensions.length, (d.value / (d.max ?? 1)) * 90).x"
        :cy="axisEnd(i, dimensions.length, (d.value / (d.max ?? 1)) * 90).y"
        r="3"
        fill="#00ff88"
      />

      <!-- Labels -->
      <text
        v-for="(d, i) in dimensions" :key="`lb${i}`"
        :x="labelPos(i, dimensions.length).x"
        :y="labelPos(i, dimensions.length).y"
        class="radar-label"
        text-anchor="middle"
        dominant-baseline="middle"
        fill="rgba(136,146,164,0.8)"
        font-size="7"
        font-family="Space Mono, monospace"
      >
        {{ d.label.length > 8 ? d.label.slice(0, 8) : d.label }}
      </text>
    </svg>

    <!-- WebGPU badge -->
    <div class="absolute top-2 right-2 flex items-center gap-1.5">
      <div :class="useWebGPU ? 'status-dot active' : 'status-dot idle'" />
      <span class="font-mono text-xs text-text-muted">
        {{ useWebGPU ? 'WebGPU' : 'SVG' }}
      </span>
    </div>
  </div>
</template>
