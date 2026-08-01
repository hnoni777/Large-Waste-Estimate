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
        importScripts: ['custom-sw.js']
      }
    })
  ],
  base: '/Large-Waste-Estimate/',
})
