import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
    open: true,
    // CORS Proxy for CUKCUK API - routes /cukcuk-api/* to graphapi.cukcuk.vn
    proxy: {
      '/cukcuk-api': {
        target: 'https://graphapi.cukcuk.vn',
        changeOrigin: true,
        rewrite: function(path) { return path.replace(/^\/cukcuk-api/, ''); },
        secure: true
      }
    }
  },
  build: {
    // Target older Chromium for Cốc Cốc browser compatibility
    target: 'es2015',
    // Ensure CSS is also compatible
    cssTarget: 'chrome61',
    // Generate sourcemaps for debugging
    sourcemap: true
  }
});
