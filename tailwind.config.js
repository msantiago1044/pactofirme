/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          900: '#042f2c',
          700: '#0b4a44',
          500: '#preserve'
        },
        notary: {
          ink: '#042f2c',
          inkLight: '#0b4a44',
          paper: '#f8fafc',
          paperWarm: '#fdfbf6',
          gold: '#a8762f',
          goldLight: '#c99a4f',
          alert: '#9a2e2e',
          line: '#d8d2c4'
        }
      },
      fontFamily: {
        serif: ['"Source Serif 4"', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace']
      },
      borderRadius: {
        none: '0px',
        seal: '50%'
      },
      keyframes: {
        stampIn: {
          '0%': { transform: 'scale(2.2) rotate(-18deg)', opacity: '0' },
          '60%': { transform: 'scale(0.95) rotate(-8deg)', opacity: '1' },
          '100%': { transform: 'scale(1) rotate(-6deg)', opacity: '1' }
        },
        inkReveal: {
          '0%': { clipPath: 'inset(0 100% 0 0)' },
          '100%': { clipPath: 'inset(0 0 0 0)' }
        }
      },
      animation: {
        stamp: 'stampIn 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
        ink: 'inkReveal 0.6s ease-out forwards'
      }
    }
  },
  plugins: []
};
