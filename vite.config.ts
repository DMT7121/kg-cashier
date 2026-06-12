import { defineConfig } from 'vite';
import { resolve } from 'path';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss()
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  },
  server: {
    port: 3000,
    open: true,
    // CORS Proxy for CUKCUK API - routes /cukcuk-api/* to the central worker proxy
    proxy: {
      '/cukcuk-api': {
        target: 'https://kg-cukcuk-api.dmt-kgwork.workers.dev',
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
    sourcemap: true,
    // Multi-page: build both cashier (index.html) and staff (staff.html)
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        staff: resolve(__dirname, 'staff.html')
      }
    }
  }
});
