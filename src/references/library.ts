/**
 * 参考資料の一覧表示用の純粋関数。
 */
import type { ReferenceRecord } from '../types/inspection';

export const UNCATEGORIZED = '未分類';

/** ファイル名から拡張子を除いて表題にする */
export function titleFromFileName(name: string): string {
  return name.replace(/\.[^.]+$/, '').trim() || '無題の資料';
}

export function kindOf(file: { type: string; name: string }): 'pdf' | 'image' | null {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return 'pdf';
  if (file.type.startsWith('image/') || /\.(jpe?g|png|heic|heif|webp|gif)$/i.test(file.name)) return 'image';
  return null;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export function describe(r: ReferenceRecord): string {
  const kind = r.kind === 'pdf' ? `PDF・${r.pageCount}ページ` : '画像';
  return `${kind}・${formatSize(r.blob.size)}`;
}

/** 既存の分類(入力候補用、五十音順) */
export function categoriesOf(list: ReferenceRecord[]): string[] {
  return [...new Set(list.map((r) => r.category.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja'));
}

/**
 * 検索(表題・分類・ファイル名)して分類ごとにまとめる。
 * 分類は五十音順、未分類は最後。分類内は表題順。
 */
export function groupReferences(list: ReferenceRecord[], query = ''): [string, ReferenceRecord[]][] {
  const q = query.trim().toLowerCase();
  const hit = (r: ReferenceRecord) =>
    !q || [r.title, r.category, r.fileName].some((s) => s.toLowerCase().includes(q));
  const map = new Map<string, ReferenceRecord[]>();
  for (const r of list.filter(hit)) {
    const key = r.category.trim() || UNCATEGORIZED;
    map.set(key, [...(map.get(key) ?? []), r]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a === UNCATEGORIZED ? 1 : b === UNCATEGORIZED ? -1 : a.localeCompare(b, 'ja')))
    .map(([k, v]) => [k, v.sort((a, b) => a.title.localeCompare(b.title, 'ja', { numeric: true }))]);
}
