import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: { index: 'app.html' },
      output: { entryFileNames: 'assets/[name]-[hash].js' },
    },
    outDir: 'dist',
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
    open: '/app.html',
  },
})
