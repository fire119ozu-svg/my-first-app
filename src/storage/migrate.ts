/**
 * 保存済みデータの形式移行。
 * 古い形式で保存された案件を読み込み時に現在の形式へ変換する(保存は次回更新時)。
 */
import type { InspectionCase, PersonInfo } from '../types/inspection';

/** 旧形式で保存されていた可能性のあるプロパティ */
interface LegacyFields {
  /** v0.1:対象物の「関係者」氏名 → 代表者へ */
  building: { ownerName?: string };
  /** v0.1:案件の「立会者」氏名 → 対象物情報の立会者へ */
  witness?: string;
}

function personFromName(name: string | undefined): PersonInfo | undefined {
  const n = name?.trim();
  return n ? { title: '', name: n } : undefined;
}

export function migrateCase(stored: InspectionCase): InspectionCase {
  const legacy = stored as InspectionCase & Partial<LegacyFields>;
  const { ownerName, ...building } = legacy.building as InspectionCase['building'] & LegacyFields['building'];
  const { witness, ...rest } = legacy;
  if (ownerName === undefined && witness === undefined) return stored;
  return {
    ...rest,
    building: {
      ...building,
      representative: building.representative ?? personFromName(ownerName),
      witness: building.witness ?? personFromName(witness),
    },
  };
}
