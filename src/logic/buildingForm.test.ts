import { describe, expect, it } from 'vitest';
import { emptyBuildingForm, emptyRenovation, parseNumber, toBuildingForm, validateBuildingForm } from './buildingForm';

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

describe('validateBuildingForm', () => {
  const valid = {
    ...emptyBuildingForm(),
    name: ' ○○ビル ',
    usage: '15' as const,
    totalFloorArea: '800',
    floorsAbove: '3',
    capacity: '60',
  };

  it('converts a valid form to BuildingInfo', () => {
    const { building, errors } = validateBuildingForm(valid);
    expect(errors).toEqual({});
    expect(building).toMatchObject({ name: '○○ビル', totalFloorArea: 800, floorsAbove: 3, floorsBelow: 0, capacity: 60 });
  });

  it('trims people and treats blank ones as not entered', () => {
    const { building } = validateBuildingForm({
      ...valid,
      representative: { title: ' 代表取締役 ', name: ' 高知太郎 ' },
      witness: { title: ' ', name: '' },
    });
    expect(building?.representative).toEqual({ title: '代表取締役', name: '高知太郎' });
    expect(building?.witness).toBeUndefined();
  });

  it('reports required fields', () => {
    const { building, errors } = validateBuildingForm(emptyBuildingForm());
    expect(building).toBeNull();
    expect(Object.keys(errors).sort()).toEqual(['capacity', 'floorsAbove', 'name', 'totalFloorArea', 'usage']);
  });

  it('rejects zero floors above ground and fractional counts', () => {
    expect(validateBuildingForm({ ...valid, floorsAbove: '0' }).errors.floorsAbove).toBeDefined();
    expect(validateBuildingForm({ ...valid, capacity: '1.5' }).errors.capacity).toBeDefined();
  });

  it('requires sub-usages for 16項 and drops them otherwise', () => {
    expect(validateBuildingForm({ ...valid, usage: '16イ' }).errors.subUsages).toBeDefined();
    const { building } = validateBuildingForm({ ...valid, subUsages: ['3ロ'] });
    expect(building?.subUsages).toEqual([]);
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
});
