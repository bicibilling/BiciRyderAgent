import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    hmr: {
      overlay: false, // Disable error overlay that might cause refreshes
      clientPort: 3000,
    },
    watch: {
      ignored: ['**/node_modules/**', '**/dist/**', '**/build/**'], // Don't watch these directories
      usePolling: false, // Disable polling which can cause issues
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
})