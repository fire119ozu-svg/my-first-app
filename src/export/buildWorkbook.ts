/**
 * 検査案件から Excel ブックを生成する。すべて端末内で処理し、外部へは送信しない。
 *
 * シート構成:
 *   1. チェックリスト … 案件情報・判定集計・全項目の判定/記録/メモ・備考
 *   2. 指摘事項       … 判定「否」の項目のみ(指導・通知書作成用)
 *   3. 階別記録       … 階ごとの入力欄(消火器の能力単位など)がある場合のみ
 *   4. 写真           … 添付写真がある場合のみ(項目ごとに画像を貼り付け)
 *   5. 対象物情報     … 入力した対象物情報と届出状況
 */
import type ExcelJS from 'exceljs';
import { CATEGORY_LABELS, getChecklistItem } from '../data/checklistItems';
import { floorKeys, floorLabel, sumPerFloor, asPerFloor } from '../logic/floors';
import { caseProgress } from '../logic/inspectionCase';
import type { ChecklistItem, CheckResult, FloorKey, InspectionCase } from '../types/inspection';
import {
  estimateLines,
  formatEquipment,
  formatFacilities,
  formatField,
  formatFloors,
  formatLegal,
  formatPerson,
  formatResult,
  formatSpecified,
  formatStatus,
  formatUsage,
  notificationRows,
} from './format';

type Workbook = ExcelJS.Workbook;
type Worksheet = ExcelJS.Worksheet;
type Cell = ExcelJS.Cell;

const FONT = '游ゴシック';
const LINE_HEIGHT = 15;
const COLOR = {
  headerFill: 'FFB71C1C',
  labelFill: 'FFF2F2F7',
  border: 'FFBFBFBF',
  ok: 'FFE3F4E8',
  okText: 'FF1B7F3B',
  ng: 'FFFDE2E2',
  ngText: 'FFC62828',
  na: 'FFEEEEEE',
  pending: 'FFFFF4E0',
};

const thin = { style: 'thin' as const, color: { argb: COLOR.border } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };

function style(cell: Cell, opts: { bold?: boolean; fill?: string; color?: string; size?: number; center?: boolean } = {}) {
  cell.font = { name: FONT, size: opts.size ?? 10, bold: opts.bold, color: opts.color ? { argb: opts.color } : undefined };
  cell.alignment = {
    vertical: opts.center ? 'middle' : 'top',
    horizontal: opts.center ? 'center' : 'left',
    wrapText: true,
  };
  if (opts.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.fill } };
  cell.border = BORDER;
}

const RESULT_STYLE: Record<CheckResult | 'pending', { fill: string; color?: string }> = {
  compliant: { fill: COLOR.ok, color: COLOR.okText },
  nonCompliant: { fill: COLOR.ng, color: COLOR.ngText },
  notApplicable: { fill: COLOR.na },
  pending: { fill: COLOR.pending },
};

/** 各セルの内容と列幅から行の高さを設定 */
function fitRowHeight(ws: Worksheet, row: ExcelJS.Row, widths: number[]) {
  let lines = 1;
  row.eachCell((cell, col) => {
    const text = cell.value == null ? '' : String(cell.value);
    lines = Math.max(lines, estimateLines(text, widths[col - 1] ?? 10));
  });
  row.height = Math.max(18, lines * LINE_HEIGHT + 4);
  void ws;
}

function caseItems(c: InspectionCase): ChecklistItem[] {
  return c.itemIds.map(getChecklistItem).filter((i): i is ChecklistItem => i !== undefined);
}

function printSetup(ws: Worksheet, headerRow?: number) {
  ws.pageSetup = {
    paperSize: 9, // A4
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    printTitlesRow: headerRow ? `${headerRow}:${headerRow}` : undefined,
  };
  ws.headerFooter = { oddFooter: '&C&P / &N' };
}

/** 出力する写真(画像データは読み込み済み) */
export interface ExportPhoto {
  id: string;
  itemId: string;
  /** JPEG データ */
  data: ArrayBuffer | Uint8Array;
  width: number;
  height: number;
  createdAt: string;
}

interface Ctx {
  c: InspectionCase;
  items: ChecklistItem[];
  floors: FloorKey[];
  photos: Map<string, ExportPhoto>;
}

/** 項目に添付され、出力できる写真(添付順) */
function itemPhotos(ctx: Ctx, itemId: string): ExportPhoto[] {
  return (ctx.c.entries[itemId]?.photoIds ?? [])
    .map((id) => ctx.photos.get(id))
    .filter((p): p is ExportPhoto => p !== undefined);
}

