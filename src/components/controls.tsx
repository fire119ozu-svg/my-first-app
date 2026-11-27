/** フォーム部品(iPhoneでの片手操作を想定し、タップ領域を44px以上確保) */
import { useId, type ReactNode } from 'react';

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="section">
      <h2 className="section-title">{title}</h2>
      <div className="section-body">{children}</div>
    </section>
  );
}

interface FieldProps {
  label: string;
  error?: string;
  required?: boolean;
  hint?: string;
  children: (id: string) => ReactNode;
}

export function Field({ label, error, required, hint, children }: FieldProps) {
  const id = useId();
  return (
    <div className={`field${error ? ' has-error' : ''}`}>
      <label htmlFor={id} className="field-label">
        {label}
        {required && <span className="required">必須</span>}
      </label>
      {children(id)}
      {hint && !error && <p className="field-hint">{hint}</p>}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

export function TextInput(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <Field label={props.label} error={props.error} required={props.required}>
      {(id) => (
        <input
          id={id}
          type="text"
          value={props.value}
          placeholder={props.placeholder}
          onChange={(e) => props.onChange(e.target.value)}
        />
      )}
    </Field>
  );
}

export function NumberInput(props: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  decimal?: boolean;
  hint?: string;
}) {
  return (
    <Field label={props.label} error={props.error} required hint={props.hint}>
      {(id) => (
        <div className="input-unit">
          <input
            id={id}
            type="text"
            inputMode={props.decimal ? 'decimal' : 'numeric'}
            value={props.value}
            onChange={(e) => props.onChange(e.target.value)}
          />
          <span className="unit">{props.unit}</span>
        </div>
      )}
    </Field>
  );
}

export function Toggle(props: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="toggle-row">
      <span className="toggle-text">
        <span>{props.label}</span>
        {props.description && <small>{props.description}</small>}
      </span>
      <input
        type="checkbox"
        role="switch"
        className="switch"
        checked={props.checked}
        onChange={(e) => props.onChange(e.target.checked)}
      />
    </label>
  );
}

export function ChipGroup<T extends string>(props: {
  options: { value: T; label: string }[];
  selected: T[];
  onChange: (v: T[]) => void;
  ariaLabel: string;
}) {
  const toggle = (v: T) =>
    props.onChange(
      props.selected.includes(v) ? props.selected.filter((s) => s !== v) : [...props.selected, v],
    );
  return (
    <div className="chips" role="group" aria-label={props.ariaLabel}>
      {props.options.map((o) => {
        const on = props.selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            className={`chip${on ? ' on' : ''}`}
            aria-pressed={on}
            onClick={() => toggle(o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Segmented<T extends string>(props: {
  options: { value: T; label: string }[];
  value: T | undefined;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={props.ariaLabel}>
      {props.options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={props.value === o.value}
          className={`seg seg-${o.value}${props.value === o.value ? ' on' : ''}`}
          onClick={() => props.onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
