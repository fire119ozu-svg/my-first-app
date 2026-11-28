/**
 * 対象物情報入力フォームの状態と検証。
 * 数値欄は入力途中の空欄を許すため文字列で保持し、検証時に BuildingInfo へ変換する。
 */
import type { BuildingInfo, PersonInfo, RenovationInfo, UsageCategory } from '../types/inspection';
import { isCompositeUsage } from './extractChecklist';

export const NUMERIC_FIELDS = ['totalFloorArea', 'floorsAbove', 'floorsBelow', 'capacity'] as const;
export type NumericField = (typeof NUMERIC_FIELDS)[number];

/** 増改築の入力状態(面積は入力途中を許すため文字列) */
export type RenovationForm = Omit<RenovationInfo, 'area'> & { area: string };

export type BuildingFormState = Omit<BuildingInfo, NumericField | 'usage' | 'representative' | 'witness' | 'renovation'> & {
  usage: UsageCategory | '';
  representative: PersonInfo;
  witness: PersonInfo;
  renovation: RenovationForm;
} & Record<NumericField, string>;

export function emptyRenovation(): RenovationForm {
  return { status: null, location: '', area: '', period: '', photoIds: [], photoCaptions: {} };
}

const emptyPerson = (): PersonInfo => ({ title: '', name: '' });

/** 役職・氏名とも空なら未入力として扱う */
export function normalizePerson(p: PersonInfo | undefined): PersonInfo | undefined {
  if (!p) return undefined;
  const title = p.title.trim();
  const name = p.name.trim();
  return title || name ? { title, name } : undefined;
}

export type FormField = keyof BuildingFormState | 'renovationArea';
export type FormErrors = Partial<Record<FormField, string>>;

export function emptyBuildingForm(): BuildingFormState {
  return {
    name: '',
    address: '',
    representative: emptyPerson(),
    witness: emptyPerson(),
    usage: '',
    renovation: emptyRenovation(),
    subUsages: [],
    totalFloorArea: '',
    floorsAbove: '',
    floorsBelow: '0',
    capacity: '',
    isHighRise: false,
    hasWindowlessFloor: false,
    isSingleStaircase: false,
    hasMultipleOwners: false,
    installedEquipment: [],
    facilities: [],
    notifications: {},
  };
}

export function toBuildingForm(b: BuildingInfo): BuildingFormState {
  return {
    ...b,
    representative: b.representative ?? emptyPerson(),
    witness: b.witness ?? emptyPerson(),
    renovation: b.renovation
      ? { ...b.renovation, area: b.renovation.area === undefined ? '' : String(b.renovation.area) }
      : emptyRenovation(),
    totalFloorArea: String(b.totalFloorArea),
    floorsAbove: String(b.floorsAbove),
    floorsBelow: String(b.floorsBelow),
    capacity: String(b.capacity),
  };
}

/** 全角数字・カンマを許容して数値化。空欄・不正値は null */
export function parseNumber(raw: string): number | null {
  const s = raw
    .replace(/[０-９．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[,，\s]/g, '');
  if (s === '' || !/^\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

const NUMERIC_RULES: Record<NumericField, { label: string; integer: boolean; min: number }> = {
  totalFloorArea: { label: '延べ面積', integer: false, min: 0 },
  floorsAbove: { label: '地上階数', integer: true, min: 1 },
  floorsBelow: { label: '地下階数', integer: true, min: 0 },
  capacity: { label: '収容人員', integer: true, min: 0 },
};

export function validateBuildingForm(form: BuildingFormState): {
  building: BuildingInfo | null;
  errors: FormErrors;
} {
  const errors: FormErrors = {};
  if (!form.name.trim()) errors.name = '名称を入力してください';
  if (!form.usage) errors.usage = '用途を選択してください';
  if (form.usage && isCompositeUsage(form.usage) && form.subUsages.length === 0) {
    errors.subUsages = '複合用途に含まれる用途を選択してください';
  }

  const nums = {} as Record<NumericField, number>;
  for (const field of NUMERIC_FIELDS) {
    const rule = NUMERIC_RULES[field];
    const v = parseNumber(form[field]);
    if (v === null) {
      errors[field] = `${rule.label}を数値で入力してください`;
    } else if (rule.integer && !Number.isInteger(v)) {
      errors[field] = `${rule.label}は整数で入力してください`;
    } else if (v < rule.min) {
      errors[field] = `${rule.label}は${rule.min}以上で入力してください`;
    } else {
      nums[field] = v;
    }
  }

  const r = form.renovation;
  let renovationArea: number | undefined;
  if (r.status === 'yes' && r.area.trim()) {
    const v = parseNumber(r.area);
    if (v === null) errors.renovationArea = '増築面積を数値で入力してください';
    else renovationArea = v;
  }

  if (Object.keys(errors).length > 0 || !form.usage) return { building: null, errors };

  return {
    building: {
      ...form,
      name: form.name.trim(),
      address: form.address.trim(),
      representative: normalizePerson(form.representative),
      witness: normalizePerson(form.witness),
      renovation: normalizeRenovation(r, renovationArea),
      usage: form.usage,
      subUsages: isCompositeUsage(form.usage) ? form.subUsages : [],
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
