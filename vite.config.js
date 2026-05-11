import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// En producción (build) la app vive en /websys/ (GitHub Pages del repo websys).
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/websys/' : '/',
  plugins: [react()],
  server: {
    port: 8080,
  },
}))
