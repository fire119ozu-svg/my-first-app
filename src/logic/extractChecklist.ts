/**
 * チェック項目抽出ロジック
 *
 * 対象物情報(BuildingInfo)に対して各チェック項目の適用条件を評価し、
 * 確認すべき項目を抽出する。純粋関数のみで構成し、UI・保存処理から独立させる。
 */
import { CATEGORY_ORDER, CHECKLIST_ITEMS } from '../data/checklistItems';
import { getUsageInfo } from '../data/usageCategories';
import type {
  ApplicabilityCondition,
  BuildingInfo,
  CheckCategory,
  ChecklistItem,
  UsageCategory,
} from '../types/inspection';

const COMPOSITE_USAGES: UsageCategory[] = ['16イ', '16ロ'];

export function isCompositeUsage(usage: UsageCategory): boolean {
  return COMPOSITE_USAGES.includes(usage);
}

/**
 * 判定に用いる用途の集合。
 * 複合用途(16項)の場合は、含まれる各用途の部分にも基準が適用されるため、
 * 主用途に加えて構成用途も対象とする(過大抽出側に倒す)。
 */
export function effectiveUsages(building: BuildingInfo): UsageCategory[] {
  if (!isCompositeUsage(building.usage)) return [building.usage];
  return [building.usage, ...building.subUsages.filter((u) => u !== building.usage)];
}

/** 特定防火対象物か(16項は構成用途に特定用途を含めば16イ=特定) */
export function isSpecifiedBuilding(building: BuildingInfo): boolean {
  return effectiveUsages(building).some((u) => getUsageInfo(u).isSpecified);
}

export function evaluateCondition(cond: ApplicabilityCondition, building: BuildingInfo): boolean {
  switch (cond.type) {
    case 'always':
      return true;
    case 'usage': {
      const usages = effectiveUsages(building);
      return cond.in.some((u) => usages.includes(u));
    }
    case 'specified':
      return isSpecifiedBuilding(building);
    case 'totalFloorArea':
      return building.totalFloorArea >= cond.gte;
    case 'capacity':
      return building.capacity >= cond.gte;
    case 'floorsAbove':
      return building.floorsAbove >= cond.gte;
    case 'floorsBelow':
      return building.floorsBelow >= cond.gte;
    case 'flag':
      return building[cond.flag];
    case 'hasEquipment':
      return building.installedEquipment.includes(cond.equipment);
    case 'hasFacility':
      return building.facilities.includes(cond.facility);
    case 'and':
      return cond.conditions.every((c) => evaluateCondition(c, building));
    case 'or':
      return cond.conditions.some((c) => evaluateCondition(c, building));
    case 'not':
      return !evaluateCondition(cond.condition, building);
    default: {
      const unreachable: never = cond;
      throw new Error(`Unknown condition: ${JSON.stringify(unreachable)}`);
    }
  }
}

/** 対象物に適用されるチェック項目を、カテゴリ順・マスタ順で返す */
export function extractChecklistItems(
  building: BuildingInfo,
  items: ChecklistItem[] = CHECKLIST_ITEMS,
): ChecklistItem[] {
  const order = new Map(CATEGORY_ORDER.map((c, i) => [c, i]));
  return items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => evaluateCondition(item.condition, building))
    .sort(
      (a, b) =>
        (order.get(a.item.category) ?? 99) - (order.get(b.item.category) ?? 99) || a.index - b.index,
    )
    .map(({ item }) => item);
}

/** カテゴリごとにグループ化(現場画面・プレビュー表示用) */
export function groupByCategory(
  items: ChecklistItem[],
): { category: CheckCategory; items: ChecklistItem[] }[] {
  return CATEGORY_ORDER.map((category) => ({
    category,
    items: items.filter((i) => i.category === category),
  })).filter((g) => g.items.length > 0);
}
