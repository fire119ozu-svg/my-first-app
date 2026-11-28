/**
 * 対象物情報入力フォームの状態と検証。
 *
 * - 敷地(名称・所在地・代表者・立会者)は案件で1つ
 * - 棟ごとに用途・規模・設備等を入力する
 * - 収容人員は階ごとに入力し、合計を算出する。16項はテナントごとに入力し、階ごとに自動で合計する
 *
 * 数値欄は入力途中の空欄を許すため文字列で保持し、検証時に変換する。
 */
import type {
  BuildingInfo,
  FloorKey,
  PersonInfo,
  RenovationInfo,
  SiteInfo,
  Tenant,
  UsageCategory,
} from '../types/inspection';
import { isCompositeUsage } from './extractChecklist';
import { floorKeys, floorLabel } from './floors';
import { newId } from './inspectionCase';
import { parseNumber } from './number';
import { toOpeningRecordForms, validateOpeningRecords, type OpeningRecordForm } from './openings';

export { parseNumber };

// ---------------------------------------------------------------------------
// 敷地
// ---------------------------------------------------------------------------

export interface SiteFormState {
  name: string;
  address: string;
  representative: PersonInfo;
  witness: PersonInfo;
}

const emptyPerson = (): PersonInfo => ({ org: '', title: '', name: '' });

export function emptySiteForm(): SiteFormState {
  return { name: '', address: '', representative: emptyPerson(), witness: emptyPerson() };
}

export function toSiteForm(s: SiteInfo): SiteFormState {
  return {
    name: s.name,
    address: s.address,
    representative: { ...emptyPerson(), ...s.representative },
    witness: { ...emptyPerson(), ...s.witness },
  };
}

/** 社名・役職・氏名がすべて空なら未入力として扱う */
export function normalizePerson(p: PersonInfo | undefined): PersonInfo | undefined {
  if (!p) return undefined;
  const org = (p.org ?? '').trim();
  const title = p.title.trim();
  const name = p.name.trim();
  if (!org && !title && !name) return undefined;
  return org ? { org, title, name } : { title, name };
}

export function validateSiteForm(form: SiteFormState): { site: SiteInfo | null; errors: { name?: string } } {
  if (!form.name.trim()) return { site: null, errors: { name: '名称を入力してください' } };
  return {
    site: {
      name: form.name.trim(),
      address: form.address.trim(),
      representative: normalizePerson(form.representative),
      witness: normalizePerson(form.witness),
    },
    errors: {},
  };
}

// ---------------------------------------------------------------------------
// 棟
// ---------------------------------------------------------------------------

/** 増改築の入力状態(面積は入力途中を許すため文字列) */
export type RenovationForm = Omit<RenovationInfo, 'area'> & { area: string };

/** テナントの入力状態 */
export type TenantForm = Omit<Tenant, 'area' | 'capacity'> & { area: string; capacity: string };

export const SCALE_FIELDS = ['totalFloorArea', 'floorsAbove', 'floorsBelow'] as const;
export type ScaleField = (typeof SCALE_FIELDS)[number];

export type BuildingFormState = Omit<
  BuildingInfo,
  ScaleField | 'usage' | 'renovation' | 'tenants' | 'capacity' | 'floorCapacities' | 'openingRecords'
> & {
  usage: UsageCategory | '';
  renovation: RenovationForm;
  tenants: TenantForm[];
  /** 階ごとの収容人員(16項以外) */
  floorCapacities: Record<FloorKey, string>;
  /** 有効開口部の記録(階ごと) */
  openingRecords: OpeningRecordForm[];
  /**
   * 階ごとの入力が無かった頃の収容人員の合計(移行データ)。
   * 階ごと(テナントごと)の収容人員が1つも入力されていない間はこの値を使う。
   */
  capacityFallback: number | null;
} & Record<ScaleField, string>;

/**
 * エラーのキー:各欄名、`floor:<階>`、`tenant:<テナントID>:<usage|floor|area|capacity>`、
 * `tenants`(テナント全体)、`capacity`(収容人員全体)、`renovationArea`、
 * 有効開口部は `openingRecord:…`・`opening:…`(openings.ts)
 */
export type FormErrors = Partial<Record<string, string>>;

export function emptyRenovation(): RenovationForm {
  return { status: null, location: '', area: '', period: '', photoIds: [], photoCaptions: {} };
}

