/**
 * 新規案件に自動で入れる「前回の値」(所属・問い合わせ先TEL・検査員)。
 * 毎回同じことが多いため端末(localStorage)に覚えておく。
 * 利便性のためだけの保存で、消えても入力し直せばよい(案件データは IndexedDB 側にある)。
 */
import type { Inspector, OfficeInfo } from '../types/inspection';

const OFFICE_KEY = 'officeDefaults:v1';
const INSPECTORS_KEY = 'inspectorDefaults:v1';

export function loadOffice(): OfficeInfo {
  try {
    const raw = localStorage.getItem(OFFICE_KEY);
    if (raw) return { department: '', phone: '', ...(JSON.parse(raw) as Partial<OfficeInfo>) };
  } catch {
    // 保存領域が使えない環境では空欄
  }
  return { department: '', phone: '' };
}

/** 空欄のときは前回の値を残す */
export function storeOffice(o: OfficeInfo) {
  if (!o.department && !o.phone) return;
  try {
    localStorage.setItem(OFFICE_KEY, JSON.stringify(o));
  } catch {
    // 保存できなくても入力は継続できる
  }
}

/** 前回の検査員。記憶が無い・壊れている場合は空の1行 */
export function loadInspectors(): Inspector[] {
  try {
    const raw = localStorage.getItem(INSPECTORS_KEY);
    if (raw) {
      const v = JSON.parse(raw) as unknown;
      if (Array.isArray(v)) {
        const rows = v
          .filter((x): x is Partial<Inspector> => typeof x === 'object' && x !== null)
          .map((x) => ({ rank: typeof x.rank === 'string' ? x.rank : '', name: typeof x.name === 'string' ? x.name : '' }))
          .filter((x) => x.rank || x.name);
        if (rows.length) return rows;
      }
    }
  } catch {
    // 保存領域が使えない環境では空欄
  }
  return [{ rank: '', name: '' }];
}

/** 整形済み(空行を除いた)検査員を記憶する。1人もいないときは前回の値を残す */
export function storeInspectors(rows: Inspector[]) {
  if (!rows.length) return;
  try {
    localStorage.setItem(INSPECTORS_KEY, JSON.stringify(rows));
  } catch {
    // 保存できなくても入力は継続できる
  }
}
