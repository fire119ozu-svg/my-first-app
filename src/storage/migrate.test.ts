import { describe, expect, it } from 'vitest';
import { createCase } from '../logic/inspectionCase';
import type { BuildingInfo, InspectionCase } from '../types/inspection';
import { migrateCase } from './migrate';

const building: BuildingInfo = {
  name: 'A', address: '', usage: '15', subUsages: [], totalFloorArea: 100, floorsAbove: 1,
  floorsBelow: 0, capacity: 10, isHighRise: false, hasWindowlessFloor: false,
  isSingleStaircase: false, hasMultipleOwners: false, installedEquipment: [], facilities: [], notifications: {},
};

describe('migrateCase', () => {
  it('moves legacy ownerName / witness strings into representative / witness', () => {
    const current = createCase(building, { inspectionDate: '2026-11-27', inspectors: [] });
    const legacy = { ...current, witness: '店長', building: { ...building, ownerName: '高知太郎' } } as unknown as InspectionCase;
    const m = migrateCase(legacy);
    expect(m.building.representative).toEqual({ title: '', name: '高知太郎' });
    expect(m.building.witness).toEqual({ title: '', name: '店長' });
    expect(m.building).not.toHaveProperty('ownerName');
    expect(m).not.toHaveProperty('witness');
  });

  it('leaves current-format cases untouched', () => {
    const c = createCase({ ...building, representative: { title: '社長', name: 'X' } }, { inspectionDate: '2026-11-27', inspectors: [] });
    expect(migrateCase(c)).toBe(c);
  });

  it('drops empty legacy values', () => {
    const current = createCase(building, { inspectionDate: '2026-11-27', inspectors: [] });
    const legacy = { ...current, witness: '', building: { ...building, ownerName: ' ' } } as unknown as InspectionCase;
    const m = migrateCase(legacy);
    expect(m.building.representative).toBeUndefined();
    expect(m.building.witness).toBeUndefined();
  });

  it('converts legacy inspector name strings to { rank, name }', () => {
    const current = createCase(building, { inspectionDate: '2026-11-27', inspectors: [] });
    const legacy = { ...current, inspectors: ['山田', '佐藤'] } as unknown as InspectionCase;
    expect(migrateCase(legacy).inspectors).toEqual([
      { rank: '', name: '山田' },
      { rank: '', name: '佐藤' },
    ]);
  });
});
