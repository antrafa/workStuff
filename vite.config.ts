import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// Portas fora das padrões (5173/3001) para não colidir com outros projetos Vite/Express na máquina.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 5180,
    strictPort: true,
    proxy: { '/api': `http://127.0.0.1:${process.env.PORT ?? 3101}` },
  },
})
