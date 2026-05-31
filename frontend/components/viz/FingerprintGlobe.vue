<script setup lang="ts">
import * as THREE from 'three'
import { onMounted, onUnmounted, ref, watch } from 'vue'
import type { FullFingerprint } from '~/types/fingerprint'

const props = defineProps<{
  fingerprint: FullFingerprint | null
  entropyBits: number
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  animated?: boolean
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let animId: number | null = null
let globe: THREE.Mesh | null = null
let particles: THREE.Points | null = null
let rings: THREE.Mesh[] = []
let clock: THREE.Clock

const RISK_COLORS = {
  low:      0x00ff88,
  medium:   0xffb800,
  high:     0xff6633,
  critical: 0xff3366,
}

function getRiskColor() {
  return RISK_COLORS[props.riskLevel] ?? 0x00d4ff
}

function buildScene(canvas: HTMLCanvasElement) {
  const W = canvas.clientWidth || 400
  const H = canvas.clientHeight || 400

  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(W, H, false)
  renderer.setClearColor(0x000000, 0)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.2

  scene = new THREE.Scene()
  scene.fog = new THREE.FogExp2(0x050709, 0.12)

  camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100)
  camera.position.set(0, 0, 4.5)
  camera.lookAt(0, 0, 0)

  clock = new THREE.Clock()

  // ── Globe
  const globeGeo = new THREE.SphereGeometry(1.5, 64, 64)
  const globeMat = new THREE.MeshStandardMaterial({
    color: 0x0a1628,
    emissive: new THREE.Color(0x001122),
    emissiveIntensity: 0.3,
    roughness: 0.8,
    metalness: 0.2,
    wireframe: false,
    transparent: true,
    opacity: 0.85,
  })
  globe = new THREE.Mesh(globeGeo, globeMat)
  scene.add(globe)

  // ── Globe wireframe overlay
  const wireMat = new THREE.MeshBasicMaterial({
    color: 0x00d4ff,
    wireframe: true,
    transparent: true,
    opacity: 0.08,
  })
  const wireGeo = new THREE.SphereGeometry(1.52, 24, 24)
  const wire = new THREE.Mesh(wireGeo, wireMat)
  scene.add(wire)

  // ── Orbital rings
  const ringAngles = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4]
  for (let i = 0; i < ringAngles.length; i++) {
    const ringGeo = new THREE.TorusGeometry(1.8 + i * 0.15, 0.003, 8, 120)
    const ringMat = new THREE.MeshBasicMaterial({
      color: i === 0 ? 0x00d4ff : i === 1 ? 0x00ff88 : i === 2 ? 0xffb800 : 0x9945ff,
      transparent: true,
      opacity: 0.5 - i * 0.08,
    })
    const ring = new THREE.Mesh(ringGeo, ringMat)
    ring.rotation.x = ringAngles[i]
    ring.rotation.y = ringAngles[i] * 0.5
    scene.add(ring)
    rings.push(ring)
  }

  // ── Particle field
  const numParticles = 2000
  const positions = new Float32Array(numParticles * 3)
  const particleColors = new Float32Array(numParticles * 3)
  const sizes = new Float32Array(numParticles)

  const colorOptions = [
    new THREE.Color(0x00d4ff),
    new THREE.Color(0x00ff88),
    new THREE.Color(0x9945ff),
    new THREE.Color(0xffb800),
  ]

  for (let i = 0; i < numParticles; i++) {
    const phi   = Math.acos(2 * Math.random() - 1)
    const theta = 2 * Math.PI * Math.random()
    const r     = 2.5 + Math.random() * 3.5

    positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
    positions[i * 3 + 2] = r * Math.cos(phi)

    const c = colorOptions[Math.floor(Math.random() * colorOptions.length)]
    particleColors[i * 3]     = c.r
    particleColors[i * 3 + 1] = c.g
    particleColors[i * 3 + 2] = c.b

    sizes[i] = Math.random() * 2 + 0.5
  }

  const particleGeo = new THREE.BufferGeometry()
  particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  particleGeo.setAttribute('color', new THREE.BufferAttribute(particleColors, 3))
  particleGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1))

  const particleMat = new THREE.PointsMaterial({
    size: 0.025,
    vertexColors: true,
    transparent: true,
    opacity: 0.6,
    sizeAttenuation: true,
  })

  particles = new THREE.Points(particleGeo, particleMat)
  scene.add(particles)

  // ── Data points on globe surface (fingerprint fields)
  addGlobeDataPoints()

  // ── Lighting
  const ambientLight = new THREE.AmbientLight(0x111122, 0.5)
  scene.add(ambientLight)

  const cyanLight = new THREE.PointLight(0x00d4ff, 2.0, 8)
  cyanLight.position.set(3, 2, 3)
  scene.add(cyanLight)

  const greenLight = new THREE.PointLight(0x00ff88, 1.0, 8)
  greenLight.position.set(-3, -2, -2)
  scene.add(greenLight)

  const rimLight = new THREE.DirectionalLight(0x9945ff, 0.5)
  rimLight.position.set(0, 5, -3)
  scene.add(rimLight)

  // ── Post-processing: inner glow sphere
  const glowGeo = new THREE.SphereGeometry(1.48, 32, 32)
  const glowMat = new THREE.MeshBasicMaterial({
    color: getRiskColor(),
    transparent: true,
    opacity: 0.04,
    side: THREE.BackSide,
  })
  const glow = new THREE.Mesh(glowGeo, glowMat)
  scene.add(glow)

  animate()
}

