import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// 完全ローカル・オフライン動作のPWA構成。
// 全アセットをService Workerでプリキャッシュし、電波のない現場でも起動できるようにする。
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: '消防立入検査チェックリスト',
        short_name: '立入検査',
        description: '消防立入検査チェックリスト作成ツール(完全ローカル動作)',
        lang: 'ja',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#ffffff',
        theme_color: '#b71c1c',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // ExcelJSを含むためバンドルが大きくなる。プリキャッシュ上限を引き上げる。
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
    }),
  ],
});
