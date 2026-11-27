import { describe, expect, it } from 'vitest';
import type { BuildingInfo } from '../types/inspection';
import { caseProgress, createCase, parseInspectors, today, updateBuilding, updateEntry, updateEntryField } from './inspectionCase';

const base: BuildingInfo = {
  name: '飲食店', address: '高知市', usage: '3ロ', subUsages: [],
  totalFloorArea: 120, floorsAbove: 2, floorsBelow: 0, capacity: 40,
  isHighRise: false, hasWindowlessFloor: false, isSingleStaircase: false, hasMultipleOwners: false,
  installedEquipment: [], facilities: ['kitchen'], notifications: {},
};
const meta = { inspectionDate: '2026-11-27', inspectors: ['山田'] };

describe('inspectionCase', () => {
  it('creates a case with extracted items', () => {
    const c = createCase(base, meta);
    expect(c.status).toBe('draft');
    expect(c.itemIds).toContain('FU-001');
    expect(c.entries).toEqual({});
  });

  it('first entry moves status to inspecting and updates progress', () => {
    let c = createCase(base, meta);
    c = updateEntry(c, 'FM-001', { result: 'compliant' });
    c = updateEntry(c, 'FU-001', { result: 'nonCompliant' });
    c = updateEntry(c, 'FU-001', { memo: 'グリスフィルター油脂付着' });
    expect(c.status).toBe('inspecting');
    expect(c.entries['FU-001']).toMatchObject({ result: 'nonCompliant', memo: 'グリスフィルター油脂付着' });
    expect(caseProgress(c)).toMatchObject({ done: 2, compliant: 1, nonCompliant: 1, total: c.itemIds.length });
  });

  it('re-extraction keeps entered items that no longer apply, drops empty ones', () => {
    let c = createCase(base, meta);
    c = updateEntry(c, 'FU-001', { result: 'nonCompliant' });
    const noKitchen = { ...base, facilities: [] };
    const after = updateBuilding(c, noKitchen, meta);
    expect(after.itemIds).toContain('FU-001'); // 入力済みのため残す
    expect(after.itemIds).not.toContain('NT-002'); // 未入力・対象外は除外
    expect(after.entries['FU-001'].result).toBe('nonCompliant');
    // 順序:カテゴリ順(火気使用設備は避難施設の後)
    expect(after.itemIds.indexOf('FU-001')).toBeGreaterThan(after.itemIds.indexOf('EV-001'));
  });

  it('stores item fields without affecting the judgement', () => {
    let c = createCase(base, meta);
    c = updateEntryField(c, 'EQ-001', 'abilityUnits', { '1': '3' });
    c = updateEntryField(c, 'EQ-001', 'abilityUnits', { '1': '3', '2': '2' });
    c = updateEntry(c, 'EQ-001', { result: 'compliant' });
    expect(c.entries['EQ-001']).toMatchObject({ result: 'compliant', fields: { abilityUnits: { '1': '3', '2': '2' } } });
    expect(c.status).toBe('inspecting');
  });

  it('keeps items with only field input on re-extraction', () => {
    const withAlarm = { ...base, installedEquipment: ['autoFireAlarm' as const] };
    let c = createCase(withAlarm, meta);
    c = updateEntryField(c, 'EQ-004', 'receiverLocation', '1階 事務室');
    const after = updateBuilding(c, base, meta); // 自火報なし・300㎡未満 → 抽出対象外
    expect(after.itemIds).toContain('EQ-004');
  });

  it('parses inspectors and formats local date', () => {
    expect(parseInspectors('山田、佐藤, 鈴木  高橋')).toEqual(['山田', '佐藤', '鈴木', '高橋']);
    expect(today(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
