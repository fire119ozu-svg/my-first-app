import { describe, expect, it } from 'vitest';
import { emptyOpening, emptyOpeningRecord } from './openings';
import {
  emptyBuildingForm,
  emptyRenovation,
  emptySiteForm,
  emptyTenant,
  parseNumber,
  summarizeCapacity,
  toBuildingForm,
  validateBuildingForm,
  validateSiteForm,
  type TenantForm,
} from './buildingForm';

describe('parseNumber', () => {
  it('accepts full-width digits and commas', () => {
    expect(parseNumber('１，２００.５')).toBe(1200.5);
    expect(parseNumber('3,000')).toBe(3000);
  });
  it('rejects empty and invalid input', () => {
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('abc')).toBeNull();
    expect(parseNumber('-1')).toBeNull();
  });
});

describe('validateSiteForm', () => {
  it('requires a name and trims people', () => {
    expect(validateSiteForm(emptySiteForm()).errors.name).toBeDefined();
    const { site } = validateSiteForm({
      ...emptySiteForm(),
      name: ' ○○ビル ',
      representative: { title: ' 代表取締役 ', name: ' 高知太郎 ' },
      witness: { title: ' ', name: '' },
    });
    expect(site).toEqual({ name: '○○ビル', address: '', representative: { title: '代表取締役', name: '高知太郎' }, witness: undefined });
  });
});

