// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: true },

  modules: ['@pinia/nuxt', '@unocss/nuxt', '@vueuse/nuxt'],

  typescript: {
    strict: true,
    shim: false,
  },

  css: ['~/assets/css/main.css'],

  // Security headers for CSP, COOP, COEP
  routeRules: {
    '/**': {
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Resource-Policy': 'same-origin',
        'Content-Security-Policy': [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' https://cdnjs.cloudflare.com",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src 'self' https://fonts.gstatic.com",
          "worker-src 'self' blob:",
          "img-src 'self' data: blob:",
          "connect-src 'self' ws://localhost:3001 http://localhost:3001",
        ].join('; '),
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
      },
    },
  },

  nitro: {
    experimental: {
      wasm: true,
    },
  },

  vite: {
    optimizeDeps: {
      exclude: ['monaco-editor'],
    },
    worker: {
      format: 'es',
    },
    build: {
      target: 'esnext',
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
    },
  },

  app: {
    head: {
      title: 'Browser Fingerprint Analyzer',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      ],
      link: [
        {
          rel: 'preconnect',
          href: 'https://fonts.googleapis.com',
        },
        {
          rel: 'preconnect',
          href: 'https://fonts.gstatic.com',
          crossorigin: '',
        },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Space+Mono:ital,wght@0,400;0,700;1,400&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300&display=swap',
        },
      ],
    },
  },
})
