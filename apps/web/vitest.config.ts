import { defineConfig } from 'vitest/config';

// Unit tests only; browser tests live in e2e/ and run with Playwright.
export default defineConfig({
  test: { include: ['src/**/*.test.{ts,tsx}'] },
});