describe('validateBuildingForm', () => {
  const valid = {
    ...emptyBuildingForm('b1'),
    label: ' A棟 ',
    usage: '15' as const,
    totalFloorArea: '800',
    floorsAbove: '3',
    floorsBelow: '1',
    floorCapacities: { B1: '5', '1': '20', '2': '20', '3': '15' },
  };

  it('converts a valid form and totals capacity per floor', () => {
    const { building, errors } = validateBuildingForm(valid);
    expect(errors).toEqual({});
    expect(building).toMatchObject({
      id: 'b1',
      label: 'A棟',
      totalFloorArea: 800,
      floorsAbove: 3,
      floorsBelow: 1,
      capacity: 60,
      floorCapacities: { B1: 5, '1': 20, '2': 20, '3': 15 },
      tenants: [],
      subUsages: [],
    });
    expect(building).not.toHaveProperty('capacityFallback');
  });

  it('ignores capacities of floors that no longer exist', () => {
    const { building } = validateBuildingForm({ ...valid, floorsAbove: '2', floorsBelow: '0' });
    expect(building?.capacity).toBe(40);
    expect(building?.floorCapacities).toEqual({ '1': 20, '2': 20 });
  });

  it('allows blank floors but requires at least one capacity', () => {
    expect(validateBuildingForm({ ...valid, floorCapacities: { '1': '10' } }).building?.capacity).toBe(10);
    expect(validateBuildingForm({ ...valid, floorCapacities: {} }).errors.capacity).toBeDefined();
  });

  it('uses the migrated total until floors are entered', () => {
    const migrated = { ...valid, floorCapacities: {}, capacityFallback: 342 };
    expect(validateBuildingForm(migrated).building).toMatchObject({ capacity: 342, floorCapacities: {} });
    expect(validateBuildingForm({ ...migrated, floorCapacities: { '1': '10' } }).building?.capacity).toBe(10);
  });

  it('reports required fields', () => {
    const { building, errors } = validateBuildingForm(emptyBuildingForm());
    expect(building).toBeNull();
    expect(Object.keys(errors).sort()).toEqual(['floorsAbove', 'totalFloorArea', 'usage']);
  });

  it('rejects zero floors above ground and fractional counts', () => {
    expect(validateBuildingForm({ ...valid, floorsAbove: '0' }).errors.floorsAbove).toBeDefined();
    expect(validateBuildingForm({ ...valid, floorCapacities: { '1': '1.5' } }).errors['floor:1']).toBeDefined();
  });

  describe('16項 tenants', () => {
    const t = (o: Partial<TenantForm>): TenantForm => ({ ...emptyTenant(), ...o });
    const composite = {
      ...valid,
      usage: '16イ' as const,
      floorCapacities: { '1': '999' }, // 16項では使わない
      tenants: [
        t({ id: 't1', name: '○○食堂', usage: '3ロ', floor: '1', area: '120', capacity: '40' }),
        t({ id: 't2', name: '△△商事', usage: '15', floor: '2', area: '200', capacity: '30' }),
        t({ id: 't3', name: '△△商事', usage: '15', floor: '3', capacity: '25' }),
        t({ id: 't4', name: '共用部', usage: '15', capacity: '5' }),
        t({ id: 't5' }), // 空行は無視
      ],
    };

    it('derives sub-usages and per-floor capacity from tenants', () => {
      const { building, errors } = validateBuildingForm(composite);
      expect(errors).toEqual({});
      expect(building?.subUsages).toEqual(['3ロ', '15']);
      expect(building?.floorCapacities).toEqual({ '1': 40, '2': 30, '3': 25 });
      expect(building?.capacity).toBe(100); // 階未設定の共用部も合計に含む
      expect(building?.tenants).toHaveLength(4);
      expect(building?.tenants[0]).toEqual({ id: 't1', name: '○○食堂', usage: '3ロ', floor: '1', area: 120, capacity: 40 });
      expect(building?.tenants[2]).not.toHaveProperty('area');
    });

    it('summarizes capacity for the form', () => {
      expect(summarizeCapacity(composite)).toEqual({ byFloor: { '1': 40, '2': 30, '3': 25 }, total: 100, unassigned: 5 });
    });

    it('requires tenant usage and numeric values', () => {
      const { errors } = validateBuildingForm({
        ...composite,
        tenants: [t({ id: 'x', name: '名称のみ', area: 'abc', capacity: '1.5', floor: '9' })],
      });
      expect(errors['tenant:x:usage']).toBeDefined();
      expect(errors['tenant:x:area']).toBeDefined();
      expect(errors['tenant:x:capacity']).toBeDefined();
      expect(errors['tenant:x:floor']).toBeDefined();
      expect(errors.tenants).toBeDefined();
    });

    it('drops tenants when the usage is not 16項', () => {
      const { building } = validateBuildingForm({ ...composite, usage: '15' });
      expect(building?.tenants).toEqual([]);
      expect(building?.subUsages).toEqual([]);
      expect(building?.capacity).toBe(999);
    });

    it('round-trips through the edit form', () => {
      const { building } = validateBuildingForm(composite);
      const form = toBuildingForm(building!);
      expect(form.tenants[0]).toMatchObject({ name: '○○食堂', area: '120', capacity: '40' });
      expect(form.capacityFallback).toBeNull();
      expect(validateBuildingForm(form).building).toEqual(building);
    });
  });

  describe('renovation', () => {
    it('is undefined when nothing is entered', () => {
      expect(validateBuildingForm(valid).building?.renovation).toBeUndefined();
    });

    it('keeps details when 有 and converts the area', () => {
      const { building } = validateBuildingForm({
        ...valid,
        renovation: { ...emptyRenovation(), status: 'yes', location: ' 3階 東側 ', area: '１２０.５', period: '令和5年3月', photoIds: ['p1'], photoCaptions: { p1: '東側外観', gone: 'x' } },
      });
      expect(building?.renovation).toEqual({
        status: 'yes', location: '3階 東側', area: 120.5, period: '令和5年3月', photoIds: ['p1'], photoCaptions: { p1: '東側外観' },
      });
    });

    it('drops details when 無 but keeps photos', () => {
      const { building } = validateBuildingForm({
        ...valid,
        renovation: { ...emptyRenovation(), status: 'no', location: '3階', area: '10', period: 'R5', photoIds: ['p1'] },
      });
      expect(building?.renovation).toEqual({ status: 'no', location: '', period: '', photoIds: ['p1'], photoCaptions: {} });
    });

    it('keeps photos even when 有無 is not selected', () => {
      const { building } = validateBuildingForm({ ...valid, renovation: { ...emptyRenovation(), photoIds: ['p1'] } });
      expect(building?.renovation?.status).toBeNull();
      expect(building?.renovation?.photoIds).toEqual(['p1']);
    });

    it('rejects a non-numeric area and allows an empty one', () => {
      expect(validateBuildingForm({ ...valid, renovation: { ...emptyRenovation(), status: 'yes', area: 'abc' } }).errors.renovationArea).toBeDefined();
      expect(validateBuildingForm({ ...valid, renovation: { ...emptyRenovation(), status: 'yes', area: '' } }).building?.renovation).not.toHaveProperty('area');
    });

    it('round-trips through the edit form', () => {
      const { building } = validateBuildingForm({ ...valid, renovation: { ...emptyRenovation(), status: 'yes', area: '120' } });
      expect(toBuildingForm(building!).renovation.area).toBe('120');
    });
  });
  describe('有効開口部', () => {
    it('validates opening records and round-trips through the edit form', () => {
      const rec = { ...emptyOpeningRecord('2'), floorArea: '120', openings: [{ ...emptyOpening('full'), width: '80', height: '130', count: '2' }] };
      const { building, errors } = validateBuildingForm({ ...valid, openingRecords: [rec] });
      expect(errors).toEqual({});
      expect(building?.openingRecords).toEqual([
        {
          id: rec.id,
          floor: '2',
          floorArea: 120,
          memo: '',
          photoIds: [],
          photoCaptions: {},
          openings: [
            { id: rec.openings[0].id, direction: '', location: '', kind: 'full', width: 80, height: 130, count: 2, photoIds: [], photoCaptions: {} },
          ],
        },
      ]);
      const back = toBuildingForm(building!).openingRecords;
      expect(back[0]).toMatchObject({ floor: '2', floorArea: '120', openings: [{ width: '80', height: '130', count: '2' }] });
    });

    it('does not allow basement floors', () => {
      const rec = { ...emptyOpeningRecord('B1'), memo: 'x' };
      expect(validateBuildingForm({ ...valid, openingRecords: [rec] }).errors).toEqual({
        [`openingRecord:${rec.id}:floor`]: '階を選び直してください',
      });
    });
  });
});
