/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ivory: {
          50: '#FCFBF8',
          100: '#F8F6F0',
          200: '#F2EFE8',
          300: '#E7E2D6',
        },
        cognac: {
          50: '#FDF8F3',
          100: '#F9EDE0',
          200: '#F2D7BF',
          400: '#B87A3E',
          500: '#9C6A36',
          600: '#8E5D2A',
          700: '#73481D',
          800: '#5A3716',
          900: '#3D240E',
        },
        champagne: {
          border: 'rgba(180, 150, 110, 0.22)',
          'border-subtle': 'rgba(180, 150, 110, 0.12)',
          light: '#F4EDE2',
        }
      },
      fontFamily: {
        serif: ['Georgia', 'Cambria', '"Times New Roman"', 'serif'],
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        'card': '0 2px 12px rgba(142, 93, 42, 0.05), 0 1px 3px rgba(0, 0, 0, 0.02)',
        'card-hover': '0 8px 24px rgba(142, 93, 42, 0.09), 0 2px 6px rgba(0, 0, 0, 0.03)',
      }
    },
  },
  plugins: [],
};
