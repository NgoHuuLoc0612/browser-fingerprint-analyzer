export interface FingerprintSIMDModule {
  cosineSimilarity(a: number, b: number, n: number): number
  l2Distance(a: number, b: number, n: number): number
  cmsInsert(item: string): void
  cmsQuery(item: string): number
  cmsClear(): void
  computeEntropy(valuesPtr: number, n: number): number
  mlpForward(input: Float32Array): number
  _malloc(size: number): number
  _free(ptr: number): void
  HEAPF32: Float32Array
  HEAP32: Int32Array
  HEAPU8: Uint8Array
  HEAPU32: Uint32Array
  ccall(name: string, returnType: string, argTypes: string[], args: unknown[]): unknown
  cwrap(name: string, returnType: string, argTypes: string[]): (...args: unknown[]) => unknown
}
declare function FingerprintSIMD(opts?: { wasmBinary?: ArrayBuffer }): Promise<FingerprintSIMDModule>
export default FingerprintSIMD
