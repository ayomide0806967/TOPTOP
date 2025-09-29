import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['apps/**/*.{test,spec}.js'],
    exclude: ['node_modules', 'apps/**/dist/**'],
    coverage: {
      enabled: false,
    },
  },
});
