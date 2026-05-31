/// <reference lib="webworker" />
// Audio Fingerprint Worker — AudioWorkletProcessor cannot run in standard worker
// This worker orchestrates the collection logic and posts results

declare const self: DedicatedWorkerGlobalScope

function fnv1a(str: string): string {
  let hash = 0x811c9dc5 >>> 0
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

// The actual AudioContext must run on the main thread (workers can't create AudioContext)
// This worker receives float arrays from main thread and hashes them
self.onmessage = (e: MessageEvent) => {
  const { type, payload } = e.data

  if (type === 'HASH_AUDIO_BUFFER') {
    const { buffer } = payload as { buffer: Float32Array }
    const samples = Array.from(buffer).slice(0, 500)
    const quantized = samples.map(v => Math.round(v * 1e6))
    const hash = fnv1a(quantized.join(','))

    // Compute spectral features
    const rms = Math.sqrt(samples.reduce((s, v) => s + v * v, 0) / samples.length)
    const peak = samples.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
    const zeroCrossings = samples.slice(1).filter((v, i) => (v >= 0) !== (samples[i] >= 0)).length

    self.postMessage({
      type: 'AUDIO_HASH_RESULT',
      payload: { hash, rms, peak, zeroCrossings }
    })
  }

  if (type === 'COMPUTE_DYNAMICS_HASH') {
    const { buffers } = payload as { buffers: Float32Array[] }
    const combined = buffers.map(b =>
      fnv1a(Array.from(b).slice(0, 100).map(v => Math.round(v * 1e5)).join(','))
    ).join('|')

    self.postMessage({
      type: 'DYNAMICS_HASH_RESULT',
      payload: { hash: fnv1a(combined) }
    })
  }
}
