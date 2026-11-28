/**
 * 階の一覧・表示・集計。
 */
import type { BuildingInfo, FloorKey, ItemFieldValue } from '../types/inspection';
import { parseNumber } from './number';

/** 地下の深い階から順に地上最上階まで(例:B2, B1, 1, 2, 3) */
export function floorKeys(building: Pick<BuildingInfo, 'floorsAbove' | 'floorsBelow'>): FloorKey[] {
  const below = Array.from({ length: building.floorsBelow }, (_, i) => `B${building.floorsBelow - i}`);
  const above = Array.from({ length: building.floorsAbove }, (_, i) => String(i + 1));
  return [...below, ...above];
}

export function floorLabel(key: FloorKey): string {
  return key.startsWith('B') ? `地下${key.slice(1)}階` : `${key}階`;
}

/** 階ごとの値として読む(文字列や未入力は空として扱う) */
export function asPerFloor(value: ItemFieldValue | undefined): Record<FloorKey, string> {
  return value && typeof value === 'object' ? value : {};
}

export function asText(value: ItemFieldValue | undefined): string {
  return typeof value === 'string' ? value : '';
}

/**
 * 現在の階構成に含まれる階だけを合計する。
 * 数値として読めない入力は invalid に数える。
 */
export function sumPerFloor(
  value: ItemFieldValue | undefined,
  keys: FloorKey[],
): { total: number; filled: number; invalid: number } {
  const v = asPerFloor(value);
  let total = 0;
  let filled = 0;
  let invalid = 0;
  for (const k of keys) {
    const raw = (v[k] ?? '').trim();
    if (!raw) continue;
    const n = parseNumber(raw);
    if (n === null) invalid++;
    else {
      total += n;
      filled++;
    }
  }
  // 小数の誤差を丸める(0.1 + 0.2 等)
  return { total: Math.round(total * 100) / 100, filled, invalid };
}