/** 記録事項セル:追加入力欄の値と写真枚数 */
function recordText(ctx: Ctx, item: ChecklistItem): string {
  const entry = ctx.c.entries[item.id];
  const lines = (item.fields ?? []).map((d) => formatField(d, entry?.fields?.[d.key], ctx.floors)).filter(Boolean);
  const n = itemPhotos(ctx, item.id).length;
  if (n > 0) lines.push(`写真 ${n}枚(「写真」シート)`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 1. チェックリスト
// ---------------------------------------------------------------------------

const LIST_COLUMNS = [
  { header: 'No', width: 5 },
  { header: '区分', width: 13 },
  { header: '項目', width: 20 },
  { header: '確認ポイント', width: 44 },
  { header: '根拠法令', width: 26 },
  { header: '判定', width: 9 },
  { header: '記録事項', width: 26 },
  { header: 'メモ・指摘内容', width: 38 },
];
const LIST_WIDTHS = LIST_COLUMNS.map((c) => c.width);

function addChecklistSheet(wb: Workbook, ctx: Ctx, exportedAt: Date) {
  const { c, items } = ctx;
  const ws = wb.addWorksheet('チェックリスト', { views: [{ state: 'frozen', ySplit: 0 }] });
  ws.columns = LIST_COLUMNS.map((col) => ({ width: col.width }));
  const b = c.building;

  // タイトル
  ws.mergeCells('A1:H1');
  const title = ws.getCell('A1');
  title.value = '消防立入検査チェックリスト';
  title.font = { name: FONT, size: 16, bold: true };
  title.alignment = { vertical: 'middle' };
  ws.getRow(1).height = 28;

  // 案件情報(左:A-B見出し/C-D値、右:E見出し/F-H値)
  const info: [string, string, string, string][] = [
    ['対象物名称', b.name, '検査日', c.inspectionDate],
    ['所在地', b.address || '', '検査員', c.inspectors.join('、')],
    ['代表者', formatPerson(b.representative), '立会者', formatPerson(b.witness)],
    ['用途', formatUsage(b), '区分', formatSpecified(b)],
    ['延べ面積', `${b.totalFloorArea.toLocaleString('ja-JP')}㎡`, '階数', formatFloors(b)],
    ['収容人員', `${b.capacity}人`, '状態', formatStatus(c)],
  ];
  let r = 3;
  for (const [l1, v1, l2, v2] of info) {
    ws.mergeCells(r, 1, r, 2);
    ws.mergeCells(r, 3, r, 4);
    ws.mergeCells(r, 6, r, 8);
    const cells = [ws.getCell(r, 1), ws.getCell(r, 3), ws.getCell(r, 5), ws.getCell(r, 6)];
    cells[0].value = l1;
    cells[1].value = v1;
    cells[2].value = l2;
    cells[3].value = v2;
    style(cells[0], { bold: true, fill: COLOR.labelFill });
    style(cells[1]);
    style(cells[2], { bold: true, fill: COLOR.labelFill });
    style(cells[3]);
    ws.getRow(r).height = Math.max(18, estimateLines(v1, 13 + 20) * LINE_HEIGHT + 4);
    r++;
  }

  // 判定集計
  const p = caseProgress(c, items.map((i) => i.id));
  ws.mergeCells(r, 1, r, 2);
  ws.mergeCells(r, 3, r, 8);
  ws.getCell(r, 1).value = '判定集計';
  style(ws.getCell(r, 1), { bold: true, fill: COLOR.labelFill });
  ws.getCell(r, 3).value =
    `全${p.total}項目 適 ${p.compliant} / 否 ${p.nonCompliant} / 該当なし ${p.notApplicable} / 未判定 ${p.total - p.done}`;
  style(ws.getCell(r, 3), { bold: true, color: p.nonCompliant > 0 ? COLOR.ngText : undefined });
  ws.getRow(r).height = 20;
  r += 2;

  // 明細
  const headerRowNo = r;
  const header = ws.getRow(r);
  LIST_COLUMNS.forEach((col, i) => {
    const cell = header.getCell(i + 1);
    cell.value = col.header;
    style(cell, { bold: true, fill: COLOR.headerFill, color: 'FFFFFFFF', center: true });
  });
  header.height = 20;
  r++;

  items.forEach((item, idx) => {
    const entry = c.entries[item.id];
    const result = entry?.result ?? null;
    const record = recordText(ctx, item);
    const row = ws.getRow(r);
    row.values = [
      idx + 1,
      CATEGORY_LABELS[item.category],
      `${item.title}\n(${item.id})`,
      item.checkPoint,
      formatLegal(item.legalBasis),
      formatResult(result),
      record,
      entry?.memo ?? '',
    ];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      if (col === 1) style(cell, { center: true });
      else if (col === 6) style(cell, { bold: true, center: true, ...RESULT_STYLE[result ?? 'pending'] });
      else style(cell);
    });
    fitRowHeight(ws, row, LIST_WIDTHS);
    r++;
  });

  // 備考
  r++;
  ws.mergeCells(r, 1, r, 2);
  ws.mergeCells(r, 3, r, 8);
  ws.getCell(r, 1).value = '備考';
  style(ws.getCell(r, 1), { bold: true, fill: COLOR.labelFill });
  ws.getCell(r, 3).value = c.remarks;
  style(ws.getCell(r, 3));
  ws.getRow(r).height = Math.max(40, estimateLines(c.remarks, 140) * LINE_HEIGHT + 4);
  r += 2;

  ws.mergeCells(r, 1, r, 8);
  const note = ws.getCell(r, 1);
  note.value =
    `作成日時 ${exportedAt.toLocaleString('ja-JP')}。チェック項目は主要な設置基準を簡略化した判定により抽出しており、` +
    '構造による緩和・階ごとの判定・免除特例は含まない。「条番号要確認」の条番号は高知市例規集で確認すること。';
  note.font = { name: FONT, size: 8, color: { argb: 'FF6E6E73' } };
  note.alignment = { wrapText: true, vertical: 'top' };
  ws.getRow(r).height = 26;

  ws.views = [{ state: 'frozen', ySplit: headerRowNo }];
  ws.autoFilter = { from: { row: headerRowNo, column: 1 }, to: { row: headerRowNo + items.length, column: 8 } };
  printSetup(ws, headerRowNo);
}

