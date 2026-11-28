/**
 * pdf.js の読み込み(使用時に遅延読み込み。Service Workerでプリキャッシュされるためオフラインでも動作)。
 * 古いiPhoneでも動くよう legacy ビルドを使う。
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
  lib ??= import('pdfjs-dist/legacy/build/pdf.mjs').then((m) => {
    m.GlobalWorkerOptions.workerSrc = workerUrl;
    return m;
  });
  return lib;
}

/** 補助ファイルの場所(GitHub Pages のサブパス配下でも動くようページ基準) */
const asset = (dir: string) => new URL(`pdfjs/${dir}/`, document.baseURI).href;

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
