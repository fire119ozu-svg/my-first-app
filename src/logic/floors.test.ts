import { describe, expect, it } from 'vitest';
import { floorKeys, floorLabel, sumPerFloor } from './floors';

describe('floors', () => {
  it('lists basement (deepest first) then above-ground floors', () => {
    expect(floorKeys({ floorsAbove: 3, floorsBelow: 2 })).toEqual(['B2', 'B1', '1', '2', '3']);
    expect(floorKeys({ floorsAbove: 1, floorsBelow: 0 })).toEqual(['1']);
  });

  it('formats labels', () => {
    expect(floorLabel('B1')).toBe('地下1階');
    expect(floorLabel('12')).toBe('12階');
  });

  it('sums only current floors and counts invalid input', () => {
    const v = { B1: '2', '1': '３', '2': '1.5', '3': 'abc', '9': '100' };
    expect(sumPerFloor(v, ['B1', '1', '2', '3'])).toEqual({ total: 6.5, filled: 3, invalid: 1 });
    expect(sumPerFloor(undefined, ['1'])).toEqual({ total: 0, filled: 0, invalid: 0 });
    expect(sumPerFloor({ '1': '0.1', '2': '0.2' }, ['1', '2']).total).toBe(0.3);
  });
});
