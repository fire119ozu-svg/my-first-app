/**
 * 検査案件の生成・更新(純粋関数)。保存は storage 層で行う。
 *
 * 案件は対象物(敷地)全体の情報と1つ以上の棟からなり、チェック項目は棟ごとに抽出する。
 * 結果は entryKey(棟ID, 項目ID) をキーに保持する。
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
  OfficeInfo,
  SiteInfo,
} from '../types/inspection';
import { extractChecklistItems, sortChecklistItems } from './extractChecklist';

export interface CaseMeta {
  inspectionDate: string;
  inspectors: Inspector[];
  office?: OfficeInfo;
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

// ---------------------------------------------------------------------------
// 棟・結果のキー
// ---------------------------------------------------------------------------

export function entryKey(buildingId: string, itemId: string): string {
  return `${buildingId}:${itemId}`;
}

/** 増改築の写真を保存するときの項目キー(PhotoRecord.itemId) */
export function renovationPhotoKey(buildingId: string): string {
  return `${buildingId}:__renovation__`;
}

/** 有効開口部(全景・窓)の写真を保存するときの項目キー */
export function openingPhotoKey(buildingId: string, recordId: string, openingId?: string): string {
  return `${buildingId}:__opening__:${recordId}${openingId ? `:${openingId}` : ''}`;
}

/** 対象物情報の入力欄に添付した写真(増改築・有効開口部の全景・窓) */
export function buildingInfoPhotoIds(
  b: { renovation?: { photoIds: string[] }; openingRecords?: { photoIds: string[]; openings: { photoIds: string[] }[] }[] },
): string[] {
  return [
    ...(b.renovation?.photoIds ?? []),
    ...(b.openingRecords ?? []).flatMap((r) => [...(r.photoIds ?? []), ...r.openings.flatMap((o) => o.photoIds ?? [])]),
  ];
}

/** 表示用の棟名。棟名が未入力なら「第1棟」など */
export function buildingName(b: BuildingInfo, index: number): string {
  return b.label.trim() || `第${index + 1}棟`;
}

/** 案件内の全結果キー(棟の順 → 項目の順) */
export function allEntryKeys(c: InspectionCase): string[] {
  return c.checklists.flatMap((cl) => cl.itemIds.map((id) => entryKey(cl.buildingId, id)));
}

export function checklistOf(c: InspectionCase, buildingId: string): string[] {
  return c.checklists.find((cl) => cl.buildingId === buildingId)?.itemIds ?? [];
}

// ---------------------------------------------------------------------------
// 生成・更新
// ---------------------------------------------------------------------------

/**
 * @param id 下書きの段階で写真を保存するため、事前に決めたIDを使う場合に指定
 */
