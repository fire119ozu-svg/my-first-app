/**
 * 高知市査察事務処理マニュアルの様式をExcelシートとして出力する。
 *
 *   様式第4号 査察結果通知書 … 常に出力(指導事項が無い場合は不備事項なしの文面)
 *   様式第5号 指導事項       … 判定「否」がある場合のみ
 *   様式第7号 改善計画・結果報告書 … 判定「否」がある場合のみ(関係者が記入する欄は空欄)
 *
 * 発送番号(防第 号)・通知年月日・受領欄は手書き・後入力のため空欄とする。
 */
import type ExcelJS from 'exceljs';
import { getChecklistItem } from '../data/checklistItems';
import { INSTRUCTIONS } from '../data/instructions';
import { buildingName, checklistOf, entryKey, formatInspector } from '../logic/inspectionCase';
import type { BuildingInfo, ChecklistItem, InspectionCase, PersonInfo } from '../types/inspection';
import { estimateLines } from './format';
import { formatCitation, stationOf, toWareki } from './officialFormat';

type Worksheet = ExcelJS.Worksheet;

const FONT = '游明朝';
/** A4縦に収まる10列のグリッド(1列 ≒ 半角8.6文字) */
const COLS = 10;
const COL_WIDTH = 8.6;
const LINE = 16;
/** A4縦の印刷範囲の高さ(pt)の目安(余白・ヘッダーを除く) */
const PAGE_HEIGHT_PT = 700;
/** 通知年月日・発送番号(手書き用の空欄)。同じ文字数にして位置をそろえる */
const DATE_LINE = '令和　　年　　月　　日';
const NUMBER_LINE = '防第　　　　　　　　号';
/** 改善計画・結果報告書の表の最低行数(枠数) */
const MIN_PLAN_ROWS = 5;
const thin = { style: 'thin' as const, color: { argb: 'FF000000' } };

/** 指導事項(判定「否」)1件 */
export interface Finding {
  no: number;
  building: BuildingInfo;
  bIndex: number;
  item: ChecklistItem;
  memo: string;
}

/** 判定「否」の項目を棟の順・項目の順に通し番号で並べる */
export function collectFindings(c: InspectionCase): Finding[] {
  let no = 0;
  return c.buildings.flatMap((building, bIndex) =>
    checklistOf(c, building.id)
      .filter((id) => c.entries[entryKey(building.id, id)]?.result === 'nonCompliant')
      .map((id) => getChecklistItem(id))
      .filter((i): i is ChecklistItem => i !== undefined)
      .map((item) => ({
        no: ++no,
        building,
        bIndex,
        item,
        memo: c.entries[entryKey(building.id, item.id)]?.memo.trim() ?? '',
      })),
  );
}

function setup(ws: Worksheet) {
  ws.columns = Array.from({ length: COLS }, () => ({ width: COL_WIDTH }));
  ws.pageSetup = {
    paperSize: 9,
    orientation: 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.7, right: 0.6, top: 0.7, bottom: 0.6, header: 0.3, footer: 0.3 },
  };
  ws.properties.defaultRowHeight = LINE + 2;
}

interface CellOpts {
  size?: number;
  bold?: boolean;
  align?: 'left' | 'center' | 'right';
  valign?: 'top' | 'middle';
  border?: boolean;
  /** 字下げ(枠線に文字が付かないように) */
  indent?: number;
}

/** 結合したセルに値を入れる(r1..r2 行, c1..c2 列。1始まり) */
function put(ws: Worksheet, r1: number, c1: number, r2: number, c2: number, value: string, o: CellOpts = {}) {
  if (r1 !== r2 || c1 !== c2) ws.mergeCells(r1, c1, r2, c2);
  const cell = ws.getCell(r1, c1);
  cell.value = value;
  cell.font = { name: FONT, size: o.size ?? 10.5, bold: o.bold };
  cell.alignment = { horizontal: o.align ?? 'left', vertical: o.valign ?? 'middle', wrapText: true, indent: o.indent };
  if (o.border) box(ws, r1, c1, r2, c2);
}

/** 範囲の外周に罫線を引く */
function box(ws: Worksheet, r1: number, c1: number, r2: number, c2: number) {
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const cell = ws.getCell(r, c);
      cell.border = {
        ...cell.border,
        ...(r === r1 ? { top: thin } : {}),
        ...(r === r2 ? { bottom: thin } : {}),
        ...(c === c1 ? { left: thin } : {}),
        ...(c === c2 ? { right: thin } : {}),
      };
    }
  }
}

/** 1〜last 行の高さの合計(pt) */
function usedHeight(ws: Worksheet, last: number): number {
  let sum = 0;
  for (let r = 1; r <= last; r++) sum += ws.getRow(r).height ?? LINE + 2;
  return sum;
}

