/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Deep institutional navy — the base of the interface.
        navy: {
          50: '#f1f5f9',
          100: '#e2e8f0',
          200: '#c7d2e0',
          300: '#9aacc4',
          400: '#6b81a3',
          500: '#4a6285',
          600: '#374d6b',
          700: '#2b3d56',
          800: '#1e2c40',
          900: '#141e2e',
          950: '#0b1220',
        },
        // Cooperative green — ownership, verification, worker-positive numbers.
        coop: {
          50: '#eefbf3',
          100: '#d6f5e2',
          200: '#b0eac9',
          300: '#7bd9a8',
          400: '#44c082',
          500: '#1fa565',
          600: '#128551',
          700: '#0f6a43',
          800: '#105437',
          900: '#0e462f',
        },
        // Saffron — emergencies, surge, calls to action.
        saffron: {
          50: '#fff8ed',
          100: '#ffefd4',
          200: '#ffdba8',
          300: '#ffc170',
          400: '#ff9f37',
          500: '#fb8210',
          600: '#ec6606',
          700: '#c44b07',
          800: '#9c3b0e',
          900: '#7e330f',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(11,18,32,.04), 0 4px 16px rgba(11,18,32,.06)',
        lift: '0 4px 12px rgba(11,18,32,.08), 0 16px 40px rgba(11,18,32,.10)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(.8)', opacity: '.7' },
          '100%': { transform: 'scale(2.2)', opacity: '0' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-up': 'fade-up .3s ease-out both',
        'pulse-ring': 'pulse-ring 2s cubic-bezier(.4,0,.6,1) infinite',
      },
    },
  },
  plugins: [],
};
