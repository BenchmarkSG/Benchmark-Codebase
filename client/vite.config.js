import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 'prompt', not 'autoUpdate': a new deployment must never reload the page
      // out from under someone mid-form. components/UpdatePrompt.jsx registers
      // the worker and offers the refresh instead — hence injectRegister: null,
      // so the plugin doesn't also inject its own registration script.
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: ['favicon-64.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'FeeOptima — Stop Overpaying Your Bank',
        short_name: 'FeeOptima',
        description:
          'Instantly benchmark your bank against the best options in Singapore & SEA for mortgages, loans, FX, deposits and more.',
        id: '/',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait-primary',
        theme_color: '#1d63c4',
        background_color: '#ffffff',
        categories: ['finance', 'business', 'productivity'],
        // `display_override` lets a desktop install drop the browser chrome
        // entirely, falling back through the list on anything that can't.
        display_override: ['standalone', 'minimal-ui'],
        // 'any' is the default purpose, so the bare 512 entry already covered
        // it — the duplicate third entry did nothing. Maskable icons are listed
        // at both densities so Android doesn't upscale the 512 on mdpi launchers.
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'pwa-maskable-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Long-press / right-click the installed icon. Both land inside `scope`;
        // the hash router resolves them the same way a normal link would.
        shortcuts: [
          {
            name: 'My dashboard', short_name: 'Dashboard',
            description: 'Your saved benchmarks, savings and next steps',
            url: '/#dashboard',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Run a benchmark', short_name: 'Benchmark',
            description: 'Compare your bank against the market',
            url: '/#calculator',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        // SPA fallback so client routes work offline, but never intercept the API.
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api/],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Bank logos & app images — serve fast, refresh in background.
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'images',
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 30 },
              // Cross-origin images (Supabase avatars, advisor photos) come back
              // opaque with status 0. Naming both keeps them cacheable while
              // still rejecting 4xx/5xx, which would otherwise be stored and
              // then re-served as a broken image for the next 30 days.
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Rate/reference API — prefer fresh data, fall back to cache offline.
            // Payment/session state must NEVER be served stale (a cached "paid"
            // verdict could unlock content offline), so /api/checkout/* is excluded.
            urlPattern: ({ url }) => url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/checkout'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        // Service worker DISABLED in `npm run dev` — it was caching stale JS/CSS
        // and hiding live edits. The PWA still works fully in the production build;
        // test installability with `npm run build && npm run preview`.
        enabled: false,
        type: 'module',
        navigateFallback: 'index.html',
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
