import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
    open: true
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
