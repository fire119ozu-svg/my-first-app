/**
 * 収容人員の入力。
 * - FloorCapacityInput:階ごとに入力し合計を表示
 * - TenantsInput:16項のテナントごとに名称・用途・階・床面積・収容人員を入力し、階ごとに自動で合計
 */
import { useId } from 'react';
import { USAGE_CATEGORIES } from '../data/usageCategories';
import { emptyTenant, type CapacitySummary, type FormErrors, type TenantForm } from '../logic/buildingForm';
import { floorLabel } from '../logic/floors';
import type { FloorKey, UsageCategory } from '../types/inspection';

/** テナントの用途として選べるもの(16項以降を除く) */
const TENANT_USAGES = USAGE_CATEGORIES.filter(
  (u) => !['16イ', '16ロ', '16の2', '16の3', '17', '18', '19', '20'].includes(u.code),
);

function TotalRow({ summary, note }: { summary: CapacitySummary; note?: string }) {
  return (
    <div className="capacity-total">
      <span>
        合計 <strong>{summary.total ?? '―'}</strong> 人
      </span>
      {note && <small>{note}</small>}
    </div>
  );
}

function FallbackNotice({ fallback }: { fallback: number | null }) {
  if (fallback === null) return null;
  return (
    <p className="capacity-notice">
      以前は合計({fallback}人)のみ入力されていました。階ごとに入力してください。入力するまでは合計{fallback}人として扱います。
    </p>
  );
}

export function FloorCapacityInput(props: {
  floors: FloorKey[];
  values: Record<FloorKey, string>;
  errors: FormErrors;
  summary: CapacitySummary;
  fallback: number | null;
  onChange: (v: Record<FloorKey, string>) => void;
}) {
  const { floors, values, errors, summary, fallback, onChange } = props;
  return (
    <fieldset className={`field capacity-field${errors.capacity ? ' has-error' : ''}`}>
      <legend className="field-label">
        収容人員(階ごと)<span className="required">必須</span>
      </legend>
      <p className="field-hint">令第1条の3により算定した人数</p>
      <FallbackNotice fallback={fallback} />
      {floors.length === 0 ? (
        <p className="muted small">地上階数・地下階数を入力すると、階ごとの入力欄が表示されます。</p>
      ) : (
        <div className="floor-grid">
          {floors.map((f) => {
            const err = errors[`floor:${f}`];
            return (
              <label key={f} className={`floor-row${err ? ' has-error' : ''}`}>
                <span className="floor-name">{floorLabel(f)}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  className="item-field-input num"
                  aria-label={`${floorLabel(f)}の収容人員`}
                  value={values[f] ?? ''}
                  onChange={(e) => onChange({ ...values, [f]: e.target.value })}
                />
                <span className="unit">人</span>
              </label>
            );
          })}
        </div>
      )}
      <TotalRow summary={summary} />
      {Object.entries(errors)
        .filter(([k]) => k.startsWith('floor:') || k === 'capacity')
        .map(([k, m]) => (
          <p key={k} className="field-error">
            {m}
          </p>
        ))}
    </fieldset>
  );
}

