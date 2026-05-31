<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'

const props = defineProps<{
  vector: number[]
  labels: string[]
  title?: string
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
let gl: WebGL2RenderingContext | null = null
let program: WebGLProgram | null = null
let animId: number | null = null
let startTime = Date.now()

// ──────────────────────────────────────────────────────────────────────────────
// GLSL Shaders
// ──────────────────────────────────────────────────────────────────────────────
const VERT_SRC = `#version 300 es
precision highp float;

in vec2 a_position;
in vec2 a_texCoord;
out vec2 v_texCoord;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord  = a_texCoord;
}
`

const FRAG_SRC = `#version 300 es
precision highp float;

uniform float u_time;
uniform float u_values[32];
uniform int   u_count;
uniform vec2  u_resolution;

in  vec2 v_texCoord;
out vec4 fragColor;

// ── Palettes
vec3 entropyColor(float t) {
  // Low → High: dark blue → cyan → green → amber → red
  vec3 a = vec3(0.004, 0.027, 0.067);
  vec3 b = vec3(0.000, 0.831, 1.000);
  vec3 c = vec3(0.000, 1.000, 0.533);
  vec3 d = vec3(1.000, 0.722, 0.000);
  vec3 e = vec3(1.000, 0.200, 0.400);

  if (t < 0.25) return mix(a, b, t / 0.25);
  if (t < 0.50) return mix(b, c, (t - 0.25) / 0.25);
  if (t < 0.75) return mix(c, d, (t - 0.50) / 0.25);
  return mix(d, e, (t - 0.75) / 0.25);
}

// ── Noise
float hash(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 19.19);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  vec2 uv = v_texCoord;
  float t = u_time * 0.5;

  int n = u_count;
  if (n <= 0) {
    fragColor = vec4(0.04, 0.06, 0.09, 1.0);
    return;
  }

  // ── Grid layout
  float cols = ceil(sqrt(float(n)));
  float rows = ceil(float(n) / cols);
  float cellW = 1.0 / cols;
  float cellH = 1.0 / rows;

  float col = floor(uv.x / cellW);
  float row = floor(uv.y / cellH);
  int idx = int(row * cols + col);

  if (idx >= n) {
    fragColor = vec4(0.04, 0.06, 0.09, 1.0);
    return;
  }

  vec2 cellUV = fract(uv / vec2(cellW, cellH));
  vec2 cc = cellUV - 0.5; // center

  float val = u_values[idx];
  val = clamp(val, 0.0, 1.0);

  // ── Radial gradient per cell
  float dist = length(cc);
  float circle = 1.0 - smoothstep(0.3, 0.5, dist);

  // ── Animated noise overlay
  float n1 = noise(cellUV * 6.0 + t + float(idx)) * 0.15;
  float animated_val = val + n1 * (1.0 - val);

  // ── Scan line pulse
  float scanPulse = sin(uv.y * 80.0 + t * 4.0) * 0.015 + 0.985;

  // ── Cell color
  vec3 color = entropyColor(animated_val);

  // ── Glow rings
  float ring1 = smoothstep(0.38, 0.40, dist) - smoothstep(0.40, 0.42, dist);
  float ring2 = smoothstep(0.44, 0.46, dist) - smoothstep(0.46, 0.48, dist);
  color += ring1 * color * 2.0;
  color += ring2 * color * 0.5;

  // ── Grid lines
  float border = 0.04;
  float bx = step(border, cellUV.x) * step(border, 1.0 - cellUV.x);
  float by = step(border, cellUV.y) * step(border, 1.0 - cellUV.y);
  float inCell = bx * by;

  // ── Background
  vec3 bg = vec3(0.04, 0.06, 0.09);
  vec3 borderColor = vec3(0.0, 0.83, 1.0) * 0.12;
  color = mix(borderColor, color * circle * scanPulse, inCell);

  // ── Bloom
  float brightness = dot(color, vec3(0.299, 0.587, 0.114));
  color += color * brightness * 0.3;

  fragColor = vec4(color, 1.0);
}
`

function createShader(type: number, src: string): WebGLShader | null {
  if (!gl) return null
  const sh = gl.createShader(type)!
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error('Shader error:', gl.getShaderInfoLog(sh))
    return null
  }
  return sh
}

function initGL(canvas: HTMLCanvasElement) {
  gl = canvas.getContext('webgl2', { alpha: true, antialias: true })
  if (!gl) return

  const vert = createShader(gl.VERTEX_SHADER, VERT_SRC)
  const frag = createShader(gl.FRAGMENT_SHADER, FRAG_SRC)
  if (!vert || !frag) return

  program = gl.createProgram()!
  gl.attachShader(program, vert)
  gl.attachShader(program, frag)
  gl.linkProgram(program)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(program))
    return
  }

  // ── Full-screen quad
  const verts = new Float32Array([
    -1, -1,  0, 0,
     1, -1,  1, 0,
    -1,  1,  0, 1,
     1,  1,  1, 1,
  ])

  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW)

  const posLoc = gl.getAttribLocation(program, 'a_position')
  const texLoc = gl.getAttribLocation(program, 'a_texCoord')

  gl.enableVertexAttribArray(posLoc)
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0)
  gl.enableVertexAttribArray(texLoc)
  gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 16, 8)

  gl.useProgram(program)
  render()
}

function render() {
  animId = requestAnimationFrame(render)
  if (!gl || !program || !canvasRef.value) return

  const W = canvasRef.value.clientWidth
  const H = canvasRef.value.clientHeight
  if (gl.canvas.width !== W || gl.canvas.height !== H) {
    (gl.canvas as HTMLCanvasElement).width  = W
    ;(gl.canvas as HTMLCanvasElement).height = H
    gl.viewport(0, 0, W, H)
  }

  const t = (Date.now() - startTime) / 1000
  const vector = props.vector.slice(0, 32)
  const padded = [...vector, ...new Array(32 - vector.length).fill(0)]

  gl.uniform1f(gl.getUniformLocation(program, 'u_time'), t)
  gl.uniform1fv(gl.getUniformLocation(program, 'u_values'), new Float32Array(padded))
  gl.uniform1i(gl.getUniformLocation(program, 'u_count'), vector.length)
  gl.uniform2f(gl.getUniformLocation(program, 'u_resolution'), W, H)

  gl.clearColor(0, 0, 0, 0)
  gl.clear(gl.COLOR_BUFFER_BIT)
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
}

onMounted(() => {
  if (canvasRef.value) initGL(canvasRef.value)
})

onUnmounted(() => {
  if (animId !== null) cancelAnimationFrame(animId)
  if (gl && program) gl.deleteProgram(program)
})
</script>

<template>
  <div class="relative w-full h-full">
    <div v-if="title" class="absolute top-3 left-4 z-10 font-mono text-xs text-text-muted uppercase tracking-widest">
      {{ title }}
    </div>
    <canvas ref="canvasRef" class="w-full h-full" style="display:block;" />

    <!-- Legend -->
    <div class="absolute bottom-2 right-3 flex items-center gap-2">
      <div class="text-xs font-mono text-text-muted">0.0</div>
      <div class="h-2 w-24 rounded" style="background: linear-gradient(to right, #000a11, #00d4ff, #00ff88, #ffb800, #ff3366)" />
      <div class="text-xs font-mono text-text-muted">1.0</div>
    </div>

    <!-- Field labels -->
    <div v-if="labels.length > 0" class="absolute top-8 left-0 right-0 bottom-8 pointer-events-none">
      <!-- labels are rendered via CSS overlay grid matching GLSL grid -->
    </div>
  </div>
</template>