/**
 * 用紙(A4縦)の余りを指定した行に重みに応じて配分し、内容を用紙全体にバランスよく配置する。
 * 内容が1ページを超える場合は何もしない。
 */
function spreadToPage(ws: Worksheet, last: number, spacers: [row: number, weight: number][]) {
  const extra = PAGE_HEIGHT_PT - usedHeight(ws, last);
  if (extra <= 0) return;
  const total = spacers.reduce((a, [, w]) => a + w, 0);
  for (const [row, w] of spacers) {
    const h = ws.getRow(row).height ?? LINE + 2;
    // Excel の行の高さの上限は409pt
    ws.getRow(row).height = Math.min(400, h + (extra * w) / total);
  }
}

function height(ws: Worksheet, r: number, lines: number) {
  ws.getRow(r).height = Math.max(LINE + 2, lines * LINE + 4);
}

/** 文章の行数(結合幅 cols 列ぶん) */
const linesOf = (text: string, cols: number) => estimateLines(text, cols * COL_WIDTH * 0.95);

/** 「○○株式会社 代表取締役 ○○○○」 */
function personLine(p: PersonInfo | undefined): string {
  return p ? [p.org ?? '', p.title, p.name].map((x) => x.trim()).filter(Boolean).join(' ') : '';
}

// ---------------------------------------------------------------------------
// 様式第4号 査察結果通知書
// ---------------------------------------------------------------------------

export function addNoticeSheet(wb: ExcelJS.Workbook, c: InspectionCase, hasFindings: boolean) {
  const ws = wb.addWorksheet('査察結果通知書');
  setup(ws);
  ws.pageSetup.fitToHeight = 1;
  const site = c.site;
  const rep = site.representative;
  const lead = c.inspectors[0];
  const department = c.office?.department ?? '';
  const station = stationOf(department) || '○○消防署';
  const date = toWareki(c.inspectionDate);

  put(ws, 1, 1, 1, 3, '様式第4号');
  // 発送番号と日付は同じ文字数にして、左右の端をそろえる
  put(ws, 2, 7, 2, 10, NUMBER_LINE, { align: 'right' });
  put(ws, 3, 7, 3, 10, DATE_LINE, { align: 'right' });

  // 名宛人(関係者)
  put(ws, 5, 1, 5, 6, site.address);
  put(ws, 6, 1, 6, 6, rep?.org ?? '');
  put(ws, 7, 1, 7, 6, `${[rep?.title ?? '', rep?.name ?? ''].filter(Boolean).join('　')}　　様`);

  // 発信者(査察員:主担当者又は階級上位者の1名=検査員の1人目)
  put(ws, 9, 5, 9, 6, '所　属');
  put(ws, 9, 7, 9, 10, department);
  put(ws, 10, 5, 10, 6, '査察員');
  put(ws, 10, 7, 10, 10, lead ? formatInspector(lead).replace(' ', '　') : '');

  put(ws, 12, 1, 12, 10, '査　察　結　果　通　知　書', { align: 'center', bold: true, size: 14 });
  ws.getRow(12).height = 28;

  put(ws, 14, 1, 14, 2, '所在地');
  put(ws, 14, 3, 14, 10, site.address);
  put(ws, 15, 1, 15, 2, '名　称');
  put(ws, 15, 3, 15, 10, site.name);
  put(ws, 16, 1, 16, 2, '立会者');
  const witness = personLine(site.witness);
  put(ws, 16, 3, 16, 10, witness ? `${witness}　様` : '');

  // 本文
  const body = hasFindings
    ? `　上記対象物は${date}消防法第４条により立入検査を実施したところ、別紙のとおり火災予防上の不備事項があるので、是正するよう指導します。\n` +
      `　なお、この指導事項については通知書受領後20日以内に別添の改善計画・結果報告書に改善内容を記入し、${station}に提出してください。`
    : `　上記対象物は${date}消防法第４条により立入検査を実施したところ、火災予防上の不備事項は認められませんでした。`;
  put(ws, 18, 1, 18, 10, body, { valign: 'top', border: true, indent: 1 });
  height(ws, 18, Math.max(5, linesOf(body, 9.5) + 1));

  // 問い合わせ先・受領欄
  // 「(注) お問い合わせ先」は枠の左上、消防署名・TELは枠の中央に配置する(枠は1つ)
  put(ws, 19, 1, 19, 5, '(注)　お問い合わせ先', { valign: 'top', indent: 1 });
  put(ws, 20, 1, 21, 5, `${station}\nＴＥＬ　${c.office?.phone ?? ''}`, { align: 'center', valign: 'middle' });
  box(ws, 19, 1, 21, 5);
  put(ws, 19, 6, 19, 7, '受領年月日', { align: 'center', border: true });
  put(ws, 19, 8, 19, 10, '年　　月　　日', { align: 'right', border: true, indent: 1 });
  put(ws, 20, 6, 21, 7, '受領者氏名', { align: 'center', border: true });
  put(ws, 20, 8, 21, 10, '', { border: true });
  // 受領欄・お問い合わせ先は記入に必要な高さに固定する(余白の配分対象にしない)
  ws.getRow(19).height = 22; // 受領年月日
  ws.getRow(20).height = 21; // 受領者氏名(2行分)
  ws.getRow(21).height = 21;

  // 備考
  put(ws, 22, 1, 24, 1, '備\n考', { align: 'center', valign: 'middle', border: true });
  put(ws, 22, 2, 24, 10, '', { border: true });
  [22, 23, 24].forEach((r) => height(ws, r, 1.5));

  // 余白を各ブロックの間と枠内に配分して、用紙全体に配置する(記入例と同じバランス)
  spreadToPage(ws, 24, [
    [4, 2], // 日付と名宛人の間
    [8, 1.5], // 名宛人と所属の間
    [11, 2.5], // 標題の前
    [13, 3], // 標題の後(所在地・名称・立会者は本文枠の1行上に寄せる)
    [14, 0.5],
    [15, 0.5],
    [16, 0.5],
    // 17行目(立会者と本文枠の間)は1行ぶんのまま
    [18, 2], // 本文枠
    [22, 1], // 備考欄
    [23, 1],
    [24, 1],
  ]);
}

