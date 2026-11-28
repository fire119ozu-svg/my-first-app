import { EQUIPMENT_OPTIONS, FACILITY_OPTIONS, NOTIFICATION_OPTIONS, NOTIFICATION_STATUS_OPTIONS } from '../data/labels';
import { USAGE_CATEGORIES } from '../data/usageCategories';
import { emptyTenant, formFloorKeys, summarizeCapacity, type BuildingFormState, type FormErrors, type RenovationForm } from '../logic/buildingForm';
import { isCompositeUsage } from '../logic/extractChecklist';
import { renovationPhotoKey } from '../logic/inspectionCase';
import { floorLabel } from '../logic/floors';
import { windowlessFloors, type OpeningRecordForm } from '../logic/openings';
import type { UsageCategory } from '../types/inspection';
import { FloorCapacityInput, TenantsInput } from './CapacityInputs';
import { ChipGroup, Field, NumberInput, Section, Segmented, TextInput, Toggle } from './controls';
import { OpeningRecordsInput } from './OpeningRecordsInput';
import { withCaption, withoutPhoto, type FormPhotoHandlers } from './formPhotos';
import { PhotoStrip } from './PhotoStrip';

const RENOVATION_OPTIONS: { value: 'yes' | 'no'; label: string }[] = [
  { value: 'yes', label: '有' },
  { value: 'no', label: '無' },
];

interface Props {
  form: BuildingFormState;
  errors: FormErrors;
  onChange: (next: BuildingFormState) => void;
  photos: FormPhotoHandlers;
  /** 棟の見出し(例:A棟) */
  title: string;
}

/** 1棟ぶんの入力(用途・増改築・規模・構造・設備・届出) */
export function BuildingForm({ form, errors, onChange, photos, title }: Props) {
  const set = <K extends keyof BuildingFormState>(key: K, value: BuildingFormState[K]) =>
    onChange({ ...form, [key]: value });
  const reno = form.renovation;
  const setReno = (patch: Partial<RenovationForm>) => set('renovation', { ...reno, ...patch });
  const composite = !!form.usage && isCompositeUsage(form.usage);
  const floors = formFloorKeys(form);
  const summary = summarizeCapacity(form);
  const windowless = windowlessFloors(form.openingRecords);
  const renovationKey = renovationPhotoKey(form.id);

  /** 有効開口部の記録で無窓階と判定される階が新たに出たら「無窓階あり」をオンにする(オフは手動のみ) */
  const setOpeningRecords = (openingRecords: OpeningRecordForm[]) => {
    const becameWindowless = windowless.length === 0 && windowlessFloors(openingRecords).length > 0;
    onChange({ ...form, openingRecords, hasWindowlessFloor: form.hasWindowlessFloor || becameWindowless });
  };

  return (
    <form className="building-form" onSubmit={(e) => e.preventDefault()} noValidate>
      <Section title={`${title}の用途`}>
        <TextInput label="棟名" value={form.label} onChange={(v) => set('label', v)} placeholder="例:A棟、本館(1棟のみなら空欄可)" />
        <Field label="用途(令別表第一)" required error={errors.usage}>
          {(id) => (
            <select
              id={id}
              value={form.usage}
              onChange={(e) => {
                const usage = e.target.value as UsageCategory | '';
                // 16項に切り替えたら、テナントの入力欄を1行用意する
                const tenants = usage && isCompositeUsage(usage) && form.tenants.length === 0 ? [emptyTenant()] : form.tenants;
                onChange({ ...form, usage, tenants });
              }}
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
        {composite && <p className="field-hint usage-hint">含まれる用途は、下の「規模」で入力するテナントの用途から自動で設定されます。</p>}

        <div className="field renovation">
          <span className="field-label">増改築の有無</span>
          <Segmented
            ariaLabel="増改築の有無"
            options={RENOVATION_OPTIONS}
            value={reno.status ?? undefined}
            // 選択中をもう一度押すと未選択に戻す
            onChange={(v) => setReno({ status: reno.status === v ? null : v })}
          />
        </div>
        {reno.status === 'yes' && (
          <div className="renovation-detail">
            <TextInput label="増改築の場所" value={reno.location} onChange={(v) => setReno({ location: v })} placeholder="例:3階 東側" />
            <NumberInput
              label="増築面積"
              unit="㎡"
              decimal
              optional
              value={reno.area}
              error={errors.renovationArea}
              onChange={(v) => setReno({ area: v })}
            />
            <TextInput label="増改築時期" value={reno.period} onChange={(v) => setReno({ period: v })} placeholder="例:令和5年3月" />
          </div>
        )}
        <div className="field">
          <span className="field-label">増改築の写真</span>
          <PhotoStrip
            title="増改築"
            photoIds={reno.photoIds}
            captions={reno.photoCaptions}
            readOnly={false}
            pending={photos.pending(renovationKey)}
            onAdd={(files) =>
              photos.add(renovationKey, files, (b, id) => ({ ...b, renovation: { ...b.renovation, photoIds: [...b.renovation.photoIds, id] } }))
            }
            onRemove={(id) => photos.remove([id], (b) => ({ ...b, renovation: withoutPhoto(b.renovation, id) }))}
            onCaption={(id, caption) => set('renovation', withCaption(reno, id, caption))}
          />
        </div>
      </Section>

      <Section title={`${title}の規模`}>
        <NumberInput label="延べ面積" unit="㎡" decimal value={form.totalFloorArea} error={errors.totalFloorArea} onChange={(v) => set('totalFloorArea', v)} />
        <div className="field-row">
          <NumberInput label="地上階数" unit="階" value={form.floorsAbove} error={errors.floorsAbove} onChange={(v) => set('floorsAbove', v)} />
          <NumberInput label="地下階数" unit="階" value={form.floorsBelow} error={errors.floorsBelow} onChange={(v) => set('floorsBelow', v)} />
        </div>
        {composite ? (
          <TenantsInput
            tenants={form.tenants}
            floors={floors}
            errors={errors}
            summary={summary}
            fallback={form.capacityFallback}
            onChange={(v) => set('tenants', v)}
          />
        ) : (
          <FloorCapacityInput
            floors={floors}
            values={form.floorCapacities}
            errors={errors}
            summary={summary}
            fallback={form.capacityFallback}
            onChange={(v) => set('floorCapacities', v)}
          />
        )}
      </Section>

      <section className="section">
        <div className="section-body">
          <OpeningRecordsInput
            buildingId={form.id}
            photos={photos}
            records={form.openingRecords}
            floors={floors.filter((f) => !f.startsWith('B'))}
            errors={errors}
            onChange={setOpeningRecords}
          />
        </div>
      </section>

      <Section title="構造・管理">
        <Toggle label="高層建築物" description="高さ31m超" checked={form.isHighRise} onChange={(v) => set('isHighRise', v)} />
        <Toggle
          label="無窓階あり"
          description={windowless.length ? `有効開口部の記録で無窓階:${windowless.map(floorLabel).join('・')}` : undefined}
          checked={form.hasWindowlessFloor}
          onChange={(v) => set('hasWindowlessFloor', v)}
        />
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