function TenantCard(props: {
  index: number;
  tenant: TenantForm;
  floors: FloorKey[];
  errors: FormErrors;
  onChange: (t: TenantForm) => void;
  onRemove: () => void;
}) {
  const { index, tenant: t, floors, errors, onChange, onRemove } = props;
  const id = useId();
  const err = (k: string) => errors[`tenant:${t.id}:${k}`];
  const label = t.name.trim() || `テナント${index + 1}`;
  return (
    <div className="tenant-card">
      <div className="tenant-head">
        <input
          id={`${id}-name`}
          type="text"
          className="tenant-name"
          placeholder={`テナント${index + 1}の名称`}
          aria-label={`テナント${index + 1}の名称`}
          value={t.name}
          onChange={(e) => onChange({ ...t, name: e.target.value })}
        />
        <button type="button" className="inspector-remove" onClick={onRemove} aria-label={`${label}を削除`}>
          ×
        </button>
      </div>
      <div className="tenant-grid">
        <div className={err('usage') ? 'has-error' : ''}>
          <label className="sub-label" htmlFor={`${id}-usage`}>
            用途
          </label>
          <select
            id={`${id}-usage`}
            aria-label={`${label}の用途`}
            value={t.usage}
            onChange={(e) => onChange({ ...t, usage: e.target.value as UsageCategory | '' })}
          >
            <option value="">選択</option>
            {TENANT_USAGES.map((u) => (
              <option key={u.code} value={u.code}>
                {u.code}項 {u.label}
              </option>
            ))}
          </select>
        </div>
        <div className={err('floor') ? 'has-error' : ''}>
          <label className="sub-label" htmlFor={`${id}-floor`}>
            階
          </label>
          <select
            id={`${id}-floor`}
            aria-label={`${label}の階`}
            value={t.floor}
            onChange={(e) => onChange({ ...t, floor: e.target.value })}
          >
            <option value="">選択</option>
            {/* 階数を変更して存在しなくなった階も、選び直すまで表示する */}
            {t.floor && !floors.includes(t.floor) && <option value={t.floor}>{floorLabel(t.floor)}(範囲外)</option>}
            {floors.map((f) => (
              <option key={f} value={f}>
                {floorLabel(f)}
              </option>
            ))}
          </select>
        </div>
        <div className={err('area') ? 'has-error' : ''}>
          <label className="sub-label" htmlFor={`${id}-area`}>
            床面積
          </label>
          <div className="input-unit">
            <input
              id={`${id}-area`}
              type="text"
              inputMode="decimal"
              className="num"
              aria-label={`${label}の床面積`}
              value={t.area}
              onChange={(e) => onChange({ ...t, area: e.target.value })}
            />
            <span className="unit">㎡</span>
          </div>
        </div>
        <div className={err('capacity') ? 'has-error' : ''}>
          <label className="sub-label" htmlFor={`${id}-cap`}>
            収容人員
          </label>
          <div className="input-unit">
            <input
              id={`${id}-cap`}
              type="text"
              inputMode="numeric"
              className="num"
              aria-label={`${label}の収容人員`}
              value={t.capacity}
              onChange={(e) => onChange({ ...t, capacity: e.target.value })}
            />
            <span className="unit">人</span>
          </div>
        </div>
      </div>
      {['usage', 'floor', 'area', 'capacity'].map(
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

export function TenantsInput(props: {
  tenants: TenantForm[];
  floors: FloorKey[];
  errors: FormErrors;
  summary: CapacitySummary;
  fallback: number | null;
  onChange: (t: TenantForm[]) => void;
}) {
  const { tenants, floors, errors, summary, fallback, onChange } = props;
  const usages = [...new Set(tenants.map((t) => t.usage).filter(Boolean))];
  const floorRows = floors.filter((f) => summary.byFloor[f] !== undefined);
  return (
    <fieldset className={`field tenants-field${errors.tenants || errors.capacity ? ' has-error' : ''}`}>
      <legend className="field-label">
        テナント<span className="required">必須</span>
      </legend>
      <p className="field-hint">複数階に入居するテナントは、階ごとに1行ずつ入力してください。共用部の人員は「共用部」として入力できます。</p>
      <FallbackNotice fallback={fallback} />
      {tenants.map((t, i) => (
        <TenantCard
          key={t.id}
          index={i}
          tenant={t}
          floors={floors}
          errors={errors}
          onChange={(v) => onChange(tenants.map((x) => (x.id === t.id ? v : x)))}
          onRemove={() => onChange(tenants.filter((x) => x.id !== t.id))}
        />
      ))}
      <button type="button" className="inspector-add" onClick={() => onChange([...tenants, emptyTenant()])}>
        ＋ テナントを追加
      </button>
      {errors.tenants && <p className="field-error">{errors.tenants}</p>}

      <div className="tenant-summary">
        <span className="sub-label">含まれる用途(自動)</span>
        <p>{usages.length ? usages.map((u) => `${u}項`).join('・') : '―'}</p>
        <span className="sub-label">階ごとの収容人員(自動)</span>
        {floorRows.length > 0 || summary.unassigned > 0 ? (
          <ul className="capacity-by-floor">
            {floorRows.map((f) => (
              <li key={f}>
                <span>{floorLabel(f)}</span>
                <span>{summary.byFloor[f]}人</span>
              </li>
            ))}
            {summary.unassigned > 0 && (
              <li className="muted">
                <span>階未設定</span>
                <span>{summary.unassigned}人</span>
              </li>
            )}
          </ul>
        ) : (
          <p>―</p>
        )}
        <TotalRow summary={summary} />
        {errors.capacity && <p className="field-error">{errors.capacity}</p>}
      </div>
    </fieldset>
  );
}
