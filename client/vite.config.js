import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // The client calls /api/* on its own origin; Vite forwards to the Express
    // server, so there is no CORS preflight in development and no base URL
    // baked into the bundle.
    proxy: {
      '/api': {
        // Override with API_PROXY when the server is on another port.
        target: process.env.API_PROXY || 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    // Split the vendor bundle so a change to app code does not invalidate
    // React and the router in the browser cache.
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          icons: ['lucide-react'],
        },
      },
    },
  },
});
