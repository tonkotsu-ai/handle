import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import path from "path"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [tailwindcss(), react()],
  root: "demo",
  resolve: {
    alias: [{ find: /^~(.+)/, replacement: path.resolve(__dirname, "$1") }]
  }
})
