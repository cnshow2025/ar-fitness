/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';

// GitHub Pages 部署時由 workflow 設定 BASE_PATH（例如 /Reader/），本機開發用 /。
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  build: {
    target: 'es2020',
    sourcemap: false,
  },
  server: {
    port: 5173,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
