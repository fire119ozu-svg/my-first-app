import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import {
  addEntryPhoto,
  allEntryKeys,
  createCase,
  entryKey,
  setPhotoCaption,
  setRemarks,
  updateEntry,
  updateEntryField,
} from '../logic/inspectionCase';
import { makeBuilding, makeSite } from '../test/fixtures';
import type { BuildingInfo, InspectionCase } from '../types/inspection';
import { buildWorkbook, type ExportPhoto } from './buildWorkbook';
import { estimateLines, exportFileName, formatField, formatPerson } from './format';

const site = makeSite({
  name: '追手筋テナントビル',
  address: '高知市本町1丁目',
  representative: { title: '代表取締役', name: '高知太郎' },
  witness: { title: '店長', name: '土佐花子' },
});
const building: BuildingInfo = makeBuilding({
  usage: '3ロ', totalFloorArea: 600, floorsAbove: 3, floorsBelow: 1, capacity: 150,
  floorCapacities: { B1: 10, '1': 60, '2': 50, '3': 30 },
  installedEquipment: ['extinguisher', 'autoFireAlarm'], facilities: ['kitchen'],
  notifications: { fireManagerAppointment: 'submitted', firePreventionPlan: 'notSubmitted' },
});
/** 1棟目(b1)の結果キー */
const K = (itemId: string) => entryKey('b1', itemId);

function sampleCase(): InspectionCase {
  let c = createCase(site, [building], { inspectionDate: '2026-11-27', inspectors: [{ rank: '消防司令補', name: '山田' }, { rank: '消防士', name: '佐藤' }] });
  c = updateEntry(c, K('FM-001'), { result: 'compliant' });
  c = updateEntry(c, K('FU-001'), { result: 'nonCompliant', memo: 'グリスフィルターに油脂付着' });
  c = updateEntry(c, K('EQ-001'), { result: 'compliant' });
  c = updateEntryField(c, K('EQ-001'), 'abilityUnits', { B1: '2', '1': '4', '2': '2', '3': '1.5' });
  c = updateEntryField(c, K('EQ-004'), 'receiverLocation', '1階 管理人室');
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
    expect(itemRows).toHaveLength(allEntryKeys(c).length);
  });

  it('lists only non-compliant items on the findings sheet', async () => {
    const ws = (await roundTrip(sampleCase())).getWorksheet('指摘事項')!;
    const all = texts(ws).join('|');
    expect(all).toContain('厨房設備');
    expect(all).toContain('グリスフィルターに油脂付着');
    expect(all).not.toContain('防火管理者の選任');
  });

  it('writes capacity and per-floor numbers top floor first with SUM totals', async () => {
    const ws = (await roundTrip(sampleCase())).getWorksheet('階別記録')!;
    expect(ws.getCell('A4').value).toBe('3階');
    // B列:収容人員、C列:消火器の能力単位
    expect(ws.getCell('B3').value).toBe('収容人員\n(人)');
    expect(ws.getCell('B4').value).toBe(30);
    expect(ws.getCell('C4').value).toBe(1.5);
    expect(ws.getCell('A7').value).toBe('地下1階');
    expect(ws.getCell('B7').value).toBe(10);
    expect(ws.getCell('C7').value).toBe(2);
    expect(ws.getCell('B8').value).toMatchObject({ formula: 'SUM(B4:B7)', result: 150 });
    expect(ws.getCell('C8').value).toMatchObject({ formula: 'SUM(C4:C7)', result: 9.5 });
  });

  it('omits the per-floor sheet when nothing per floor exists and notes no findings', async () => {
    const c = createCase(site, [{ ...building, floorCapacities: {} }], { inspectionDate: '2026-11-27', inspectors: [] });
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
    c = addEntryPhoto(c, K('FU-001'), 'p1');
    c = addEntryPhoto(c, K('FU-001'), 'p2');
    c = addEntryPhoto(c, K('FU-001'), 'p3');
    c = addEntryPhoto(c, K('EQ-001'), 'p4');
    c = addEntryPhoto(c, K('EQ-001'), 'gone'); // 本体が無い写真は出力しない
    c = setPhotoCaption(c, K('FU-001'), 'p2', '1階 厨房 排気フード');
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

  it('puts renovation info in the sheets and its photos first on the photo sheet', async () => {
    let c = createCase(
      site,
      [
        {
          ...building,
          renovation: { status: 'yes', location: '3階 東側', area: 120, period: '令和5年3月', photoIds: ['r1'], photoCaptions: { r1: '増築部分 外観' } },
        },
      ],
      { inspectionDate: '2026-11-27', inspectors: [] },
    );
    c = addEntryPhoto(c, K('FU-001'), 'p1');
    const wb = await roundTrip(c, [photo('r1', '__renovation__'), photo('p1', 'FU-001')]);
    const summary = '有(場所:3階 東側/増築面積:120㎡/時期:令和5年3月) 写真1枚(「写真」シート)';
    expect(texts(wb.getWorksheet('チェックリスト')!)).toContain(summary);
    const info = texts(wb.getWorksheet('対象物情報')!).join('|');
    expect(info).toContain('増改築の有無|有');
    expect(info).toContain('増築面積|120㎡');
    const ws = wb.getWorksheet('写真')!;
    const all = texts(ws).join('|');
    expect(all.indexOf('増改築(対象物情報)')).toBeLessThan(all.indexOf('厨房設備(FU-001)'));
    expect(all).toContain(summary);
    expect(ws.getImages()).toHaveLength(2);
  });

  it('shows 無 / 未入力 when there is no renovation', async () => {
    const none = createCase(site, [{ ...building, renovation: { status: 'no', location: '', period: '', photoIds: [], photoCaptions: {} } }], { inspectionDate: '2026-11-27', inspectors: [] });
    expect(texts((await roundTrip(none)).getWorksheet('対象物情報')!).join('|')).toContain('増改築の有無|無');
    expect(texts((await roundTrip(sampleCase())).getWorksheet('チェックリスト')!)).toContain('未入力');
  });

  it('omits the photo sheet when no photos are attached', async () => {
    const wb = await roundTrip(sampleCase(), []);
    expect(wb.getWorksheet('写真')).toBeUndefined();
  });
});

