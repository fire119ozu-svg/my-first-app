import { describe, expect, it } from 'vitest';
import { extractChecklistItems } from '../logic/extractChecklist';
import { makeBuilding } from '../test/fixtures';
import { CHECKLIST_ITEMS } from './checklistItems';

describe('checklist master', () => {
  it('has unique ids', () => {
    const ids = CHECKLIST_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('cites only verified articles of the Kochi ordinance (no placeholders)', () => {
    const kochi = CHECKLIST_ITEMS.flatMap((i) => i.legalBasis.filter((l) => l.law === '高知市火災予防条例').map((l) => ({ id: i.id, ...l })));
    expect(kochi.length).toBeGreaterThan(10);
    for (const l of kochi) {
      expect(l.verified, `${l.id} ${l.article}`).toBe(true);
      expect(l.article, l.id).toMatch(/^第\d+条/);
    }
  });

  it('excludes 19項・20項 from the use-start notification (条例第43条)', () => {
    const ids = (usage: '15' | '19' | '20') => extractChecklistItems(makeBuilding({ usage })).map((i) => i.id);
    expect(ids('15')).toContain('NT-001');
    expect(ids('19')).not.toContain('NT-001');
    expect(ids('20')).not.toContain('NT-001');
  });
});
