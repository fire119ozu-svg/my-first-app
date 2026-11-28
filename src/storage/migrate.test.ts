import { describe, expect, it } from 'vitest';
import { createCase } from '../logic/inspectionCase';
import { makeBuilding, makeSite } from '../test/fixtures';
import type { InspectionCase } from '../types/inspection';
import { migrateCase } from './migrate';

/** 1棟のみだった頃(v0.3以前)の保存形式 */
function legacyCase(overrides: Record<string, unknown> = {}, building: Record<string, unknown> = {}): InspectionCase {
  return {
    id: 'c1',
    status: 'inspecting',
    inspectionDate: '2026-11-01',
    inspectors: [{ rank: '消防士', name: '山田' }],
    building: {
      name: 'Aビル',
      address: '高知市本町',
      representative: { title: '代表取締役', name: '高知太郎' },
      witness: { title: '店長', name: '土佐花子' },
      usage: '15',
      subUsages: [],
      totalFloorArea: 800,
      floorsAbove: 3,
      floorsBelow: 0,
      capacity: 342,
      isHighRise: false,
      hasWindowlessFloor: false,
      isSingleStaircase: false,
      hasMultipleOwners: false,
      installedEquipment: [],
      facilities: [],
      notifications: {},
      ...building,
    },
    itemIds: ['FM-001', 'EQ-001'],
    entries: {
      'FM-001': { itemId: 'FM-001', result: 'compliant', memo: 'OK', updatedAt: '' },
      'EQ-001': { itemId: 'EQ-001', result: null, memo: '', photoIds: ['p1'], updatedAt: '' },
    },
    remarks: '備考',
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
    ...overrides,
  } as unknown as InspectionCase;
}

describe('migrateCase', () => {
  it('splits a single-building case into site + building and re-keys results', () => {
    const m = migrateCase(legacyCase());
    expect(m.site).toEqual({
      name: 'Aビル',
      address: '高知市本町',
      representative: { title: '代表取締役', name: '高知太郎' },
      witness: { title: '店長', name: '土佐花子' },
    });
    expect(m.buildings).toHaveLength(1);
    expect(m.buildings[0]).toMatchObject({ id: 'b1', label: '', usage: '15', capacity: 342, floorCapacities: {}, tenants: [] });
    expect(m.buildings[0]).not.toHaveProperty('name');
    expect(m.checklists).toEqual([{ buildingId: 'b1', itemIds: ['FM-001', 'EQ-001'] }]);
    expect(m.entries['b1:FM-001']).toMatchObject({ buildingId: 'b1', itemId: 'FM-001', result: 'compliant', memo: 'OK' });
    expect(m.entries['b1:EQ-001'].photoIds).toEqual(['p1']);
    expect(m).not.toHaveProperty('building');
    expect(m).not.toHaveProperty('itemIds');
    expect(m.remarks).toBe('備考');
  });

  it('turns 16項 sub-usages into tenants', () => {
    const m = migrateCase(legacyCase({}, { usage: '16イ', subUsages: ['3ロ', '15'] }));
    expect(m.buildings[0].tenants.map((t) => [t.usage, t.name, t.floor])).toEqual([
      ['3ロ', '', ''],
      ['15', '', ''],
    ]);
  });

  it('moves legacy ownerName / witness strings into representative / witness', () => {
    const m = migrateCase(
      legacyCase({ witness: '店長' }, { ownerName: '高知太郎', representative: undefined, witness: undefined }),
    );
    expect(m.site.representative).toEqual({ title: '', name: '高知太郎' });
    expect(m.site.witness).toEqual({ title: '', name: '店長' });
    expect(m).not.toHaveProperty('witness');
  });

  it('drops empty legacy values', () => {
    const m = migrateCase(legacyCase({ witness: '' }, { ownerName: ' ', representative: undefined, witness: undefined }));
    expect(m.site.representative).toBeUndefined();
    expect(m.site.witness).toBeUndefined();
  });

  it('converts legacy inspector name strings to { rank, name }', () => {
    expect(migrateCase(legacyCase({ inspectors: ['山田', '佐藤'] })).inspectors).toEqual([
      { rank: '', name: '山田' },
      { rank: '', name: '佐藤' },
    ]);
    const current = createCase(makeSite(), [makeBuilding()], { inspectionDate: '2026-11-27', inspectors: [] });
    const old = { ...current, inspectors: ['山田'] } as unknown as InspectionCase;
    expect(migrateCase(old).inspectors).toEqual([{ rank: '', name: '山田' }]);
  });

  it('leaves current-format cases untouched', () => {
    const c = createCase(makeSite(), [makeBuilding()], { inspectionDate: '2026-11-27', inspectors: [{ rank: '', name: 'X' }] });
    expect(migrateCase(c)).toBe(c);
  });
  it('adds empty opening records to buildings saved before they existed', () => {
    const c = createCase(makeSite(), [makeBuilding()], { inspectionDate: '2026-11-27', inspectors: [] });
    const { openingRecords: _o, ...oldBuilding } = c.buildings[0];
    void _o;
    const old = { ...c, buildings: [oldBuilding] } as unknown as InspectionCase;
    expect(migrateCase(old).buildings[0].openingRecords).toEqual([]);
    expect(migrateCase(legacyCase()).buildings[0].openingRecords).toEqual([]);
  });
});