// ---------------------------------------------------------------------------
// 様式第5号 指導事項
// ---------------------------------------------------------------------------

export function addGuidanceSheet(wb: ExcelJS.Workbook, c: InspectionCase, findings: Finding[]) {
  const ws = wb.addWorksheet('指導事項');
  setup(ws);
  const multi = c.buildings.length > 1;

  put(ws, 1, 1, 1, 3, '様式第5号');
  put(ws, 2, 1, 2, 2, '検　査　日', { align: 'center', border: true });
  put(ws, 2, 3, 2, 10, toWareki(c.inspectionDate), { border: true });
  put(ws, 3, 1, 3, 2, '名　　　称', { align: 'center', border: true });
  put(ws, 3, 3, 3, 10, c.site.name, { border: true });
  put(ws, 4, 1, 4, 10, '指　　導　　事　　項', { align: 'center', border: true });
  [2, 3, 4].forEach((r) => height(ws, r, 1.4));

  let r = 5;
  const line = (text: string, indent = 0) => {
    // 枠線から離すため Excel の字下げ1、さらに段落ごとに全角空白で字下げ
    put(ws, r, 1, r, 10, `${'　'.repeat(indent)}${text}`, { valign: 'top', indent: 1 });
    height(ws, r, linesOf(`${'　'.repeat(indent)}${text}`, 9.5));
    r++;
  };
  const blank = () => {
    ws.getRow(r).height = 8;
    r++;
  };

  let current: BuildingInfo | null = null;
  for (const f of findings) {
    if (f.building !== current) {
      current = f.building;
      if (r > 5) blank();
      // 棟の表示(1棟のみの場合は対象物名称)
      line(`棟　：　${multi ? buildingName(f.building, f.bIndex) : c.site.name}`);
      blank();
    }
    line(`${toZenkaku(f.no)}　${f.item.title}について(${formatCitation(f.item.legalBasis)})`, 0);
    line(INSTRUCTIONS[f.item.id] ?? '', 2);
    if (f.memo) line(`(${f.memo})`, 1);
    blank();
  }
  // 枠を用紙の下端近くまで伸ばす(記入例と同じ見た目にする)。内容が1ページを超える場合はそのまま
  const used = Array.from({ length: r - 1 }, (_, i) => ws.getRow(i + 1).height ?? LINE + 2).reduce((a, b) => a + b, 0);
  // Excel の行の高さは最大409ptのため、残りを複数行に分ける
  let remaining = Math.max(LINE, PAGE_HEIGHT_PT - used);
  for (;;) {
    ws.getRow(r).height = Math.min(400, remaining);
    remaining -= 400;
    if (remaining <= 0) break;
    r++;
  }
  box(ws, 5, 1, r, 10);
}

// ---------------------------------------------------------------------------
// 様式第7号 改善計画・結果報告書
// ---------------------------------------------------------------------------

