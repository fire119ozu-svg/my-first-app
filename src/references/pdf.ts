/**
 * pdf.js の読み込み。古いiPhoneでも動くよう legacy ビルドを使う。
 *
 * pdf.js 一式(約2MB)は初回インストールに含めない。「参考資料」を初めて開いたときに
 * ensurePdfSupport() でまとめて取得し、Service Worker のキャッシュに保存してオフラインでも使えるようにする。
 */
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';

export type { PDFDocumentProxy };

/** 表示を終えたら呼んでメモリを解放する */
export function closePdf(doc: PDFDocumentProxy): void {
  void doc.loadingTask.destroy();
}

let lib: Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs')> | null = null;

function pdfjs() {
  lib ??= import('pdfjs-dist/legacy/build/pdf.mjs').then(
    (m) => {
      m.GlobalWorkerOptions.workerSrc = workerUrl;
      return m;
    },
    (e: unknown) => {
      lib = null; // 電波が戻ったら再試行できるようにする
      throw e;
    },
  );
  return lib;
}

/** 補助ファイルの場所(GitHub Pages のサブパス配下でも動くようページ基準。版ごとに別フォルダ) */
const assetBase = () => new URL(`pdfjs/${__PDFJS_VERSION__}/`, document.baseURI).href;
const asset = (dir: string) => `${assetBase()}${dir}/`;

/** 取得済みか(キャッシュにあるか)。Service Worker が無い環境では常に未取得扱い */
async function cached(url: string): Promise<boolean> {
  return typeof caches !== 'undefined' && (await caches.match(url)) !== undefined;
}

/**
 * PDF表示に必要なファイルを揃える。取得済みのものは通信しない。
 * Service Worker が CacheFirst で保存するため、揃った後はオフラインでも表示できる。
 * @param onProgress 取得が必要なときだけ 0〜1 で呼ばれる
 */
export async function ensurePdfSupport(onProgress?: (ratio: number) => void): Promise<void> {
  const manifestUrl = `${assetBase()}manifest.json`;
  const manifest = (await (await fetch(manifestUrl)).json()) as { files: string[] };
  const urls = [new URL(workerUrl, document.baseURI).href, ...manifest.files.map((f) => assetBase() + f)];
  const missing: string[] = [];
  for (const u of urls) if (!(await cached(u))) missing.push(u);

  let done = 0;
  const total = missing.length + 1; // +1 は本体
  const step = () => onProgress?.(++done / total);
  if (missing.length > 0) onProgress?.(0);

  await pdfjs();
  if (missing.length > 0) step();
  // 同時に6件ずつ取得する
  const queue = [...missing];
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      for (let u = queue.shift(); u; u = queue.shift()) {
        const r = await fetch(u);
        if (!r.ok) throw new Error(`取得に失敗しました(${r.status})`);
        await r.arrayBuffer(); // 最後まで受信してキャッシュさせる
        step();
      }
    }),
  );
}

export class PdfPasswordError extends Error {}

export async function openPdf(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  const m = await pdfjs();
  try {
    return await m.getDocument({
      data,
      // 日本語フォントを埋め込んでいないPDFの表示に必要
      cMapUrl: asset('cmaps'),
      cMapPacked: true,
      standardFontDataUrl: asset('standard_fonts'),
      wasmUrl: asset('wasm'),
      iccUrl: asset('iccs'),
    }).promise;
  } catch (e) {
    if (e instanceof Error && e.name === 'PasswordException') {
      throw new PdfPasswordError('パスワード付きのPDFは表示できません。');
    }
    throw e;
  }
}

/** 取り込み時のページ数確認(読めないPDFはここで弾く) */
export async function countPdfPages(blob: Blob): Promise<number> {
  const doc = await openPdf(await blob.arrayBuffer());
  try {
    return doc.numPages;
  } finally {
    void doc.loadingTask.destroy();
  }
}
