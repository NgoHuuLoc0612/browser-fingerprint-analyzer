/**
 * useWASM.ts
 * Loads the fingerprint_simd WASM module.
 * Falls back to pure-JS implementations if WASM fails to load.
 */
import { ref, shallowRef } from 'vue'

export interface WASMApi {
  cosineSimilarity(a: number[], b: number[]): number
  l2Distance(a: number[], b: number[]): number
  cmsInsert(item: string): void
  cmsQuery(item: string): number
  cmsClear(): void
  computeEntropy(values: number[]): number
  mlpForward(input: number[]): number
  kmeansCluster(data: number[][], k: number): { centroids: number[][], assignments: number[] }
  emaUpdate(newVec: number[], oldEma: number[], alpha?: number): number[]
  isWASM: boolean
}

// ── Pure JS fallbacks (used when WASM unavailable or still loading)
const jsFallback: WASMApi = {
  isWASM: false,

  cosineSimilarity(a, b) {
    if (a.length !== b.length || a.length === 0) return 0
    let dot = 0, na = 0, nb = 0
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2
    }
    return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb)
  },

  l2Distance(a, b) {
    let s = 0
    for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d }
    return Math.sqrt(s)
  },

  // Count-Min Sketch (pure JS)
  _cms: (() => {
    const W = 2048, D = 4
    const table = Array.from({ length: D }, () => new Uint32Array(W))
    const seeds = [0x3f16a3b1, 0x6d2e4f7c, 0xa1b9c3d5, 0xf7e6d2c1]
    function h(item: string, seed: number): number {
      let hash = seed ^ 2166136261
      for (let i = 0; i < item.length; i++) {
        hash ^= item.charCodeAt(i)
        hash = Math.imul(hash, 16777619) >>> 0
      }
      return hash % W
    }
    return { table, seeds, h }
  })(),

  cmsInsert(item) {
    for (let d = 0; d < 4; d++) {
      const idx = (this as any)._cms.h(item, (this as any)._cms.seeds[d])
      ;(this as any)._cms.table[d][idx]++
    }
  },

  cmsQuery(item): number {
    let min = Infinity
    for (let d = 0; d < 4; d++) {
      const idx = (this as any)._cms.h(item, (this as any)._cms.seeds[d])
      min = Math.min(min, (this as any)._cms.table[d][idx])
    }
    return min === Infinity ? 0 : min
  },

  cmsClear() {
    for (const row of (this as any)._cms.table) row.fill(0)
  },

  computeEntropy(values) {
    const total = values.reduce((s, v) => s + v, 0)
    if (total <= 0) return 0
    return -values.reduce((h, v) => {
      if (v <= 0) return h
      const p = v / total
      return h + p * Math.log2(p)
    }, 0)
  },

  mlpForward(input) {
    // Simplified sigmoid of weighted sum
    const weights = [0.15, 0.12, 0.11, 0.10, 0.09, 0.08, 0.07, 0.06, 0.05, 0.05, 0.05, 0.04, 0.04, 0.04, 0.03, 0.02]
    const raw = input.reduce((s, v, i) => s + v * (weights[i] ?? 0.01), 0)
    return 1 / (1 + Math.exp(-(raw * 3 - 1)))
  },

  kmeansCluster(data, k) {
    const n = data.length
    const dim = data[0]?.length ?? 0
    if (n === 0 || dim === 0 || k <= 0) return { centroids: [], assignments: [] }
    k = Math.min(k, n)

    const centroids: number[][] = []
    const used = new Set<number>()
    while (centroids.length < k) {
      const idx = Math.floor(Math.random() * n)
      if (!used.has(idx)) { used.add(idx); centroids.push([...data[idx]]) }
    }

    let assignments = new Array<number>(n).fill(0)
    for (let iter = 0; iter < 50; iter++) {
      let changed = false
      for (let i = 0; i < n; i++) {
        let best = 0, bestD = Infinity
        for (let c = 0; c < k; c++) {
          let d = 0
          for (let j = 0; j < dim; j++) { const diff = data[i][j] - centroids[c][j]; d += diff * diff }
          if (d < bestD) { bestD = d; best = c }
        }
        if (assignments[i] !== best) { assignments[i] = best; changed = true }
      }
      if (!changed) break

      const newC = Array.from({ length: k }, () => new Array(dim).fill(0))
      const counts = new Array(k).fill(0)
      for (let i = 0; i < n; i++) {
        counts[assignments[i]]++
        for (let j = 0; j < dim; j++) newC[assignments[i]][j] += data[i][j]
      }
      for (let c = 0; c < k; c++) {
        if (counts[c] > 0) {
          for (let j = 0; j < dim; j++) newC[c][j] /= counts[c]
          centroids[c] = newC[c]
        }
      }
    }
    return { centroids, assignments }
  },

  emaUpdate(newVec, oldEma, alpha = 0.3) {
    if (oldEma.length === 0) return [...newVec]
    return newVec.map((v, i) => alpha * v + (1 - alpha) * (oldEma[i] ?? v))
  },
}

