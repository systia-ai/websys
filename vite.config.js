import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// En producción (build) la app vive en /websys/ (GitHub Pages del repo websys).
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/websys/' : '/',
  plugins: [react()],
  server: {
    port: 8080,
    // Abre Google Chrome (no el navegador integrado de Cursor) al hacer npm run dev.
    open: process.platform === 'win32' ? { app: { name: 'chrome' } } : true,
  },
}))
