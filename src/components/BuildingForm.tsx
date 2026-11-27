import { EQUIPMENT_OPTIONS, FACILITY_OPTIONS, NOTIFICATION_OPTIONS, NOTIFICATION_STATUS_OPTIONS } from '../data/labels';
import { USAGE_CATEGORIES } from '../data/usageCategories';
import type { BuildingFormState, FormErrors } from '../logic/buildingForm';
import { isCompositeUsage } from '../logic/extractChecklist';
import type { UsageCategory } from '../types/inspection';
import { ChipGroup, Field, NumberInput, PersonInput, Section, Segmented, TextInput, Toggle } from './controls';

/** 複合用途の構成用途として選べるもの(16項以降を除く) */
const SUB_USAGE_OPTIONS = USAGE_CATEGORIES.filter(
  (u) => !['16イ', '16ロ', '16の2', '16の3', '17', '18', '19', '20'].includes(u.code),
).map((u) => ({ value: u.code, label: `${u.code} ${u.label}` }));

interface Props {
  form: BuildingFormState;
  errors: FormErrors;
  onChange: (next: BuildingFormState) => void;
}

export function BuildingForm({ form, errors, onChange }: Props) {
  const set = <K extends keyof BuildingFormState>(key: K, value: BuildingFormState[K]) =>
    onChange({ ...form, [key]: value });

  return (
    <form className="building-form" onSubmit={(e) => e.preventDefault()} noValidate>
      <Section title="基本情報">
        <TextInput label="名称" required value={form.name} error={errors.name} onChange={(v) => set('name', v)} placeholder="例:○○ビル" />
        <TextInput label="所在地" value={form.address} onChange={(v) => set('address', v)} placeholder="例:高知市本町○丁目" />
        <PersonInput label="代表者" titlePlaceholder="例:代表取締役" value={form.representative} onChange={(v) => set('representative', v)} />
        <PersonInput label="立会者" titlePlaceholder="例:防火管理者" value={form.witness} onChange={(v) => set('witness', v)} />
        <Field label="用途(令別表第一)" required error={errors.usage}>
          {(id) => (
            <select
              id={id}
              value={form.usage}
              onChange={(e) => set('usage', e.target.value as UsageCategory | '')}
            >
              <option value="">選択してください</option>
              {USAGE_CATEGORIES.map((u) => (
                <option key={u.code} value={u.code}>
                  {u.code}項 {u.label}
                </option>
              ))}
            </select>
          )}
        </Field>
        {form.usage && isCompositeUsage(form.usage) && (
          <div className={`field${errors.subUsages ? ' has-error' : ''}`}>
            <span className="field-label">
              含まれる用途<span className="required">必須</span>
            </span>
            <ChipGroup
              ariaLabel="含まれる用途"
              options={SUB_USAGE_OPTIONS}
              selected={form.subUsages}
              onChange={(v) => set('subUsages', v)}
            />
            {errors.subUsages && <p className="field-error">{errors.subUsages}</p>}
          </div>
        )}
      </Section>

      <Section title="規模">
        <NumberInput label="延べ面積" unit="㎡" decimal value={form.totalFloorArea} error={errors.totalFloorArea} onChange={(v) => set('totalFloorArea', v)} />
        <div className="field-row">
          <NumberInput label="地上階数" unit="階" value={form.floorsAbove} error={errors.floorsAbove} onChange={(v) => set('floorsAbove', v)} />
          <NumberInput label="地下階数" unit="階" value={form.floorsBelow} error={errors.floorsBelow} onChange={(v) => set('floorsBelow', v)} />
        </div>
        <NumberInput label="収容人員" unit="人" value={form.capacity} error={errors.capacity} onChange={(v) => set('capacity', v)} hint="令第1条の3により算定した人数" />
      </Section>

      <Section title="構造・管理">
        <Toggle label="高層建築物" description="高さ31m超" checked={form.isHighRise} onChange={(v) => set('isHighRise', v)} />
        <Toggle label="無窓階あり" checked={form.hasWindowlessFloor} onChange={(v) => set('hasWindowlessFloor', v)} />
        <Toggle label="特定一階段等防火対象物" description="地階・3階以上に特定用途があり屋内階段が1つ" checked={form.isSingleStaircase} onChange={(v) => set('isSingleStaircase', v)} />
        <Toggle label="管理権原が複数" description="テナントごとに権原が分かれている" checked={form.hasMultipleOwners} onChange={(v) => set('hasMultipleOwners', v)} />
      </Section>

      <Section title="設置済みの消防用設備等">
        <ChipGroup ariaLabel="消防用設備等" options={EQUIPMENT_OPTIONS} selected={form.installedEquipment} onChange={(v) => set('installedEquipment', v)} />
      </Section>

      <Section title="火気使用設備・危険物等">
        <ChipGroup ariaLabel="火気使用設備・危険物等" options={FACILITY_OPTIONS} selected={form.facilities} onChange={(v) => set('facilities', v)} />
      </Section>

      <Section title="各種届出の状況">
        <ul className="notification-list">
          {NOTIFICATION_OPTIONS.map((n) => (
            <li key={n.value}>
              <span className="notification-label">{n.label}</span>
              <Segmented
                ariaLabel={n.label}
                options={NOTIFICATION_STATUS_OPTIONS}
                value={form.notifications[n.value]}
                onChange={(v) => set('notifications', { ...form.notifications, [n.value]: v })}
              />
            </li>
          ))}
        </ul>
      </Section>
    </form>
  );
}