// ── WASM wrapper (wraps raw module into typed API)
function wrapWASMModule(mod: any): WASMApi {
  function allocF32(arr: number[]): number {
    const ptr = mod._malloc(arr.length * 4)
    mod.HEAPF32.set(arr, ptr >> 2)
    return ptr
  }
  function readF32(ptr: number, n: number): number[] {
    return Array.from(mod.HEAPF32.slice(ptr >> 2, (ptr >> 2) + n))
  }

  return {
    isWASM: true,

    cosineSimilarity(a, b) {
      const pA = allocF32(a), pB = allocF32(b)
      try { return mod.ccall('cosine_similarity_simd', 'number', ['number', 'number', 'number'], [pA, pB, a.length]) }
      finally { mod._free(pA); mod._free(pB) }
    },

    l2Distance(a, b) {
      const pA = allocF32(a), pB = allocF32(b)
      try { return mod.ccall('l2_distance_simd', 'number', ['number', 'number', 'number'], [pA, pB, a.length]) }
      finally { mod._free(pA); mod._free(pB) }
    },

    cmsInsert(item) {
      const enc = new TextEncoder().encode(item)
      const ptr = mod._malloc(enc.length)
      mod.HEAPU8.set(enc, ptr)
      try { mod.ccall('cms_insert', null, ['number', 'number'], [ptr, enc.length]) }
      finally { mod._free(ptr) }
    },

    cmsQuery(item) {
      const enc = new TextEncoder().encode(item)
      const ptr = mod._malloc(enc.length)
      mod.HEAPU8.set(enc, ptr)
      try { return mod.ccall('cms_query', 'number', ['number', 'number'], [ptr, enc.length]) as number }
      finally { mod._free(ptr) }
    },

    cmsClear() { mod.ccall('cms_clear', null, [], []) },

    computeEntropy(values) {
      const ptr = allocF32(values)
      try { return mod.ccall('compute_entropy', 'number', ['number', 'number'], [ptr, values.length]) }
      finally { mod._free(ptr) }
    },

    mlpForward(input) {
      const ptr = allocF32(input)
      try { return mod.ccall('mlp_forward', 'number', ['number', 'number'], [ptr, input.length]) }
      finally { mod._free(ptr) }
    },

    kmeansCluster(data, k) {
      const n = data.length, dim = data[0]?.length ?? 0
      if (n === 0 || dim === 0) return { centroids: [], assignments: [] }
      k = Math.min(k, n)

      const flat = new Float32Array(n * dim)
      for (let i = 0; i < n; i++) for (let j = 0; j < dim; j++) flat[i * dim + j] = data[i][j]

      const pData = mod._malloc(flat.length * 4)
      const pCentOut = mod._malloc(k * dim * 4)
      const pAssOut = mod._malloc(n * 4)
      mod.HEAPF32.set(flat, pData >> 2)

      try {
        mod.ccall('kmeans_cluster',
          null,
          ['number', 'number', 'number', 'number', 'number', 'number', 'number'],
          [pData, n, dim, k, 50, pCentOut, pAssOut]
        )
        const centroids: number[][] = []
        for (let c = 0; c < k; c++) {
          centroids.push(readF32(pCentOut + c * dim * 4, dim))
        }
        const assignments = Array.from(mod.HEAP32.slice(pAssOut >> 2, (pAssOut >> 2) + n))
        return { centroids, assignments }
      } finally {
        mod._free(pData); mod._free(pCentOut); mod._free(pAssOut)
      }
    },

    emaUpdate(newVec, oldEma, alpha = 0.3) {
      const n = newVec.length
      const pNew = allocF32(newVec)
      const pOld = allocF32(oldEma.length === n ? oldEma : newVec)
      const pOut = mod._malloc(n * 4)
      try {
        mod.ccall('ema_update',
          null,
          ['number', 'number', 'number', 'number', 'number'],
          [pNew, pOld, pOut, n, alpha]
        )
        return readF32(pOut, n)
      } finally {
        mod._free(pNew); mod._free(pOld); mod._free(pOut)
      }
    },
  }
}

// ── Global state
const wasmApi = shallowRef<WASMApi>(jsFallback)
const wasmReady = ref(false)
const wasmError = ref<string | null>(null)
const wasmLoading = ref(false)

let loadPromise: Promise<WASMApi> | null = null

export function useWASM() {
  async function loadWASM(): Promise<WASMApi> {
    if (wasmReady.value) return wasmApi.value
    if (loadPromise) return loadPromise

    loadPromise = (async () => {
      wasmLoading.value = true
      wasmError.value = null

      try {
        // Dynamically import the Emscripten-generated module
        const FingerprintSIMD = await import('/wasm/fingerprint_simd.js').catch(() => null)
        if (!FingerprintSIMD) throw new Error('WASM module not found')

        const mod = await FingerprintSIMD.default({
          wasmBinary: await fetch('/wasm/fingerprint_simd.wasm')
            .then(r => r.ok ? r.arrayBuffer() : Promise.reject(new Error('WASM binary not found')))
            .catch(() => null),
        })

        const api = wrapWASMModule(mod)
        wasmApi.value = api
        wasmReady.value = true
        console.log('[WASM] fingerprint_simd loaded — SIMD acceleration active')
        return api
      } catch (e) {
        wasmError.value = e instanceof Error ? e.message : String(e)
        console.warn('[WASM] Loading failed, using JS fallback:', wasmError.value)
        wasmApi.value = jsFallback
        wasmReady.value = true
        return jsFallback
      } finally {
        wasmLoading.value = false
      }
    })()

    return loadPromise
  }

  return {
    api: wasmApi,
    ready: wasmReady,
    loading: wasmLoading,
    error: wasmError,
    loadWASM,
    // Convenience: get API or fallback synchronously
    get(): WASMApi { return wasmApi.value },
  }
}
