import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: true
      },
      manifest: {
        name: '폐가구 처리 매니저',
        short_name: '폐가구',
        description: '폐가구 수거 및 공유 플랫폼',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: 'waste_app_icon_192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'waste_app_icon_512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        importScripts: ['custom-sw.js'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/(?:i\.)?ibb\.co\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'imgbb-images-cache',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 7 // 7일간 보관
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    })
  ],
  base: '/Large-Waste-Estimate/',
})
