import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["benchmarks/runners/**/*.bench.ts"],
    exclude: ["**/vitest.config.*"],
    testTimeout: 120_000, // embeddings can be slow on first run
    pool: "forks", // isolate each file to avoid singleton conflicts
    benchmark: {
      include: ["benchmarks/runners/**/*.bench.ts"],
      exclude: ["**/vitest.config.*"],
    },
  },
});
