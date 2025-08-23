/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Bici brand colors extracted from website
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#2B5AA0', // Main Bici blue
          600: '#1e40af',
          700: '#1d4ed8',
          800: '#1e3a8a',
          900: '#1e3a8a',
        },
        secondary: {
          500: '#4A90A4', // Secondary Bici blue-green
          600: '#0891b2',
        },
        neutral: {
          50: '#F8F9FA',
          100: '#f3f4f6',
          200: '#e5e7eb',
          500: '#6b7280',
          600: '#4b5563',
          700: '#374151',
          800: '#1f2937',
          900: '#2C2C2C', // Bici dark gray
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'bounce-gentle': 'bounce 2s ease-in-out infinite',
      }
    },
  },
  plugins: [],
}