export function emptyTenant(): TenantForm {
  return { id: newId(), name: '', usage: '', floor: '', area: '', capacity: '' };
}

export function emptyBuildingForm(id = newId()): BuildingFormState {
  return {
    id,
    label: '',
    usage: '',
    renovation: emptyRenovation(),
    subUsages: [],
    tenants: [],
    totalFloorArea: '',
    floorsAbove: '',
    floorsBelow: '0',
    floorCapacities: {},
    capacityFallback: null,
    isHighRise: false,
    hasWindowlessFloor: false,
    openingRecords: [],
    isSingleStaircase: false,
    hasMultipleOwners: false,
    installedEquipment: [],
    facilities: [],
    notifications: {},
  };
}

const str = (n: number | undefined) => (n === undefined ? '' : String(n));

export function toBuildingForm(b: BuildingInfo): BuildingFormState {
  const entered = Object.keys(b.floorCapacities).length > 0 || b.tenants.some((t) => t.capacity !== undefined);
  return {
    ...b,
    renovation: b.renovation ? { ...b.renovation, area: str(b.renovation.area) } : emptyRenovation(),
    tenants: b.tenants.map((t) => ({ ...t, area: str(t.area), capacity: str(t.capacity) })),
    floorCapacities: isCompositeUsage(b.usage)
      ? {}
      : Object.fromEntries(Object.entries(b.floorCapacities).map(([k, v]) => [k, String(v)])),
    capacityFallback: entered ? null : b.capacity,
    openingRecords: toOpeningRecordForms(b.openingRecords ?? []),
    totalFloorArea: String(b.totalFloorArea),
    floorsAbove: String(b.floorsAbove),
    floorsBelow: String(b.floorsBelow),
  };
}

const SCALE_RULES: Record<ScaleField, { label: string; integer: boolean; min: number }> = {
  totalFloorArea: { label: '延べ面積', integer: false, min: 0 },
  floorsAbove: { label: '地上階数', integer: true, min: 1 },
  floorsBelow: { label: '地下階数', integer: true, min: 0 },
};

/** 人数として読めるか(空欄は null、不正は undefined) */
function parseCount(raw: string): number | null | undefined {
  if (!raw.trim()) return null;
  const v = parseNumber(raw);
  return v === null || !Number.isInteger(v) ? undefined : v;
}

/** 現在の階数入力から階の一覧を求める(階数が未入力・不正なら空) */
export function formFloorKeys(form: Pick<BuildingFormState, 'floorsAbove' | 'floorsBelow'>): FloorKey[] {
  const above = parseNumber(form.floorsAbove);
  const below = parseNumber(form.floorsBelow) ?? 0;
  if (above === null || !Number.isInteger(above) || above < 1 || !Number.isInteger(below)) return [];
  return floorKeys({ floorsAbove: above, floorsBelow: below });
}

export interface CapacitySummary {
  /** 階ごとの人数(入力のあった階のみ) */
  byFloor: Record<FloorKey, number>;
  /** 合計(何も入力が無い場合は移行データの合計、それも無ければ null) */
  total: number | null;
  /** 階が未設定のテナントの人数 */
  unassigned: number;
}

/**
 * 収容人員を集計する(画面の合計表示と検証で共用)。
 * 16項はテナントの収容人員を階ごとに合計する。
 */
export function summarizeCapacity(form: BuildingFormState): CapacitySummary {
  const byFloor: Record<FloorKey, number> = {};
  let sum = 0;
  let entered = false;
  let unassigned = 0;
  if (form.usage && isCompositeUsage(form.usage)) {
    for (const t of form.tenants) {
      const v = parseCount(t.capacity);
      if (typeof v !== 'number') continue;
      entered = true;
      sum += v;
      if (t.floor) byFloor[t.floor] = (byFloor[t.floor] ?? 0) + v;
      else unassigned += v;
    }
  } else {
    for (const f of formFloorKeys(form)) {
      const v = parseCount(form.floorCapacities[f] ?? '');
      if (typeof v !== 'number') continue;
      entered = true;
      sum += v;
      byFloor[f] = v;
    }
  }
  return { byFloor, total: entered ? sum : form.capacityFallback, unassigned };
}

function tenantHasInput(t: TenantForm): boolean {
  return !!(t.name.trim() || t.usage || t.floor || t.area.trim() || t.capacity.trim());
}