export function createCase(
  site: SiteInfo,
  buildings: BuildingInfo[],
  meta: CaseMeta,
  now = new Date(),
  id = newId(),
): InspectionCase {
  const ts = now.toISOString();
  return {
    id,
    status: 'draft',
    inspectionDate: meta.inspectionDate,
    inspectors: meta.inspectors,
    ...(meta.office ? { office: meta.office } : {}),
    site,
    buildings,
    checklists: buildings.map((b) => ({ buildingId: b.id, itemIds: extractChecklistItems(b).map((i) => i.id) })),
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

/** カテゴリ順 → マスタ順に並べる(抽出ロジックと同じ順序) */
function sortItemIds(ids: string[]): string[] {
  const set = new Set(ids);
  return sortChecklistItems(CHECKLIST_ITEMS.filter((i) => set.has(i.id))).map((i) => i.id);
}

/** 削除される棟に入力済みの内容があるか(確認表示用) */
export function removedBuildingsWithInput(c: InspectionCase, buildings: BuildingInfo[]): BuildingInfo[] {
  const keep = new Set(buildings.map((b) => b.id));
  return c.buildings.filter(
    (b) =>
      !keep.has(b.id) &&
      (checklistOf(c, b.id).some((id) => hasInput(c.entries[entryKey(b.id, id)])) || buildingInfoPhotoIds(b).length > 0),
  );
}

/**
 * 対象物情報の変更に伴い棟ごとに項目を再抽出する。
 * - 入力済み(判定・メモ・記録・写真あり)の項目は、抽出対象外になっても結果を失わないよう残す
 * - 削除された棟の結果は破棄し、その棟の写真IDを返す(呼び出し側で写真を削除する)
 */
export function updateCaseInfo(
  c: InspectionCase,
  site: SiteInfo,
  buildings: BuildingInfo[],
  meta: CaseMeta,
  now = new Date(),
): { case: InspectionCase; removedPhotoIds: string[] } {
  const keep = new Set(buildings.map((b) => b.id));
  const removedPhotoIds = c.buildings
    .filter((b) => !keep.has(b.id))
    .flatMap((b) => [
      ...buildingInfoPhotoIds(b),
      ...checklistOf(c, b.id).flatMap((id) => c.entries[entryKey(b.id, id)]?.photoIds ?? []),
    ]);
  const entries = Object.fromEntries(Object.entries(c.entries).filter(([, e]) => keep.has(e.buildingId)));
  const checklists = buildings.map((b) => {
    const extracted = extractChecklistItems(b).map((i) => i.id);
    const kept = checklistOf(c, b.id).filter((id) => !extracted.includes(id) && hasInput(entries[entryKey(b.id, id)]));
    return { buildingId: b.id, itemIds: sortItemIds([...extracted, ...kept]) };
  });
  return {
    case: {
      ...c,
      site,
      buildings,
      checklists,
      entries,
      inspectionDate: meta.inspectionDate,
      inspectors: meta.inspectors,
      office: meta.office,
      updatedAt: now.toISOString(),
    },
    removedPhotoIds,
  };
}

function splitKey(key: string): { buildingId: string; itemId: string } {
  const i = key.indexOf(':');
  return { buildingId: key.slice(0, i), itemId: key.slice(i + 1) };
}

export function updateEntry(
  c: InspectionCase,
  key: string,
  patch: Partial<Pick<CheckEntry, 'result' | 'memo' | 'fields' | 'photoIds' | 'photoCaptions'>>,
  now = new Date(),
): InspectionCase {
  const ts = now.toISOString();
  const prev: CheckEntry = c.entries[key] ?? { ...splitKey(key), result: null, memo: '', updatedAt: ts };
  return {
    ...c,
    // 最初の入力で「検査中」へ
    status: c.status === 'draft' ? 'inspecting' : c.status,
    entries: { ...c.entries, [key]: { ...prev, ...patch, updatedAt: ts } },
    updatedAt: ts,
  };
}

/** 追加入力欄の値を更新する */
export function updateEntryField(
  c: InspectionCase,
  key: string,
  fieldKey: string,
  value: ItemFieldValue,
  now = new Date(),
): InspectionCase {
  const fields = { ...c.entries[key]?.fields, [fieldKey]: value };
  return updateEntry(c, key, { fields }, now);
}

export function addEntryPhoto(c: InspectionCase, key: string, photoId: string, now = new Date()): InspectionCase {
  const ids = c.entries[key]?.photoIds ?? [];
  return updateEntry(c, key, { photoIds: [...ids, photoId] }, now);
}

export function removeEntryPhoto(c: InspectionCase, key: string, photoId: string, now = new Date()): InspectionCase {
  const entry = c.entries[key];
  const ids = entry?.photoIds ?? [];
  // 写真と一緒にコメントも消す
  const { [photoId]: _removed, ...captions } = entry?.photoCaptions ?? {};
  void _removed;
  return updateEntry(c, key, { photoIds: ids.filter((id) => id !== photoId), photoCaptions: captions }, now);
}

/** 写真のコメント(撮影場所など)を設定する。空文字は削除扱い */
export function setPhotoCaption(
  c: InspectionCase,
  key: string,
  photoId: string,
  caption: string,
  now = new Date(),
): InspectionCase {
  const { [photoId]: _old, ...rest } = c.entries[key]?.photoCaptions ?? {};
  void _old;
  return updateEntry(c, key, { photoCaptions: caption ? { ...rest, [photoId]: caption } : rest }, now);
}

/** 案件内の全写真ID(棟ごとに 増改築 → 項目の並び順) */
export function allPhotoIds(c: InspectionCase): string[] {
  return c.buildings.flatMap((b) => [
    ...buildingInfoPhotoIds(b),
    ...checklistOf(c, b.id).flatMap((id) => c.entries[entryKey(b.id, id)]?.photoIds ?? []),
  ]);
}

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

/** @param keys 集計する結果キー(省略時は全棟の全項目) */
export function caseProgress(c: InspectionCase, keys: string[] = allEntryKeys(c)): CaseProgress {
  const p: CaseProgress = { total: keys.length, done: 0, compliant: 0, nonCompliant: 0, notApplicable: 0 };
  for (const k of keys) {
    const r: CheckResult | null | undefined = c.entries[k]?.result;
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