function addGlobeDataPoints() {
  if (!scene || !props.fingerprint) return

  const fields = [
    { label: 'Browser', color: 0x00d4ff },
    { label: 'GPU',     color: 0x9945ff },
    { label: 'Canvas',  color: 0x00ff88 },
    { label: 'Audio',   color: 0xffb800 },
    { label: 'Fonts',   color: 0xff3366 },
    { label: 'WebGL',   color: 0x00d4ff },
    { label: 'Screen',  color: 0x00ff88 },
    { label: 'WebRTC',  color: 0xff3366 },
    { label: 'Storage', color: 0xffb800 },
    { label: 'Perms',   color: 0x9945ff },
  ]

  for (let i = 0; i < fields.length; i++) {
    const phi   = (i / fields.length) * Math.PI
    const theta = (i / fields.length) * 2 * Math.PI

    const dotGeo = new THREE.SphereGeometry(0.04, 8, 8)
    const dotMat = new THREE.MeshBasicMaterial({ color: fields[i].color })
    const dot = new THREE.Mesh(dotGeo, dotMat)

    dot.position.set(
      1.52 * Math.sin(phi) * Math.cos(theta),
      1.52 * Math.sin(phi) * Math.sin(theta),
      1.52 * Math.cos(phi),
    )

    // Spike line
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      dot.position.clone().multiplyScalar(0.98),
      dot.position.clone().multiplyScalar(1.15),
    ])
    const lineMat = new THREE.LineBasicMaterial({
      color: fields[i].color,
      transparent: true,
      opacity: 0.7,
    })
    const line = new THREE.Line(lineGeo, lineMat)
    scene!.add(line)
    scene!.add(dot)
  }
}

function updateGlobeColor() {
  if (!globe || !scene) return
  const color = new THREE.Color(getRiskColor())
  ;(globe.material as THREE.MeshStandardMaterial).emissive = color
  ;(globe.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.1
}

function animate() {
  animId = requestAnimationFrame(animate)
  if (!scene || !camera || !renderer) return

  const t = clock.getElapsedTime()
  const animated = props.animated !== false

  if (animated) {
    // Globe rotation
    if (globe) globe.rotation.y = t * 0.08

    // Ring rotations
    rings.forEach((ring, i) => {
      ring.rotation.z = t * (0.2 + i * 0.05)
      ring.rotation.x += 0.001 * (i % 2 === 0 ? 1 : -1)
    })

    // Particle slow drift
    if (particles) {
      particles.rotation.y = t * 0.02
      particles.rotation.x = Math.sin(t * 0.01) * 0.1
    }

    // Camera bob
    camera.position.y = Math.sin(t * 0.3) * 0.15
    camera.lookAt(0, 0, 0)
  }

  renderer.render(scene, camera)
}

function handleResize() {
  if (!canvasRef.value || !renderer || !camera) return
  const W = canvasRef.value.clientWidth
  const H = canvasRef.value.clientHeight
  renderer.setSize(W, H, false)
  camera.aspect = W / H
  camera.updateProjectionMatrix()
}

onMounted(() => {
  if (!canvasRef.value) return
  buildScene(canvasRef.value)
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  if (animId !== null) cancelAnimationFrame(animId)
  renderer?.dispose()
  window.removeEventListener('resize', handleResize)
})

watch(() => props.riskLevel, updateGlobeColor)
watch(() => props.fingerprint, () => {
  // Rebuild data points when fingerprint changes
  if (scene) {
    addGlobeDataPoints()
  }
})
</script>

<template>
  <div class="relative w-full h-full">
    <canvas
      ref="canvasRef"
      class="w-full h-full"
      style="display: block;"
    />

    <!-- Overlay labels -->
    <div class="absolute inset-0 pointer-events-none flex items-center justify-center">
      <div v-if="!fingerprint" class="text-center">
        <div class="font-mono text-xs text-text-muted uppercase tracking-widest opacity-50">
          Awaiting Scan
        </div>
      </div>
    </div>

    <!-- Entropy indicator -->
    <div class="absolute bottom-4 left-4 right-4 flex items-center justify-between pointer-events-none">
      <div>
        <div class="text-xs font-mono text-text-muted">ENTROPY</div>
        <div class="font-mono text-lg font-bold" :style="{ color: `var(--accent-cyan)` }">
          {{ entropyBits.toFixed(2) }} bits
        </div>
      </div>
      <div class="text-right">
        <div class="text-xs font-mono text-text-muted">RISK</div>
        <div
          class="font-mono text-lg font-bold uppercase"
          :style="{ color: riskLevel === 'low' ? 'var(--accent-green)' : riskLevel === 'medium' ? 'var(--accent-amber)' : 'var(--accent-red)' }"
        >
          {{ riskLevel }}
        </div>
      </div>
    </div>
  </div>
</template>
