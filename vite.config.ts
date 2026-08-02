import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const buildHash = process.env.GITHUB_SHA?.slice(0, 7) || Date.now().toString(36);

export default defineConfig({
  base: '/game-dealer-gambit/',
  define: {
    __BUILD_HASH__: JSON.stringify(buildHash),
  },
  plugins: [
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: "Dealer's Gambit",
        short_name: 'Dealer',
        description: 'A case-elimination game of wits against an adaptive Dealer.',
        theme_color: '#0b0906',
        background_color: '#0b0906',
        display: 'standalone',
        orientation: 'any',
        start_url: '/game-dealer-gambit/',
        scope: '/game-dealer-gambit/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        navigateFallback: '/game-dealer-gambit/index.html',
      },
    }),
  ],
});
