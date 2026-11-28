/**
 * 保存済みデータの形式移行。
 * 古い形式で保存された案件を読み込み時に現在の形式へ変換する(保存は次回更新時)。
 *
 * - v0.1:関係者(ownerName)・立会者(案件の witness)が氏名の文字列
 * - v0.2:検査員が氏名の文字列
 * - v0.3:対象物情報が1棟のみ(building・itemIds、結果のキーが項目ID)
 */
import type {
  BuildingInfo,
  CheckEntry,
  InspectionCase,
  PersonInfo,
  SiteInfo,
  Tenant,
  UsageCategory,
} from '../types/inspection';

/** 1棟のみだった頃の対象物情報 */
export interface LegacyBuilding extends Omit<BuildingInfo, 'id' | 'label' | 'tenants' | 'floorCapacities'> {
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
    building: { ...rest, id, label: '', tenants, floorCapacities: {} },
  };
}

export function migrateCase(stored: InspectionCase): InspectionCase {
  const raw = stored as unknown as Partial<LegacyCase> & InspectionCase;
  const inspectors = (raw.inspectors as unknown[]).map((x) =>
    typeof x === 'string' ? { rank: '', name: x } : (x as InspectionCase['inspectors'][number]),
  );
  if (!raw.building) {
    return inspectors.some((x, i) => x !== raw.inspectors[i]) ? { ...raw, inspectors } : stored;
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
