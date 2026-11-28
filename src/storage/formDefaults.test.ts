import { beforeEach, describe, expect, it } from 'vitest';
import { loadInspectors, loadOffice, storeInspectors, storeOffice } from './formDefaults';

/** テスト環境(node)用の簡易 localStorage */
class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
}

beforeEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();
});

describe('前回の検査員', () => {
  it('記憶が無ければ空の1行', () => {
    expect(loadInspectors()).toEqual([{ rank: '', name: '' }]);
  });

  it('保存した検査員を次回読み込める(複数人・順序どおり)', () => {
    storeInspectors([
      { rank: '消防司令補', name: '高知太郎' },
      { rank: '消防士長', name: '土佐花子' },
    ]);
    expect(loadInspectors()).toEqual([
      { rank: '消防司令補', name: '高知太郎' },
      { rank: '消防士長', name: '土佐花子' },
    ]);
  });

  it('1人もいないときは前回の値を残す', () => {
    storeInspectors([{ rank: '消防司令補', name: '高知太郎' }]);
    storeInspectors([]);
    expect(loadInspectors()).toEqual([{ rank: '消防司令補', name: '高知太郎' }]);
  });

  it('壊れた値は無視して空の1行', () => {
    localStorage.setItem('inspectorDefaults:v1', '{壊れた');
    expect(loadInspectors()).toEqual([{ rank: '', name: '' }]);
    localStorage.setItem('inspectorDefaults:v1', JSON.stringify([null, 1, { name: '高知太郎' }, {}]));
    expect(loadInspectors()).toEqual([{ rank: '', name: '高知太郎' }]);
  });
});

describe('前回の所属・TEL', () => {
  it('保存・読み込み、空欄なら前回の値を残す', () => {
    storeOffice({ department: '中央消防署', phone: '088-000-0000' });
    storeOffice({ department: '', phone: '' });
    expect(loadOffice()).toEqual({ department: '中央消防署', phone: '088-000-0000' });
  });
});
