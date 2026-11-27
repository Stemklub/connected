import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages servira aplikaciju na /<ime-repoa>/. Workflow postavlja VITE_BASE iz imena repoa.
const base = process.env.VITE_BASE ?? '/connected/'

export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? base : '/',
  plugins: [react()],
  build: { sourcemap: false, chunkSizeWarningLimit: 900 },
}))
