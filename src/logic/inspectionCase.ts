/**
 * 検査案件の生成・更新(純粋関数)。保存は storage 層で行う。
 */
import { CHECKLIST_ITEMS } from '../data/checklistItems';
import type {
  BuildingInfo,
  CaseStatus,
  CheckEntry,
  CheckResult,
  InspectionCase,
  Inspector,
  ItemFieldValue,
} from '../types/inspection';
import { extractChecklistItems, sortChecklistItems } from './extractChecklist';

export interface CaseMeta {
  inspectionDate: string;
  inspectors: Inspector[];
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** ローカル日付(YYYY-MM-DD) */
export function today(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** 「消防司令補 消防太郎」(階級のみ・氏名のみも可) */
export function formatInspector(i: Inspector): string {
  return [i.rank, i.name].map((x) => x.trim()).filter(Boolean).join(' ');
}

/** 前後の空白を除き、階級・氏名とも空の行を除く */
export function normalizeInspectors(rows: Inspector[]): Inspector[] {
  return rows
    .map((r) => ({ rank: r.rank.trim(), name: r.name.trim() }))
    .filter((r) => r.rank || r.name);
}

/** 旧形式(「山田、佐藤」の文字列)を配列に */
export function parseInspectors(raw: string): string[] {
  return raw
    .split(/[、,，\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * @param id 下書きの段階で写真を保存するため、事前に決めたIDを使う場合に指定
 */
export function createCase(building: BuildingInfo, meta: CaseMeta, now = new Date(), id = newId()): InspectionCase {
  const ts = now.toISOString();
  return {
    id,
    status: 'draft',
    inspectionDate: meta.inspectionDate,
    inspectors: meta.inspectors,
    building,
    itemIds: extractChecklistItems(building).map((i) => i.id),
    entries: {},
    remarks: '',
    createdAt: ts,
    updatedAt: ts,
  };
}

function hasFieldInput(fields: CheckEntry['fields']): boolean {
  return Object.values(fields ?? {}).some((v) =>
    typeof v === 'string' ? v.trim() !== '' : Object.values(v).some((x) => x.trim() !== ''),
  );
}

function hasInput(e: CheckEntry | undefined): boolean {
  return (
    !!e &&
    (e.result !== null || e.memo.trim() !== '' || hasFieldInput(e.fields) || (e.photoIds?.length ?? 0) > 0)
  );
}

/**
 * 対象物情報の変更に伴い項目を再抽出する。
 * 入力済み(判定またはメモあり)の項目は、抽出対象外になっても結果を失わないよう残す。
 */
export function updateBuilding(
  c: InspectionCase,
  building: BuildingInfo,
  meta: CaseMeta,
  now = new Date(),
): InspectionCase {
  const extracted = extractChecklistItems(building).map((i) => i.id);
  const keep = c.itemIds.filter((id) => !extracted.includes(id) && hasInput(c.entries[id]));
  return {
    ...c,
    building,
    inspectionDate: meta.inspectionDate,
    inspectors: meta.inspectors,
    itemIds: sortItemIds([...extracted, ...keep]),
    updatedAt: now.toISOString(),
  };
}

/** カテゴリ順 → マスタ順に並べる(抽出ロジックと同じ順序) */
function sortItemIds(ids: string[]): string[] {
  const set = new Set(ids);
  return sortChecklistItems(CHECKLIST_ITEMS.filter((i) => set.has(i.id))).map((i) => i.id);
}

export function updateEntry(
  c: InspectionCase,
  itemId: string,
  patch: Partial<Pick<CheckEntry, 'result' | 'memo' | 'fields' | 'photoIds' | 'photoCaptions'>>,
  now = new Date(),
): InspectionCase {
  const ts = now.toISOString();
  const prev: CheckEntry = c.entries[itemId] ?? { itemId, result: null, memo: '', updatedAt: ts };
  return {
    ...c,
    // 最初の入力で「検査中」へ
    status: c.status === 'draft' ? 'inspecting' : c.status,
    entries: { ...c.entries, [itemId]: { ...prev, ...patch, updatedAt: ts } },
    updatedAt: ts,
  };
}

/** 追加入力欄の値を更新する */
export function updateEntryField(
  c: InspectionCase,
  itemId: string,
  key: string,
  value: ItemFieldValue,
  now = new Date(),
): InspectionCase {
  const fields = { ...c.entries[itemId]?.fields, [key]: value };
  return updateEntry(c, itemId, { fields }, now);
}

export function addEntryPhoto(c: InspectionCase, itemId: string, photoId: string, now = new Date()): InspectionCase {
  const ids = c.entries[itemId]?.photoIds ?? [];
  return updateEntry(c, itemId, { photoIds: [...ids, photoId] }, now);
}

export function removeEntryPhoto(c: InspectionCase, itemId: string, photoId: string, now = new Date()): InspectionCase {
  const entry = c.entries[itemId];
  const ids = entry?.photoIds ?? [];
  // 写真と一緒にコメントも消す
  const { [photoId]: _removed, ...captions } = entry?.photoCaptions ?? {};
  void _removed;
  return updateEntry(c, itemId, { photoIds: ids.filter((id) => id !== photoId), photoCaptions: captions }, now);
}

/** 写真のコメント(撮影場所など)を設定する。空文字は削除扱い */
export function setPhotoCaption(
  c: InspectionCase,
  itemId: string,
  photoId: string,
  caption: string,
  now = new Date(),
): InspectionCase {
  const { [photoId]: _old, ...rest } = c.entries[itemId]?.photoCaptions ?? {};
  void _old;
  return updateEntry(c, itemId, { photoCaptions: caption ? { ...rest, [photoId]: caption } : rest }, now);
}

/** 案件内の全写真ID(増改築 → 項目の並び順) */
export function allPhotoIds(c: InspectionCase): string[] {
  return [...(c.building.renovation?.photoIds ?? []), ...c.itemIds.flatMap((id) => c.entries[id]?.photoIds ?? [])];
}

/** 増改築の写真を保存するときの項目キー(PhotoRecord.itemId) */
export const RENOVATION_PHOTO_KEY = '__renovation__';

export function setStatus(c: InspectionCase, status: CaseStatus, now = new Date()): InspectionCase {
  return { ...c, status, updatedAt: now.toISOString() };
}

export function setRemarks(c: InspectionCase, remarks: string, now = new Date()): InspectionCase {
  return { ...c, remarks, updatedAt: now.toISOString() };
}

export interface CaseProgress {
  total: number;
  done: number;
  compliant: number;
  nonCompliant: number;
  notApplicable: number;
}

export function caseProgress(c: InspectionCase, itemIds: string[] = c.itemIds): CaseProgress {
  const p: CaseProgress = { total: itemIds.length, done: 0, compliant: 0, nonCompliant: 0, notApplicable: 0 };
  for (const id of itemIds) {
    const r: CheckResult | null | undefined = c.entries[id]?.result;
    if (!r) continue;
    p.done++;
    p[r]++;
  }
  return p;
}

export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  draft: '未着手',
  inspecting: '検査中',
  completed: '完了',
};
