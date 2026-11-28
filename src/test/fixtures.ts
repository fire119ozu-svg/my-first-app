/** テスト用の対象物データ */
import type { BuildingInfo, SiteInfo } from '../types/inspection';

export function makeBuilding(overrides: Partial<BuildingInfo> = {}): BuildingInfo {
  return {
    id: 'b1',
    label: '',
    usage: '15',
    subUsages: [],
    tenants: [],
    totalFloorArea: 0,
    floorsAbove: 1,
    floorsBelow: 0,
    capacity: 0,
    floorCapacities: {},
    isHighRise: false,
    hasWindowlessFloor: false,
    isSingleStaircase: false,
    hasMultipleOwners: false,
    installedEquipment: [],
    facilities: [],
    notifications: {},
    ...overrides,
  };
}

export function makeSite(overrides: Partial<SiteInfo> = {}): SiteInfo {
  return { name: 'テスト', address: '高知市', ...overrides };
}
