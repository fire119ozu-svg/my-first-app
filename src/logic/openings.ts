/**
 * 有効開口部の記録と無窓階の判定(消防法施行規則第5条の3)。
 *
 * 普通階(無窓階以外の階)の要件:
 * - 直径50cm以上の円が内接できる開口部の面積の合計が、その階の床面積の1/30を超える
 * - 10階以下の階は、さらに「直径1m以上の円が内接できる開口部」または
 *   「幅75cm以上かつ高さ1.2m以上の開口部」(大型開口部)を2以上有する
 *
 * 開口部が要件(床面から下端1.2m以内・空地に面する・格子等がない等)を満たすかは査察員が判断し、
 * 要件を満たすものだけを入力する前提。引き違い窓は開く部分(幅の1/2)で計算する。
 */
import type { FloorKey, OpeningDirection, OpeningFloorRecord, OpeningKind, WindowOpening } from '../types/inspection';
import { newId } from './inspectionCase';
import { parseNumber } from './number';

export const OPENING_KINDS: { value: OpeningKind; label: string; hint: string }[] = [
  { value: 'sliding', label: '引き違い(幅1/2)', hint: '開く部分(幅の1/2)で計算' },
  { value: 'full', label: '全面', hint: '開き戸・開き窓、容易に破壊できるガラスのはめ殺し窓など' },
];

export const OPENING_DIRECTIONS: OpeningDirection[] = ['東', '西', '南', '北', '北東', '北西', '南東', '南西'];

/** 方角と場所をまとめた表示(例:東面 事務室)。どちらも空なら空文字 */
export function openingPlace(o: Pick<WindowOpening, 'direction' | 'location'>): string {
  return [o.direction ? `${o.direction}面` : '', o.location.trim()].filter(Boolean).join(' ');
}

export const openingKindLabel = (k: OpeningKind) => OPENING_KINDS.find((x) => x.value === k)?.label ?? k;

type OpeningSize = Pick<WindowOpening, 'kind' | 'width' | 'height' | 'count'>;

/** 有効な幅・高さ(cm) */
export function effectiveSize(o: Pick<WindowOpening, 'kind' | 'width' | 'height'>): { width: number; height: number } {
  return { width: o.kind === 'sliding' ? o.width / 2 : o.width, height: o.height };
}

/** 直径50cm以上の円が内接できるか */
export function isEffectiveOpening(o: Pick<WindowOpening, 'kind' | 'width' | 'height'>): boolean {
  const { width, height } = effectiveSize(o);
  return width >= 50 && height >= 50;
}

/** 大型開口部(直径1m以上の円が内接、または幅75cm以上かつ高さ1.2m以上)か */
export function isLargeOpening(o: Pick<WindowOpening, 'kind' | 'width' | 'height'>): boolean {
  const { width, height } = effectiveSize(o);
  return (width >= 100 && height >= 100) || (width >= 75 && height >= 120);
}

export interface OpeningJudgement {
  /** 直径50cm以上の円が内接できる開口部の有効面積の合計(㎡) */
  effectiveArea: number;
  /** 床面積の1/30(㎡)。床面積が未入力なら null */
  requiredArea: number | null;
  /** 大型開口部の数 */
  largeCount: number;
  /** 必要な大型開口部の数(10階以下は2、11階以上は0) */
  largeRequired: number;
  /** 普通階 / 無窓階。床面積が未入力なら null */
  result: 'normal' | 'windowless' | null;
}

