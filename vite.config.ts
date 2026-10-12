import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// base must match the GitHub Pages project path (<org>.github.io/fell-in/) in production.
// Chunks: three, the R3F/drei layer and the engine get their own chunks so none passes ~800 KB.
export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/fell-in/' : '/',
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    chunkSizeWarningLimit: 800,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\/](react|react-dom|scheduler|zustand|use-sync-external-store)[\/]/, priority: 40 },
            { name: 'three', test: /node_modules[\/]three[\/]/, priority: 30 },
            { name: 'r3f', test: /node_modules[\/](@react-three|three-stdlib|three-mesh-bvh|camera-controls|maath|troika|@monogrid|meshline|stats|suspend-react|its-fine)/, priority: 20 },
            { name: 'engine', test: /src[\/]engine[\/]/, priority: 10 },
          ],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    testTimeout: 30000, // CI runners are slow
  },
}))
