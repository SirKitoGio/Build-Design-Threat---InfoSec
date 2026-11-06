import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Vercel runs "vite build" from the repository root. The app lives in frontend/.
export default defineConfig({
  root: 'frontend',
  plugins: [react()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
})
