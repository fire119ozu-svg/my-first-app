/**
 * Excel出力用の文字列整形(ExcelJSに依存しない純粋関数)。
 */
import { EQUIPMENT_OPTIONS, FACILITY_OPTIONS, NOTIFICATION_OPTIONS, NOTIFICATION_STATUS_OPTIONS } from '../data/labels';
import { getUsageInfo } from '../data/usageCategories';
import { isSpecifiedBuilding } from '../logic/extractChecklist';
import { asPerFloor, asText, floorLabel, sumPerFloor } from '../logic/floors';
import { CASE_STATUS_LABELS } from '../logic/inspectionCase';
import {
  CHECK_RESULT_LABELS,
  type BuildingInfo,
  type CheckResult,
  type FloorKey,
  type InspectionCase,
  type ItemFieldDef,
  type ItemFieldValue,
  type LegalBasis,
  type PersonInfo,
} from '../types/inspection';

export function formatUsage(b: BuildingInfo): string {
  const u = getUsageInfo(b.usage);
  const subs = b.subUsages.length ? `(${b.subUsages.map((s) => `${s}項`).join('・')})` : '';
  return `${u.code}項 ${u.label}${subs}`;
}

/** 「社名 役職 氏名」(入力のあるものだけ) */
export function formatPerson(p: PersonInfo | undefined): string {
  return p ? [p.org ?? '', p.title, p.name].map((x) => x.trim()).filter(Boolean).join(' ') : '';
}

export function formatRenovationStatus(b: BuildingInfo): string {
  const st = b.renovation?.status;
  return st === 'yes' ? '有' : st === 'no' ? '無' : '未入力';
}

/** 「有(場所:3階東側/増築面積:120㎡/時期:令和5年3月)写真2枚」 */
export function formatRenovation(b: BuildingInfo): string {
  const r = b.renovation;
  let text = formatRenovationStatus(b);
  if (r?.status === 'yes') {
    const parts = [
      r.location && `場所:${r.location}`,
      r.area !== undefined && `増築面積:${r.area.toLocaleString('ja-JP')}㎡`,
      r.period && `時期:${r.period}`,
    ].filter(Boolean);
    if (parts.length) text += `(${parts.join('/')})`;
  }
  if (r?.photoIds.length) text += ` 写真${r.photoIds.length}枚(「写真」シート)`;
  return text;
}

export function formatSpecified(b: BuildingInfo): string {
  return isSpecifiedBuilding(b) ? '特定防火対象物' : '非特定防火対象物';
}

export function formatFloors(b: BuildingInfo): string {
  return `地上${b.floorsAbove}階` + (b.floorsBelow > 0 ? ` 地下${b.floorsBelow}階` : '');
}

export function formatResult(r: CheckResult | null | undefined): string {
  return r ? CHECK_RESULT_LABELS[r] : '未判定';
}

export function formatLegal(list: LegalBasis[]): string {
  return list.map((l) => `${l.law} ${l.article}${l.verified ? '' : '(条番号要確認)'}`).join('\n');
}

export function formatStatus(c: InspectionCase): string {
  return CASE_STATUS_LABELS[c.status];
}

/** 追加入力欄を1セル分の文字列に(未入力なら空文字) */
export function formatField(def: ItemFieldDef, value: ItemFieldValue | undefined, floors: FloorKey[]): string {
  if (def.kind === 'text') {
    const v = asText(value).trim();
    return v ? `${def.label}:${v}` : '';
  }
  const per = asPerFloor(value);
  const lines = floors
    .filter((f) => (per[f] ?? '').trim() !== '')
    .map((f) => `${floorLabel(f)} ${per[f].trim()}${def.unit}`);
  if (lines.length === 0) return '';
  const sum = sumPerFloor(value, floors);
  return `${def.label}\n${lines.join('\n')}\n合計 ${sum.total}${def.unit}`;
}

const labelOf = <T extends string>(opts: { value: T; label: string }[], v: T) =>
  opts.find((o) => o.value === v)?.label ?? v;

export function formatEquipment(b: BuildingInfo): string {
  return b.installedEquipment.map((e) => labelOf(EQUIPMENT_OPTIONS, e)).join('、') || 'なし';
}

export function formatFacilities(b: BuildingInfo): string {
  return b.facilities.map((f) => labelOf(FACILITY_OPTIONS, f)).join('、') || 'なし';
}

export function notificationRows(b: BuildingInfo): [string, string][] {
  return NOTIFICATION_OPTIONS.map((n) => {
    const s = b.notifications[n.value];
    return [n.label, s ? labelOf(NOTIFICATION_STATUS_OPTIONS, s) : '未入力'];
  });
}

/** ファイル名に使えない文字を除去 */
export function exportFileName(c: InspectionCase): string {
  const name = c.site.name.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40) || '案件';
  return `立入検査_${name}_${c.inspectionDate.replace(/-/g, '')}.xlsx`;
}

/**
 * セル幅(Excelの列幅 ≒ 半角文字数)に対して必要な行数を概算する。
 * 生成したxlsxはExcelが行の高さを自動調整しないため、出力側で高さを設定する。
 */
export function estimateLines(text: string, width: number): number {
  const usable = Math.max(1, width - 1);
  return text.split('\n').reduce((sum, line) => {
    let w = 0;
    for (const ch of line) w += /[\u0000-ÿ｡-ﾟ]/.test(ch) ? 1 : 2;
    return sum + Math.max(1, Math.ceil(w / usable));
  }, 0);
}
