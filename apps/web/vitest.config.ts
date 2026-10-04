import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * I test puri dell'app (tests/*.test.ts): la logica delle action tenuta
 * in funzioni senza database. "server-only" diventa un modulo vuoto, così
 * si possono importare anche i file che lo dichiarano.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
