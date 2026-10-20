/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0faf7',
          100: '#d9f2e8',
          200: '#b3e5d2',
          300: '#7dd3b7',
          400: '#3dbb94',
          500: '#1cdcab',
          600: '#118467',
          700: '#0e6f57',
          800: '#0b5744',
          900: '#0b2b22',
        },
        accent: {
          50: '#eff9ff',
          100: '#dbf0ff',
          200: '#bfe2ff',
          300: '#93ceff',
          400: '#3dbbff',
          500: '#1ea7f0',
          600: '#0d84c9',
          700: '#0a69a1',
        },
        ink: {
          50: '#f7f9fc',
          100: '#eef2f0',
          200: '#e5e9e7',
          300: '#dde2dd',
          400: '#9aa8a2',
          500: '#5b6b66',
          600: '#4a5a54',
          700: '#36443f',
          800: '#23292f',
          900: '#141a17',
        },
      },
      fontFamily: {
        sans: ['Ubuntu', 'Helvetica', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(11, 43, 34, 0.08), 0 4px 16px rgba(11, 43, 34, 0.06)',
        lift: '0 4px 12px rgba(11, 43, 34, 0.1), 0 8px 32px rgba(11, 43, 34, 0.08)',
      },
      keyframes: {
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(28, 220, 171, 0.4)' },
          '70%': { boxShadow: '0 0 0 10px rgba(28, 220, 171, 0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(28, 220, 171, 0)' },
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