export function validateBuildingForm(form: BuildingFormState): {
  building: BuildingInfo | null;
  errors: FormErrors;
} {
  const errors: FormErrors = {};
  if (!form.usage) errors.usage = '用途を選択してください';
  const composite = !!form.usage && isCompositeUsage(form.usage);

  const nums = {} as Record<ScaleField, number>;
  for (const field of SCALE_FIELDS) {
    const rule = SCALE_RULES[field];
    const v = parseNumber(form[field]);
    if (v === null) errors[field] = `${rule.label}を数値で入力してください`;
    else if (rule.integer && !Number.isInteger(v)) errors[field] = `${rule.label}は整数で入力してください`;
    else if (v < rule.min) errors[field] = `${rule.label}は${rule.min}以上で入力してください`;
    else nums[field] = v;
  }
  const floors = formFloorKeys(form);

  // 収容人員・テナント
  const tenants: Tenant[] = [];
  if (composite) {
    for (const t of form.tenants.filter(tenantHasInput)) {
      if (!t.usage) errors[`tenant:${t.id}:usage`] = '用途を選択してください';
      if (t.floor && floors.length && !floors.includes(t.floor)) errors[`tenant:${t.id}:floor`] = '階を選び直してください';
      const area = t.area.trim() ? parseNumber(t.area) : undefined;
      if (area === null) errors[`tenant:${t.id}:area`] = '床面積を数値で入力してください';
      const cap = parseCount(t.capacity);
      if (cap === undefined) errors[`tenant:${t.id}:capacity`] = '収容人員を整数で入力してください';
      tenants.push({
        id: t.id,
        name: t.name.trim(),
        usage: t.usage,
        floor: t.floor,
        ...(typeof area === 'number' ? { area } : {}),
        ...(typeof cap === 'number' ? { capacity: cap } : {}),
      });
    }
    if (!tenants.some((t) => t.usage)) errors.tenants = 'テナントを1件以上入力し、用途を選択してください';
  } else {
    for (const f of floors) {
      if (parseCount(form.floorCapacities[f] ?? '') === undefined) {
        errors[`floor:${f}`] = `${floorLabel(f)}の収容人員を整数で入力してください`;
      }
    }
  }
  const summary = summarizeCapacity(form);
  if (summary.total === null && !errors.floorsAbove) {
    errors.capacity = composite ? 'テナントの収容人員を入力してください' : '階ごとの収容人員を入力してください';
  }

  const r = form.renovation;
  let renovationArea: number | undefined;
  if (r.status === 'yes' && r.area.trim()) {
    const v = parseNumber(r.area);
    if (v === null) errors.renovationArea = '増築面積を数値で入力してください';
    else renovationArea = v;
  }

  // 有効開口部(地上階のみ)
  const openings = validateOpeningRecords(
    form.openingRecords,
    floors.filter((f) => !f.startsWith('B')),
  );
  Object.assign(errors, openings.errors);

  if (Object.keys(errors).length > 0 || !form.usage || summary.total === null) return { building: null, errors };

  const { capacityFallback: _fallback, ...rest } = form;
  void _fallback;
  return {
    building: {
      ...rest,
      label: form.label.trim(),
      usage: form.usage,
      renovation: normalizeRenovation(r, renovationArea),
      // 16項はテナントの用途から自動設定(重複を除き入力順)
      subUsages: composite ? [...new Set(tenants.map((t) => t.usage).filter((u): u is UsageCategory => !!u))] : [],
      tenants: composite ? tenants : [],
      capacity: summary.total,
      floorCapacities: summary.byFloor,
      openingRecords: openings.records,
      ...nums,
    },
    errors: {},
  };
}

/**
 * 増改築の入力を保存用に整える。
 * 「無」の場合は場所・面積・時期を持たない(写真は有無に関わらず残す)。何も入力が無ければ undefined。
 */
function normalizeRenovation(r: RenovationForm, area: number | undefined): RenovationInfo | undefined {
  if (r.status === null && r.photoIds.length === 0) return undefined;
  const yes = r.status === 'yes';
  const captions = Object.fromEntries(
    Object.entries(r.photoCaptions).filter(([id, c]) => r.photoIds.includes(id) && c.trim()),
  );
  return {
    status: r.status,
    location: yes ? r.location.trim() : '',
    ...(yes && area !== undefined ? { area } : {}),
    period: yes ? r.period.trim() : '',
    photoIds: r.photoIds,
    photoCaptions: captions,
  };
}
