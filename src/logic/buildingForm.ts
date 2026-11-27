/**
 * 対象物情報入力フォームの状態と検証。
 * 数値欄は入力途中の空欄を許すため文字列で保持し、検証時に BuildingInfo へ変換する。
 */
import type { BuildingInfo, UsageCategory } from '../types/inspection';
import { isCompositeUsage } from './extractChecklist';

export const NUMERIC_FIELDS = ['totalFloorArea', 'floorsAbove', 'floorsBelow', 'capacity'] as const;
export type NumericField = (typeof NUMERIC_FIELDS)[number];

export type BuildingFormState = Omit<BuildingInfo, NumericField | 'usage'> & {
  usage: UsageCategory | '';
} & Record<NumericField, string>;

export type FormField = keyof BuildingFormState;
export type FormErrors = Partial<Record<FormField, string>>;

export function emptyBuildingForm(): BuildingFormState {
  return {
    name: '',
    address: '',
    ownerName: '',
    usage: '',
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

  if (Object.keys(errors).length > 0 || !form.usage) return { building: null, errors };

  return {
    building: {
      ...form,
      name: form.name.trim(),
      address: form.address.trim(),
      ownerName: form.ownerName?.trim() || undefined,
      usage: form.usage,
      subUsages: isCompositeUsage(form.usage) ? form.subUsages : [],
      ...nums,
    },
    errors: {},
  };
}
