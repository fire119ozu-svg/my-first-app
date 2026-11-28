import { describe, expect, it } from 'vitest';
import { CHECKLIST_ITEMS } from '../data/checklistItems';
import { INSTRUCTIONS } from '../data/instructions';
import { formatCitation, stationOf, toWareki } from './officialFormat';

describe('official form formatting', () => {
  it('converts to the Japanese era', () => {
    expect(toWareki('2026-11-27')).toBe('令和8年11月27日');
    expect(toWareki('2019-05-01')).toBe('令和元年5月1日');
    expect(toWareki('2019-04-30')).toBe('平成31年4月30日');
  });

  it('formats citations like the sample (法・令・規則)', () => {
    expect(
      formatCitation([
        { law: '消防法', article: '第17条', verified: true },
        { law: '消防法施行令', article: '第10条', verified: true },
        { law: '消防法施行規則', article: '第6条〜第9条', verified: true },
      ]),
    ).toBe('法第17条、令第10条、規則第6条から第9条');
    expect(formatCitation([{ law: '高知市火災予防条例', article: '第3条の4', verified: true }])).toBe('火災予防条例第3条の4');
  });

  it('extracts the fire station from the department', () => {
    expect(stationOf('高知市中央消防署庶務予防係')).toBe('高知市中央消防署');
    expect(stationOf('予防課')).toBe('');
  });

  it('has a standard instruction for every checklist item', () => {
    for (const item of CHECKLIST_ITEMS) expect(INSTRUCTIONS[item.id], item.id).toMatch(/こと。|でない。$/);
    expect(Object.keys(INSTRUCTIONS).sort()).toEqual(CHECKLIST_ITEMS.map((i) => i.id).sort());
  });
});
