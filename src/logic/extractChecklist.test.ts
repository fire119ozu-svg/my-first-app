import { describe, expect, it } from 'vitest';
import type { BuildingInfo } from '../types/inspection';
import { evaluateCondition, extractChecklistItems, isSpecifiedBuilding } from './extractChecklist';

function building(overrides: Partial<BuildingInfo>): BuildingInfo {
  return {
    name: 'テスト',
    address: '高知市',
    usage: '15',
    subUsages: [],
    totalFloorArea: 0,
    floorsAbove: 1,
    floorsBelow: 0,
    capacity: 0,
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

const ids = (b: BuildingInfo) => extractChecklistItems(b).map((i) => i.id);

describe('evaluateCondition', () => {
  it('evaluates numeric thresholds as "以上"', () => {
    const b = building({ totalFloorArea: 300 });
    expect(evaluateCondition({ type: 'totalFloorArea', gte: 300 }, b)).toBe(true);
    expect(evaluateCondition({ type: 'totalFloorArea', gte: 301 }, b)).toBe(false);
  });

  it('combines and / or / not', () => {
    const b = building({ capacity: 40, floorsAbove: 3 });
    expect(
      evaluateCondition(
        {
          type: 'and',
          conditions: [
            { type: 'capacity', gte: 30 },
            { type: 'not', condition: { type: 'floorsAbove', gte: 4 } },
          ],
        },
        b,
      ),
    ).toBe(true);
    expect(evaluateCondition({ type: 'or', conditions: [] }, b)).toBe(false);
  });
});

describe('isSpecifiedBuilding', () => {
  it('treats 16項 with a specified sub-usage as specified', () => {
    expect(isSpecifiedBuilding(building({ usage: '16ロ', subUsages: ['15', '5ロ'] }))).toBe(false);
    expect(isSpecifiedBuilding(building({ usage: '16イ', subUsages: ['15', '3ロ'] }))).toBe(true);
  });
});

describe('extractChecklistItems', () => {
  it('small restaurant with kitchen', () => {
    const r = ids(
      building({
        usage: '3ロ',
        totalFloorArea: 120,
        floorsAbove: 2,
        capacity: 40,
        facilities: ['kitchen'],
      }),
    );
    expect(r).toContain('FM-001'); // 特定 30人以上
    expect(r).toContain('EQ-001'); // 3項+火気 → 消火器
    expect(r).toContain('FU-001'); // 厨房設備
    expect(r).not.toContain('EQ-004'); // 300㎡未満 → 自火報なし
  });

  it('office 800㎡ does not require hydrant or fire alarm', () => {
    const r = ids(building({ usage: '15', totalFloorArea: 800, floorsAbove: 3, capacity: 60 }));
    expect(r).toContain('FM-001');
    expect(r).not.toContain('EQ-002');
    expect(r).not.toContain('EQ-004');
  });

  it('installed equipment is checked even if not legally required', () => {
    const r = ids(building({ usage: '15', totalFloorArea: 100, installedEquipment: ['autoFireAlarm'] }));
    expect(r).toContain('EQ-004');
    expect(r).toContain('NT-005');
  });

  it('nursing home 6ロ', () => {
    const r = ids(building({ usage: '6ロ', totalFloorArea: 400, floorsAbove: 2, capacity: 25 }));
    for (const id of ['FM-001', 'EQ-003', 'EQ-004', 'EQ-005', 'EQ-007', 'FR-001']) {
      expect(r).toContain(id);
    }
  });

  it('composite building inherits sub-usage requirements', () => {
    const r = ids(
      building({ usage: '16イ', subUsages: ['3ロ', '15'], totalFloorArea: 200, capacity: 40 }),
    );
    expect(r).toContain('EV-004'); // 3項の客席・定員
    expect(r).toContain('FR-001');
  });

  it('connected sprinkler is extracted when installed and placed after standpipe', () => {
    const r = ids(
      building({ usage: '15', totalFloorArea: 8000, floorsAbove: 7, floorsBelow: 1, installedEquipment: ['connectedSprinkler'] }),
    );
    expect(r).toContain('EQ-015');
    expect(r.indexOf('EQ-015')).toBe(r.indexOf('EQ-010') + 1);
    expect(ids(building({ usage: '15', totalFloorArea: 8000, floorsBelow: 1 }))).not.toContain('EQ-015');
  });

  it('returns items in category order', () => {
    const items = extractChecklistItems(building({ usage: '4', totalFloorArea: 5000, capacity: 500 }));
    const cats = items.map((i) => i.category);
    expect(cats.indexOf('fireManagement')).toBeLessThan(cats.indexOf('equipment'));
    expect(cats.lastIndexOf('fireManagement')).toBeLessThan(cats.indexOf('notification'));
  });
});
