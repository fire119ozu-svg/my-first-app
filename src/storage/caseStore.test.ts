import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createCase } from '../logic/inspectionCase';
import { makeBuilding, makeSite } from '../test/fixtures';
import {
  deleteCase,
  deletePhoto,
  deletePhotosByCase,
  deleteReference,
  getCase,
  getPhoto,
  getReference,
  listCases,
  listPhotosByCase,
  listReferences,
  saveCase,
  savePhoto,
  saveReference,
} from './caseStore';
import type { PhotoRecord } from '../types/inspection';

const building = makeBuilding({ totalFloorArea: 100, capacity: 10 });
const meta = { inspectionDate: '2026-11-27', inspectors: [] };

describe('caseStore', () => {
  it('saves, lists (newest first), loads and deletes', async () => {
    const a = createCase(makeSite({ name: 'A' }), [building], meta, new Date('2026-11-01T00:00:00Z'));
    const b = createCase(makeSite({ name: 'B' }), [building], meta, new Date('2026-11-02T00:00:00Z'));
    await saveCase(a);
    await saveCase(b);
    expect((await listCases()).map((c) => c.site.name)).toEqual(['B', 'A']);
    expect((await getCase(a.id))?.site.name).toBe('A');
    await deleteCase(a.id);
    expect(await getCase(a.id)).toBeUndefined();
    expect(await listCases()).toHaveLength(1);
  });

  it('stores photos per case and deletes them with the case', async () => {
    const c = createCase(makeSite({ name: 'P' }), [building], meta);
    const other = createCase(makeSite({ name: 'Q' }), [building], meta);
    await saveCase(c);
    await saveCase(other);
    const photo = (id: string, caseId: string): PhotoRecord => ({
      id, caseId, itemId: 'FM-001',
      blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }),
      thumb: new Blob([new Uint8Array([1])], { type: 'image/jpeg' }),
      width: 3, height: 1, createdAt: '2026-11-27T00:00:00Z',
    });
    await savePhoto(photo('a', c.id));
    await savePhoto(photo('b', c.id));
    await savePhoto(photo('x', other.id));
    expect((await listPhotosByCase(c.id)).map((p) => p.id).sort()).toEqual(['a', 'b']);
    const a = await getPhoto('a');
    expect(a?.width).toBe(3);
    expect(new Uint8Array(await a!.blob.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));

    await deletePhoto('a');
    expect(await getPhoto('a')).toBeUndefined();

    await deleteCase(c.id);
    expect(await listPhotosByCase(c.id)).toEqual([]);
    expect(await getPhoto('x')).toBeDefined(); // 他の案件の写真は残る
  });

  it('stores reference documents independently of cases', async () => {
    const r = {
      id: 'r1', title: '点検要領', category: '点検要領', kind: 'pdf' as const,
      blob: new Blob([new Uint8Array([37, 80, 68, 70])], { type: 'application/pdf' }),
      pageCount: 5, fileName: '点検要領.pdf', createdAt: '2026-11-28T00:00:00Z', updatedAt: '2026-11-28T00:00:00Z',
    };
    await saveReference(r);
    await saveReference({ ...r, title: '改題' });
    expect((await listReferences()).map((x) => x.title)).toEqual(['改題']);
    const got = await getReference('r1');
    expect(new Uint8Array(await got!.blob.arrayBuffer())).toEqual(new Uint8Array([37, 80, 68, 70]));
    // 案件を消しても資料は残る
    const c = createCase(makeSite(), [building], meta);
    await saveCase(c);
    await deleteCase(c.id);
    expect(await getReference('r1')).toBeDefined();
    await deleteReference('r1');
    expect(await listReferences()).toEqual([]);
  });

  it('deletes all photos of a draft case', async () => {
    const photo = (id: string, caseId: string): PhotoRecord => ({
      id, caseId, itemId: '__renovation__', blob: new Blob([new Uint8Array([1])]), thumb: new Blob([new Uint8Array([1])]),
      width: 1, height: 1, createdAt: '',
    });
    await savePhoto(photo('d1', 'draft'));
    await savePhoto(photo('d2', 'draft'));
    await savePhoto(photo('k1', 'keep'));
    await deletePhotosByCase('draft');
    expect(await listPhotosByCase('draft')).toEqual([]);
    expect(await getPhoto('k1')).toBeDefined();
  });
});
