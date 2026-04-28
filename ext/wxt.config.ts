import tailwindcss from "@tailwindcss/vite"
import path from "path"
import { defineConfig } from "wxt"

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    host_permissions: ["https://*/*", "http://localhost/*"],
    permissions: ["sidePanel", "scripting", "contextMenus", "storage"],
    icons: { "128": "icon.png" },
    action: { default_title: "Open Side Panel" },
    side_panel: { default_path: "sidepanel.html" }
  },
  vite: () => ({
    plugins: [tailwindcss()],
    resolve: {
      alias: [{ find: /^~(.+)/, replacement: path.resolve(__dirname, "$1") }]
    }
  })
})
