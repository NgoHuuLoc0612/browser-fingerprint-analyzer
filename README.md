# Browser Fingerprint Analyzer

> Browser fingerprinting system with entropy clustering, anomaly detection, probabilistic identity matching, and advanced security analysis.

## Architecture

```
browser-fingerprint-analyzer/
├── frontend/                    # Nuxt 3 + Vue 3 + TypeScript
│   ├── components/
│   │   ├── fingerprint/
│   │   │   ├── OverviewPanel.vue      # Full fingerprint overview
│   │   │   ├── RawViewer.vue          # Monaco Editor JSON viewer
│   │   │   ├── WebGLPanel.vue         # GPU/WebGL/WebGPU analysis
│   │   │   ├── SandboxedLab.vue       # Sandboxed iframe security tests
│   │   │   └── HistoryPanel.vue       # Temporal drift + scan history
│   │   ├── viz/
│   │   │   ├── FingerprintGlobe.vue   # Three.js 3D entropy globe
│   │   │   ├── EntropyHeatmap.vue     # WebGL2 GLSL heatmap
│   │   │   └── RadarChart.vue         # WebGPU WGSL radar chart (SVG fallback)
│   │   └── layout/
│   │       └── AppShell.vue           # Main app layout
│   ├── composables/
│   │   ├── useFingerprintCollector.ts # Main collection orchestrator
│   │   └── useWASM.ts                 # WASM module loader + JS fallbacks
│   ├── stores/
│   │   └── fingerprint.ts             # Pinia store
│   ├── workers/
│   │   ├── fingerprint.worker.ts      # OffscreenCanvas + k-means + CMS
│   │   └── audio.worker.ts            # Audio hash worker
│   ├── types/
│   │   └── fingerprint.ts             # Full TypeScript type system
│   └── public/wasm/                   # Compiled WASM output
│
├── backend/                     # Node.js + Fastify + tRPC
│   ├── src/
│   │   ├── server.ts                  # Fastify server entrypoint
│   │   └── routers/
│   │       └── app.router.ts          # tRPC router + analysis pipeline
│   └── sql/
│       └── init.sql                   # PostgreSQL schema + views + functions
│
└── wasm-simd/                   # C++ → WASM SIMD
    └── src/
        └── fingerprint_simd.cpp       # SIMD cosine sim, CMS, k-means, MLP, CSR graph
```

## Features

### Browser Fingerprinting (16+ signal categories)

| Signal | Method | Worker |
|--------|--------|--------|
| Browser / Engine | UA parsing + API probing | Main thread |
| OS detection | UA + platform API | Main thread |
| GPU (WebGL debug info) | WEBGL_debug_renderer_info | Main thread |
| Canvas fingerprint | OffscreenCanvas 2D rendering | Web Worker |
| WebGL2 fingerprint | Shader + parameter + texture hash | Web Worker |
| WebGPU (WGSL radar) | Adapter info + limits | Main thread |
| Audio fingerprint | OscillatorNode → CompressorNode → AnalyserNode | Main thread |
| Font detection | Canvas width measurement (150+ fonts) | Web Worker |
| Screen info | screen.* + matchMedia color-gamut/HDR | Main thread |
| Timezone & locale | Intl API + DST detection | Main thread |
| Touch support | PointerEvent + TouchEvent APIs | Main thread |
| Storage support | localStorage / IndexedDB / Cache API | Main thread |
| WebRTC leak | RTCPeerConnection ICE candidates | Main thread |
| Permission states | 25+ permission names | Main thread |
| Extension detection | DOM artifact + AdBlock probe | Main thread |
| DevTools detection | Size threshold + debugger timing | Main thread |
| Anti-tamper | Prototype chain + native fn integrity | Main thread |

### ML Pipeline

