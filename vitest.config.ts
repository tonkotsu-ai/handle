import path from "path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["shared/src/**/*.test.{ts,tsx}", "ext/__tests__/**/*.test.{ts,tsx}"],
    css: false,
  },
  resolve: {
    alias: [
      // WXT ~ alias maps to ext/ root
      { find: /^~(.+)/, replacement: path.resolve(__dirname, "ext/$1") },
    ],
  },
})
