import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'

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
    vue()
  ],
})
