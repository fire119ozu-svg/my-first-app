import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { addEntryPhoto, createCase, setPhotoCaption, setRemarks, updateEntry, updateEntryField } from '../logic/inspectionCase';
import type { BuildingInfo, InspectionCase } from '../types/inspection';
import { buildWorkbook, type ExportPhoto } from './buildWorkbook';
import { estimateLines, exportFileName, formatField, formatPerson } from './format';

const building: BuildingInfo = {
  name: '追手筋テナントビル', address: '高知市本町1丁目', representative: { title: '代表取締役', name: '高知太郎' }, witness: { title: '店長', name: '土佐花子' }, usage: '3ロ', subUsages: [],
  totalFloorArea: 600, floorsAbove: 3, floorsBelow: 1, capacity: 150,
  isHighRise: false, hasWindowlessFloor: false, isSingleStaircase: false, hasMultipleOwners: false,
  installedEquipment: ['extinguisher', 'autoFireAlarm'], facilities: ['kitchen'],
  notifications: { fireManagerAppointment: 'submitted', firePreventionPlan: 'notSubmitted' },
};

function sampleCase(): InspectionCase {
  let c = createCase(building, { inspectionDate: '2026-11-27', inspectors: [{ rank: '消防司令補', name: '山田' }, { rank: '消防士', name: '佐藤' }] });
  c = updateEntry(c, 'FM-001', { result: 'compliant' });
  c = updateEntry(c, 'FU-001', { result: 'nonCompliant', memo: 'グリスフィルターに油脂付着' });
  c = updateEntry(c, 'EQ-001', { result: 'compliant' });
  c = updateEntryField(c, 'EQ-001', 'abilityUnits', { B1: '2', '1': '4', '2': '2', '3': '1.5' });
  c = updateEntryField(c, 'EQ-004', 'receiverLocation', '1階 管理人室');
  return setRemarks(c, '次回再確認');
}

async function roundTrip(c: InspectionCase, photos?: ExportPhoto[]) {
  const wb = buildWorkbook(ExcelJS, c, { exportedAt: new Date('2026-11-27T10:00:00+09:00'), photos });
  const buf = await wb.xlsx.writeBuffer();
  const read = new ExcelJS.Workbook();
  await read.xlsx.load(buf);
  return read;
}

/** シート内の全セルの文字列 */
function texts(ws: ExcelJS.Worksheet): string[] {
  const out: string[] = [];
  ws.eachRow((row) => row.eachCell((cell) => out.push(String(cell.value ?? ''))));
  return out;
}

function findRow(ws: ExcelJS.Worksheet, pred: (v: unknown[]) => boolean): unknown[] | undefined {
  let found: unknown[] | undefined;
  ws.eachRow((row) => {
    const v = (row.values as unknown[]).slice(1);
    if (!found && pred(v)) found = v;
  });
  return found;
}

describe('buildWorkbook', () => {
  it('creates the expected sheets', async () => {
    const wb = await roundTrip(sampleCase());
    expect(wb.worksheets.map((w) => w.name)).toEqual(['チェックリスト', '指摘事項', '階別記録', '対象物情報']);
  });

  it('writes case info, results, fields and memos to the checklist sheet', async () => {
    const c = sampleCase();
    const ws = (await roundTrip(c)).getWorksheet('チェックリスト')!;
    const all = texts(ws).join('|');
    expect(all).toContain('追手筋テナントビル');
    expect(all).toContain('消防司令補 山田、消防士 佐藤');
    expect(all).toContain('代表者|代表者|代表取締役 高知太郎');
    expect(all).toContain('立会者|店長 土佐花子');
    expect(all).toContain('3ロ項 飲食店');
    expect(all).toContain('特定防火対象物');
    expect(all).toContain('次回再確認');

    const fu = findRow(ws, (v) => String(v[2] ?? '').includes('(FU-001)'))!;
    expect(fu[5]).toBe('否');
    expect(fu[7]).toBe('グリスフィルターに油脂付着');

    const ext = findRow(ws, (v) => String(v[2] ?? '').includes('(EQ-001)'))!;
    expect(ext[6]).toBe('設置能力単位(階ごと)\n地下1階 2単位\n1階 4単位\n2階 2単位\n3階 1.5単位\n合計 9.5単位');

    const afa = findRow(ws, (v) => String(v[2] ?? '').includes('(EQ-004)'))!;
    expect(afa[5]).toBe('未判定');
    expect(afa[6]).toBe('受信機設置場所:1階 管理人室');

    // 全項目が出力されている
    const itemRows = texts(ws).filter((t) => /\([A-Z]{2}-\d{3}\)$/.test(t));
    expect(itemRows).toHaveLength(c.itemIds.length);
  });

  it('lists only non-compliant items on the findings sheet', async () => {
    const ws = (await roundTrip(sampleCase())).getWorksheet('指摘事項')!;
    const all = texts(ws).join('|');
    expect(all).toContain('厨房設備');
    expect(all).toContain('グリスフィルターに油脂付着');
    expect(all).not.toContain('防火管理者の選任');
  });

  it('writes per-floor numbers top floor first with a SUM total', async () => {
    const ws = (await roundTrip(sampleCase())).getWorksheet('階別記録')!;
    expect(ws.getCell('A4').value).toBe('3階');
    expect(ws.getCell('B4').value).toBe(1.5);
    expect(ws.getCell('A7').value).toBe('地下1階');
    expect(ws.getCell('B7').value).toBe(2);
    expect(ws.getCell('B8').value).toMatchObject({ formula: 'SUM(B4:B7)', result: 9.5 });
  });

  it('omits the per-floor sheet when nothing was entered and notes no findings', async () => {
    const c = createCase(building, { inspectionDate: '2026-11-27', inspectors: [] });
    const wb = await roundTrip(c);
    expect(wb.getWorksheet('階別記録')).toBeUndefined();
    expect(texts(wb.getWorksheet('指摘事項')!)).toContain('指摘事項なし');
  });

  it('writes building info and notification status', async () => {
    const all = texts((await roundTrip(sampleCase())).getWorksheet('対象物情報')!).join('|');
    expect(all).toContain('消火器、自動火災報知設備');
    expect(all).toContain('代表者 役職|代表取締役');
    expect(all).toContain('立会者 氏名|土佐花子');
    expect(all).toContain('防火管理者選任届|済');
    expect(all).toContain('消防計画作成届|未');
    expect(all).toContain('統括防火管理者選任届|未入力');
  });
});

