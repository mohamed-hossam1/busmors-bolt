// CSS variables let the dashboard use its own palette without changing public pages.
const themeColor = (name, hex) => {
  const rgb = hex.match(/[a-f\d]{2}/gi).map((value) => parseInt(value, 16)).join(' ')
  return `rgb(var(--${name}, ${rgb}) / <alpha-value>)`
}

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      opacity: { 15: ".15", 35: ".35", 55: ".55", 65: ".65", 85: ".85" },
      colors: {
        cosmic: { deep: '#080911', canvas: '#171926', card: '#121520', raised: '#1b1d30', active: '#212936' },
        lavender: { canvas: '#edf0fe', alt: '#edf0fd', tint: '#eaeeff' },
        purple: { electric: '#6437fc', accent: '#6742d1', hover: '#5229db', focus: '#8f70ff', glow: 'rgba(100,55,252,.35)' },
        cyan: { electric: '#00b1ff' }, pink: { electric: '#ff3067' }, gold: { electric: '#e5b869' },
        slate: { structure: '#42516b' }, stage: { muted: '#bdc5e6', subtle: '#a6afd5' },
        primary: { DEFAULT: '#6437fc',
          50: themeColor('primary-50', '#f1edff'),
          100: themeColor('primary-100', '#e8e0ff'),
          200: themeColor('primary-200', '#d5c7ff'),
          300: themeColor('primary-300', '#b7a0ff'),
          400: themeColor('primary-400', '#8f70ff'),
          500: themeColor('primary-500', '#6437fc'),
          600: themeColor('primary-600', '#5229db'),
          700: themeColor('primary-700', '#4823bd'),
          800: themeColor('primary-800', '#381c90'),
          900: themeColor('primary-900', '#261655'),
        },
        accent: {
          50: themeColor('accent-50', '#eff9ff'),
          100: themeColor('accent-100', '#dbf0ff'),
          200: themeColor('accent-200', '#bfe2ff'),
          300: themeColor('accent-300', '#93ceff'),
          400: themeColor('accent-400', '#3dbbff'),
          500: themeColor('accent-500', '#1ea7f0'),
          600: themeColor('accent-600', '#0d84c9'),
          700: themeColor('accent-700', '#0a69a1'),
        },
        ink: {
          50: themeColor('ink-50', '#edf0fe'),
          100: themeColor('ink-100', '#e6e9f8'),
          200: themeColor('ink-200', '#d4daeb'),
          300: themeColor('ink-300', '#a8b2cb'),
          400: themeColor('ink-400', '#65738e'),
          500: themeColor('ink-500', '#53627c'),
          600: themeColor('ink-600', '#42516b'),
          700: themeColor('ink-700', '#303b51'),
          800: themeColor('ink-800', '#25283a'),
          900: themeColor('ink-900', '#171926'),
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px rgb(var(--shadow-color, 11 43 34) / 0.08), 0 4px 16px rgb(var(--shadow-color, 11 43 34) / 0.06)',
        lift: '0 4px 12px rgb(var(--shadow-color, 11 43 34) / 0.1), 0 8px 32px rgb(var(--shadow-color, 11 43 34) / 0.08)',
      },
      keyframes: {
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(100, 55, 252, 0.4)' },
          '70%': { boxShadow: '0 0 0 10px rgba(100, 55, 252, 0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(100, 55, 252, 0)' },
        },
        'dash-flow': {
          to: { strokeDashoffset: '-24' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'pulse-ring': 'pulse-ring 2s infinite',
        'fade-up': 'fade-up 0.3s ease-out both',
        'dash-flow': 'dash-flow 1s linear infinite',
      },
    },
  },
  plugins: [],
}
