import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Vite MPA build for Quiz Builder without SSR.
// Outputs to dist/quizbuilder to mirror current deployment layout.
export default defineConfig({
  root: resolve(__dirname),
  base: './',
  publicDir: resolve(__dirname, 'public'),
  build: {
    outDir: resolve(__dirname, '../../dist/quizbuilder'),
    emptyOutDir: false,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        start: resolve(__dirname, 'quiz-builder-start.html'),
        login: resolve(__dirname, 'login.html'),
        instructor: resolve(__dirname, 'instructor.html'),
      },
    },
  },
  server: {
    port: 5175,
    open: '/quiz-builder-start.html',
  },
});
