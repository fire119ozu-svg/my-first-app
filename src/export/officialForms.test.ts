import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { createCase, entryKey, updateEntry } from '../logic/inspectionCase';
import { makeBuilding } from '../test/fixtures';
import type { InspectionCase, SiteInfo } from '../types/inspection';
import { buildWorkbook } from './buildWorkbook';
import { collectFindings } from './officialForms';

const site: SiteInfo = {
  name: '〇〇ビル',
  address: '高知市〇〇町1番1号',
  representative: { org: '〇〇株式会社', title: '代表取締役', name: '高知太郎' },
  witness: { org: '〇〇株式会社', title: '総務部', name: '土佐花子' },
};
const meta = {
  inspectionDate: '2026-11-27',
  inspectors: [
    { rank: '消防司令補', name: '消防太郎' },
    { rank: '消防士', name: '山田' },
  ],
  office: { department: '高知市中央消防署特別消防第1係', phone: '088-000-0000' },
};
const a = makeBuilding({ id: 'a', label: '本館', usage: '3ロ', totalFloorArea: 600, floorsAbove: 3, capacity: 150, facilities: ['kitchen'] });
const b = makeBuilding({ id: 'b', label: '倉庫棟', usage: '14', totalFloorArea: 600, floorsAbove: 1, capacity: 5 });

async function load(c: InspectionCase) {
  const buf = await buildWorkbook(ExcelJS, c).xlsx.writeBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb;
}

function texts(ws: ExcelJS.Worksheet): string[] {
  const out: string[] = [];
  ws.eachRow((row) => row.eachCell((cell) => cell.value != null && out.push(String(cell.value))));
  return [...new Set(out)];
}

describe('official forms', () => {
  it('outputs only the notice (no findings wording) when nothing is non-compliant', async () => {
    const c = updateEntry(createCase(site, [a], meta), entryKey('a', 'FM-001'), { result: 'compliant' });
    const wb = await load(c);
    const names = wb.worksheets.map((w) => w.name);
    expect(names[0]).toBe('査察結果通知書');
    expect(names).not.toContain('指導事項');
    expect(names).not.toContain('改善計画・結果報告書');
    const all = texts(wb.getWorksheet('査察結果通知書')!).join('|');
    expect(all).toContain('令和8年11月27日消防法第４条により立入検査を実施したところ、火災予防上の不備事項は認められませんでした。');
    expect(all).not.toContain('別紙');
  });

  it('fills the notice from the case', async () => {
    const c = updateEntry(createCase(site, [a], meta), entryKey('a', 'EQ-001'), { result: 'nonCompliant' });
    const t = texts((await load(c)).getWorksheet('査察結果通知書')!);
    const all = t.join('|');
    expect(t).toContain('様式第4号');
    expect(t).toContain('防第　　　　号');
    expect(t).toContain('高知市〇〇町1番1号');
    expect(t).toContain('〇〇株式会社');
    expect(t).toContain('代表取締役　高知太郎　　様');
    expect(t).toContain('高知市中央消防署特別消防第1係');
    expect(t).toContain('消防司令補　消防太郎'); // 1人目の検査員のみ
    expect(all).not.toContain('山田');
    expect(t).toContain('〇〇株式会社 総務部 土佐花子　様');
    expect(all).toContain('別紙のとおり火災予防上の不備事項があるので、是正するよう指導します。');
    expect(all).toContain('高知市中央消防署に提出してください。');
    expect(all).toContain('ＴＥＬ　088-000-0000');
  });

  it('numbers findings across buildings and writes the guidance (様式第5号)', async () => {
    let c = createCase(site, [a, b], meta);
    c = updateEntry(c, entryKey('a', 'FR-001'), { result: 'nonCompliant', memo: '2階:厨房出入口' });
    c = updateEntry(c, entryKey('a', 'EQ-001'), { result: 'nonCompliant', memo: '屋上:ボイラー設備' });
    c = updateEntry(c, entryKey('b', 'EQ-001'), { result: 'nonCompliant' });
    c = updateEntry(c, entryKey('a', 'FM-001'), { result: 'compliant' });

    const f = collectFindings(c);
    expect(f.map((x) => [x.no, x.building.id, x.item.id])).toEqual([
      [1, 'a', 'EQ-001'],
      [2, 'a', 'FR-001'],
      [3, 'b', 'EQ-001'],
    ]);

    const wb = await load(c);
    const g = texts(wb.getWorksheet('指導事項')!);
    expect(g).toContain('令和8年11月27日');
    expect(g).toContain('棟　：　本館');
    expect(g).toContain('棟　：　倉庫棟');
    expect(g).toContain('１　消火器について(法第17条、令第10条、規則第6条から第9条)');
    expect(g).toContain('　　消火器具を消防法令に定める技術上の基準により設置し、維持すること。');
    expect(g).toContain('　(屋上:ボイラー設備)');
    expect(g).toContain('２　防炎物品の使用について(法第8条の3、令第4条の3)');
    expect(g).toContain('３　消火器について(法第17条、令第10条、規則第6条から第9条)');
    expect(g.indexOf('棟　：　本館')).toBeLessThan(g.indexOf('棟　：　倉庫棟'));
  });

  it('writes the improvement plan (様式第7号) with one row per finding plus blanks', async () => {
    let c = createCase(site, [a], meta);
    c = updateEntry(c, entryKey('a', 'FR-001'), { result: 'nonCompliant' });
    c = updateEntry(c, entryKey('a', 'EQ-001'), { result: 'nonCompliant' });
    const ws = (await load(c)).getWorksheet('改善計画・結果報告書')!;
    const t = texts(ws);
    expect(t).toContain('　高知市中央消防署長　　様');
    expect(t).toContain('〇〇ビル');
    expect(t).toContain('代表取締役　高知太郎');
    expect(t).toContain('　令和8年11月27日の消防法第４条に基づく指導事項の改修について、下記のとおり報告します。');
    expect(t).toContain('消火器について');
    expect(t).toContain('防炎物品の使用について');
    // 結合セルは各セルが同じ値を返すため、行単位で数える
    let boxes = 0;
    ws.eachRow((row) => row.getCell(8).value === '□ 改修済み　□ 改修計画' && boxes++);
    expect(boxes).toBe(4); // 指導事項2件+予備2行
  });
});
