#!/usr/bin/env bash
# build_wasm.sh — Build fingerprint_simd.cpp with Emscripten
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$SCRIPT_DIR/src/fingerprint_simd.cpp"
OUT_DIR="$SCRIPT_DIR/../frontend/public/wasm"
mkdir -p "$OUT_DIR"

echo "[WASM] Building fingerprint_simd with Emscripten + SIMD128..."

emcc "$SRC" \
  -O3 \
  -msimd128 \
  -std=c++17 \
  -s WASM=1 \
  -s MODULARIZE=1 \
  -s EXPORT_NAME="FingerprintSIMD" \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s INITIAL_MEMORY=33554432 \
  -s MAXIMUM_MEMORY=268435456 \
  -s EXPORTED_FUNCTIONS="[
    '_cosine_similarity_simd',
    '_l2_distance_simd',
    '_cms_insert',
    '_cms_query',
    '_cms_clear',
    '_compute_entropy',
    '_kmeans_cluster',
    '_csr_build',
    '_csr_bfs',
    '_ema_update',
    '_mlp_forward',
    '_malloc',
    '_free'
  ]" \
  -s EXPORTED_RUNTIME_METHODS="[
    'ccall','cwrap',
    'HEAPF32','HEAP32','HEAPU8','HEAPU32',
    'getValue','setValue'
  ]" \
  --bind \
  -s ENVIRONMENT="web,worker" \
  -s FILESYSTEM=0 \
  -s ASSERTIONS=0 \
  -s SINGLE_FILE=0 \
  -o "$OUT_DIR/fingerprint_simd.js"

echo "[WASM] Build complete: $OUT_DIR/fingerprint_simd.js + fingerprint_simd.wasm"

# Generate TypeScript type stubs
cat > "$OUT_DIR/fingerprint_simd.d.ts" << 'TSEOF'
export interface FingerprintSIMDModule {
  // SIMD vector ops
  cosineSimilarity(a: number, b: number, n: number): number
  l2Distance(a: number, b: number, n: number): number

  // Count-Min Sketch
  cmsInsert(item: string): void
  cmsQuery(item: string): number
  cmsClear(): void

  // Entropy
  computeEntropy(valuesPtr: number, n: number): number

  // k-means
  kmeansCluster(
    dataPtr: number, n: number, dim: number, k: number, maxIter: number,
    centroidsOut: number, assignmentsOut: number
  ): void

  // CSR Graph
  csrBuild(
    edgesPtr: number, weightsPtr: number,
    nEdges: number, nNodes: number
  ): void
  csrBfs(
    startNode: number, maxDepth: number,
    outNodes: number, outScores: number, maxResults: number
  ): number

  // EMA
  emaUpdate(
    newVec: number, oldEma: number, outEma: number,
    n: number, alpha: number
  ): void

  // MLP Calibrator
  mlpForward(input: Float32Array): number

  // Memory management
  _malloc(size: number): number
  _free(ptr: number): void

  // Heap views
  HEAPF32: Float32Array
  HEAP32:  Int32Array
  HEAPU8:  Uint8Array
  HEAPU32: Uint32Array

  ccall(name: string, returnType: string, argTypes: string[], args: unknown[]): unknown
  cwrap(name: string, returnType: string, argTypes: string[]): (...args: unknown[]) => unknown
}

declare function FingerprintSIMD(opts?: { wasmBinary?: ArrayBuffer }): Promise<FingerprintSIMDModule>
export default FingerprintSIMD
TSEOF

echo "[WASM] TypeScript stubs written."
