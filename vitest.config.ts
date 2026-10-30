import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/unit/**/*.test.ts", "tests/routes/**/*.test.ts"],
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "server-only": path.resolve("./tests/empty.ts"),
      "@": path.resolve("."),
    },
  },
});
