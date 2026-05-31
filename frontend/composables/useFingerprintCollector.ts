import type {
  FullFingerprint,
  BrowserInfo,
  OSInfo,
  GPUInfo,
  AudioFingerprint,
  ScreenInfo,
  TimezoneLocaleInfo,
  TouchInfo,
  StorageInfo,
  WebRTCLeak,
  PermissionState,
  SecurityFeatures,
  ExtensionDetection,
  DevToolsDetection,
  AntiTamper,
  FingerprintUniqueness,
  FieldContribution,
  CollectionProgress,
  CollectionPhase,
  WorkerResponse,
  WebGPUAdapterInfo,
} from '~/types/fingerprint'

// Font list to probe
const FONT_LIST = [
  'Arial', 'Arial Black', 'Arial Narrow', 'Arial Rounded MT Bold',
  'Calibri', 'Cambria', 'Candara', 'Comic Sans MS', 'Consolas',
  'Constantia', 'Corbel', 'Courier New', 'Franklin Gothic Medium',
  'Garamond', 'Georgia', 'Helvetica', 'Impact', 'Lucida Console',
  'Lucida Sans Unicode', 'Microsoft Sans Serif', 'Palatino Linotype',
  'Segoe UI', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana',
  'Gill Sans', 'Futura', 'Baskerville', 'Helvetica Neue', 'Century Gothic',
  'Book Antiqua', 'Bookman Old Style', 'Century Schoolbook',
  'Copperplate Gothic Light', 'Copperplate Gothic Bold',
  'Courier', 'Didot', 'Franklin Gothic Book', 'Gill Sans MT',
  'Goudy Old Style', 'Haettenschweiler', 'Lucida Bright',
  'Lucida Calligraphy', 'Lucida Fax', 'Lucida Handwriting',
  'MS Gothic', 'MS Mincho', 'MS PGothic', 'MS PMincho',
  'MV Boli', 'Malgun Gothic', 'Marlett', 'Meiryo',
  'Microsoft Himalaya', 'Microsoft JhengHei', 'Microsoft New Tai Lue',
  'Microsoft PhagsPa', 'Microsoft Tai Le', 'Microsoft Uighur',
  'Microsoft YaHei', 'Microsoft Yi Baiti', 'MingLiU-ExtB',
  'Miriam Fixed', 'Mongolian Baiti', 'Myanmar Text',
  'Nirmala UI', 'Nyala', 'Palatino', 'Plantagenet Cherokee',
  'Raavi', 'Rockwell', 'Rockwell Extra Bold', 'Rod',
  'Sakkal Majalla', 'Segoe Print', 'Segoe Script', 'Segoe UI Light',
  'Segoe UI Semibold', 'Segoe UI Symbol', 'Shruti', 'Sylfaen',
  'Symbol', 'Traditional Arabic', 'Tunga', 'Utsaah',
  'Vijaya', 'Vrinda', 'Webdings', 'Wingdings', 'Wingdings 2', 'Wingdings 3',
  '.AppleSystemUIFont', 'Apple Chancery', 'Apple Color Emoji',
  'Apple SD Gothic Neo', 'AppleGothic', 'AppleMyungjo', 'Avenir',
  'Avenir Next', 'Big Caslon', 'Brush Script MT', 'Chalkboard',
  'Cochin', 'Copperplate', 'Corsiva Hebrew', 'Damascus', 'DecoType Naskh',
  'Devanagari MT', 'Didot', 'Euphemia UCAS', 'Farah', 'Farisi',
  'Footlight MT Light', 'Geeza Pro', 'Helvetica CY', 'Herculanum',
  'Hiragino Kaku Gothic Pro', 'Hiragino Mincho Pro', 'Hoefler Text',
  'Kailasa', 'Kokonor', 'Krungthep', 'Lucida Grande', 'Luminari',
  'Menlo', 'Monaco', 'Mshtakan', 'Nadeem', 'New Peninim MT',
  'Optima', 'Osaka', 'Papyrus', 'PT Mono', 'PT Sans', 'PT Serif',
  'Raanana', 'Sathu', 'Silom', 'Skia', 'Songti SC', 'STFangsong',
  'STHeiti', 'STIXGeneral', 'STKaiti', 'STSong', 'Thonburi',
  'Times', 'Trattatello', 'Zapfino',
  'DejaVu Sans', 'DejaVu Serif', 'DejaVu Sans Mono',
  'Liberation Sans', 'Liberation Serif', 'Liberation Mono',
  'Ubuntu', 'Ubuntu Mono', 'Ubuntu Condensed',
  'Noto Sans', 'Noto Serif', 'Noto Mono',
  'FreeSans', 'FreeSerif', 'FreeMono',
  'Cantarell', 'Droid Sans', 'Droid Serif', 'Droid Sans Mono',
  'Lato', 'Open Sans', 'Roboto', 'Source Sans Pro', 'Source Serif Pro',
  'Source Code Pro', 'Fira Sans', 'Fira Mono', 'Fira Code',
]