describe('buildWorkbook with multiple buildings and tenants', () => {
  const meta = { inspectionDate: '2026-11-28', inspectors: [] };
  const office = makeBuilding({
    id: 'a', label: 'A棟', usage: '16イ', subUsages: ['3ロ', '15'], totalFloorArea: 1200, floorsAbove: 3, capacity: 95,
    floorCapacities: { '1': 40, '2': 30, '3': 25 },
    tenants: [
      { id: 't1', name: '○○食堂', usage: '3ロ', floor: '1', area: 120, capacity: 40 },
      { id: 't2', name: '△△商事', usage: '15', floor: '2', capacity: 30 },
      { id: 't3', name: '△△商事', usage: '15', floor: '3', capacity: 25 },
    ],
    facilities: ['kitchen'],
  });
  const warehouse = makeBuilding({ id: 'b', label: '', usage: '14', totalFloorArea: 600, floorsAbove: 1, capacity: 5, floorCapacities: { '1': 5 } });

  async function multiCase() {
    let c = createCase(site, [office, warehouse], meta);
    c = updateEntry(c, entryKey('a', 'FU-001'), { result: 'nonCompliant', memo: 'フィルター清掃' });
    c = updateEntry(c, entryKey('b', 'EQ-001'), { result: 'compliant' });
    c = addEntryPhoto(c, entryKey('b', 'EQ-001'), 'pb');
    const wb = await roundTrip(c, [{ id: 'pb', itemId: 'b:EQ-001', data: Buffer.from([0xff, 0xd8, 0xff, 0xd9]), width: 1600, height: 1200, createdAt: '2026-11-28T00:00:00Z' }]);
    return { c, wb };
  }

  it('lists each building with a summary and its own items', async () => {
    const { c, wb } = await multiCase();
    const all = texts(wb.getWorksheet('チェックリスト')!);
    expect(all).toContain('2棟');
    expect(all.some((t) => t.startsWith('16イ項 複合用途(特定用途を含む)(3ロ項・15項)(特定防火対象物)・1,200㎡'))).toBe(true);
    expect(all.some((t) => t.startsWith('A棟 16イ項'))).toBe(true);
    expect(all.some((t) => t.startsWith('第2棟 14項'))).toBe(true);
    // 番号は全棟の通し番号
    const total = allEntryKeys(c).length;
    expect(all).toContain(String(total));
    expect(all.indexOf(all.find((t) => t.startsWith('A棟 16イ項'))!)).toBeLessThan(all.indexOf(all.find((t) => t.startsWith('第2棟 14項'))!));
  });

  it('prefixes the building on findings and photos', async () => {
    const { wb } = await multiCase();
    expect(texts(wb.getWorksheet('指摘事項')!)).toContain('A棟\n厨房設備\n(FU-001)');
    expect(texts(wb.getWorksheet('写真')!).some((t) => t.startsWith('第2棟 No.'))).toBe(true);
  });

  it('writes per-floor capacity per building and tenants on the building sheet', async () => {
    const { wb } = await multiCase();
    const floor = texts(wb.getWorksheet('階別記録')!);
    expect(floor).toContain('A棟');
    expect(floor).toContain('第2棟');
    expect(floor).toContain('収容人員\n(人)');
    const info = texts(wb.getWorksheet('対象物情報')!).join('|');
    expect(info).toContain('棟数|2棟');
    expect(info).toContain('テナント1|○○食堂 / 3ロ項 飲食店 / 1階 / 120㎡ / 40人');
    expect(info).toContain('階ごとの収容人員|3階 25人、2階 30人、1階 40人');
    expect(info).toContain('A棟 各種届出の状況');
  });
});

describe('format helpers', () => {
  it('builds a safe file name', () => {
    const c = createCase({ ...site, name: 'A/B:ビル 1号' }, [building], { inspectionDate: '2026-11-27', inspectors: [] });
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
