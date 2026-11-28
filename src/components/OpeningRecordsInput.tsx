/**
 * 有効開口部の記録(無窓階の判定用)。
 * 毎回計算するものではないため折りたたんでおき、タップで開く。
 * 階ごとに床面積と開口部(幅×高さ×箇所数)を入力すると、普通階/無窓階を自動で表示する。
 */
import { useId, useState } from 'react';
import type { FormErrors } from '../logic/buildingForm';
import { floorLabel } from '../logic/floors';
import {
  emptyOpening,
  emptyOpeningRecord,
  effectiveSize,
  formatJudgement,
  isEffectiveOpening,
  isLargeOpening,
  judgeRecordForm,
  OPENING_DIRECTIONS,
  OPENING_KINDS,
  openingPlace,
  type OpeningForm,
  type OpeningRecordForm,
} from '../logic/openings';
import { parseNumber } from '../logic/number';
import type { FloorKey, OpeningDirection, OpeningKind } from '../types/inspection';

/** 開口部1つの有効寸法と扱い(例:有効 90×130cm・大型開口部) */
function openingNote(o: OpeningForm): string | null {
  const width = parseNumber(o.width);
  const height = parseNumber(o.height);
  if (!width || !height) return null;
  const size = { kind: o.kind, width, height };
  const eff = effectiveSize(size);
  const fmt = (n: number) => String(Math.round(n * 10) / 10);
  const kind = isLargeOpening(size) ? '大型開口部' : isEffectiveOpening(size) ? '面積に算入' : '直径50cmの円が内接しないため算入しない';
  return `有効 ${fmt(eff.width)}×${fmt(eff.height)}cm・${kind}`;
}