// ---------------------------------------------------------------------------
// 2. 指摘事項
// ---------------------------------------------------------------------------

function addFindingsSheet(wb: Workbook, ctx: Ctx) {
  const { c, items } = ctx;
  const ws = wb.addWorksheet('指摘事項');
  const cols = [
    { header: 'No', width: 5 },
    { header: '項目', width: 22 },
    { header: '根拠法令', width: 30 },
    { header: '指摘内容', width: 50 },
    { header: '記録事項', width: 28 },
  ];
  const widths = cols.map((x) => x.width);
  ws.columns = cols.map((x) => ({ width: x.width }));

  ws.mergeCells('A1:E1');
  ws.getCell('A1').value = `指摘事項 ${c.building.name}(検査日 ${c.inspectionDate})`;
  ws.getCell('A1').font = { name: FONT, size: 14, bold: true };
  ws.getRow(1).height = 24;

  const header = ws.getRow(3);
  cols.forEach((col, i) => {
    header.getCell(i + 1).value = col.header;
    style(header.getCell(i + 1), { bold: true, fill: COLOR.headerFill, color: 'FFFFFFFF', center: true });
  });
  header.height = 20;

  const ng = items.filter((i) => c.entries[i.id]?.result === 'nonCompliant');
  if (ng.length === 0) {
    ws.mergeCells('A4:E4');
    ws.getCell('A4').value = '指摘事項なし';
    style(ws.getCell('A4'), { center: true });
    ws.getRow(4).height = 22;
  }
  ng.forEach((item, idx) => {
    const entry = c.entries[item.id];
    const row = ws.getRow(4 + idx);
    row.values = [
      idx + 1,
      `${item.title}\n(${item.id})`,
      formatLegal(item.legalBasis),
      entry?.memo || '(指摘内容未記入)',
      recordText(ctx, item),
    ];
    row.eachCell({ includeEmpty: true }, (cell, col) => style(cell, { center: col === 1 }));
    fitRowHeight(ws, row, widths);
  });
  printSetup(ws, 3);
}

// ---------------------------------------------------------------------------
// 3. 階別記録
// ---------------------------------------------------------------------------

