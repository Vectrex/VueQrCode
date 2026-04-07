import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  build: {
    lib: {
      entry: ['src/lib.js'],
      name: 'qrCodeGenerator',
      fileName: format => `qrcg.${format}.js`,
    },
  },
  plugins: [
    tailwindcss(),
  ],
})
