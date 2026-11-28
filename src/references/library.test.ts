import { describe, expect, it } from 'vitest';
import type { ReferenceRecord } from '../types/inspection';
import { categoriesOf, describe as describeRef, formatSize, groupReferences, kindOf, titleFromFileName } from './library';

const ref = (title: string, category: string, extra: Partial<ReferenceRecord> = {}): ReferenceRecord => ({
  id: title, title, category, kind: 'pdf', blob: new Blob([new Uint8Array(2048)]), pageCount: 3,
  fileName: `${title}.pdf`, createdAt: '', updatedAt: '', ...extra,
});

describe('reference library helpers', () => {
  it('derives titles and kinds from files', () => {
    expect(titleFromFileName('点検要領 2026.pdf')).toBe('点検要領 2026');
    expect(titleFromFileName('.pdf')).toBe('無題の資料');
    expect(kindOf({ type: 'application/pdf', name: 'a' })).toBe('pdf');
    expect(kindOf({ type: '', name: 'A.PDF' })).toBe('pdf'); // 「ファイル」アプリで type が空の場合
    expect(kindOf({ type: 'image/jpeg', name: 'a.jpg' })).toBe('image');
    expect(kindOf({ type: 'text/plain', name: 'a.txt' })).toBeNull();
  });

  it('formats size and description', () => {
    expect(formatSize(500)).toBe('1KB');
    expect(formatSize(2.5 * 1024 * 1024)).toBe('2.5MB');
    expect(describeRef(ref('a', ''))).toBe('PDF・3ページ・2KB');
    expect(describeRef(ref('b', '', { kind: 'image', pageCount: 1 }))).toBe('画像・2KB');
  });

  it('groups by category (未分類 last) and sorts titles naturally', () => {
    const list = [ref('第10章', '点検要領'), ref('第2章', '点検要領'), ref('メモ', ''), ref('誘導灯', '設置基準')];
    const g = groupReferences(list);
    expect(g.map(([c]) => c)).toEqual(['設置基準', '点検要領', '未分類']);
    expect(g[1][1].map((r) => r.title)).toEqual(['第2章', '第10章']);
    expect(categoriesOf(list)).toEqual(['設置基準', '点検要領']);
  });

  it('searches title, category and file name', () => {
    const list = [ref('誘導灯', '設置基準'), ref('消火器', '点検要領', { fileName: 'extinguisher.pdf' })];
    expect(groupReferences(list, '設置').flatMap(([, v]) => v.map((r) => r.title))).toEqual(['誘導灯']);
    expect(groupReferences(list, 'EXTING').flatMap(([, v]) => v.map((r) => r.title))).toEqual(['消火器']);
    expect(groupReferences(list, 'なし')).toEqual([]);
  });
});
