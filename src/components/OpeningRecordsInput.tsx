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
  openingPhotoIds,
  OPENING_KINDS,
  openingPlace,
  type OpeningForm,
  type OpeningRecordForm,
} from '../logic/openings';
import type { BuildingFormState } from '../logic/buildingForm';
import { openingPhotoKey } from '../logic/inspectionCase';
import { parseNumber } from '../logic/number';
import type { FloorKey, OpeningDirection, OpeningKind } from '../types/inspection';
import { withCaption, withoutPhoto, type FormPhotoHandlers } from './formPhotos';
import { PhotoStrip } from './PhotoStrip';

/** 写真の追加先(棟・記録・開口部)と操作 */
interface PhotoTarget {
  buildingId: string;
  photos: FormPhotoHandlers;
}

type Update<T> = (x: T) => T;
const mapRecord =
  (recordId: string, fn: Update<OpeningRecordForm>): Update<BuildingFormState> =>
  (b) => ({ ...b, openingRecords: b.openingRecords.map((r) => (r.id === recordId ? fn(r) : r)) });
const mapOpening = (recordId: string, openingId: string, fn: Update<OpeningForm>) =>
  mapRecord(recordId, (r) => ({ ...r, openings: r.openings.map((o) => (o.id === openingId ? fn(o) : o)) }));

/**
 * 写真欄(全景・窓)。
 * update は、最新の入力状態の該当する記録・開口部を書き換える関数を作る。
 */
function FormPhotoField<T extends { photoIds: string[]; photoCaptions: Record<string, string> }>(props: {
  label: string;
  title: string;
  photoKey: string;
  value: T;
  target: PhotoTarget;
  update: (fn: Update<T>) => Update<BuildingFormState>;
  onChange: (v: T) => void;
}) {
  const { label, title, photoKey, value, target, update, onChange } = props;
  return (
    <div className="opening-photos">
      <span className="sub-label">{label}</span>
      <PhotoStrip
        title={title}
        photoIds={value.photoIds}
        captions={value.photoCaptions}
        readOnly={false}
        pending={target.photos.pending(photoKey)}
        onAdd={(files) => target.photos.add(photoKey, files, (b, id) => update((x) => ({ ...x, photoIds: [...x.photoIds, id] }))(b))}
        onRemove={(id) => target.photos.remove([id], update((x) => withoutPhoto(x, id)))}
        onCaption={(id, caption) => onChange(withCaption(value, id, caption))}
      />
    </div>
  );
}

/** 開口部1つの有効寸法と扱い(例:有効 90×130cm・大型開口部) */
function openingNote(o: OpeningForm): string | null {
  const width = parseNumber(o.width);
  const height = parseNumber(o.height);
  if (!width || !height) {
    const entered = o.direction || o.location.trim() || o.width.trim() || o.height.trim() || o.photoIds.length;
    return entered ? '寸法が未入力のため、判定に含めません' : null;
  }
  const size = { kind: o.kind, width, height };
  const eff = effectiveSize(size);
  const fmt = (n: number) => String(Math.round(n * 10) / 10);
  const kind = isLargeOpening(size) ? '大型開口部' : isEffectiveOpening(size) ? '面積に算入' : '直径50cmの円が内接しないため算入しない';
  return `有効 ${fmt(eff.width)}×${fmt(eff.height)}cm・${kind}`;
}

function OpeningRow(props: {
  index: number;
  recordId: string;
  target: PhotoTarget;
  value: OpeningForm;
  errors: FormErrors;
  removable: boolean;
  onChange: (v: OpeningForm) => void;
  onRemove: () => void;
}) {
  const { index, recordId, target, value: o, errors, removable, onChange, onRemove } = props;
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
          <button
            type="button"
            className="inspector-remove"
            onClick={() => {
              if (!o.photoIds.length || confirm(`${label}を削除しますか?\n窓の写真(${o.photoIds.length}枚)も削除されます。`)) onRemove();
            }}
            aria-label={`${label}を削除`}
          >
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
      <FormPhotoField
        label="窓の写真"
        title={label}
        photoKey={openingPhotoKey(target.buildingId, recordId, o.id)}
        value={o}
        target={target}
        update={(fn) => mapOpening(recordId, o.id, fn)}
        onChange={onChange}
      />
    </div>
  );
}

function RecordCard(props: {
  record: OpeningRecordForm;
  target: PhotoTarget;
  floors: FloorKey[];
  /** 他の記録で使っている階(選択肢から除く) */
  usedFloors: FloorKey[];
  errors: FormErrors;
  onChange: (r: OpeningRecordForm) => void;
  onRemove: () => void;
}) {
  const { record: r, target, floors, usedFloors, errors, onChange, onRemove } = props;
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
            const photoCount = openingPhotoIds([r]).length;
            const entered = r.floorArea.trim() || r.memo.trim() || photoCount || r.openings.some((o) => o.width.trim() || o.height.trim());
            const msg = `${name}の有効開口部の記録を削除しますか?` + (photoCount ? `\n写真(${photoCount}枚)も削除されます。` : '');
            if (!entered || confirm(msg)) onRemove();
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

      <FormPhotoField
        label="全景写真"
        title={`${name} 全景`}
        photoKey={openingPhotoKey(target.buildingId, r.id)}
        value={r}
        target={target}
        update={(fn) => mapRecord(r.id, fn)}
        onChange={onChange}
      />

      {r.openings.map((o, i) => (
        <OpeningRow
          key={o.id}
          index={i}
          recordId={r.id}
          target={target}
          value={o}
          errors={errors}
          removable={r.openings.length > 1}
          onChange={setOpening}
          onRemove={() => {
            onChange({ ...r, openings: r.openings.filter((x) => x.id !== o.id) });
            target.photos.remove(o.photoIds);
          }}
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
  buildingId: string;
  photos: FormPhotoHandlers;
  records: OpeningRecordForm[];
  /** 地上階の一覧 */
  floors: FloorKey[];
  errors: FormErrors;
  onChange: (v: OpeningRecordForm[]) => void;
}) {
  const { buildingId, photos, records, floors, errors, onChange } = props;
  const target: PhotoTarget = { buildingId, photos };
  const hasError = Object.keys(errors).some((k) => k.startsWith('opening'));
  const [open, setOpen] = useState(false);
  // 入力に不備があるときは閉じたままにしない
  const shown = open || hasError;
  const judged = records.filter((r) => r.floor).map((r) => ({ floor: r.floor, ...judgeRecordForm(r) }));
  const windowless = judged
    .filter((x) => x.result === 'windowless')
    .map((x) => floorLabel(x.floor) + (x.unmeasured ? '(暫定)' : ''));
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
                  target={target}
                  floors={floors}
                  usedFloors={usedFloors.filter((f) => f !== r.floor)}
                  errors={errors}
                  onChange={(v) => onChange(records.map((x) => (x.id === r.id ? v : x)))}
                  onRemove={() => {
                    onChange(records.filter((x) => x.id !== r.id));
                    photos.remove(openingPhotoIds([r]));
                  }}
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