function addPerFloorSheet(wb: Workbook, c: InspectionCase, items: ChecklistItem[]) {
  const floors = floorKeys(c.building);
  const columns = items.flatMap((item) =>
    (item.fields ?? [])
      .filter((d) => d.kind === 'perFloorNumber')
      .map((def) => ({ item, def, value: c.entries[item.id]?.fields?.[def.key] }))
      .filter(({ value }) => sumPerFloor(value, floors).filled + sumPerFloor(value, floors).invalid > 0),
  );
  if (columns.length === 0 || floors.length === 0) return;

  const ws = wb.addWorksheet('階別記録');
  ws.columns = [{ width: 12 }, ...columns.map(() => ({ width: 22 }))];
  ws.getCell('A1').value = '階別記録';
  ws.getCell('A1').font = { name: FONT, size: 14, bold: true };

  const header = ws.getRow(3);
  header.getCell(1).value = '階';
  columns.forEach(({ item, def }, i) => {
    header.getCell(i + 2).value = `${item.title}\n${def.label}${def.kind === 'perFloorNumber' ? `(${def.unit})` : ''}`;
  });
  header.eachCell((cell) => style(cell, { bold: true, fill: COLOR.headerFill, color: 'FFFFFFFF', center: true }));
  header.height = 34;

  // 上の階から順に(図面・報告書の慣例に合わせる)
  const ordered = [...floors].reverse();
  ordered.forEach((f, idx) => {
    const row = ws.getRow(4 + idx);
    row.getCell(1).value = floorLabel(f);
    style(row.getCell(1), { center: true, fill: COLOR.labelFill });
    columns.forEach(({ value }, i) => {
      const raw = (asPerFloor(value)[f] ?? '').trim();
      const n = sumPerFloor({ [f]: raw }, [f]);
      const cell = row.getCell(i + 2);
      // 数値として読めるものは数値で出力(Excel上で再計算できるように)
      cell.value = raw === '' ? null : n.filled ? n.total : raw;
      style(cell, { center: true });
    });
  });
  const totalRow = ws.getRow(4 + ordered.length);
  totalRow.getCell(1).value = '合計';
  style(totalRow.getCell(1), { bold: true, center: true, fill: COLOR.labelFill });
  columns.forEach((_, i) => {
    const col = ws.getColumn(i + 2).letter;
    const cell = totalRow.getCell(i + 2);
    const total = sumPerFloor(columns[i].value, floors).total;
    cell.value = { formula: `SUM(${col}4:${col}${3 + ordered.length})`, result: total };
    style(cell, { bold: true, center: true });
  });
  printSetup(ws, 3);
  ws.pageSetup.orientation = 'portrait';
}

// ---------------------------------------------------------------------------
// 4. 対象物情報
// ---------------------------------------------------------------------------

