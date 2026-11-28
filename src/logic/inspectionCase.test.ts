import { describe, expect, it } from 'vitest';
import { makeBuilding, makeSite } from '../test/fixtures';
import {
  addEntryPhoto,
  allEntryKeys,
  allPhotoIds,
  buildingName,
  caseProgress,
  checklistOf,
  createCase,
  entryKey,
  formatInspector,
  normalizeInspectors,
  parseInspectors,
  removedBuildingsWithInput,
  removeEntryPhoto,
  setPhotoCaption,
  today,
  updateCaseInfo,
  updateEntry,
  updateEntryField,
} from './inspectionCase';

const site = makeSite({ name: '飲食店' });
const base = makeBuilding({ id: 'b1', usage: '3ロ', totalFloorArea: 120, floorsAbove: 2, capacity: 40, facilities: ['kitchen'] });
const meta = { inspectionDate: '2026-11-27', inspectors: [{ rank: '消防士長', name: '山田' }] };
const k = (itemId: string, b = 'b1') => entryKey(b, itemId);

describe('inspectionCase', () => {
  it('creates a case with a checklist per building', () => {
    const c = createCase(site, [base], meta);
    expect(c.status).toBe('draft');
    expect(checklistOf(c, 'b1')).toContain('FU-001');
    expect(c.entries).toEqual({});
  });

  it('first entry moves status to inspecting and updates progress', () => {
    let c = createCase(site, [base], meta);
    c = updateEntry(c, k('FM-001'), { result: 'compliant' });
    c = updateEntry(c, k('FU-001'), { result: 'nonCompliant' });
    c = updateEntry(c, k('FU-001'), { memo: 'グリスフィルター油脂付着' });
    expect(c.status).toBe('inspecting');
    expect(c.entries[k('FU-001')]).toMatchObject({
      buildingId: 'b1',
      itemId: 'FU-001',
      result: 'nonCompliant',
      memo: 'グリスフィルター油脂付着',
    });
    expect(caseProgress(c)).toMatchObject({ done: 2, compliant: 1, nonCompliant: 1, total: checklistOf(c, 'b1').length });
  });

  it('re-extraction keeps entered items that no longer apply, drops empty ones', () => {
    let c = createCase(site, [base], meta);
    c = updateEntry(c, k('FU-001'), { result: 'nonCompliant' });
    const { case: after } = updateCaseInfo(c, site, [{ ...base, facilities: [] }], meta);
    const ids = checklistOf(after, 'b1');
    expect(ids).toContain('FU-001'); // 入力済みのため残す
    expect(ids).not.toContain('NT-002'); // 未入力・対象外は除外
    expect(after.entries[k('FU-001')].result).toBe('nonCompliant');
    // 順序:カテゴリ順(火気使用設備は避難施設の後)
    expect(ids.indexOf('FU-001')).toBeGreaterThan(ids.indexOf('EV-001'));
  });

  it('stores item fields without affecting the judgement', () => {
    let c = createCase(site, [base], meta);
    c = updateEntryField(c, k('EQ-001'), 'abilityUnits', { '1': '3' });
    c = updateEntryField(c, k('EQ-001'), 'abilityUnits', { '1': '3', '2': '2' });
    c = updateEntry(c, k('EQ-001'), { result: 'compliant' });
    expect(c.entries[k('EQ-001')]).toMatchObject({ result: 'compliant', fields: { abilityUnits: { '1': '3', '2': '2' } } });
  });

  it('keeps items with only field input on re-extraction', () => {
    const withAlarm = { ...base, installedEquipment: ['autoFireAlarm' as const] };
    let c = createCase(site, [withAlarm], meta);
    c = updateEntryField(c, k('EQ-004'), 'receiverLocation', '1階 事務室');
    const { case: after } = updateCaseInfo(c, site, [base], meta); // 自火報なし・300㎡未満 → 抽出対象外
    expect(checklistOf(after, 'b1')).toContain('EQ-004');
  });

  it('adds and removes photos in order without touching the judgement', () => {
    let c = createCase(site, [base], meta);
    c = updateEntry(c, k('FU-001'), { result: 'nonCompliant' });
    c = addEntryPhoto(c, k('FU-001'), 'p1');
    c = addEntryPhoto(c, k('FU-001'), 'p2');
    c = addEntryPhoto(c, k('FM-001'), 'p3');
    expect(c.entries[k('FU-001')]).toMatchObject({ result: 'nonCompliant', photoIds: ['p1', 'p2'] });
    expect(allPhotoIds(c)).toEqual(['p3', 'p1', 'p2']); // 項目の並び順
    c = removeEntryPhoto(c, k('FU-001'), 'p1');
    expect(c.entries[k('FU-001')].photoIds).toEqual(['p2']);
  });

  it('sets, clears and removes photo captions with the photo', () => {
    let c = createCase(site, [base], meta);
    c = addEntryPhoto(c, k('FU-001'), 'p1');
    c = addEntryPhoto(c, k('FU-001'), 'p2');
    c = setPhotoCaption(c, k('FU-001'), 'p1', '1階 厨房 排気フード');
    c = setPhotoCaption(c, k('FU-001'), 'p2', '2階');
    expect(c.entries[k('FU-001')].photoCaptions).toEqual({ p1: '1階 厨房 排気フード', p2: '2階' });
    c = setPhotoCaption(c, k('FU-001'), 'p2', '');
    expect(c.entries[k('FU-001')].photoCaptions).toEqual({ p1: '1階 厨房 排気フード' });
    c = removeEntryPhoto(c, k('FU-001'), 'p1');
    expect(c.entries[k('FU-001')].photoCaptions).toEqual({});
    expect(c.entries[k('FU-001')].photoIds).toEqual(['p2']);
  });

  it('keeps items with only photos on re-extraction', () => {
    let c = createCase(site, [base], meta);
    c = addEntryPhoto(c, k('FU-001'), 'p1');
    const { case: after } = updateCaseInfo(c, site, [{ ...base, facilities: [] }], meta);
    expect(checklistOf(after, 'b1')).toContain('FU-001');
  });

  it('uses a given id and lists renovation photos first', () => {
    let c = createCase(
      site,
      [{ ...base, renovation: { status: 'yes', location: '', period: '', photoIds: ['r1'], photoCaptions: {} } }],
      meta,
      new Date(),
      'draft-id',
    );
    expect(c.id).toBe('draft-id');
    c = addEntryPhoto(c, k('FU-001'), 'p1');
    expect(allPhotoIds(c)).toEqual(['r1', 'p1']);
  });

  it('formats and normalizes inspectors', () => {
    expect(formatInspector({ rank: '消防司令補', name: '消防太郎' })).toBe('消防司令補 消防太郎');
    expect(formatInspector({ rank: '', name: '消防太郎' })).toBe('消防太郎');
    expect(formatInspector({ rank: '消防士', name: ' ' })).toBe('消防士');
    expect(
      normalizeInspectors([
        { rank: ' 消防士長 ', name: ' 山田 ' },
        { rank: '', name: '' },
        { rank: '', name: '佐藤' },
      ]),
    ).toEqual([
      { rank: '消防士長', name: '山田' },
      { rank: '', name: '佐藤' },
    ]);
  });

  it('parses inspectors and formats local date', () => {
    expect(parseInspectors('山田、佐藤, 鈴木  高橋')).toEqual(['山田', '佐藤', '鈴木', '高橋']);
    expect(today(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('multiple buildings', () => {
  const office = makeBuilding({ id: 'a', label: 'A棟', usage: '15', totalFloorArea: 800, floorsAbove: 3, capacity: 60 });
  const warehouse = makeBuilding({ id: 'b', label: '', usage: '14', totalFloorArea: 600, floorsAbove: 1, capacity: 5 });

  it('extracts a separate checklist for each building', () => {
    const c = createCase(site, [office, warehouse], meta);
    expect(c.checklists.map((cl) => cl.buildingId)).toEqual(['a', 'b']);
    expect(checklistOf(c, 'a')).toContain('FM-001'); // 15項 60人 → 防火管理者
    expect(checklistOf(c, 'b')).not.toContain('FM-001'); // 14項 5人 → 不要
    expect(checklistOf(c, 'b')).toContain('EQ-001'); // 14項 600㎡ → 消火器
    // 結果は棟ごとに独立
    const keys = allEntryKeys(c);
    expect(keys[0].startsWith('a:')).toBe(true);
    expect(keys.at(-1)!.startsWith('b:')).toBe(true);
    expect(buildingName(office, 0)).toBe('A棟');
    expect(buildingName(warehouse, 1)).toBe('第2棟');
  });

  it('keeps results per building and drops a removed building with its photos', () => {
    let c = createCase(site, [office, warehouse], meta);
    c = updateEntry(c, entryKey('a', 'EQ-001'), { result: 'compliant' });
    c = updateEntry(c, entryKey('b', 'EQ-001'), { result: 'nonCompliant' });
    c = addEntryPhoto(c, entryKey('b', 'EQ-001'), 'pb');
    const withReno = { ...warehouse, renovation: { status: 'no' as const, location: '', period: '', photoIds: ['rb'], photoCaptions: {} } };
    c = { ...c, buildings: [office, withReno] };
    expect(caseProgress(c, checklistOf(c, 'a').map((id) => entryKey('a', id)))).toMatchObject({ compliant: 1, nonCompliant: 0 });

    expect(removedBuildingsWithInput(c, [office]).map((b) => b.id)).toEqual(['b']);
    const { case: after, removedPhotoIds } = updateCaseInfo(c, site, [office], meta);
    expect(after.buildings.map((b) => b.id)).toEqual(['a']);
    expect(after.checklists.map((cl) => cl.buildingId)).toEqual(['a']);
    expect(Object.keys(after.entries)).toEqual([entryKey('a', 'EQ-001')]);
    expect(removedPhotoIds.sort()).toEqual(['pb', 'rb']);
  });

  it('adds a checklist when a building is added', () => {
    const c = createCase(site, [office], meta);
    const { case: after } = updateCaseInfo(c, site, [office, warehouse], meta);
    expect(after.checklists.map((cl) => cl.buildingId)).toEqual(['a', 'b']);
    expect(checklistOf(after, 'b').length).toBeGreaterThan(0);
  });
});
