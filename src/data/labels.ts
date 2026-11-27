import type {
  FacilityType,
  FireEquipmentType,
  NotificationStatus,
  NotificationType,
} from '../types/inspection';

/** 消防用設備等(表示順) */
export const EQUIPMENT_OPTIONS: { value: FireEquipmentType; label: string }[] = [
  { value: 'extinguisher', label: '消火器' },
  { value: 'indoorHydrant', label: '屋内消火栓' },
  { value: 'sprinkler', label: 'スプリンクラー' },
  { value: 'specialExtinguishing', label: '特殊消火設備(泡・ガス等)' },
  { value: 'outdoorHydrant', label: '屋外消火栓' },
  { value: 'autoFireAlarm', label: '自動火災報知設備' },
  { value: 'gasLeakAlarm', label: 'ガス漏れ火災警報設備' },
  { value: 'leakageAlarm', label: '漏電火災警報器' },
  { value: 'fireDeptNotification', label: '火災通報装置' },
  { value: 'emergencyAlarm', label: '非常警報設備' },
  { value: 'evacuationDevice', label: '避難器具' },
  { value: 'guideLight', label: '誘導灯・誘導標識' },
  { value: 'fireWater', label: '消防用水' },
  { value: 'smokeExhaust', label: '排煙設備' },
  { value: 'connectedSprinkler', label: '連結散水設備' },
  { value: 'standpipe', label: '連結送水管' },
  { value: 'emergencyOutlet', label: '非常コンセント' },
];

export const FACILITY_OPTIONS: { value: FacilityType; label: string }[] = [
  { value: 'kitchen', label: '厨房設備' },
  { value: 'boiler', label: 'ボイラー・給湯設備' },
  { value: 'furnace', label: '炉' },
  { value: 'heater', label: '暖房機・ストーブ' },
  { value: 'substation', label: '変電・発電設備' },
  { value: 'storageBattery', label: '蓄電池設備' },
  { value: 'smallQuantityHazmat', label: '少量危険物' },
  { value: 'designatedCombustibles', label: '指定可燃物' },
];

export const NOTIFICATION_OPTIONS: { value: NotificationType; label: string }[] = [
  { value: 'useStartNotice', label: '防火対象物使用開始届' },
  { value: 'fireManagerAppointment', label: '防火管理者選任届' },
  { value: 'firePreventionPlan', label: '消防計画作成届' },
  { value: 'generalFireManager', label: '統括防火管理者選任届' },
  { value: 'equipmentInspectionReport', label: '消防用設備等点検結果報告' },
  { value: 'buildingInspectionReport', label: '防火対象物点検報告' },
  { value: 'fireEquipmentNotice', label: '火を使用する設備等の設置届' },
  { value: 'smallHazmatNotice', label: '少量危険物貯蔵取扱届' },
  { value: 'designatedCombustiblesNotice', label: '指定可燃物貯蔵取扱届' },
];

export const NOTIFICATION_STATUS_OPTIONS: { value: NotificationStatus; label: string }[] = [
  { value: 'submitted', label: '済' },
  { value: 'notSubmitted', label: '未' },
  { value: 'notRequired', label: '不要' },
  { value: 'unknown', label: '不明' },
];
