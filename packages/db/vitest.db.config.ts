import { defineConfig } from "vitest/config";

/**
 * I test che girano su un Postgres vero (DATABASE_ADMIN_URL), separati da
 * quelli puri di `pnpm test`: `pnpm test:db`.
 */
export default defineConfig({
  test: {
    include: ["tests/**/*.dbtest.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
