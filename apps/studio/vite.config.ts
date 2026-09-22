import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

const packagesRoot = path.resolve(__dirname, '../../packages')

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: /^@taiping\/content-model$/,
        replacement: path.join(packagesRoot, 'content-model/src/index.ts'),
      },
      {
        find: /^@taiping\/content-model\/(.*)$/,
        replacement: path.join(packagesRoot, 'content-model/src/$1'),
      },
      {
        find: /^@taiping\/shared-utils$/,
        replacement: path.join(packagesRoot, 'shared-utils/src/index.ts'),
      },
      {
        find: /^@taiping\/shared-utils\/(.*)$/,
        replacement: path.join(packagesRoot, 'shared-utils/src/$1'),
      },
      {
        find: /^@\/(.*)$/,
        replacement: path.resolve(__dirname, './src/$1'),
      },
    ],
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
