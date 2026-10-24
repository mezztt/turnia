import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Turnia · by Mezztt
export default defineConfig({
  plugins: [react()],
  server: { port: 5178 },
  preview: { port: 5178 },
})
