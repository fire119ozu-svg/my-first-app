import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * pdf.js が PDF 表示時に読み込む補助ファイル(日本語フォント対応表・標準フォント・画像デコーダ)を
 * dist/pdfjs/<版>/ に出力する。
 *
 * これらは初回インストール時には読み込まず、「参考資料」を初めて開いたときに manifest.json に
 * 列挙したファイルをまとめて取得し、以後はオフラインでも使えるようにする(runtimeCaching)。
 */
const PDFJS_DIR = 'node_modules/pdfjs-dist';
const PDFJS_VERSION: string = JSON.parse(readFileSync(join(PDFJS_DIR, 'package.json'), 'utf8')).version;
const PDFJS_ASSET_DIRS = ['cmaps', 'standard_fonts', 'wasm', 'iccs'];
// フォームのJavaScript実行用(使用しない)は除外
const PDFJS_EXCLUDE = /^quickjs|^LICENSE/;
/** 事前取得する CMap は日本語関係のみ(中国語・韓国語用は必要時に取得) */
const JAPANESE_CMAP = /JIS|RKSJ|90m|90p|83pv|EUC|Ext|Japan1|^[HV]\.bcmap$|^Add-|NWP|Hankaku|Hiragana|Katakana|Roman|WP-Symbol/;

function pdfjsAssets(): Plugin {
  const base = `pdfjs/${PDFJS_VERSION}`;
  const files = () =>
    PDFJS_ASSET_DIRS.flatMap((dir) =>
      readdirSync(join(PDFJS_DIR, dir))
        .filter((f) => !PDFJS_EXCLUDE.test(f) && statSync(join(PDFJS_DIR, dir, f)).isFile())
        .map((f) => ({ src: join(PDFJS_DIR, dir, f), out: `${base}/${dir}/${f}`, rel: `${dir}/${f}` })),
    );
  const prefetch = () => files().filter((f) => !f.rel.startsWith('cmaps/') || JAPANESE_CMAP.test(f.rel.slice(6)));
  return {
    name: 'pdfjs-assets',
    // 開発サーバー:/pdfjs/... を node_modules から配信
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = req.url?.match(/\/(pdfjs\/[^?]+)/);
        const path = m && decodeURIComponent(m[1]);
        if (path === `${base}/manifest.json`) {
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ version: PDFJS_VERSION, files: prefetch().map((f) => f.rel) }));
        }
        const hit = path && files().find((f) => f.out === path);
        if (!hit) return next();
        res.setHeader('Content-Type', hit.out.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream');
        res.end(readFileSync(hit.src));
      });
    },
    // ビルド:dist/pdfjs/ に出力
    generateBundle() {
      for (const f of files()) this.emitFile({ type: 'asset', fileName: f.out, source: readFileSync(f.src) });
      this.emitFile({
        type: 'asset',
        fileName: `${base}/manifest.json`,
        source: JSON.stringify({ version: PDFJS_VERSION, files: prefetch().map((f) => f.rel) }),
      });
    },
  };
}

// 完全ローカル・オフライン動作のPWA構成。
// 全アセットをService Workerでプリキャッシュし、電波のない現場でも起動できるようにする。
export default defineConfig({
  base: './',
  define: { __PDFJS_VERSION__: JSON.stringify(PDFJS_VERSION) },
  // ExcelJS(プリキャッシュ)・pdf.js(参考資料を開いたときに取得)は使用時に遅延読み込みする
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
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,jpg,jpeg,webp,woff2}'],
        // pdf.js 一式(約2MB)は初回インストールに含めず、参考資料を開いたときに取得する
        globIgnores: ['pdfjs/**', 'assets/pdf-*.js', 'assets/pdf.worker*.mjs'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.pathname.includes('/pdfjs/') || /\/assets\/pdf(\.worker\.min)?-[\w-]+\.m?js$/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'pdfjs',
              expiration: { maxEntries: 400 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
        // ExcelJS を含むためプリキャッシュ上限を引き上げる
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
    }),
  ],
});
