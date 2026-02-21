import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    global: 'globalThis',
  },
  resolve: {
    alias: {
      path: 'path-browserify',
    },
  },
  optimizeDeps: {
    include: ['@uipath/uipath-typescript'],
  },
  server: {
    port: 5173,
    proxy: {
      // Replace '/your-org' with your actual organization
      '/uipathlabs': {
        target: 'https://staging.uipath.com',
        changeOrigin: true,
        secure: true,
      },
    },
  }
})
