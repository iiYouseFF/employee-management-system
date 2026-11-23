import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return
          if (id.includes('recharts') || id.includes('d3-')) return 'charts'
          if (id.includes('@supabase')) return 'supabase'
          if (id.includes('react-router') || id.includes('react-dom') || id.includes('/react/')) return 'react'
          return 'vendor'
        },
      },
    },
  },
})
