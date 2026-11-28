/**
 * 検査案件から Excel ブックを生成する。すべて端末内で処理し、外部へは送信しない。
 *
 * 棟が複数ある場合は、棟ごとに見出しを付けて続けて出力する(番号は通し番号)。
 *
 * シート構成:
 *   0. 査察結果通知書(様式第4号)・指導事項(様式第5号)・改善計画・結果報告書(様式第7号)
 *      … 指導事項(判定「否」)が無い場合は通知書のみ
 *   1. チェックリスト … 案件情報・判定集計・全項目の判定/記録/メモ・備考
 *   2. 指摘事項       … 判定「否」の項目のみ(指導・通知書作成用)
 *   3. 階別記録       … 階ごとの収容人員・階ごとの入力欄(消火器の能力単位など)
 *   4. 写真           … 添付写真がある場合のみ(増改築・項目ごとに画像を貼り付け)
 *   5. 対象物情報     … 入力した対象物情報と届出状況
 */
import type ExcelJS from 'exceljs';
import { addGuidanceSheet, addImprovementSheet, addNoticeSheet, collectFindings } from './officialForms';
import { CATEGORY_LABELS, getChecklistItem } from '../data/checklistItems';
import { floorKeys, floorLabel, sumPerFloor, asPerFloor } from '../logic/floors';
import { buildingName, caseProgress, checklistOf, entryKey, formatInspector } from '../logic/inspectionCase';
import { formatJudgement, isEffectiveOpening, isLargeOpening, judgeRecord, openingKindLabel, openingPlace } from '../logic/openings';
import type { BuildingInfo, ChecklistItem, CheckResult, FloorKey, InspectionCase, OpeningFloorRecord } from '../types/inspection';
import {
  estimateLines,
  formatEquipment,
  formatFacilities,
  formatField,
  formatFloors,
  formatLegal,
  formatPerson,
  formatRenovation,
  formatRenovationStatus,
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

/** 出力する1行(棟 × 項目)。no は全棟の通し番号 */
interface Row {
  building: BuildingInfo;
  bIndex: number;
  item: ChecklistItem;
  key: string;
  no: number;
}

function caseRows(c: InspectionCase): Row[] {
  let no = 0;
  return c.buildings.flatMap((building, bIndex) =>
    checklistOf(c, building.id)
      .map(getChecklistItem)
      .filter((i): i is ChecklistItem => i !== undefined)
      .map((item) => ({ building, bIndex, item, key: entryKey(building.id, item.id), no: ++no })),
  );
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
  rows: Row[];
  /** 棟が複数あるか(棟名を表示するか) */
  multi: boolean;
  photos: Map<string, ExportPhoto>;
}

/** 棟名(複数棟の場合のみ)を前置した表示 */
function withBuilding(ctx: Ctx, row: Row, text: string, sep = ' '): string {
  return ctx.multi ? `${buildingName(row.building, row.bIndex)}${sep}${text}` : text;
}

/** 項目に添付され、出力できる写真(添付順) */
function itemPhotos(ctx: Ctx, key: string): ExportPhoto[] {
  return (ctx.c.entries[key]?.photoIds ?? [])
    .map((id) => ctx.photos.get(id))
    .filter((p): p is ExportPhoto => p !== undefined);
}

/** 記録事項セル:追加入力欄の値と写真枚数 */
function recordText(ctx: Ctx, row: Row): string {
  const entry = ctx.c.entries[row.key];
  const floors = floorKeys(row.building);
  const lines = (row.item.fields ?? []).map((d) => formatField(d, entry?.fields?.[d.key], floors)).filter(Boolean);
  const n = itemPhotos(ctx, row.key).length;
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

/** 棟の概要(複数棟の見出し・一覧用) */
function buildingSummary(b: BuildingInfo): string {
  return [
    `${formatUsage(b)}(${formatSpecified(b)})`,
    `${b.totalFloorArea.toLocaleString('ja-JP')}㎡`,
    formatFloors(b),
    `${b.capacity}人`,
    `増改築:${formatRenovation(b)}`,
  ].join('・');
}

/** A-B見出し+C-H値の1行 */
function wideRow(ws: Worksheet, r: number, label: string, value: string, opts: { bold?: boolean; color?: string } = {}) {
  ws.mergeCells(r, 1, r, 2);
  ws.mergeCells(r, 3, r, 8);
  ws.getCell(r, 1).value = label;
  style(ws.getCell(r, 1), { bold: true, fill: COLOR.labelFill });
  ws.getCell(r, 3).value = value;
  style(ws.getCell(r, 3), opts);
  ws.getRow(r).height = Math.max(20, estimateLines(value, 140) * LINE_HEIGHT + 4);
}

function addChecklistSheet(wb: Workbook, ctx: Ctx, exportedAt: Date) {
  const { c, rows, multi } = ctx;
  const ws = wb.addWorksheet('チェックリスト', { views: [{ state: 'frozen', ySplit: 0 }] });
  ws.columns = LIST_COLUMNS.map((col) => ({ width: col.width }));
  const site = c.site;
  const b = c.buildings[0];

  // タイトル
  ws.mergeCells('A1:H1');
  const title = ws.getCell('A1');
  title.value = '消防立入検査チェックリスト';
  title.font = { name: FONT, size: 16, bold: true };
  title.alignment = { vertical: 'middle' };
  ws.getRow(1).height = 28;

  // 案件情報(左:A-B見出し/C-D値、右:E見出し/F-H値)
  const info: [string, string, string, string][] = [
    ['対象物名称', site.name, '検査日', c.inspectionDate],
    ['所在地', site.address || '', '検査員', c.inspectors.map(formatInspector).join('、')],
    ['代表者', formatPerson(site.representative), '立会者', formatPerson(site.witness)],
    ...(multi
      ? ([['棟数', `${c.buildings.length}棟`, '状態', formatStatus(c)]] as [string, string, string, string][])
      : ([
          ['用途', formatUsage(b), '区分', formatSpecified(b)],
          ['延べ面積', `${b.totalFloorArea.toLocaleString('ja-JP')}㎡`, '階数', formatFloors(b)],
          ['収容人員', `${b.capacity}人`, '状態', formatStatus(c)],
        ] as [string, string, string, string][])),
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

  if (multi) {
    // 棟ごとの概要
    c.buildings.forEach((x, i) => wideRow(ws, r++, buildingName(x, i), buildingSummary(x)));
  } else {
    wideRow(ws, r++, '増改築', formatRenovation(b));
  }

  // 判定集計
  const progressText = (keys?: string[]) => {
    const p = caseProgress(c, keys);
    return {
      text: `全${p.total}項目 適 ${p.compliant} / 否 ${p.nonCompliant} / 該当なし ${p.notApplicable} / 未判定 ${p.total - p.done}`,
      color: p.nonCompliant > 0 ? COLOR.ngText : undefined,
    };
  };
  const total = progressText();
  wideRow(ws, r++, '判定集計', total.text, { bold: true, color: total.color });
  r++;

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

  rows.forEach((x, i) => {
    // 複数棟:棟の見出し行
    if (multi && (i === 0 || rows[i - 1].building !== x.building)) {
      ws.mergeCells(r, 1, r, 8);
      const head = ws.getCell(r, 1);
      const p = progressText(rows.filter((y) => y.building === x.building).map((y) => y.key));
      head.value = `${buildingName(x.building, x.bIndex)} ${formatUsage(x.building)}  ${p.text}`;
      style(head, { bold: true, fill: COLOR.labelFill, color: p.color });
      ws.getRow(r).height = 20;
      r++;
    }
    const { item } = x;
    const entry = c.entries[x.key];
    const result = entry?.result ?? null;
    const record = recordText(ctx, x);
    const row = ws.getRow(r);
    row.values = [
      x.no,
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
    '構造による緩和・階ごとの判定・免除特例は含まない。高知市火災予防条例は平成28年4月1日改正までの条文と照合している。';
  note.font = { name: FONT, size: 8, color: { argb: 'FF6E6E73' } };
  note.alignment = { wrapText: true, vertical: 'top' };
  ws.getRow(r).height = 26;

  ws.views = [{ state: 'frozen', ySplit: headerRowNo }];
  // 棟の見出し行があると絞り込みが崩れるため、1棟の場合のみ設定
  if (!multi) ws.autoFilter = { from: { row: headerRowNo, column: 1 }, to: { row: headerRowNo + rows.length, column: 8 } };
  printSetup(ws, headerRowNo);
}

// ---------------------------------------------------------------------------
// 2. 指摘事項
// ---------------------------------------------------------------------------

function addFindingsSheet(wb: Workbook, ctx: Ctx) {
  const { c, rows } = ctx;
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
  ws.getCell('A1').value = `指摘事項 ${c.site.name}(検査日 ${c.inspectionDate})`;
  ws.getCell('A1').font = { name: FONT, size: 14, bold: true };
  ws.getRow(1).height = 24;

  const header = ws.getRow(3);
  cols.forEach((col, i) => {
    header.getCell(i + 1).value = col.header;
    style(header.getCell(i + 1), { bold: true, fill: COLOR.headerFill, color: 'FFFFFFFF', center: true });
  });
  header.height = 20;

  const ng = rows.filter((x) => c.entries[x.key]?.result === 'nonCompliant');
  if (ng.length === 0) {
    ws.mergeCells('A4:E4');
    ws.getCell('A4').value = '指摘事項なし';
    style(ws.getCell('A4'), { center: true });
    ws.getRow(4).height = 22;
  }
  ng.forEach((x, idx) => {
    const entry = c.entries[x.key];
    const row = ws.getRow(4 + idx);
    row.values = [
      idx + 1,
      withBuilding(ctx, x, `${x.item.title}\n(${x.item.id})`, '\n'),
      formatLegal(x.item.legalBasis),
      entry?.memo || '(指摘内容未記入)',
      recordText(ctx, x),
    ];
    row.eachCell({ includeEmpty: true }, (cell, col) => style(cell, { center: col === 1 }));
    fitRowHeight(ws, row, widths);
  });
  printSetup(ws, 3);
}

// ---------------------------------------------------------------------------
// 3. 階別記録
// ---------------------------------------------------------------------------

/** 1棟ぶんの階別記録の列(収容人員+階ごとの入力欄) */
function perFloorColumns(ctx: Ctx, building: BuildingInfo) {
  const floors = floorKeys(building);
  const capacity =
    Object.keys(building.floorCapacities).length > 0
      ? [
          {
            title: '収容人員\n(人)',
            value: (f: FloorKey): number | string | null => building.floorCapacities[f] ?? null,
            total: Object.values(building.floorCapacities).reduce((a, b) => a + b, 0) as number | null,
          },
        ]
      : [];
  const fields = ctx.rows
    .filter((x) => x.building === building)
    .flatMap((x) =>
      (x.item.fields ?? [])
        .filter((d) => d.kind === 'perFloorNumber')
        .map((def) => ({ def, value: ctx.c.entries[x.key]?.fields?.[def.key], item: x.item }))
        .filter(({ value }) => sumPerFloor(value, floors).filled + sumPerFloor(value, floors).invalid > 0)
        .map(({ def, value, item }) => ({
          title: `${item.title}\n${def.label}${def.kind === 'perFloorNumber' ? `(${def.unit})` : ''}`,
          value: (f: FloorKey): number | string | null => {
            const raw = (asPerFloor(value)[f] ?? '').trim();
            const n = sumPerFloor({ [f]: raw }, [f]);
            // 数値として読めるものは数値で出力(Excel上で再計算できるように)
            return raw === '' ? null : n.filled ? n.total : raw;
          },
          total: sumPerFloor(value, floors).total as number | null,
        })),
    );
  return { floors, columns: [...capacity, ...fields] };
}

function addPerFloorSheet(wb: Workbook, ctx: Ctx) {
  const blocks = ctx.c.buildings
    .map((b, i) => ({ b, i, ...perFloorColumns(ctx, b) }))
    .filter((x) => x.columns.length > 0 && x.floors.length > 0);
  if (blocks.length === 0) return;

  const ws = wb.addWorksheet('階別記録');
  const maxCols = Math.max(...blocks.map((x) => x.columns.length));
  ws.columns = [{ width: 12 }, ...Array.from({ length: maxCols }, () => ({ width: 22 }))];
  ws.getCell('A1').value = `階別記録 ${ctx.c.site.name}`;
  ws.getCell('A1').font = { name: FONT, size: 14, bold: true };

  let r = 3;
  for (const { b, i, floors, columns } of blocks) {
    if (ctx.multi) {
      ws.mergeCells(r, 1, r, columns.length + 1);
      ws.getCell(r, 1).value = buildingName(b, i);
      style(ws.getCell(r, 1), { bold: true, fill: COLOR.labelFill });
      r++;
    }
    const header = ws.getRow(r);
    header.getCell(1).value = '階';
    columns.forEach((col, j) => (header.getCell(j + 2).value = col.title));
    header.eachCell((cell) => style(cell, { bold: true, fill: COLOR.headerFill, color: 'FFFFFFFF', center: true }));
    header.height = 34;
    const first = r + 1;

    // 上の階から順に(図面・報告書の慣例に合わせる)
    const ordered = [...floors].reverse();
    ordered.forEach((f, idx) => {
      const row = ws.getRow(first + idx);
      row.getCell(1).value = floorLabel(f);
      style(row.getCell(1), { center: true, fill: COLOR.labelFill });
      columns.forEach((col, j) => {
        const cell = row.getCell(j + 2);
        cell.value = col.value(f);
        style(cell, { center: true });
      });
    });
    const totalRow = ws.getRow(first + ordered.length);
    totalRow.getCell(1).value = '合計';
    style(totalRow.getCell(1), { bold: true, center: true, fill: COLOR.labelFill });
    columns.forEach((col, j) => {
      const letter = ws.getColumn(j + 2).letter;
      const cell = totalRow.getCell(j + 2);
      cell.value = { formula: `SUM(${letter}${first}:${letter}${first + ordered.length - 1})`, result: col.total ?? 0 };
      style(cell, { bold: true, center: true });
    });
    r = first + ordered.length + 2;
  }
  printSetup(ws);
  ws.pageSetup.orientation = 'portrait';
}

// ---------------------------------------------------------------------------
// 5. 対象物情報
// ---------------------------------------------------------------------------

/** 有効開口部の記録(1階分):床面積・判定、開口部の一覧、メモ */
function formatOpeningRecord(rec: OpeningFloorRecord): string {
  const head = [rec.floorArea !== undefined ? `床面積 ${rec.floorArea.toLocaleString('ja-JP')}㎡` : '', formatJudgement(judgeRecord(rec))]
    .filter(Boolean)
    .join(' / ');
  const lines = rec.openings.map((o) => {
    const marks = [isEffectiveOpening(o) ? '' : '50cm円不可', isLargeOpening(o) ? '大型' : ''].filter(Boolean).join('・');
    return `・${openingPlace(o) || '場所未記入'} ${openingKindLabel(o.kind)} ${o.width}×${o.height}cm×${o.count}箇所${marks ? `(${marks})` : ''}`;
  });
  return [head, ...lines, ...(rec.memo ? [`メモ:${rec.memo}`] : [])].join('\n');
}

function buildingRows(b: BuildingInfo): [string, string][] {
  const yesNo = (v: boolean) => (v ? 'あり' : 'なし');
  const floorCaps = floorKeys(b)
    .filter((f) => b.floorCapacities[f] !== undefined)
    .reverse()
    .map((f) => `${floorLabel(f)} ${b.floorCapacities[f]}人`)
    .join('、');
  return [
    ['用途', formatUsage(b)],
    ['区分', formatSpecified(b)],
    ['延べ面積', `${b.totalFloorArea.toLocaleString('ja-JP')}㎡`],
    ['地上階数', `${b.floorsAbove}階`],
    ['地下階数', `${b.floorsBelow}階`],
    ['収容人員', `${b.capacity}人`],
    ['階ごとの収容人員', floorCaps],
    ...b.tenants.map((t, i): [string, string] => [
      `テナント${i + 1}`,
      [
        t.name || '(名称未入力)',
        t.usage ? formatUsage({ ...b, usage: t.usage, subUsages: [] }) : '用途未入力',
        t.floor ? floorLabel(t.floor) : '階未設定',
        t.area !== undefined ? `${t.area.toLocaleString('ja-JP')}㎡` : '',
        t.capacity !== undefined ? `${t.capacity}人` : '',
      ]
        .filter(Boolean)
        .join(' / '),
    ]),
    ['高層建築物(31m超)', yesNo(b.isHighRise)],
    ['無窓階', yesNo(b.hasWindowlessFloor)],
    ...(b.openingRecords ?? []).map((rec): [string, string] => [`有効開口部 ${floorLabel(rec.floor)}`, formatOpeningRecord(rec)]),
    ['特定一階段等防火対象物', b.isSingleStaircase ? '該当' : '非該当'],
    ['管理権原が複数', yesNo(b.hasMultipleOwners)],
    ['増改築の有無', formatRenovationStatus(b)],
    ['増改築の場所', b.renovation?.location ?? ''],
    ['増築面積', b.renovation?.area !== undefined ? `${b.renovation.area.toLocaleString('ja-JP')}㎡` : ''],
    ['増改築時期', b.renovation?.period ?? ''],
    ['設置済みの消防用設備等', formatEquipment(b)],
    ['火気使用設備・危険物等', formatFacilities(b)],
  ];
}

function addBuildingSheet(wb: Workbook, ctx: Ctx) {
  const { c, multi } = ctx;
  const ws = wb.addWorksheet('対象物情報');
  ws.columns = [{ width: 26 }, { width: 60 }];
  const site = c.site;

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
  const heading = (text: string) => {
    r++;
    ws.getCell(r, 1).value = text;
    ws.getCell(r, 1).font = { name: FONT, size: 12, bold: true };
    r++;
  };

  (
    [
      ['名称', site.name],
      ['所在地', site.address],
      ['代表者 社名・所属', site.representative?.org ?? ''],
      ['代表者 役職', site.representative?.title ?? ''],
      ['代表者 氏名', site.representative?.name ?? ''],
      ['立会者 社名・所属', site.witness?.org ?? ''],
      ['立会者 役職', site.witness?.title ?? ''],
      ['立会者 氏名', site.witness?.name ?? ''],
      ...(multi ? ([['棟数', `${c.buildings.length}棟`]] as [string, string][]) : []),
    ] as [string, string][]
  ).forEach((x) => put(x));

  c.buildings.forEach((b, i) => {
    const name = multi ? buildingName(b, i) : '';
    if (multi) heading(name);
    buildingRows(b).forEach((x) => put(x));
    heading(multi ? `${name} 各種届出の状況` : '各種届出の状況');
    notificationRows(b).forEach((x) => put(x));
  });
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
  const { c, rows, multi } = ctx;
  interface Group {
    heading: string;
    headColor?: string;
    memo: string;
    photos: ExportPhoto[];
    captions: Record<string, string>;
  }
  const groups: Group[] = c.buildings.flatMap((b, bIndex) => {
    const prefix = multi ? `${buildingName(b, bIndex)} ` : '';
    const reno = b.renovation;
    const renoPhotos = (reno?.photoIds ?? []).map((id) => ctx.photos.get(id)).filter((p): p is ExportPhoto => !!p);
    const toPhotos = (ids: string[]) => ids.map((id) => ctx.photos.get(id)).filter((p): p is ExportPhoto => !!p);
    // 有効開口部:階ごとの全景、続いて窓ごと
    const openingGroups: Group[] = (b.openingRecords ?? []).flatMap((rec) => {
      const floor = floorLabel(rec.floor);
      return [
        {
          heading: `${prefix}有効開口部 ${floor} 全景`,
          memo: [formatJudgement(judgeRecord(rec)), rec.memo].filter(Boolean).join('\n'),
          photos: toPhotos(rec.photoIds ?? []),
          captions: rec.photoCaptions ?? {},
        },
        ...rec.openings.map((o) => ({
          heading: `${prefix}有効開口部 ${floor} ${openingPlace(o) || '場所未記入'}`,
          memo: `${openingKindLabel(o.kind)} ${o.width}×${o.height}cm×${o.count}箇所`,
          photos: toPhotos(o.photoIds ?? []),
          captions: o.photoCaptions ?? {},
        })),
      ].filter((g) => g.photos.length > 0);
    });
    return [
      // 増改築(対象物情報)の写真を各棟の最初に
      ...(renoPhotos.length
        ? [{ heading: `${prefix}増改築(対象物情報)`, memo: formatRenovation(b), photos: renoPhotos, captions: reno?.photoCaptions ?? {} }]
        : []),
      ...openingGroups,
      ...rows
        .filter((x) => x.building === b)
        .map((x) => {
          const entry = c.entries[x.key];
          return {
            heading: `${prefix}No.${x.no} ${x.item.title}(${x.item.id}) 判定:${formatResult(entry?.result)}`,
            headColor: RESULT_STYLE[entry?.result ?? 'pending'].color,
            memo: entry?.memo ?? '',
            photos: itemPhotos(ctx, x.key),
            captions: entry?.photoCaptions ?? {},
          };
        })
        .filter((g) => g.photos.length > 0),
    ];
  });
  if (groups.length === 0) return;

  const ws = wb.addWorksheet('写真');
  ws.columns = [{ width: PHOTO_COL_WIDTH }, { width: PHOTO_COL_WIDTH }];
  ws.mergeCells('A1:B1');
  ws.getCell('A1').value = `写真 ${c.site.name}(検査日 ${c.inspectionDate})`;
  ws.getCell('A1').font = { name: FONT, size: 14, bold: true };
  ws.getRow(1).height = 24;

  let r = 3;
  for (const { heading, headColor, memo, photos, captions } of groups) {
    ws.mergeCells(r, 1, r, 2);
    const head = ws.getCell(r, 1);
    head.value = heading;
    style(head, { bold: true, fill: COLOR.labelFill, color: headColor });
    ws.getRow(r).height = 20;
    r++;

    if (memo.trim()) {
      ws.mergeCells(r, 1, r, 2);
      const m = ws.getCell(r, 1);
      m.value = memo;
      style(m);
      ws.getRow(r).height = Math.max(18, estimateLines(memo, PHOTO_COL_WIDTH * 2) * LINE_HEIGHT + 4);
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
        const comment = captions[p.id]?.trim() ?? '';
        const date = new Date(p.createdAt).toLocaleString('ja-JP');
        // コメント(場所など)を主に、日時は補足として表示
        cap.value = comment
          ? {
              richText: [
                { text: `写真${i + j + 1} ${comment}`, font: { name: FONT, size: 10, bold: true } },
                { text: `\n${date}`, font: { name: FONT, size: 8, color: { argb: 'FF6E6E73' } } },
              ],
            }
          : `写真${i + j + 1} ${date}`;
        if (!comment) cap.font = { name: FONT, size: 9, color: { argb: 'FF6E6E73' } };
        cap.alignment = { vertical: 'top', wrapText: true };
      });
      const captionLines = Math.max(
        1,
        ...pair.map((p, j) => {
          const comment = captions[p.id]?.trim() ?? '';
          return comment ? estimateLines(`写真${i + j + 1} ${comment}`, PHOTO_COL_WIDTH) + 1 : 1;
        }),
      );
      ws.getRow(r + 1).height = captionLines * LINE_HEIGHT + 4;
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
    rows: caseRows(c),
    multi: c.buildings.length > 1,
    photos: new Map((opts.photos ?? []).map((p) => [p.id, p])),
  };
  // 査察結果通知書(様式第4号)を先頭に。指導事項がある場合は指導事項(様式第5号)・改善計画(様式第7号)も
  const findings = collectFindings(c);
  addNoticeSheet(wb, c, findings.length > 0);
  if (findings.length > 0) {
    addGuidanceSheet(wb, c, findings);
    addImprovementSheet(wb, c, findings);
  }
  addChecklistSheet(wb, ctx, exportedAt);
  addFindingsSheet(wb, ctx);
  addPerFloorSheet(wb, ctx);
  addPhotoSheet(wb, ctx);
  addBuildingSheet(wb, ctx);
  return wb;
}