// 最小のJPEG(1x1)
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
);

describe('buildWorkbook with photos', () => {
  const photo = (id: string, itemId: string, w = 1600, h = 1200): ExportPhoto => ({
    id, itemId, data: JPEG, width: w, height: h, createdAt: '2026-11-27T01:23:00Z',
  });

  it('adds a photo sheet with embedded images and counts in the checklist', async () => {
    let c = sampleCase();
    c = addEntryPhoto(c, 'FU-001', 'p1');
    c = addEntryPhoto(c, 'FU-001', 'p2');
    c = addEntryPhoto(c, 'FU-001', 'p3');
    c = addEntryPhoto(c, 'EQ-001', 'p4');
    c = addEntryPhoto(c, 'EQ-001', 'gone'); // 本体が無い写真は出力しない
    c = setPhotoCaption(c, 'FU-001', 'p2', '1階 厨房 排気フード');
    const wb = await roundTrip(c, [photo('p1', 'FU-001'), photo('p2', 'FU-001', 1200, 1600), photo('p3', 'FU-001'), photo('p4', 'EQ-001')]);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['チェックリスト', '指摘事項', '階別記録', '写真', '対象物情報']);

    const ws = wb.getWorksheet('写真')!;
    expect(ws.getImages()).toHaveLength(4);
    const all = texts(ws).join('|');
    // 項目の並び順(消火器 → 厨房設備)、判定・メモ付き
    expect(all.indexOf('消火器(EQ-001)')).toBeLessThan(all.indexOf('厨房設備(FU-001)'));
    expect(all).toContain('厨房設備(FU-001) 判定:否');
    expect(all).toContain('グリスフィルターに油脂付着');
    expect(all).toContain('写真3');
    // コメントは画像の下に(太字のコメント+日時)
    const capCell = (() => {
      let found: ExcelJS.Cell | undefined;
      ws.eachRow((row) => row.eachCell((cell) => {
        const v = cell.value as { richText?: { text: string }[] } | null;
        if (v?.richText?.[0]?.text === '写真2 1階 厨房 排気フード') found = cell;
      }));
      return found;
    })();
    expect(capCell).toBeDefined();
    expect((capCell!.value as { richText: { text: string }[] }).richText[1].text).toMatch(/^\n2026\/11\/27/);

    // 縦長写真は枠の高さに合わせて縮小(縦横比を維持)
    const ext = ws.getImages().map((im) => (im.range as unknown as { ext: { width: number; height: number } }).ext);
    expect(ext).toContainEqual({ width: 188, height: 250 });
    expect(ext).toContainEqual({ width: 330, height: 248 });

    const list = wb.getWorksheet('チェックリスト')!;
    const fu = findRow(list, (v) => String(v[2] ?? '').includes('(FU-001)'))!;
    expect(fu[6]).toBe('写真 3枚(「写真」シート)');
    const ext1 = findRow(list, (v) => String(v[2] ?? '').includes('(EQ-001)'))!;
    expect(String(ext1[6])).toMatch(/合計 9\.5単位\n写真 1枚/);
    // 指摘事項シートにも枚数
    expect(texts(wb.getWorksheet('指摘事項')!)).toContain('写真 3枚(「写真」シート)');
  });

  it('omits the photo sheet when no photos are attached', async () => {
    const wb = await roundTrip(sampleCase(), []);
    expect(wb.getWorksheet('写真')).toBeUndefined();
  });
});

describe('format helpers', () => {
  it('builds a safe file name', () => {
    const c = createCase({ ...building, name: 'A/B:ビル 1号' }, { inspectionDate: '2026-11-27', inspectors: [] });
    expect(exportFileName(c)).toBe('立入検査_A_B_ビル_1号_20261127.xlsx');
  });

  it('formats a person with optional title', () => {
    expect(formatPerson({ title: '店長', name: '土佐花子' })).toBe('店長 土佐花子');
    expect(formatPerson({ title: '', name: '土佐花子' })).toBe('土佐花子');
    expect(formatPerson(undefined)).toBe('');
  });

  it('returns empty for unfilled fields', () => {
    expect(formatField({ key: 'x', kind: 'text', label: '場所' }, '  ', [])).toBe('');
    expect(formatField({ key: 'x', kind: 'perFloorNumber', label: 'L', unit: '単位' }, {}, ['1'])).toBe('');
  });

  it('estimates wrapped lines with full-width characters counted double', () => {
    expect(estimateLines('abc', 10)).toBe(1);
    expect(estimateLines('あいうえおかきくけこ', 11)).toBe(2);
    expect(estimateLines('a\nb', 10)).toBe(2);
  });
});