function addBuildingSheet(wb: Workbook, c: InspectionCase) {
  const ws = wb.addWorksheet('対象物情報');
  ws.columns = [{ width: 26 }, { width: 60 }];
  const b = c.building;
  const yesNo = (v: boolean) => (v ? 'あり' : 'なし');
  const rows: [string, string][] = [
    ['名称', b.name],
    ['所在地', b.address],
    ['代表者 役職', b.representative?.title ?? ''],
    ['代表者 氏名', b.representative?.name ?? ''],
    ['立会者 役職', b.witness?.title ?? ''],
    ['立会者 氏名', b.witness?.name ?? ''],
    ['用途', formatUsage(b)],
    ['区分', formatSpecified(b)],
    ['延べ面積', `${b.totalFloorArea.toLocaleString('ja-JP')}㎡`],
    ['地上階数', `${b.floorsAbove}階`],
    ['地下階数', `${b.floorsBelow}階`],
    ['収容人員', `${b.capacity}人`],
    ['高層建築物(31m超)', yesNo(b.isHighRise)],
    ['無窓階', yesNo(b.hasWindowlessFloor)],
    ['特定一階段等防火対象物', b.isSingleStaircase ? '該当' : '非該当'],
    ['管理権原が複数', yesNo(b.hasMultipleOwners)],
    ['設置済みの消防用設備等', formatEquipment(b)],
    ['火気使用設備・危険物等', formatFacilities(b)],
  ];

  ws.getCell('A1').value = '対象物情報';
  ws.getCell('A1').font = { name: FONT, size: 14, bold: true };
  let r = 3;
  const put = ([k, v]: [string, string], fill = COLOR.labelFill) => {
    const row = ws.getRow(r++);
    row.values = [k, v];
    style(row.getCell(1), { bold: true, fill });
    style(row.getCell(2));
    fitRowHeight(ws, row, [26, 60]);
  };
  rows.forEach((x) => put(x));

  r++;
  ws.getCell(r, 1).value = '各種届出の状況';
  ws.getCell(r, 1).font = { name: FONT, size: 12, bold: true };
  r++;
  notificationRows(b).forEach((x) => put(x));
  printSetup(ws);
  ws.pageSetup.orientation = 'portrait';
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 4. 写真
// ---------------------------------------------------------------------------

/** 1枚あたりの表示枠(px)。2枚並べてA4縦に収まる大きさ */
const PHOTO_BOX = { width: 330, height: 250 };
const PHOTO_COL_WIDTH = 49; // ≒ 348px

function addPhotoSheet(wb: Workbook, ctx: Ctx) {
  const { c, items } = ctx;
  const groups = items
    .map((item, idx) => ({ item, no: idx + 1, photos: itemPhotos(ctx, item.id) }))
    .filter((g) => g.photos.length > 0);
  if (groups.length === 0) return;

  const ws = wb.addWorksheet('写真');
  ws.columns = [{ width: PHOTO_COL_WIDTH }, { width: PHOTO_COL_WIDTH }];
  ws.mergeCells('A1:B1');
  ws.getCell('A1').value = `写真 ${c.building.name}(検査日 ${c.inspectionDate})`;
  ws.getCell('A1').font = { name: FONT, size: 14, bold: true };
  ws.getRow(1).height = 24;

  let r = 3;
  for (const { item, no, photos } of groups) {
    const entry = c.entries[item.id];
    ws.mergeCells(r, 1, r, 2);
    const head = ws.getCell(r, 1);
    head.value = `No.${no} ${item.title}(${item.id}) 判定:${formatResult(entry?.result)}`;
    const res = entry?.result ?? 'pending';
    style(head, { bold: true, fill: COLOR.labelFill, color: RESULT_STYLE[res].color });
    ws.getRow(r).height = 20;
    r++;

    if (entry?.memo.trim()) {
      ws.mergeCells(r, 1, r, 2);
      const memo = ws.getCell(r, 1);
      memo.value = entry.memo;
      style(memo);
      ws.getRow(r).height = Math.max(18, estimateLines(entry.memo, PHOTO_COL_WIDTH * 2) * LINE_HEIGHT + 4);
      r++;
    }

    for (let i = 0; i < photos.length; i += 2) {
      const pair = photos.slice(i, i + 2);
      const sizes = pair.map((p) => {
        const scale = Math.min(PHOTO_BOX.width / p.width, PHOTO_BOX.height / p.height, 1);
        return { width: Math.round(p.width * scale), height: Math.round(p.height * scale) };
      });
      const rowPx = Math.max(...sizes.map((s) => s.height)) + 8;
      ws.getRow(r).height = rowPx * 0.75; // px → pt
      pair.forEach((p, j) => {
        const imageId = wb.addImage({
          // ExcelJS はブラウザでは ArrayBuffer も受け付ける(型定義は Node の Buffer)
          buffer: p.data as unknown as ExcelJS.Buffer,
          extension: 'jpeg',
        });
        ws.addImage(imageId, {
          tl: { col: j + 0.02, row: r - 1 + 0.02 },
          ext: sizes[j],
          editAs: 'oneCell',
        });
        const cap = ws.getCell(r + 1, j + 1);
        cap.value = `写真${i + j + 1} ${new Date(p.createdAt).toLocaleString('ja-JP')}`;
        cap.font = { name: FONT, size: 9, color: { argb: 'FF6E6E73' } };
      });
      ws.getRow(r + 1).height = 16;
      r += 2;
    }
    r++;
  }
  printSetup(ws);
  ws.pageSetup.orientation = 'portrait';
}

export interface BuildOptions {
  exportedAt?: Date;
  /** 添付写真(省略時は写真シートを作らない) */
  photos?: ExportPhoto[];
}

export function buildWorkbook(ExcelJSLib: typeof ExcelJS, c: InspectionCase, opts: BuildOptions = {}): Workbook {
  const exportedAt = opts.exportedAt ?? new Date();
  const wb = new ExcelJSLib.Workbook();
  wb.creator = '消防立入検査チェックリスト';
  wb.created = exportedAt;
  const ctx: Ctx = {
    c,
    items: caseItems(c),
    floors: floorKeys(c.building),
    photos: new Map((opts.photos ?? []).map((p) => [p.id, p])),
  };
  addChecklistSheet(wb, ctx, exportedAt);
  addFindingsSheet(wb, ctx);
  addPerFloorSheet(wb, c, ctx.items);
  addPhotoSheet(wb, ctx);
  addBuildingSheet(wb, c);
  return wb;
}