function OpeningRow(props: {
  index: number;
  value: OpeningForm;
  errors: FormErrors;
  removable: boolean;
  onChange: (v: OpeningForm) => void;
  onRemove: () => void;
}) {
  const { index, value: o, errors, removable, onChange, onRemove } = props;
  const id = useId();
  const err = (k: string) => errors[`opening:${o.id}:${k}`];
  const label = openingPlace(o) || `開口部${index + 1}`;
  const num = (k: 'width' | 'height' | 'count', title: string, unit: string, placeholder?: string) => (
    <div className={err(k) ? 'has-error' : ''}>
      <label className="sub-label" htmlFor={`${id}-${k}`}>
        {title}
      </label>
      <div className="input-unit">
        <input
          id={`${id}-${k}`}
          type="text"
          inputMode={k === 'count' ? 'numeric' : 'decimal'}
          className="num"
          aria-label={`${label}の${title}`}
          placeholder={placeholder}
          value={o[k]}
          onChange={(e) => onChange({ ...o, [k]: e.target.value })}
        />
        <span className="unit">{unit}</span>
      </div>
    </div>
  );
  return (
    <div className="opening-row">
      <div className="opening-place">
        <select
          aria-label={`開口部${index + 1}の方角`}
          value={o.direction}
          onChange={(e) => onChange({ ...o, direction: e.target.value as OpeningDirection | '' })}
        >
          <option value="">方角</option>
          {OPENING_DIRECTIONS.map((d) => (
            <option key={d} value={d}>
              {d}面
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="場所(例:事務室)"
          aria-label={`開口部${index + 1}の場所`}
          value={o.location}
          onChange={(e) => onChange({ ...o, location: e.target.value })}
        />
        {removable && (
          <button type="button" className="inspector-remove" onClick={onRemove} aria-label={`${label}を削除`}>
            ×
          </button>
        )}
      </div>
      <div className="opening-kind" role="radiogroup" aria-label={`${label}の種類`}>
        {OPENING_KINDS.map((k) => (
          <button
            key={k.value}
            type="button"
            role="radio"
            aria-checked={o.kind === k.value}
            className={`chip${o.kind === k.value ? ' on' : ''}`}
            onClick={() => onChange({ ...o, kind: k.value as OpeningKind })}
          >
            {k.label}
          </button>
        ))}
      </div>
      <div className="opening-grid">
        {num('width', '幅', 'cm')}
        {num('height', '高さ', 'cm')}
        {num('count', '箇所数', '箇所', '1')}
      </div>
      {openingNote(o) && <p className="opening-note">{openingNote(o)}</p>}
      {['width', 'height', 'count'].map(
        (k) =>
          err(k) && (
            <p key={k} className="field-error">
              {err(k)}
            </p>
          ),
      )}
    </div>
  );
}

function RecordCard(props: {
  record: OpeningRecordForm;
  floors: FloorKey[];
  /** 他の記録で使っている階(選択肢から除く) */
  usedFloors: FloorKey[];
  errors: FormErrors;
  onChange: (r: OpeningRecordForm) => void;
  onRemove: () => void;
}) {
  const { record: r, floors, usedFloors, errors, onChange, onRemove } = props;
  const id = useId();
  const err = (k: string) => errors[`openingRecord:${r.id}:${k}`];
  const name = r.floor ? floorLabel(r.floor) : '階未選択';
  const j = judgeRecordForm(r);
  const setOpening = (o: OpeningForm) => onChange({ ...r, openings: r.openings.map((x) => (x.id === o.id ? o : x)) });
  return (
    <div className="tenant-card opening-card">
      <div className="opening-card-head">
        <div className={err('floor') ? 'has-error' : ''}>
          <label className="sub-label" htmlFor={`${id}-floor`}>
            階
          </label>
          <select id={`${id}-floor`} aria-label="記録する階" value={r.floor} onChange={(e) => onChange({ ...r, floor: e.target.value })}>
            <option value="">選択</option>
            {r.floor && !floors.includes(r.floor) && <option value={r.floor}>{floorLabel(r.floor)}(範囲外)</option>}
            {floors
              .filter((f) => f === r.floor || !usedFloors.includes(f))
              .map((f) => (
                <option key={f} value={f}>
                  {floorLabel(f)}
                </option>
              ))}
          </select>
        </div>
        <div className={err('floorArea') ? 'has-error' : ''}>
          <label className="sub-label" htmlFor={`${id}-area`}>
            床面積
          </label>
          <div className="input-unit">
            <input
              id={`${id}-area`}
              type="text"
              inputMode="decimal"
              className="num"
              aria-label={`${name}の床面積`}
              value={r.floorArea}
              onChange={(e) => onChange({ ...r, floorArea: e.target.value })}
            />
            <span className="unit">㎡</span>
          </div>
        </div>
        <button
          type="button"
          className="inspector-remove"
          onClick={() => {
            const entered = r.floorArea.trim() || r.memo.trim() || r.openings.some((o) => o.width.trim() || o.height.trim());
            if (!entered || confirm(`${name}の有効開口部の記録を削除しますか?`)) onRemove();
          }}
          aria-label={`${name}の記録を削除`}
        >
          ×
        </button>
      </div>
      {['floor', 'floorArea'].map(
        (k) =>
          err(k) && (
            <p key={k} className="field-error">
              {err(k)}
            </p>
          ),
      )}

      {r.openings.map((o, i) => (
        <OpeningRow
          key={o.id}
          index={i}
          value={o}
          errors={errors}
          removable={r.openings.length > 1}
          onChange={setOpening}
          onRemove={() => onChange({ ...r, openings: r.openings.filter((x) => x.id !== o.id) })}
        />
      ))}
      <button
        type="button"
        className="inspector-add"
        // 直前の開口部と同じ種類で追加する(同じ形式の窓が続くことが多い)
        onClick={() => onChange({ ...r, openings: [...r.openings, emptyOpening(r.openings.at(-1)?.kind)] })}
      >
        ＋ 開口部を追加
      </button>

      <input
        type="text"
        className="opening-memo"
        placeholder="メモ(例:2面道路に面する、網入りガラスは除外)"
        aria-label={`${name}のメモ`}
        value={r.memo}
        onChange={(e) => onChange({ ...r, memo: e.target.value })}
      />

      <p className={`opening-result${j.result ? ` ${j.result}` : ''}`} aria-live="polite">
        {formatJudgement(j)}
      </p>
    </div>
  );
}

export function OpeningRecordsInput(props: {
  records: OpeningRecordForm[];
  /** 地上階の一覧 */
  floors: FloorKey[];
  errors: FormErrors;
  onChange: (v: OpeningRecordForm[]) => void;
}) {
  const { records, floors, errors, onChange } = props;
  const hasError = Object.keys(errors).some((k) => k.startsWith('opening'));
  const [open, setOpen] = useState(false);
  // 入力に不備があるときは閉じたままにしない
  const shown = open || hasError;
  const judged = records.filter((r) => r.floor).map((r) => ({ floor: r.floor, result: judgeRecordForm(r).result }));
  const windowless = judged.filter((x) => x.result === 'windowless').map((x) => floorLabel(x.floor));
  const usedFloors = records.map((r) => r.floor).filter((f): f is FloorKey => !!f);

  const add = () => {
    // まだ記録していない一番下の階を選んでおく
    const next = floors.find((f) => !usedFloors.includes(f)) ?? '';
    onChange([...records, emptyOpeningRecord(next)]);
  };

  return (
    <div className={`opening-section${hasError ? ' has-error' : ''}`}>
      <button type="button" className="opening-toggle" aria-expanded={shown} onClick={() => setOpen(!shown)}>
        <span className="opening-toggle-text">
          <span>有効開口部(無窓階の判定)</span>
          <small>
            {judged.length === 0
              ? '未記録'
              : `${judged.length}階分を記録` + (windowless.length ? `・無窓階:${windowless.join('・')}` : '・すべて普通階')}
          </small>
        </span>
        <span className="opening-toggle-mark" aria-hidden="true">
          {shown ? '▾' : '▸'}
        </span>
      </button>
      {shown && (
        <div className="opening-body">
          <p className="field-hint">
            床面から下端まで1.2m以内・道等の空地に面する・格子等がない開口部を入力します(11階以上は空地の要件なし)。
            引き違い窓は幅の1/2で計算します。10階以下は大型開口部(直径1m以上の円が内接、または幅75cm以上×高さ1.2m以上)が2つ以上必要です。
          </p>
          {floors.length === 0 ? (
            <p className="muted small">地上階数を入力すると記録できます。</p>
          ) : (
            <>
              {records.map((r) => (
                <RecordCard
                  key={r.id}
                  record={r}
                  floors={floors}
                  usedFloors={usedFloors.filter((f) => f !== r.floor)}
                  errors={errors}
                  onChange={(v) => onChange(records.map((x) => (x.id === r.id ? v : x)))}
                  onRemove={() => onChange(records.filter((x) => x.id !== r.id))}
                />
              ))}
              {usedFloors.length < floors.length && (
                <button type="button" className="inspector-add" onClick={add}>
                  ＋ 階を追加
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
