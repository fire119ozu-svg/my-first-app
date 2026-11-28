import { describe, expect, it } from 'vitest';
import {
  emptyOpening,
  emptyOpeningRecord,
  formatJudgement,
  isLargeOpening,
  judgeOpenings,
  judgeRecordForm,
  validateOpeningRecords,
  windowlessFloors,
  type OpeningRecordForm,
} from './openings';

const big = { kind: 'full' as const, width: 80, height: 130, count: 1 };

describe('judgeOpenings(無窓階の判定)', () => {
  it('面積が1/30を超え、大型開口部が2以上なら普通階', () => {
    // 80×130×2 = 2.08㎡ > 60/30 = 2㎡
    const j = judgeOpenings('2', 60, [{ ...big, count: 2 }]);
    expect(j).toMatchObject({ effectiveArea: 2.08, requiredArea: 2, largeCount: 2, largeRequired: 2, result: 'normal' });
  });

  it('ちょうど1/30は「超える」に当たらないため無窓階', () => {
    // 100×100×3 = 3㎡、床面積90㎡ → 1/30 = 3㎡
    expect(judgeOpenings('1', 90, [{ kind: 'full', width: 100, height: 100, count: 3 }]).result).toBe('windowless');
  });

  it('10階以下で大型開口部が1つだけなら面積が足りても無窓階', () => {
    const j = judgeOpenings('3', 30, [big, { kind: 'full', width: 60, height: 60, count: 5 }]);
    expect(j.largeCount).toBe(1);
    expect(j.result).toBe('windowless');
  });

  it('11階以上は大型開口部が不要', () => {
    const j = judgeOpenings('11', 30, [{ kind: 'full', width: 60, height: 60, count: 3 }]);
    expect(j).toMatchObject({ largeRequired: 0, largeCount: 0, result: 'normal' });
  });

  it('引き違い窓は幅の1/2で計算する', () => {
    // 幅180の引き違い → 有効幅90×高さ130:大型(75×120以上)
    expect(isLargeOpening({ kind: 'sliding', width: 180, height: 130 })).toBe(true);
    // 幅140の引き違い → 有効幅70:大型ではない
    expect(isLargeOpening({ kind: 'sliding', width: 140, height: 130 })).toBe(false);
    const j = judgeOpenings('1', 100, [{ kind: 'sliding', width: 180, height: 100, count: 1 }]);
    expect(j.effectiveArea).toBe(0.9);
  });

  it('直径50cmの円が内接しない開口部は面積に算入しない', () => {
    // 引き違い 幅90 → 有効幅45
    expect(judgeOpenings('1', 10, [{ kind: 'sliding', width: 90, height: 200, count: 4 }]).effectiveArea).toBe(0);
  });

  it('直径1m以上の円が内接する開口部は大型', () => {
    expect(isLargeOpening({ kind: 'full', width: 100, height: 100 })).toBe(true);
    expect(isLargeOpening({ kind: 'full', width: 99, height: 119 })).toBe(false);
  });

  it('床面積が未入力なら判定しない', () => {
    const j = judgeOpenings('1', undefined, [big]);
    expect(j.result).toBeNull();
    expect(formatJudgement(j)).toBe('有効開口 1.04㎡・大型開口部 1/2 → 判定なし(床面積未入力)');
  });
});

function recordForm(patch: Partial<OpeningRecordForm> = {}): OpeningRecordForm {
  return { ...emptyOpeningRecord('1'), ...patch };
}

describe('入力フォーム', () => {
  it('入力途中の値で判定し、読めない開口部は除く', () => {
    const r = recordForm({
      floorArea: '６０',
      openings: [
        { ...emptyOpening('full'), width: '80', height: '130', count: '' },
        { ...emptyOpening('full'), width: '80', height: '130', count: '1' },
        { ...emptyOpening('full'), width: 'abc', height: '130', count: '' },
      ],
    });
    expect(judgeRecordForm(r)).toMatchObject({ largeCount: 2, result: 'normal' });
    expect(windowlessFloors([r])).toEqual([]);
    expect(windowlessFloors([{ ...r, floorArea: '1000' }])).toEqual(['1']);
  });

  it('保存用に変換する(空の階・開口部は除き、階の順に並べる)', () => {
    const { records, errors } = validateOpeningRecords(
      [
        recordForm({ floor: '3', floorArea: '200', memo: ' 東面道路 ', openings: [{ ...emptyOpening(), location: '東面', width: '180', height: '120', count: '2' }, emptyOpening()] }),
        recordForm({ floor: '1', openings: [{ ...emptyOpening(), width: '100', height: '100' }] }),
        recordForm({ floor: '' }),
      ].map((r, i) => (i === 2 ? { ...r, floor: '' as const } : r)),
      ['1', '2', '3'],
    );
    expect(errors).toEqual({});
    expect(records.map((r) => r.floor)).toEqual(['1', '3']);
    expect(records[1]).toMatchObject({
      floorArea: 200,
      memo: '東面道路',
      openings: [{ location: '東面', kind: 'sliding', width: 180, height: 120, count: 2 }],
    });
    expect(records[0]).not.toHaveProperty('floorArea');
    expect(records[0].openings[0].count).toBe(1);
  });

  it('不正な入力はエラー', () => {
    const o = { ...emptyOpening(), width: '0', height: 'x', count: '1.5' };
    const r = recordForm({ floor: '5', floorArea: 'abc', openings: [o] });
    const dup = recordForm({ floor: '1', memo: 'a' });
    const dup2 = recordForm({ floor: '1', memo: 'b' });
    const { errors } = validateOpeningRecords([r, dup, dup2], ['1', '2']);
    expect(errors).toEqual({
      [`openingRecord:${r.id}:floor`]: '階を選び直してください',
      [`openingRecord:${r.id}:floorArea`]: '床面積を数値で入力してください',
      [`opening:${o.id}:width`]: '幅を数値(cm)で入力してください',
      [`opening:${o.id}:height`]: '高さを数値(cm)で入力してください',
      [`opening:${o.id}:count`]: '箇所数を1以上の整数で入力してください',
      [`openingRecord:${dup2.id}:floor`]: '同じ階が2回記録されています',
    });
  });
});