export function addImprovementSheet(wb: ExcelJS.Workbook, c: InspectionCase, findings: Finding[]) {
  const ws = wb.addWorksheet('改善計画・結果報告書');
  setup(ws);
  const rep = c.site.representative;
  const station = stationOf(c.office?.department ?? '');

  put(ws, 1, 1, 1, 4, '様式第7号(第23条)');
  put(ws, 2, 1, 2, 10, '改　善　計　画　・　結　果　報　告　書', { align: 'center', bold: true, size: 14 });
  ws.getRow(2).height = 26;
  put(ws, 3, 7, 3, 10, '　　年　　月　　日', { align: 'right' });
  put(ws, 4, 1, 4, 6, `　${station || '高知市　　　消防署'}長　　様`);

  // 報告者欄(建物は記入済み、関係者・担当者は関係者が記入)
  const right: [string, string][] = [
    ['所在地', c.site.address],
    ['建物名称', c.site.name],
    ['', ''],
    ['(関係者)', ''],
    ['所在地', ''],
    ['社名・職・氏名', rep?.org ?? ''],
    ['', [rep?.title ?? '', rep?.name ?? ''].filter(Boolean).join('　')],
    ['電話', ''],
    ['(担当者)', ''],
    ['所在地', ''],
    ['社名・職・氏名', ''],
    ['電話', ''],
  ];
  let r = 6;
  for (const [k, v] of right) {
    put(ws, r, 5, r, 6, k);
    put(ws, r, 7, r, 10, v);
    r++;
  }
  const gapBeforeLead = r;
  r++;
  put(ws, r, 1, r, 10, `　${toWareki(c.inspectionDate)}の消防法第４条に基づく指導事項の改修について、下記のとおり報告します。`);
  r++;

  // 表
  put(ws, r, 1, r, 1, '番号', { align: 'center', border: true });
  put(ws, r, 2, r, 4, '指導事項', { align: 'center', border: true });
  put(ws, r, 5, r, 7, '改修計画・結果の内容', { align: 'center', border: true });
  put(ws, r, 8, r, 10, '改修(計画)日', { align: 'center', border: true });
  r++;
  const multi = c.buildings.length > 1;
  const filled = findings.map((f) => ({
    no: toZenkaku(f.no),
    title: `${multi ? `${buildingName(f.building, f.bIndex)}\n` : ''}${f.item.title}について`,
  }));
  // 予備の空欄を2行設け、指導事項が少なくても最低5行(枠)にする
  const blanks = Math.max(MIN_PLAN_ROWS - filled.length, 2);
  const rows = [...filled, ...Array.from({ length: blanks }, () => ({ no: '', title: '' }))];
  const tableRows: number[] = [];
  for (const x of rows) {
    tableRows.push(r, r + 1);
    put(ws, r, 1, r + 1, 1, x.no, { align: 'center', valign: 'top', border: true });
    put(ws, r, 2, r + 1, 4, x.title, { valign: 'top', border: true });
    put(ws, r, 5, r + 1, 7, '', { border: true });
    put(ws, r, 8, r, 10, '　　年　　月　　日', { align: 'center', border: true });
    put(ws, r + 1, 8, r + 1, 10, '□ 改修済み　□ 改修計画', { align: 'center', border: true });
    const lines = Math.max(1, Math.ceil(linesOf(x.title, 3) / 2));
    height(ws, r, lines);
    height(ws, r + 1, lines);
    r += 2;
  }

  const notes = [
    '・『改修計画・結果の内容』欄には、改修した内容又は計画を簡潔に記載してください。',
    '・『改修(計画)日』欄の改修済み又は改修計画のいずれかの□印にレ点を付けてください。',
    '・この報告書は、査察結果通知書又は是正指導書を受領してから、20日以内に報告してください。',
    '・改修済みのものは、写真やコピー等の資料を添付してその状況が判別できるようにしてください。',
  ];
  for (const n of notes) {
    put(ws, r, 1, r, 10, n, { size: 9.5 });
    r++;
  }
  const gapBeforeSign = r;
  r += 2;
  // 担当者氏名には査察員(通知書と同じく検査員の1人目)の階級・氏名を記載する
  put(ws, r, 5, r, 6, '担当者氏名');
  put(ws, r, 7, r, 10, c.inspectors[0] ? formatInspector(c.inspectors[0]).replace(' ', '　') : '', { align: 'center' });
  ws.getCell(r, 7).border = { bottom: thin };
  for (let col = 8; col <= 10; col++) ws.getCell(r, col).border = { bottom: thin };

  // 余白をブロックの間と表の行(記入欄)に配分して、用紙全体に配置する
  spreadToPage(ws, r, [
    [3, 1], // 標題と日付の間
    [5, 2], // 宛先と報告者欄の間
    [gapBeforeLead, 2],
    ...tableRows.map((row): [number, number] => [row, 0.6]),
    [gapBeforeSign, 2],
  ]);
}

/** 1 → 1 (全角) */
function toZenkaku(n: number): string {
  return String(n).replace(/[0-9]/g, (d) => String.fromCharCode(d.charCodeAt(0) + 0xfee0));
}
