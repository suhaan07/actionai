/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: { DEFAULT: '#F2EEE5', 2: '#E9E3D6', 3: '#FBF9F4' },
        ink: { DEFAULT: '#141210', 2: '#4B463F', 3: '#8A8377', 4: '#2A2723' },
        line: { DEFAULT: '#D9D1C1', 2: '#C6BCA8' },
        chalk: { DEFAULT: '#F4F1EA', 2: '#A9A397', 3: '#6E695F' },
        tally: '#FF2E1F',
        fit: { low: '#DC4A32', mid: '#E0A01B', high: '#2D9A5A' },
      },
      fontFamily: {
        display: ['"Big Shoulders Display"', 'Impact', 'sans-serif'],
        sans: ['"Instrument Sans"', 'system-ui', 'sans-serif'],
        serif: ['"Instrument Serif"', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 0 rgba(20,18,16,0.06), 0 8px 24px -12px rgba(20,18,16,0.18)',
        slate: '0 2px 0 rgba(20,18,16,0.5), 0 30px 60px -30px rgba(20,18,16,0.55)',
      },
    },
  },
  plugins: [],
}
