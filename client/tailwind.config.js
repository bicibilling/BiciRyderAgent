/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html"
  ],
  theme: {
    extend: {
      colors: {
        'bici-black': '#000000',
        'bici-blue': '#91C9E9',
        'bici-gray': '#F2F2F2',
        'bici-text': '#666666',
        'bici-muted': '#999999'
      },
      fontFamily: {
        'bici': ['"Neue Haas Unica"', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif']
      }
    }
  },
  plugins: []
}