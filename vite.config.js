import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,        // expone en la red local (útil para probar en el celular)
    port: 5180,        // puerto dedicado a SNAPP (evita choques con otros proyectos)
    strictPort: true,  // si está ocupado, falla en vez de saltar de puerto
  },
})
