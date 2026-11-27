/**
 * xlsx ファイルの生成と保存(端末内で完結)。
 * ExcelJS は大きいため、出力時にだけ読み込む(PWAのプリキャッシュには含まれるのでオフラインでも動作)。
 */
import type { InspectionCase } from '../types/inspection';
import { buildWorkbook } from './buildWorkbook';
import { exportFileName } from './format';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export async function createXlsxFile(c: InspectionCase): Promise<File> {
  const { default: ExcelJS } = await import('exceljs');
  const wb = buildWorkbook(ExcelJS, c);
  const buffer = await wb.xlsx.writeBuffer();
  return new File([buffer], exportFileName(c), { type: XLSX_MIME });
}

/** 共有シート(「ファイルに保存」・AirDrop・メール等)が使えるか */
export function canShareFile(file: File): boolean {
  try {
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/**
 * 共有シートを開く。Safariはユーザー操作の直後でないと拒否するため、
 * ファイルは事前に生成しておき、ボタン押下で即座に呼び出すこと。
 * キャンセルされた場合は false を返す。
 */
export async function shareFile(file: File): Promise<boolean> {
  try {
    await navigator.share({ files: [file], title: file.name });
    return true;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return false;
    throw e;
  }
}

/** ブラウザのダウンロードとして保存する */
export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Safariはクリック直後に解放すると保存に失敗することがあるため遅延させる
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
