import { describe, expect, it } from 'vitest';
import { emptyBuildingForm, parseNumber, validateBuildingForm } from './buildingForm';

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
});
