/**
 * 保存済みデータの形式移行。
 * 古い形式で保存された案件を読み込み時に現在の形式へ変換する(保存は次回更新時)。
 *
 * - v0.1:関係者(ownerName)・立会者(案件の witness)が氏名の文字列
 * - v0.2:検査員が氏名の文字列
 * - v0.3:対象物情報が1棟のみ(building・itemIds、結果のキーが項目ID)
 * - v0.4:棟に有効開口部の記録(openingRecords)が無い
 * - v0.5:有効開口部に方角(direction)が無い(場所の「東面」等は方角へ移す)
 * - v0.6:有効開口部の記録・開口部に写真(photoIds・photoCaptions)が無い
 */
import type {
  BuildingInfo,
  CheckEntry,
  InspectionCase,
  OpeningDirection,
  PersonInfo,
  SiteInfo,
  Tenant,
  UsageCategory,
  WindowOpening,
} from '../types/inspection';

/** 1棟のみだった頃の対象物情報 */
export interface LegacyBuilding extends Omit<BuildingInfo, 'id' | 'label' | 'tenants' | 'floorCapacities' | 'openingRecords'> {
  name: string;
  address: string;
  ownerName?: string;
  representative?: PersonInfo;
  witness?: PersonInfo;
}

/** 1棟のみだった頃の案件 */
interface LegacyCase extends Omit<InspectionCase, 'site' | 'buildings' | 'checklists' | 'inspectors'> {
  building: LegacyBuilding;
  itemIds: string[];
  witness?: string;
  inspectors: (string | InspectionCase['inspectors'][number])[];
}

/** 移行した棟のID(1棟のみだった案件で使う) */
export const LEGACY_BUILDING_ID = 'b1';

function personFromName(name: string | undefined): PersonInfo | undefined {
  const n = name?.trim();
  return n ? { title: '', name: n } : undefined;
}

/**
 * 1棟のみだった頃の対象物情報を、敷地情報と棟に分ける。
 * 階ごとの収容人員は無いため合計のみ引き継ぐ(編集画面で階ごとに入力し直す)。
 * 16項の「含まれる用途」は、名称・階が空のテナントとして引き継ぐ。
 */
export function splitLegacyBuilding(
  old: LegacyBuilding,
  id: string,
  legacyWitness?: string,
): { site: SiteInfo; building: BuildingInfo } {
  const { name, address, ownerName, representative, witness, ...rest } = old;
  const tenants: Tenant[] =
    rest.usage === '16イ' || rest.usage === '16ロ'
      ? rest.subUsages.map((u: UsageCategory, i) => ({ id: `${id}-t${i + 1}`, name: '', usage: u, floor: '' }))
      : [];
  return {
    site: {
      name,
      address,
      representative: representative ?? personFromName(ownerName),
      witness: witness ?? personFromName(legacyWitness),
    },
    building: { ...rest, id, label: '', tenants, floorCapacities: {}, openingRecords: [] },
  };
}

const DIRECTIONS: OpeningDirection[] = ['東', '西', '南', '北', '北東', '北西', '南東', '南西'];

/** 写真の欄が無い記録(v0.6以前)に空の欄を足す */
function withPhotos<T extends { photoIds: string[]; photoCaptions: Record<string, string> }>(x: T): T {
  return Array.isArray(x.photoIds) ? x : { ...x, photoIds: [], photoCaptions: x.photoCaptions ?? {} };
}

/** 方角の無い開口部(v0.5以前)。場所が「東面」「東」等だけなら方角へ移す */
function withDirection(o: WindowOpening): WindowOpening {
  if (typeof o.direction === 'string') return o;
  const m = o.location.trim().match(/^(北東|北西|南東|南西|東|西|南|北)面?(?:[ 　]+(.*))?$/);
  const d = m?.[1] as OpeningDirection | undefined;
  return d && DIRECTIONS.includes(d) ? { ...o, direction: d, location: (m?.[2] ?? '').trim() } : { ...o, direction: '' };
}

const needsMigration = (b: BuildingInfo) =>
  !Array.isArray(b.openingRecords) ||
  b.openingRecords.some(
    (r) => !Array.isArray(r.photoIds) || r.openings.some((o) => typeof o.direction !== 'string' || !Array.isArray(o.photoIds)),
  );

/** 有効開口部の記録が無い棟(v0.4以前)に空の記録を足し、方角の無い開口部を変換する */
function withOpeningRecords(b: BuildingInfo): BuildingInfo {
  if (!needsMigration(b)) return b;
  return {
    ...b,
    openingRecords: (b.openingRecords ?? []).map((r) => withPhotos({ ...r, openings: r.openings.map((o) => withPhotos(withDirection(o))) })),
  };
}

export function migrateCase(stored: InspectionCase): InspectionCase {
  const raw = stored as unknown as Partial<LegacyCase> & InspectionCase;
  const inspectors = (raw.inspectors as unknown[]).map((x) =>
    typeof x === 'string' ? { rank: '', name: x } : (x as InspectionCase['inspectors'][number]),
  );
  if (!raw.building) {
    const changedInspectors = inspectors.some((x, i) => x !== raw.inspectors[i]);
    const needsOpenings = raw.buildings.some(needsMigration);
    if (!changedInspectors && !needsOpenings) return stored;
    return {
      ...raw,
      inspectors,
      buildings: needsOpenings ? raw.buildings.map(withOpeningRecords) : raw.buildings,
    };
  }

  // 1棟のみの案件を、敷地+棟の形式へ
  const { building: old, itemIds = [], witness, ...rest } = raw;
  const id = LEGACY_BUILDING_ID;
  const { site, building } = splitLegacyBuilding(old, id, witness);
  const entries: Record<string, CheckEntry> = {};
  for (const [itemId, e] of Object.entries(raw.entries ?? {})) {
    entries[`${id}:${itemId}`] = { ...e, buildingId: id, itemId };
  }
  return {
    ...(rest as Omit<InspectionCase, 'site' | 'buildings' | 'checklists' | 'entries' | 'inspectors'>),
    inspectors,
    site,
    buildings: [building],
    checklists: [{ buildingId: id, itemIds }],
    entries,
  };
}