```
Browser data (16D vector)
       │
       ▼
┌─────────────────────────────────────────┐
│  Autoencoder (ONNX Runtime / TS sim)    │
│  Input(16) → Encode(4) → Decode(16)     │
│  Reconstruction error → anomaly score   │
└─────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│  Count-Min Sketch (C++ WASM SIMD)       │
│  Track fingerprint hash frequency       │
│  Width=2048, Depth=4, FNV-1a seeds      │
└─────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│  k-means++ Clustering (C++ WASM SIMD)   │
│  k=8 clusters, k-means++ init           │
│  SIMD-accelerated L2 distance           │
└─────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│  EMA Temporal Model (WASM SIMD)         │
│  α=0.3, stored in Redis per hash        │
│  Tracks drift between visits            │
└─────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│  CSR Graph (C++ WASM)                   │
│  Identity graph: BFS neighbor lookup    │
│  Edge weight = cosine similarity        │
└─────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│  MLP Calibrator (C++ WASM SIMD)         │
│  16 → Dense(128) → ReLU → LayerNorm     │
│     → Dense(64) → ReLU → Residual       │
│     → Dense(32) → ReLU → Dense(1)       │
│     → Sigmoid → calibrated score        │
└─────────────────────────────────────────┘
```

### Security Features

- **CSP Level 3** — strict-dynamic, wasm-unsafe-eval
- **Trusted Types** — enforced in browser, tested in lab
- **COOP/COEP** — enables SharedArrayBuffer + Atomics
- **Sandboxed iframe lab** — 10 security tests in isolated contexts
- **Anti-tamper detection** — prototype chain, native function integrity
- **Extension detection** — DOM artifact probing, AdBlock check
- **DevTools detection** — size threshold + debugger timing attack
- **WebRTC leak detection** — ICE candidate IP parsing

### Visualizations

| Component | Technology |
|-----------|-----------|
| Entropy Globe | Three.js (orbital rings, particle field, data spikes) |
| Entropy Heatmap | WebGL2 + custom GLSL fragment shader |
| Radar Chart | WebGPU + WGSL (SVG fallback) |
| Temporal Drift | Canvas 2D bezier sparkline |
| Raw JSON | Monaco Editor (custom dark theme) |

## Quick Start

### Development

```bash
# Start PostgreSQL + Redis
docker-compose up postgres redis -d

# Backend
cd backend && npm install && npm run dev

# Frontend
cd frontend && npm install && npm run dev
```

### Production

```bash
docker-compose up --build -d
```

### Build WASM (requires Emscripten)

```bash
source /path/to/emsdk/emsdk_env.sh
cd wasm-simd && chmod +x build_wasm.sh && ./build_wasm.sh
```

## Environment Variables

### Backend

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/fingerprint_db` | PostgreSQL connection |
| `REDIS_HOST` | `localhost` | Redis host |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_PASSWORD` | - | Redis auth (optional) |
| `CORS_ORIGINS` | - | Comma-separated allowed origins |

## Tech Stack

### Frontend
- **Nuxt 3** + **Vue 3** + **TypeScript** (strict)
- **Pinia** — state management with session persistence
- **UnoCSS** — utility-first CSS with custom design tokens
- **Three.js** — 3D fingerprint globe
- **Monaco Editor** — raw JSON viewer with custom theme
- **WebGL2 + GLSL** — entropy heatmap shader
- **WebGPU + WGSL** — radar chart with GPU compute
- **OffscreenCanvas** — canvas/WebGL fingerprinting in workers
- **SharedArrayBuffer + Atomics** — lock-free progress signalling
- **Web Workers** — parallel fingerprint collection
- **Comlink** — typed worker RPC
- **Motion One** — animation system

### Backend
- **Node.js 20** + **TypeScript** (ESM)
- **Fastify 4** — HTTP server with helmet, CORS, rate-limiting
- **tRPC 10** — end-to-end type-safe API
- **PostgreSQL (EDB-compatible)** — fingerprint storage + analytics
- **Redis / Memurai** — EMA vector cache, visitor identity, CMS

### Native / WASM
- **C++17** — core ML algorithms
- **Emscripten** — C++ → WASM compilation
- **WASM SIMD128** — vectorized cosine similarity, L2 distance, EMA
- **Count-Min Sketch** — probabilistic frequency estimation
- **k-means++** — entropy clustering
- **CSR Graph** — identity graph with BFS traversal
- **MLP** — calibration neural network (16→128→64→32→1)
