import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * pdf.js が PDF 表示時に読み込む補助ファイル(日本語フォント対応表・標準フォント・画像デコーダ)を
 * dist/pdfjs/ に出力する。プリキャッシュ対象にしてオフラインでも日本語PDFを表示できるようにする。
 */
const PDFJS_DIR = 'node_modules/pdfjs-dist';
const PDFJS_ASSET_DIRS = ['cmaps', 'standard_fonts', 'wasm', 'iccs'];
// フォームのJavaScript実行用(使用しない)は除外
const PDFJS_EXCLUDE = /^quickjs/;

function pdfjsAssets(): Plugin {
  const files = () =>
    PDFJS_ASSET_DIRS.flatMap((dir) =>
      readdirSync(join(PDFJS_DIR, dir))
        .filter((f) => !PDFJS_EXCLUDE.test(f) && statSync(join(PDFJS_DIR, dir, f)).isFile())
        .map((f) => ({ src: join(PDFJS_DIR, dir, f), out: `pdfjs/${dir}/${f}` })),
    );
  return {
    name: 'pdfjs-assets',
    // 開発サーバー:/pdfjs/... を node_modules から配信
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = req.url?.match(/\/pdfjs\/([^?]+)/);
        const hit = m && files().find((f) => f.out === `pdfjs/${decodeURIComponent(m[1])}`);
        if (!hit) return next();
        res.setHeader('Content-Type', hit.out.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream');
        res.end(readFileSync(hit.src));
      });
    },
    // ビルド:dist/pdfjs/ に出力
    generateBundle() {
      for (const f of files()) this.emitFile({ type: 'asset', fileName: f.out, source: readFileSync(f.src) });
    },
  };
}

// 完全ローカル・オフライン動作のPWA構成。
// 全アセットをService Workerでプリキャッシュし、電波のない現場でも起動できるようにする。
export default defineConfig({
  base: './',
  // ExcelJS・pdf.js は使用時に遅延読み込みし、Service Workerでプリキャッシュする
  build: { chunkSizeWarningLimit: 1500 },
  plugins: [
    react(),
    pdfjsAssets(),
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
        globPatterns: [
          '**/*.{js,mjs,css,html,svg,png,jpg,jpeg,webp,woff2}',
          // pdf.js の補助ファイル
          'pdfjs/**/*.{bcmap,pfb,ttf,wasm,icc}',
        ],
        // ExcelJS・pdf.js のワーカーを含むためプリキャッシュ上限を引き上げる
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
    }),
  ],
});
