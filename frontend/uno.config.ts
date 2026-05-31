import {
  defineConfig,
  presetAttributify,
  presetIcons,
  presetUno,
  presetWind,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss'

export default defineConfig({
  presets: [
    presetUno(),
    presetWind(),
    presetAttributify(),
    presetIcons({
      scale: 1.2,
      warn: true,
    }),
  ],
  transformers: [transformerDirectives(), transformerVariantGroup()],
  theme: {
    colors: {
      bg: {
        base: '#050709',
        surface: '#0c0f14',
        elevated: '#121620',
        overlay: '#1a2030',
      },
      accent: {
        cyan: '#00d4ff',
        green: '#00ff88',
        red: '#ff3366',
        amber: '#ffb800',
        purple: '#9945ff',
      },
      border: {
        subtle: 'rgba(255,255,255,0.06)',
        DEFAULT: 'rgba(255,255,255,0.10)',
        strong: 'rgba(255,255,255,0.18)',
      },
      text: {
        primary: '#e8eaf0',
        secondary: '#8892a4',
        muted: '#4a5568',
        accent: '#00d4ff',
      },
    },
    fontFamily: {
      mono: ['Space Mono', 'Fira Code', 'monospace'],
      sans: ['DM Sans', 'system-ui', 'sans-serif'],
    },
    animation: {
      'scan': 'scan 3s linear infinite',
      'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
      'float': 'float 6s ease-in-out infinite',
      'grid-flow': 'gridFlow 20s linear infinite',
      'entropy-spin': 'entropySpin 8s linear infinite',
    },
    keyframes: {
      scan: {
        '0%': { transform: 'translateY(-100%)' },
        '100%': { transform: 'translateY(100vh)' },
      },
      pulseGlow: {
        '0%, 100%': { boxShadow: '0 0 8px rgba(0,212,255,0.3)' },
        '50%': { boxShadow: '0 0 24px rgba(0,212,255,0.7), 0 0 48px rgba(0,212,255,0.3)' },
      },
      float: {
        '0%, 100%': { transform: 'translateY(0px)' },
        '50%': { transform: 'translateY(-10px)' },
      },
      gridFlow: {
        '0%': { backgroundPosition: '0 0' },
        '100%': { backgroundPosition: '40px 40px' },
      },
      entropySpin: {
        '0%': { transform: 'rotate(0deg)' },
        '100%': { transform: 'rotate(360deg)' },
      },
    },
  },
  shortcuts: {
    'panel': 'bg-bg-surface border border-border rounded-lg p-4',
    'panel-elevated': 'bg-bg-elevated border border-border-strong rounded-xl p-5',
    'glow-cyan': 'shadow-[0_0_20px_rgba(0,212,255,0.3)]',
    'glow-green': 'shadow-[0_0_20px_rgba(0,255,136,0.3)]',
    'glow-red': 'shadow-[0_0_20px_rgba(255,51,102,0.3)]',
    'badge': 'inline-flex items-center px-2 py-0.5 rounded text-xs font-mono',
    'btn-ghost': 'px-3 py-1.5 rounded border border-border text-text-secondary hover:border-border-strong hover:text-text-primary transition-all duration-200',
    'metric-value': 'font-mono text-2xl font-bold text-text-primary',
    'metric-label': 'text-xs font-mono text-text-muted uppercase tracking-widest',
    'section-header': 'flex items-center gap-2 mb-4 pb-2 border-b border-border',
    'section-title': 'font-mono text-sm font-bold text-text-accent uppercase tracking-wider',
    'data-row': 'flex items-start justify-between py-2 border-b border-border/50 last:border-0',
    'data-key': 'font-mono text-xs text-text-muted w-40 shrink-0',
    'data-val': 'font-mono text-xs text-text-primary text-right break-all',
  },
})