/** 地上階の階番号(地階・不正な値は null) */
function floorNumber(floor: FloorKey): number | null {
  const n = Number(floor);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

export function judgeOpenings(floor: FloorKey, floorArea: number | undefined, openings: OpeningSize[]): OpeningJudgement {
  // 小数の誤差を避けるため cm² で合計する
  let areaCm2 = 0;
  let largeCount = 0;
  for (const o of openings) {
    if (isEffectiveOpening(o)) {
      const { width, height } = effectiveSize(o);
      areaCm2 += width * height * o.count;
    }
    if (isLargeOpening(o)) largeCount += o.count;
  }
  const n = floorNumber(floor);
  const largeRequired = n !== null && n >= 11 ? 0 : 2;
  const hasArea = floorArea !== undefined && floorArea > 0;
  // 「1/30を超える」:面積合計 × 30 > 床面積
  const enoughArea = hasArea && areaCm2 * 30 > floorArea * 10000;
  return {
    effectiveArea: Math.round(areaCm2 / 100) / 100,
    requiredArea: hasArea ? Math.round((floorArea / 30) * 100) / 100 : null,
    largeCount,
    largeRequired,
    result: hasArea ? (enoughArea && largeCount >= largeRequired ? 'normal' : 'windowless') : null,
  };
}

export const judgeRecord = (r: OpeningFloorRecord) => judgeOpenings(r.floor, r.floorArea, r.openings);

/** 判定結果の1行表示(例:有効開口 12.5㎡/必要 16.67㎡超・大型開口部 1/2 → 無窓階) */
export function formatJudgement(j: OpeningJudgement): string {
  const area = `有効開口 ${j.effectiveArea}㎡` + (j.requiredArea !== null ? `/必要 ${j.requiredArea}㎡超` : '');
  const large = j.largeRequired ? `・大型開口部 ${j.largeCount}/${j.largeRequired}` : '';
  const result = j.result === 'normal' ? '普通階' : j.result === 'windowless' ? '無窓階' : '判定なし(床面積未入力)';
  return `${area}${large} → ${result}`;
}

// ---------------------------------------------------------------------------
// 入力フォーム(数値欄は入力途中を許すため文字列で保持)
// ---------------------------------------------------------------------------

export type OpeningForm = Omit<WindowOpening, 'width' | 'height' | 'count'> & {
  width: string;
  height: string;
  /** 空欄は1箇所 */
  count: string;
};

export type OpeningRecordForm = Omit<OpeningFloorRecord, 'floor' | 'floorArea' | 'openings'> & {
  floor: FloorKey | '';
  floorArea: string;
  openings: OpeningForm[];
};

export function emptyOpening(kind: OpeningKind = 'sliding'): OpeningForm {
  return { id: newId(), direction: '', location: '', kind, width: '', height: '', count: '' };
}

export function emptyOpeningRecord(floor: FloorKey | '' = ''): OpeningRecordForm {
  return { id: newId(), floor, floorArea: '', memo: '', openings: [emptyOpening()] };
}

export function toOpeningRecordForms(records: OpeningFloorRecord[]): OpeningRecordForm[] {
  return records.map((r) => ({
    ...r,
    floorArea: r.floorArea === undefined ? '' : String(r.floorArea),
    openings: r.openings.map((o) => ({ ...o, width: String(o.width), height: String(o.height), count: String(o.count) })),
  }));
}

const openingHasInput = (o: OpeningForm) => !!(o.direction || o.location.trim() || o.width.trim() || o.height.trim() || o.count.trim());
const recordHasInput = (r: OpeningRecordForm) =>
  !!(r.floor || r.floorArea.trim() || r.memo.trim() || r.openings.some(openingHasInput));

/** 箇所数として読めるか(空欄は1、不正は null) */
function parseOpeningCount(raw: string): number | null {
  if (!raw.trim()) return 1;
  const v = parseNumber(raw);
  return v !== null && Number.isInteger(v) && v >= 1 ? v : null;
}

const positive = (raw: string) => {
  const v = parseNumber(raw);
  return v !== null && v > 0 ? v : null;
};

/** 入力途中の値で判定する(読めない開口部は除く。画面表示用) */
export function judgeRecordForm(r: OpeningRecordForm): OpeningJudgement {
  const openings: OpeningSize[] = [];
  for (const o of r.openings) {
    const width = positive(o.width);
    const height = positive(o.height);
    const count = parseOpeningCount(o.count);
    if (width !== null && height !== null && count !== null) openings.push({ kind: o.kind, width, height, count });
  }
  return judgeOpenings(r.floor, positive(r.floorArea) ?? undefined, openings);
}

/** 入力途中の値で無窓階と判定される階 */
export function windowlessFloors(records: OpeningRecordForm[]): FloorKey[] {
  return records.filter((r) => r.floor && judgeRecordForm(r).result === 'windowless').map((r) => r.floor as FloorKey);
}

/**
 * 有効開口部の入力を検証して保存用に変換する。何も入力の無い階・開口部は除く。
 * エラーのキー:`openingRecord:<記録ID>:<floor|floorArea>`、`opening:<開口部ID>:<width|height|count>`
 */
export function validateOpeningRecords(
  forms: OpeningRecordForm[],
  aboveFloors: FloorKey[],
): { records: OpeningFloorRecord[]; errors: Partial<Record<string, string>> } {
  const errors: Partial<Record<string, string>> = {};
  const records: OpeningFloorRecord[] = [];
  const seen = new Set<string>();
  for (const r of forms.filter(recordHasInput)) {
    const key = (k: string) => `openingRecord:${r.id}:${k}`;
    if (!r.floor) errors[key('floor')] = '階を選択してください';
    else if (aboveFloors.length && !aboveFloors.includes(r.floor)) errors[key('floor')] = '階を選び直してください';
    else if (seen.has(r.floor)) errors[key('floor')] = '同じ階が2回記録されています';
    if (r.floor) seen.add(r.floor);
    const floorArea = r.floorArea.trim() ? positive(r.floorArea) : undefined;
    if (floorArea === null) errors[key('floorArea')] = '床面積を数値で入力してください';

    const openings: WindowOpening[] = [];
    for (const o of r.openings.filter(openingHasInput)) {
      const width = positive(o.width);
      const height = positive(o.height);
      const count = parseOpeningCount(o.count);
      if (width === null) errors[`opening:${o.id}:width`] = '幅を数値(cm)で入力してください';
      if (height === null) errors[`opening:${o.id}:height`] = '高さを数値(cm)で入力してください';
      if (count === null) errors[`opening:${o.id}:count`] = '箇所数を1以上の整数で入力してください';
      if (width !== null && height !== null && count !== null) {
        openings.push({ id: o.id, direction: o.direction, location: o.location.trim(), kind: o.kind, width, height, count });
      }
    }
    records.push({
      id: r.id,
      floor: r.floor,
      ...(typeof floorArea === 'number' ? { floorArea } : {}),
      openings,
      memo: r.memo.trim(),
    });
  }
  // 階の順(下の階から)に並べる
  records.sort((a, b) => Number(a.floor) - Number(b.floor));
  return { records, errors };
}
