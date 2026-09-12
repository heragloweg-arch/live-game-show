/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Core brand — Zatona cinematic dark gaming
        zatona: {
          50:  '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e', // Primary electric green
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
          950: '#052e16',
        },
        gold: {
          400: '#facc15',
          500: '#eab308',
          600: '#ca8a04',
        },
        surface: {
          900: '#0B0F1A', // Deepest background
          800: '#111827',
          700: '#1F2937',
          600: '#374151',
          500: '#4B5563',
        },
        neon: {
          cyan: '#22d3ee',
          purple: '#a855f7',
          pink: '#ec4899',
          lime: '#a3e635',
        }
      },
      fontFamily: {
        arabic: ['"IBM Plex Sans Arabic"', '"Noto Sans Arabic"', 'Tahoma', 'sans-serif'],
        display: ['"Cairo"', '"IBM Plex Sans Arabic"', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 20px rgba(34, 197, 94, 0.35)',
        'glow-gold': '0 0 24px rgba(234, 179, 8, 0.4)',
        'glow-lg': '0 0 40px rgba(34, 197, 94, 0.25)',
        card: '0 8px 32px rgba(0, 0, 0, 0.45)',
      },
      backgroundImage: {
        'radial-glow': 'radial-gradient(ellipse at center, rgba(34,197,94,0.12) 0%, transparent 70%)',
        'hero-gradient': 'linear-gradient(160deg, #0B0F1A 0%, #111827 40%, #0f172a 100%)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 4s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        }
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      }
    },
  },
  plugins: [],
};
