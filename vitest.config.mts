import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: { alias: { "@": root, "server-only": `${root}tests/server-only-stub.ts`, "next/headers": `${root}tests/next-headers-stub.ts` } },
  test: { include: ["tests/**/*.test.ts"] },
});
