import { defineConfig } from "wxt";
import pkg from "./package.json";

export default defineConfig({
  srcDir: "src",
  browser: "firefox",
  manifestVersion: 2,
  outDir: "dist",
  outDirTemplate: ".",
  manifest: {
    name: "Hashway",
    short_name: "Hashway",
    version: pkg.version,
    description: "Send torrent intents to Real-Debrid (hello-world setup phase).",
    browser_action: {
      default_title: "Hashway",
    },
    browser_specific_settings: {
      gecko: {
        id: "hashway@hashway.local",
        strict_min_version: "115.0",
        data_collection_permissions: {
          required: ["none"],
        },
      },
    },
    permissions: [
      "contextMenus",
      "notifications",
      "activeTab",
      "storage",
      "downloads",
      "https://api.real-debrid.com/*",
    ],
    options_ui: {
      page: "options.html",
      open_in_tab: false,
    },
  },
  alias: {
    "@domain": "src/domain",
    "@application": "src/application",
    "@ports": "src/ports",
    "@adapters": "src/adapters",
    "@entrypoints": "src/entrypoints",
    "@tests": "tests",
  },
});
