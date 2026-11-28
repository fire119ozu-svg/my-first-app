/**
 * 検査員の入力(階級をリストから選択+氏名)。複数人を追加・削除できる。
 * リストにない呼称は「その他」を選んで自由に入力する。
 */
import { useId, useState } from 'react';
import { FIRE_RANKS } from '../data/ranks';
import type { Inspector } from '../types/inspection';

const OTHER = '__other__';
const isListed = (rank: string) => (FIRE_RANKS as readonly string[]).includes(rank);

function InspectorRow(props: {
  index: number;
  value: Inspector;
  removable: boolean;
  onChange: (v: Inspector) => void;
  onRemove: () => void;
}) {
  const { index, value, removable, onChange, onRemove } = props;
  const id = useId();
  // リスト外の階級が入っている場合、または「その他」を選んだ場合は自由入力欄を出す
  const [other, setOther] = useState(value.rank !== '' && !isListed(value.rank));
  const label = `検査員${index + 1}`;
  return (
    <div className="inspector-row">
      <div className="inspector-fields">
        <div>
          <label htmlFor={`${id}-rank`} className="sub-label">
            階級
          </label>
          <select
            id={`${id}-rank`}
            aria-label={`${label}の階級`}
            value={other ? OTHER : value.rank}
            onChange={(e) => {
              const v = e.target.value;
              if (v === OTHER) {
                setOther(true);
                onChange({ ...value, rank: '' });
              } else {
                setOther(false);
                onChange({ ...value, rank: v });
              }
            }}
          >
            <option value="">選択</option>
            {FIRE_RANKS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
            <option value={OTHER}>その他(入力)</option>
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-name`} className="sub-label">
            氏名
          </label>
          <input
            id={`${id}-name`}
            type="text"
            aria-label={`${label}の氏名`}
            value={value.name}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
          />
        </div>
        {removable && (
          <button type="button" className="inspector-remove" onClick={onRemove} aria-label={`${label}を削除`}>
            ×
          </button>
        )}
      </div>
      {other && (
        <input
          type="text"
          className="inspector-other"
          aria-label={`${label}の階級(入力)`}
          placeholder="階級・役職を入力"
          value={value.rank}
          onChange={(e) => onChange({ ...value, rank: e.target.value })}
        />
      )}
    </div>
  );
}

export function InspectorsInput({ value, onChange }: { value: Inspector[]; onChange: (v: Inspector[]) => void }) {
  // 行の識別用(削除しても入力中の行が入れ替わらないように)
  const [keys, setKeys] = useState(() => value.map((_, i) => i));
  const [nextKey, setNextKey] = useState(value.length);
  const rows = value.length ? value : [{ rank: '', name: '' }];
  const rowKeys = keys.length === rows.length ? keys : rows.map((_, i) => i);

  const update = (i: number, v: Inspector) => onChange(rows.map((r, j) => (j === i ? v : r)));
  const add = () => {
    onChange([...rows, { rank: '', name: '' }]);
    setKeys([...rowKeys, nextKey]);
    setNextKey(nextKey + 1);
  };
  const remove = (i: number) => {
    onChange(rows.filter((_, j) => j !== i));
    setKeys(rowKeys.filter((_, j) => j !== i));
  };

  return (
    <fieldset className="field person-field inspectors">
      <legend className="field-label">検査員</legend>
      {rows.map((r, i) => (
        <InspectorRow
          key={rowKeys[i]}
          index={i}
          value={r}
          removable={rows.length > 1}
          onChange={(v) => update(i, v)}
          onRemove={() => remove(i)}
        />
      ))}
      <button type="button" className="inspector-add" onClick={add}>
        ＋ 検査員を追加
      </button>
    </fieldset>
  );
}
