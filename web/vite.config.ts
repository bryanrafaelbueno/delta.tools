import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    // The backend answers CORS itself (the plugin sandbox is an opaque origin
    // and needs ACAO/CORP headers). Disable Vite's own CORS so it doesn't
    // intercept preflight OPTIONS requests.
    cors: false,
    proxy: {
      '/api': 'http://localhost:3001',
    },
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  optimizeDeps: {
    // @ffmpeg creates its worker with `new URL('./worker.js', import.meta.url)`;
    // pre-bundling breaks that URL, so keep it un-bundled.
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
});