function fnv1a(str: string): string {
  let hash = 0x811c9dc5 >>> 0
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

function generateId(prefix = ''): string {
  const arr = new Uint8Array(16)
  crypto.getRandomValues(arr)
  const hex = Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')
  return prefix + hex
}

export function useFingerprintCollector() {
  const progress = ref<CollectionProgress>({
    phase: 'idle',
    percent: 0,
    message: 'Ready',
    startTime: 0,
    elapsed: 0,
  })

  const fingerprint = ref<FullFingerprint | null>(null)
  const isCollecting = ref(false)
  const error = ref<string | null>(null)

  let worker: Worker | null = null
  let audioWorker: Worker | null = null
  let sharedBuffer: SharedArrayBuffer | null = null
  let progressArray: Int32Array | null = null

  function setProgress(phase: CollectionPhase, percent: number, message: string) {
    progress.value = {
      phase,
      percent,
      message,
      startTime: progress.value.startTime,
      elapsed: Date.now() - progress.value.startTime,
    }
    if (progressArray) Atomics.store(progressArray, 1, percent)
  }

  function sendToWorker<T>(msg: object): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!worker) { reject(new Error('Worker not initialized')); return }

      const handler = (e: MessageEvent<WorkerResponse>) => {
        const { type, payload } = e.data
        if (type === 'ERROR') {
          worker!.removeEventListener('message', handler)
          reject(new Error((payload as any).message))
          return
        }
        if (type !== 'PROGRESS') {
          worker!.removeEventListener('message', handler)
          resolve(payload as T)
        }
      }
      worker.addEventListener('message', handler)
      worker.postMessage(msg)
    })
  }

  // ── Browser Info
  function collectBrowserInfo(): BrowserInfo {
    const nav = navigator
    const ua = nav.userAgent

    // Engine detection
    const isChrome = /Chrome\/(\d+)/.test(ua) && !/Edg\/|OPR\//.test(ua)
    const isFirefox = /Firefox\/(\d+)/.test(ua)
    const isSafari = /Safari\//.test(ua) && !/Chrome\//.test(ua)
    const isEdge = /Edg\/(\d+)/.test(ua)
    const isOpera = /OPR\/(\d+)/.test(ua)
    const isBrave = (nav as any).brave !== undefined

    let engine = 'unknown', engineVersion = '', browserName = 'Unknown', browserVersion = ''

    if (isChrome || isEdge || isOpera || isBrave) {
      engine = 'Blink'
      const m = ua.match(/Chrome\/(\d+\.\d+)/)
      engineVersion = m?.[1] ?? ''
    } else if (isFirefox) {
      engine = 'Gecko'
      const m = ua.match(/Firefox\/(\d+\.\d+)/)
      engineVersion = m?.[1] ?? ''
    } else if (isSafari) {
      engine = 'WebKit'
      const m = ua.match(/Version\/(\d+\.\d+)/)
      engineVersion = m?.[1] ?? ''
    }

    if (isBrave) { browserName = 'Brave'; const m = ua.match(/Chrome\/(\d+)/); browserVersion = m?.[1] ?? '' }
    else if (isEdge) { browserName = 'Edge'; const m = ua.match(/Edg\/(\d+)/); browserVersion = m?.[1] ?? '' }
    else if (isOpera) { browserName = 'Opera'; const m = ua.match(/OPR\/(\d+)/); browserVersion = m?.[1] ?? '' }
    else if (isChrome) { browserName = 'Chrome'; const m = ua.match(/Chrome\/(\d+)/); browserVersion = m?.[1] ?? '' }
    else if (isFirefox) { browserName = 'Firefox'; const m = ua.match(/Firefox\/(\d+)/); browserVersion = m?.[1] ?? '' }
    else if (isSafari) { browserName = 'Safari'; const m = ua.match(/Version\/(\d+)/); browserVersion = m?.[1] ?? '' }

    // Headless detection
    const isHeadless = !!(
      /HeadlessChrome/.test(ua) ||
      (nav as any).webdriver ||
      !(window.outerWidth && window.outerHeight) ||
      (window.chrome === undefined && isChrome)
    )

    // Plugin collection
    const plugins: BrowserInfo['plugins'] = Array.from(nav.plugins).map(p => ({
      name: p.name,
      filename: p.filename,
      description: p.description,
      mimeTypes: Array.from(p).map(m => m.type),
    }))

    const mimeTypes: BrowserInfo['mimeTypes'] = Array.from(nav.mimeTypes).map(m => ({
      type: m.type,
      suffixes: m.suffixes,
      description: m.description,
    }))

    return {
      userAgent: ua,
      vendor: nav.vendor,
      appVersion: nav.appVersion,
      platform: nav.platform,
      engine,
      engineVersion,
      browserName,
      browserVersion,
      isHeadless,
      isBot: isHeadless,
      webdriver: !!(nav as any).webdriver,
      languages: Array.from(nav.languages || [nav.language]),
      cookieEnabled: nav.cookieEnabled,
      doNotTrack: nav.doNotTrack,
      hardwareConcurrency: nav.hardwareConcurrency || 0,
      deviceMemory: (nav as any).deviceMemory,
      maxTouchPoints: nav.maxTouchPoints || 0,
      pdfViewerEnabled: !!(nav as any).pdfViewerEnabled,
      plugins,
      mimeTypes,
    }
  }

  // ── OS Info
  function collectOSInfo(): OSInfo {
    const ua = navigator.userAgent
    const platform = navigator.platform

    let name = 'Unknown', version = '', arch = 'x64'

    if (/Win/.test(platform)) {
      name = 'Windows'
      if (/Windows NT 10/.test(ua)) version = '10/11'
      else if (/Windows NT 6\.3/.test(ua)) version = '8.1'
      else if (/Windows NT 6\.2/.test(ua)) version = '8'
      else if (/Windows NT 6\.1/.test(ua)) version = '7'
    } else if (/Mac/.test(platform)) {
      name = 'macOS'
      const m = ua.match(/Mac OS X ([\d_]+)/)
      version = m?.[1]?.replace(/_/g, '.') ?? ''
    } else if (/Linux/.test(platform)) {
      name = /Android/.test(ua) ? 'Android' : 'Linux'
      if (/Android ([\d.]+)/.test(ua)) version = ua.match(/Android ([\d.]+)/)?.[1] ?? ''
    } else if (/iPhone|iPad/.test(ua)) {
      name = 'iOS'
      const m = ua.match(/OS ([\d_]+)/)
      version = m?.[1]?.replace(/_/g, '.') ?? ''
    }

    if (/WOW64|Win64|x64/.test(ua)) arch = 'x64'
    else if (/ARM/.test(ua)) arch = 'ARM'
    else arch = 'x86'

    const mobile = /Mobi|Android|iPhone|iPad/.test(ua)
    const touchDevice = navigator.maxTouchPoints > 0

    return { name, version, architecture: arch, platform, touchDevice, mobile }
  }

  // ── GPU Info
  async function collectGPUInfo(): Promise<GPUInfo> {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl') as WebGLRenderingContext | null

    let vendor = 'unknown', renderer = 'unknown', unmaskedVendor = 'unknown', unmaskedRenderer = 'unknown'
    let maxTextureSize = 0, shadingLanguageVersion = '', antialiasing = false
    let extensions: string[] = []
    let redBits = 0, greenBits = 0, blueBits = 0, alphaBits = 0, depthBits = 0, stencilBits = 0
    let maxViewportDims: [number, number] = [0, 0]
    let maxRenderbufferSize = 0, maxVertexAttribs = 0, maxVaryingVectors = 0
    let maxVertexUniformVectors = 0, maxFragmentUniformVectors = 0
    let webglVersion = 'none', webgl2Supported = false

    if (gl) {
      webgl2Supported = gl instanceof WebGL2RenderingContext
      webglVersion = webgl2Supported ? 'WebGL 2.0' : 'WebGL 1.0'

      vendor = gl.getParameter(gl.VENDOR)
      renderer = gl.getParameter(gl.RENDERER)
      shadingLanguageVersion = gl.getParameter(gl.SHADING_LANGUAGE_VERSION)
      maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE)
      antialiasing = gl.getContextAttributes()?.antialias ?? false
      extensions = gl.getSupportedExtensions() ?? []

      const dbg = gl.getExtension('WEBGL_debug_renderer_info')
      if (dbg) {
        unmaskedVendor = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)
        unmaskedRenderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)
      }

      redBits = gl.getParameter(gl.RED_BITS)
      greenBits = gl.getParameter(gl.GREEN_BITS)
      blueBits = gl.getParameter(gl.BLUE_BITS)
      alphaBits = gl.getParameter(gl.ALPHA_BITS)
      depthBits = gl.getParameter(gl.DEPTH_BITS)
      stencilBits = gl.getParameter(gl.STENCIL_BITS)
      maxRenderbufferSize = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)
      maxVertexAttribs = gl.getParameter(gl.MAX_VERTEX_ATTRIBS)
      maxVaryingVectors = gl.getParameter(gl.MAX_VARYING_VECTORS)
      maxVertexUniformVectors = gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS)
      maxFragmentUniformVectors = gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS)
      const vd = gl.getParameter(gl.MAX_VIEWPORT_DIMS)
      maxViewportDims = vd ? [vd[0], vd[1]] : [0, 0]
    }

    // WebGPU
    let webgpuSupported = false
    let webgpuAdapterInfo: WebGPUAdapterInfo | undefined

    if ('gpu' in navigator) {
      try {
        const adapter = await (navigator as any).gpu.requestAdapter()
        if (adapter) {
          webgpuSupported = true
          const info = await adapter.requestAdapterInfo?.()
          const limits = adapter.limits
          webgpuAdapterInfo = {
            vendor: info?.vendor ?? adapter.name ?? 'unknown',
            architecture: info?.architecture ?? '',
            device: info?.device ?? '',
            description: info?.description ?? '',
            adapterType: 'unknown',
            backendType: 'unknown',
            maxBindGroups: limits?.maxBindGroups ?? 0,
            maxColorAttachments: limits?.maxColorAttachments ?? 0,
            maxComputeWorkgroupSizeX: limits?.maxComputeWorkgroupSizeX ?? 0,
            maxComputeWorkgroupSizeY: limits?.maxComputeWorkgroupSizeY ?? 0,
            maxComputeWorkgroupSizeZ: limits?.maxComputeWorkgroupSizeZ ?? 0,
            maxComputeInvocationsPerWorkgroup: limits?.maxComputeInvocationsPerWorkgroup ?? 0,
            maxBufferSize: limits?.maxBufferSize ?? 0,
            maxTextureDimension2D: limits?.maxTextureDimension2D ?? 0,
          }
        }
      } catch { /* WebGPU not available */ }
    }

    return {
      vendor, renderer, unmaskedVendor, unmaskedRenderer,
      webglVersion, webgl2Supported, webgpuSupported,
      maxTextureSize, maxViewportDims, maxRenderbufferSize,
      maxVertexAttribs, maxVaryingVectors, maxVertexUniformVectors,
      maxFragmentUniformVectors, extensions, shadingLanguageVersion,
      antialiasing, redBits, greenBits, blueBits, alphaBits, depthBits,
      stencilBits, webgpuAdapterInfo,
    }
  }

  // ── Audio Fingerprint
  async function collectAudioFingerprint(): Promise<AudioFingerprint> {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioCtx) throw new Error('AudioContext not supported')

      const ctx = new AudioCtx()

      // Oscillator → Compressor → Analyser
      const osc = ctx.createOscillator()
      const compressor = ctx.createDynamicsCompressor()
      const analyser = ctx.createAnalyser()
      const gain = ctx.createGain()

      osc.type = 'triangle'
      osc.frequency.value = 10000

      compressor.threshold.value = -50
      compressor.knee.value = 40
      compressor.ratio.value = 12
      compressor.attack.value = 0
      compressor.release.value = 0.25

      gain.gain.value = 0 // silent

      osc.connect(compressor)
      compressor.connect(analyser)
      analyser.connect(gain)
      gain.connect(ctx.destination)

      osc.start()

      const bufferSize = 4096
      analyser.fftSize = bufferSize

      await new Promise(r => setTimeout(r, 100))

      const floatBuf = new Float32Array(analyser.frequencyBinCount)
      analyser.getFloatFrequencyData(floatBuf)
      const timeBuf = new Float32Array(analyser.fftSize)
      analyser.getFloatTimeDomainData(timeBuf)

      osc.stop()
      await ctx.close()

      // Hash via audio worker
      let bufferHash = fnv1a(Array.from(floatBuf.slice(0, 200)).map(v => Math.round(v * 1000)).join(','))
      const oscillatorHash = fnv1a(Array.from(timeBuf.slice(0, 100)).map(v => Math.round(v * 1e6)).join(','))

      // Dynamics compressor fingerprint
      const compHash = fnv1a([
        compressor.threshold.value,
        compressor.knee.value,
        compressor.ratio.value,
        compressor.attack.value,
        compressor.release.value,
      ].join(','))

      const analyserHash = fnv1a([analyser.fftSize, analyser.frequencyBinCount, analyser.minDecibels, analyser.maxDecibels, analyser.smoothingTimeConstant].join(','))

      return {
        oscillatorHash,
        compressorHash: compHash,
        analyserHash,
        dynamicsHash: fnv1a(oscillatorHash + compHash),
        audioContextState: 'closed',
        sampleRate: ctx.sampleRate,
        channelCount: ctx.destination.channelCount,
        maxChannelCount: ctx.destination.maxChannelCount,
        numberOfInputs: ctx.destination.numberOfInputs,
        numberOfOutputs: ctx.destination.numberOfOutputs,
        baseLatency: ctx.baseLatency ?? 0,
        outputLatency: (ctx as any).outputLatency ?? 0,
        bufferHash,
        supported: true,
      }
    } catch (e) {
      return {
        oscillatorHash: 'unsupported',
        compressorHash: 'unsupported',
        analyserHash: 'unsupported',
        dynamicsHash: 'unsupported',
        audioContextState: 'unsupported',
        sampleRate: 0,
        channelCount: 0,
        maxChannelCount: 0,
        numberOfInputs: 0,
        numberOfOutputs: 0,
        baseLatency: 0,
        outputLatency: 0,
        bufferHash: 'unsupported',
        supported: false,
      }
    }
  }

  // ── Screen Info
  function collectScreenInfo(): ScreenInfo {
    const s = screen
    const dpr = window.devicePixelRatio || 1
    const aspect = s.width / s.height

    let colorGamut = 'srgb'
    if (matchMedia('(color-gamut: p3)').matches) colorGamut = 'p3'
    if (matchMedia('(color-gamut: rec2020)').matches) colorGamut = 'rec2020'

    let dynamicRange = 'standard'
    if (matchMedia('(dynamic-range: high)').matches) dynamicRange = 'high'

    const isHDR = matchMedia('(dynamic-range: high)').matches

    return {
      width: s.width,
      height: s.height,
      availWidth: s.availWidth,
      availHeight: s.availHeight,
      colorDepth: s.colorDepth,
      pixelDepth: s.pixelDepth,
      devicePixelRatio: dpr,
      orientation: screen.orientation?.type ?? 'unknown',
      orientationAngle: screen.orientation?.angle ?? 0,
      isHDR,
      colorGamut,
      dynamicRange,
      screenX: window.screenX,
      screenY: window.screenY,
      outerWidth: window.outerWidth,
      outerHeight: window.outerHeight,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      aspectRatio: aspect,
    }
  }

  // ── Timezone/Locale
  function collectTimezoneLocale(): TimezoneLocaleInfo {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    const offset = -new Date().getTimezoneOffset()
    const locale = Intl.DateTimeFormat().resolvedOptions().locale || navigator.language

    const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: 'full' })
    const timeFormatter = new Intl.DateTimeFormat(locale, { timeStyle: 'full' })
    const numberFormatter = new Intl.NumberFormat(locale).format(1234567.89)
    const currencyFormatter = new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(99.99)

    // Check DST
    const jan = new Date(new Date().getFullYear(), 0, 1).getTimezoneOffset()
    const jul = new Date(new Date().getFullYear(), 6, 1).getTimezoneOffset()
    const dstActive = Math.max(jan, jul) !== new Date().getTimezoneOffset()

    // Week start
    const weekInfo = (Intl as any).Locale ? new (Intl as any).Locale(locale).weekInfo : null
    const weekStart = weekInfo?.firstDay ?? 0

    // Hour12
    const hour12 = new Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions().hour12 ?? false

    // JS time drift (compare to Date.now())
    const t0 = performance.now()
    const d = new Date()
    const drift = performance.now() - t0

    return {
      timezone: tz,
      timezoneOffset: offset,
      locale,
      language: navigator.language,
      languages: Array.from(navigator.languages || [navigator.language]),
      dateFormat: dateFormatter.format(new Date()),
      timeFormat: timeFormatter.format(new Date()),
      numberFormat: numberFormatter,
      currencyFormat: currencyFormatter,
      weekStart,
      hour12,
      dstActive,
      jsTimeDrift: drift,
    }
  }

  // ── Touch
  function collectTouchInfo(): TouchInfo {
    return {
      supported: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
      maxPoints: navigator.maxTouchPoints,
      touchEvent: 'ontouchstart' in window,
      pointerEvent: window.PointerEvent !== undefined,
      forceTouch: 'onwebkitmouseforcechanged' in window,
      touchAction: CSS.supports('touch-action', 'none'),
    }
  }

  // ── Storage
  async function collectStorageInfo(): Promise<StorageInfo> {
    let storageEstimate: StorageEstimate | undefined
    let quota: number | undefined
    let usage: number | undefined
    let persistentStorage = false

    try {
      storageEstimate = await navigator.storage.estimate()
      quota = storageEstimate.quota
      usage = storageEstimate.usage
      persistentStorage = await navigator.storage.persisted()
    } catch { /* ignore */ }

    // Test localStorage
    let localStorageOk = false
    try {
      localStorage.setItem('__fp_test', '1')
      localStorageOk = localStorage.getItem('__fp_test') === '1'
      localStorage.removeItem('__fp_test')
    } catch { /* ignore */ }

    // Test sessionStorage
    let sessionStorageOk = false
    try {
      sessionStorage.setItem('__fp_test', '1')
      sessionStorageOk = sessionStorage.getItem('__fp_test') === '1'
      sessionStorage.removeItem('__fp_test')
    } catch { /* ignore */ }

    // Test IndexedDB
    let indexedDBOk = false
    try {
      const req = indexedDB.open('__fp_test', 1)
      await new Promise<void>((res, rej) => {
        req.onsuccess = () => { indexedDBOk = true; req.result.close(); res() }
        req.onerror = () => rej()
        setTimeout(() => rej(), 500)
      })
      indexedDB.deleteDatabase('__fp_test')
    } catch { /* ignore */ }

    return {
      localStorage: localStorageOk,
      sessionStorage: sessionStorageOk,
      indexedDB: indexedDBOk,
      webSQL: !!(window as any).openDatabase,
      cookies: navigator.cookieEnabled,
      serviceWorker: 'serviceWorker' in navigator,
      cacheAPI: 'caches' in window,
      storageEstimate,
      quota,
      usage,
      persistentStorage,
    }
  }

  // ── WebRTC Leak
  async function collectWebRTCLeak(): Promise<WebRTCLeak> {
    const localIPs: string[] = []
    let ipv4Leaked = false, ipv6Leaked = false, mDNSEnabled = false

    try {
      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
      pc.createDataChannel('')

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 2000)
        pc.onicecandidate = (e) => {
          if (!e.candidate) { clearTimeout(timeout); resolve(); return }
          const cand = e.candidate.candidate

          // Parse IPs from SDP
          const ipv4 = cand.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/g) ?? []
          const ipv6 = cand.match(/([0-9a-f]{1,4}:){7}[0-9a-f]{1,4}/gi) ?? []
          const mdns = cand.match(/([a-f0-9-]+\.local)/gi) ?? []

          for (const ip of ipv4) {
            if (!localIPs.includes(ip)) { localIPs.push(ip); ipv4Leaked = true }
          }
          for (const ip of ipv6) {
            if (!localIPs.includes(ip)) { localIPs.push(ip); ipv6Leaked = true }
          }
          if (mdns.length > 0) mDNSEnabled = true
        }
      })

      pc.close()
    } catch { /* ignore */ }

    // Media devices
    let mediaDevices: WebRTCLeak['mediaDevices'] = []
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      mediaDevices = devices.map(d => ({
        kind: d.kind,
        label: d.label,
        deviceId: d.deviceId,
        groupId: d.groupId,
      }))
    } catch { /* ignore */ }

    return {
      localIPs,
      iceServersReachable: localIPs.length > 0,
      mediaDevices,
      supported: typeof RTCPeerConnection !== 'undefined',
      mDNSEnabled,
      ipv4Leaked,
      ipv6Leaked,
    }
  }

  // ── Permissions
  async function collectPermissions(): Promise<PermissionState[]> {
    const permNames = [
      'geolocation', 'notifications', 'push', 'midi', 'camera', 'microphone',
      'speaker', 'device-info', 'background-sync', 'bluetooth', 'persistent-storage',
      'ambient-light-sensor', 'accelerometer', 'gyroscope', 'magnetometer',
      'clipboard-read', 'clipboard-write', 'payment-handler', 'idle-detection',
      'periodic-background-sync', 'screen-wake-lock', 'nfc', 'display-capture',
      'window-management', 'local-fonts', 'storage-access',
    ]

    const results: PermissionState[] = []
    for (const name of permNames) {
      try {
        const status = await navigator.permissions.query({ name: name as PermissionName })
        results.push({ name, state: status.state })
      } catch {
        results.push({ name, state: 'unsupported' })
      }
    }
    return results
  }

  // ── Security Features
  function collectSecurityFeatures(): SecurityFeatures {
    return {
      trustedTypes: !!(window as any).trustedTypes,
      cspLevel: 3, // assume level 3 if we're running
      coep: window.crossOriginIsolated === true,
      coop: window.crossOriginIsolated === true,
      crossOriginIsolated: window.crossOriginIsolated === true,
      secureContext: window.isSecureContext,
      https: location.protocol === 'https:',
      hsts: location.protocol === 'https:',
      sriSupported: 'integrity' in HTMLScriptElement.prototype,
      cspNonce: !!(document.querySelector('meta[property="csp-nonce"]')),
    }
  }

  // ── Extension Detection
  function collectExtensionDetection(): ExtensionDetection {
    const detected: ExtensionDetection['detected'] = []
    const modifiedAPIs: string[] = []

    // Check for common extension artifacts
    const checks = [
      { name: 'uBlock Origin', check: () => document.getElementById('__facebook_connect__') !== null },
      { name: 'Privacy Badger', check: () => !!(window as any).__pbOriginTrials },
      { name: 'Grammarly', check: () => document.querySelector('grammarly-extension, grammarly-desktop-integration') !== null },
      { name: 'LastPass', check: () => document.getElementById('__lpform_') !== null },
      { name: 'Dashlane', check: () => !!(document.querySelector('[data-dashlane-rid]')) },
      { name: 'AdBlock', check: () => {
        const ad = document.createElement('div')
        ad.innerHTML = '&nbsp;'
        ad.className = 'adsbox pub_300x250 pub_300x250m pub_728x90 text-ad textAd text_ad text_ads text-ads text-ad-links'
        document.body.appendChild(ad)
        const blocked = ad.offsetHeight === 0
        document.body.removeChild(ad)
        return blocked
      }},
    ]

    for (const { name, check } of checks) {
      try {
        if (check()) detected.push({ name, confidence: 0.85, indicator: 'dom' })
      } catch { /* ignore */ }
    }

    // Check for modified native functions
    const nativeChecks = [
      ['navigator.webdriver', () => (navigator as any).__proto__.webdriver !== undefined],
      ['Function.prototype.toString', () => Function.prototype.toString.toString() !== 'function toString() { [native code] }'],
    ]

    for (const [api] of nativeChecks) {
      try {
        // Check if toString looks native
        const fn = (navigator as any)[api.split('.').pop()!]
        if (typeof fn === 'function') {
          const s = fn.toString()
          if (!s.includes('[native code]')) modifiedAPIs.push(api)
        }
      } catch { /* ignore */ }
    }

    return {
      detected,
      score: detected.length / 10,
      modifiedAPIs,
      injectedScripts: [],
      modifiedDOM: detected.length > 0,
    }
  }

  // ── DevTools Detection
  function collectDevToolsDetection(): DevToolsDetection {
    let open = false
    let method = 'none'

    // Width/height threshold
    const widthThreshold = window.outerWidth - window.innerWidth > 160
    const heightThreshold = window.outerHeight - window.innerHeight > 160

    if (widthThreshold || heightThreshold) {
      open = true
      method = 'size'
    }

    // Firebug
    const firebug = !!(window as any).Firebug?.chrome?.isInitialized

    // DevTools extension
    const devtoolsExtension = !!(window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__ ||
                              !!(window as any).__VUE_DEVTOOLS_GLOBAL_HOOK__

    // Console check
    let consoleModified = false
    try {
      const orig = console.log
      consoleModified = orig.toString().indexOf('[native code]') === -1
    } catch { /* ignore */ }

    // Timing attack
    const t0 = performance.now()
    debugger // eslint-disable-line no-debugger
    const dt = performance.now() - t0
    if (dt > 100) { open = true; method = 'debugger' }

    return { open, method, widthThreshold, heightThreshold, firebug, devtoolsExtension, consoleModified }
  }

  // ── Anti-Tamper Detection
  function collectAntiTamper(): AntiTamper {
    const suspiciousProperties: string[] = []

    // Check native function integrity
    const nativeFns = [
      ['navigator.userAgent', navigator, 'userAgent'],
      ['navigator.platform', navigator, 'platform'],
      ['navigator.languages', navigator, 'languages'],
      ['screen.width', screen, 'width'],
      ['screen.height', screen, 'height'],
    ]

    let nativeFunctionsIntact = true
    for (const [name, obj, prop] of nativeFns) {
      try {
        const desc = Object.getOwnPropertyDescriptor(obj as object, prop as string)
        if (desc && !desc.configurable && desc.get) {
          // Native getters are non-writable
        } else if (desc?.value !== undefined) {
          // Could be overridden
          suspiciousProperties.push(name as string)
        }
      } catch { /* ignore */ }
    }

    // Check prototype chain
    let prototypeIntact = true
    try {
      if (Object.getPrototypeOf(navigator) !== Navigator.prototype) {
        prototypeIntact = false
        suspiciousProperties.push('navigator.__proto__')
      }
    } catch { /* ignore */ }

    // Timing consistency
    const timings: number[] = []
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now()
      crypto.getRandomValues(new Uint8Array(1000))
      timings.push(performance.now() - t0)
    }
    const avgTiming = timings.reduce((a, b) => a + b) / timings.length
    const timingConsistent = timings.every(t => Math.abs(t - avgTiming) < avgTiming * 2)

    // Stack depth
    let stackDepthNormal = true
    try {
      function getStackDepth(depth: number): number {
        if (depth > 1000) return depth
        return getStackDepth(depth + 1)
      }
      // If no error at 1000 depth, something is wrong (proxy?)
    } catch { /* ignore */ }

    // Automation detection
    const automationDetected = !!(
      (navigator as any).webdriver ||
      (window as any).__selenium_evaluate ||
      (window as any).__webdriver_evaluate ||
      (window as any).__driver_evaluate ||
      (window as any).__webdriver_script_function ||
      (window as any).__webdriver_script_func ||
      (window as any).__webdriver_script_fn ||
      (window as any).__fxdriver_evaluate ||
      (window as any).__driver_unwrapped ||
      (window as any).__webdriver_unwrapped ||
      (window as any).__driver_evaluate ||
      (window as any).__selenium_unwrapped ||
      (window as any).__fxdriver_unwrapped ||
      (window as any).domAutomation ||
      (window as any).domAutomationController ||
      (window as any).phantom ||
      (window as any).callPhantom ||
      (window as any)._phantom ||
      (window as any).__nightmare ||
      (window as any).nightmare ||
      (window as any).Cypress
    )

    if (automationDetected) suspiciousProperties.push('automation_globals')

    return {
      prototypeIntact,
      nativeFunctionsIntact,
      timingConsistent,
      stackDepthNormal,
      suspiciousProperties,
      automationDetected,
    }
  }

  // ── Uniqueness Score
  function computeUniqueness(fp: Omit<FullFingerprint, 'uniqueness' | 'visitorId' | 'sessionId' | 'timestamp' | 'collectionDuration'>): FingerprintUniqueness {
    const contributions: FieldContribution[] = [
      { field: 'userAgent', value: fp.browser.userAgent, entropyBits: 8.5, contribution: 0.08 },
      { field: 'gpu.unmaskedRenderer', value: fp.gpu.unmaskedRenderer, entropyBits: 6.2, contribution: 0.07 },
      { field: 'canvas.hash', value: fp.canvas.hash, entropyBits: 9.1, contribution: 0.10 },
      { field: 'webgl.contextHash', value: fp.webgl.contextHash, entropyBits: 8.8, contribution: 0.09 },
      { field: 'audio.oscillatorHash', value: fp.audio.oscillatorHash, entropyBits: 5.7, contribution: 0.06 },
      { field: 'fonts.hash', value: fp.fonts.fingerprintHash, entropyBits: 7.9, contribution: 0.08 },
      { field: 'screen.resolution', value: `${fp.screen.width}x${fp.screen.height}x${fp.screen.colorDepth}`, entropyBits: 4.3, contribution: 0.04 },
      { field: 'screen.dpr', value: String(fp.screen.devicePixelRatio), entropyBits: 2.1, contribution: 0.02 },
      { field: 'timezone', value: fp.timezone.timezone, entropyBits: 5.2, contribution: 0.05 },
      { field: 'languages', value: fp.timezone.languages.join(','), entropyBits: 3.6, contribution: 0.03 },
      { field: 'hardwareConcurrency', value: String(fp.browser.hardwareConcurrency), entropyBits: 2.9, contribution: 0.02 },
      { field: 'deviceMemory', value: String(fp.browser.deviceMemory), entropyBits: 2.2, contribution: 0.02 },
      { field: 'plugins', value: fp.browser.plugins.map(p => p.name).join(','), entropyBits: 5.1, contribution: 0.05 },
      { field: 'webrtc.localIPs', value: fp.webrtc.localIPs.join(','), entropyBits: 6.8, contribution: 0.06 },
      { field: 'colorGamut', value: fp.screen.colorGamut, entropyBits: 1.8, contribution: 0.01 },
      { field: 'webgpu', value: String(fp.gpu.webgpuSupported), entropyBits: 1.5, contribution: 0.01 },
      { field: 'storage', value: [fp.storage.indexedDB, fp.storage.localStorage, fp.storage.sessionStorage].join(','), entropyBits: 1.2, contribution: 0.01 },
      { field: 'touch', value: `${fp.touch.supported}:${fp.touch.maxPoints}`, entropyBits: 2.0, contribution: 0.02 },
    ]

    const totalEntropy = contributions.reduce((s, c) => s + c.entropyBits, 0)
    const uniquenessPercent = Math.min(99.99, (1 - Math.pow(2, -totalEntropy / 2)) * 100)

    const allValues = contributions.map(c => c.value).join('|')
    const fingerprintHash = fnv1a(allValues)
    const stableValues = contributions.filter(c =>
      !['webrtc.localIPs'].includes(c.field)
    ).map(c => c.value).join('|')
    const stableHash = fnv1a(stableValues)
    const sessionHash = fnv1a(stableHash + Date.now().toString())

    let rarity: FingerprintUniqueness['rarity'] = 'common'
    if (uniquenessPercent > 99.9) rarity = 'unique'
    else if (uniquenessPercent > 99) rarity = 'very_rare'
    else if (uniquenessPercent > 95) rarity = 'rare'
    else if (uniquenessPercent > 80) rarity = 'uncommon'

    const populationEstimate = Math.max(1, Math.round(Math.pow(2, totalEntropy - 17))) // vs ~131k users

    return {
      totalScore: totalEntropy,
      entropyBits: totalEntropy,
      uniquenessPercent,
      rarity,
      fieldContributions: contributions,
      populationEstimate,
      fingerprintHash,
      stableHash,
      sessionHash,
    }
  }

  // ── Main Collection Orchestrator
  async function collect(): Promise<FullFingerprint> {
    isCollecting.value = true
    error.value = null
    const startTime = Date.now()
    progress.value.startTime = startTime

    try {
      // Init worker with SharedArrayBuffer if supported
      worker = new Worker(new URL('../workers/fingerprint.worker.ts', import.meta.url), { type: 'module' })

      if (typeof SharedArrayBuffer !== 'undefined') {
        sharedBuffer = new SharedArrayBuffer(8)
        progressArray = new Int32Array(sharedBuffer)
        worker.postMessage({ type: 'INIT', sharedBuffer })
      }

      // Worker error handler
      worker.onerror = (e) => { error.value = e.message }

      // ── Phase: Browser
      setProgress('browser', 5, 'Collecting browser information...')
      const browser = collectBrowserInfo()
      const os = collectOSInfo()

      // ── Phase: GPU
      setProgress('gpu', 15, 'Probing GPU and graphics APIs...')
      const gpu = await collectGPUInfo()

      // ── Phase: Canvas
      setProgress('canvas', 25, 'Rendering canvas fingerprint...')
      const canvas = await sendToWorker<any>({ type: 'COLLECT_CANVAS' })

      // ── Phase: WebGL
      setProgress('webgl', 35, 'Analyzing WebGL parameters...')
      const webgl = await sendToWorker<any>({ type: 'COLLECT_WEBGL' })

      // ── Phase: Audio
      setProgress('audio', 45, 'Capturing audio fingerprint...')
      const audio = await collectAudioFingerprint()

      // ── Phase: Fonts
      setProgress('fonts', 55, `Probing ${FONT_LIST.length} fonts...`)
      const fonts = await sendToWorker<any>({ type: 'COLLECT_FONTS', payload: { fontList: FONT_LIST } })

      // ── Phase: Network
      setProgress('network', 65, 'Detecting WebRTC leaks...')
      const [screen, timezone, touch, storage, webrtc, permissions] = await Promise.all([
        Promise.resolve(collectScreenInfo()),
        Promise.resolve(collectTimezoneLocale()),
        Promise.resolve(collectTouchInfo()),
        collectStorageInfo(),
        collectWebRTCLeak(),
        collectPermissions(),
      ])

      // ── Phase: Security
      setProgress('security', 80, 'Analyzing security features...')
      const security = collectSecurityFeatures()
      const extensions = collectExtensionDetection()
      const devtools = collectDevToolsDetection()
      const antiTamper = collectAntiTamper()

      // ── Phase: Analysis
      setProgress('analysis', 90, 'Computing fingerprint uniqueness...')

      const partial = {
        browser, os, gpu, canvas, webgl, audio, fonts,
        screen, timezone, touch, storage, webrtc, permissions,
        security, extensions, devtools, antiTamper,
      }

      const uniqueness = computeUniqueness(partial)

      const fp: FullFingerprint = {
        visitorId: generateId('v_'),
        sessionId: generateId('s_'),
        timestamp: new Date().toISOString(),
        collectionDuration: Date.now() - startTime,
        ...partial,
        uniqueness,
      }

      setProgress('complete', 100, 'Analysis complete')
      fingerprint.value = fp

      // Cleanup worker
      worker?.terminate()
      worker = null

      return fp
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      setProgress('error', 0, `Error: ${error.value}`)
      worker?.terminate()
      worker = null
      throw e
    } finally {
      isCollecting.value = false
    }
  }

  function reset() {
    fingerprint.value = null
    error.value = null
    progress.value = { phase: 'idle', percent: 0, message: 'Ready', startTime: 0, elapsed: 0 }
    worker?.terminate()
    worker = null
  }

  return {
    progress: readonly(progress),
    fingerprint: readonly(fingerprint),
    isCollecting: readonly(isCollecting),
    error: readonly(error),
    collect,
    reset,
  }
}
