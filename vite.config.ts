import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

const LOVABLE_CLOUD_URL = "https://dthfndbduiclposwocux.supabase.co";
const LOVABLE_CLOUD_PUBLISHABLE_KEY = "sb_publishable_h79CN10Gwwyv4IX9FLsaWw_E7WBUHAD";
const LOVABLE_CLOUD_PROJECT_ID = "dthfndbduiclposwocux";

export default defineConfig({
  vite: {
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? LOVABLE_CLOUD_URL),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY ?? LOVABLE_CLOUD_PUBLISHABLE_KEY),
      "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(process.env.VITE_SUPABASE_PROJECT_ID ?? process.env.SUPABASE_PROJECT_ID ?? LOVABLE_CLOUD_PROJECT_ID),
      "process.env.PEPPER_SECRET": JSON.stringify(process.env.PEPPER_SECRET),
    },
    plugins: [
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: null,
        filename: "sw.js",
        devOptions: { enabled: false },
        manifest: false,
        workbox: {
          navigateFallback: "/",
          navigateFallbackDenylist: [/^\/api\//, /^\/~oauth/, /^\/_/],
          globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
          runtimeCaching: [
            {
              urlPattern: ({ request }) => request.mode === "navigate",
              handler: "NetworkFirst",
              options: { cacheName: "html-pages", networkTimeoutSeconds: 4 },
            },
            {
              urlPattern: ({ url }) => url.origin === self.location.origin && /\.(?:js|css|woff2|svg|png|ico)$/.test(url.pathname),
              handler: "CacheFirst",
              options: { cacheName: "static-assets", expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 } },
            },
          ],
        },
      }),
    ],
  },
});
