import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createCase } from '../logic/inspectionCase';
import type { BuildingInfo } from '../types/inspection';
import { deleteCase, getCase, listCases, saveCase } from './caseStore';

const building: BuildingInfo = {
  name: 'A', address: '', usage: '15', subUsages: [], totalFloorArea: 100, floorsAbove: 1,
  floorsBelow: 0, capacity: 10, isHighRise: false, hasWindowlessFloor: false,
  isSingleStaircase: false, hasMultipleOwners: false, installedEquipment: [], facilities: [], notifications: {},
};
const meta = { inspectionDate: '2026-11-27', inspectors: [] };

describe('caseStore', () => {
  it('saves, lists (newest first), loads and deletes', async () => {
    const a = createCase({ ...building, name: 'A' }, meta, new Date('2026-11-01T00:00:00Z'));
    const b = createCase({ ...building, name: 'B' }, meta, new Date('2026-11-02T00:00:00Z'));
    await saveCase(a);
    await saveCase(b);
    expect((await listCases()).map((c) => c.building.name)).toEqual(['B', 'A']);
    expect((await getCase(a.id))?.building.name).toBe('A');
    await deleteCase(a.id);
    expect(await getCase(a.id)).toBeUndefined();
    expect(await listCases()).toHaveLength(1);
  });
});
