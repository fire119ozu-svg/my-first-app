/**
 * 消防立入検査チェックリスト作成ツール 型定義
 *
 * データはすべて端末内(IndexedDB)にのみ保存し、外部へ送信しない前提で設計している。
 */

// ---------------------------------------------------------------------------
// 防火対象物の用途区分(消防法施行令 別表第一)
// ---------------------------------------------------------------------------

/** 令別表第一の項。6項イは(1)〜(4)まで区別する(設置基準が異なるため)。 */
export type UsageCategory =
  | '1イ' | '1ロ'
  | '2イ' | '2ロ' | '2ハ' | '2ニ'
  | '3イ' | '3ロ'
  | '4'
  | '5イ' | '5ロ'
  | '6イ(1)' | '6イ(2)' | '6イ(3)' | '6イ(4)'
  | '6ロ' | '6ハ' | '6ニ'
  | '7' | '8'
  | '9イ' | '9ロ'
  | '10' | '11' | '12イ' | '12ロ' | '13イ' | '13ロ' | '14' | '15'
  | '16イ' | '16ロ' | '16の2' | '16の3'
  | '17' | '18' | '19' | '20';

export interface UsageCategoryInfo {
  code: UsageCategory;
  /** 用途の概要(フォームの選択肢表示用) */
  label: string;
  /** 特定防火対象物か(令別表第一のうち不特定多数・要配慮者が利用する用途) */
  isSpecified: boolean;
}

// ---------------------------------------------------------------------------
// 消防用設備等・届出・付帯設備
// ---------------------------------------------------------------------------

/** 消防用設備等の種別(法第17条、令第7条) */
export type FireEquipmentType =
  | 'extinguisher'            // 消火器・簡易消火用具
  | 'indoorHydrant'           // 屋内消火栓設備
  | 'sprinkler'               // スプリンクラー設備
  | 'specialExtinguishing'    // 水噴霧・泡・不活性ガス等消火設備
  | 'outdoorHydrant'          // 屋外消火栓設備
  | 'autoFireAlarm'           // 自動火災報知設備
  | 'gasLeakAlarm'            // ガス漏れ火災警報設備
  | 'leakageAlarm'            // 漏電火災警報器
  | 'fireDeptNotification'    // 消防機関へ通報する火災報知設備
  | 'emergencyAlarm'          // 非常警報器具・非常警報設備(非常ベル・放送設備等)
  | 'evacuationDevice'        // 避難器具
  | 'guideLight'              // 誘導灯・誘導標識
  | 'fireWater'               // 消防用水
  | 'smokeExhaust'            // 排煙設備
  | 'connectedSprinkler'      // 連結散水設備
  | 'standpipe'               // 連結送水管
  | 'emergencyOutlet';        // 非常コンセント設備

/** 各種届出・報告の種別 */
export type NotificationType =
  | 'fireManagerAppointment'      // 防火管理者選任(解任)届出(法第8条第2項)
  | 'firePreventionPlan'          // 消防計画作成(変更)届出(規則第3条)
  | 'generalFireManager'          // 統括防火管理者選任届出(法第8条の2第4項)
  | 'equipmentInspectionReport'   // 消防用設備等点検結果報告(法第17条の3の3)
  | 'buildingInspectionReport'    // 防火対象物定期点検報告(法第8条の2の2)
  | 'useStartNotice'              // 防火対象物使用開始届出(高知市火災予防条例)
  | 'fireEquipmentNotice'         // 火を使用する設備等の設置届出(高知市火災予防条例)
  | 'smallHazmatNotice'           // 少量危険物貯蔵取扱届出(高知市火災予防条例)
  | 'designatedCombustiblesNotice'; // 指定可燃物貯蔵取扱届出(高知市火災予防条例)

/** 届出の提出状況 */
export type NotificationStatus = 'submitted' | 'notSubmitted' | 'notRequired' | 'unknown';

/**
 * 火気使用設備・危険物等の有無。条例に基づく項目の抽出に使う。
 */
export type FacilityType =
  | 'kitchen'                 // 厨房設備
  | 'boiler'                  // ボイラー・給湯湯沸設備等
  | 'furnace'                 // 炉
  | 'heater'                  // 温風暖房機・ストーブ等
  | 'substation'              // 変電設備・発電設備
  | 'storageBattery'          // 蓄電池設備
  | 'smallQuantityHazmat'     // 少量危険物(指定数量の1/5以上〜指定数量未満)
  | 'designatedCombustibles'; // 指定可燃物

// ---------------------------------------------------------------------------
// 対象物情報
// ---------------------------------------------------------------------------

/** 関係者の役職・氏名 */
export interface PersonInfo {
  /** 役職(例:代表取締役、店長、防火管理者) */
  title: string;
  name: string;
}

export interface BuildingInfo {
  /** 対象物名称 */
  name: string;
  /** 所在地 */
  address: string;
  /** 代表者(所有者・管理者・占有者等の代表) */
  representative?: PersonInfo;
  /** 立会者 */
  witness?: PersonInfo;
  /** 主たる用途の項 */
  usage: UsageCategory;
  /** 複合用途(16項)の場合に含まれる用途 */
  subUsages: UsageCategory[];
  /** 延べ面積(㎡) */
  totalFloorArea: number;
  /** 地上階数 */
  floorsAbove: number;
  /** 地下階数 */
  floorsBelow: number;
  /** 収容人員(令第1条の3) */
  capacity: number;
  /** 高さ31mを超えるか(高層建築物:法第8条の2、第8条の3) */
  isHighRise: boolean;
  /** 無窓階の有無(令第10条第1項第1号) */
  hasWindowlessFloor: boolean;
  /** 特定一階段等防火対象物に該当するか(令第4条の2の2第2号) */
  isSingleStaircase: boolean;
  /** 管理について権原が分かれているか(統括防火管理の要否判定) */
  hasMultipleOwners: boolean;
  /** 設置されている消防用設備等 */
  installedEquipment: FireEquipmentType[];
  /** 火気使用設備・危険物等 */
  facilities: FacilityType[];
  /** 各種届出の状況 */
  notifications: Partial<Record<NotificationType, NotificationStatus>>;
}

// ---------------------------------------------------------------------------
// チェック項目マスタ
// ---------------------------------------------------------------------------

/** チェック項目のカテゴリ(現場画面でのグルーピング単位) */
export type CheckCategory =
  | 'fireManagement'  // 防火管理
  | 'notification'    // 各種届出・報告
  | 'equipment'       // 消防用設備等
  | 'evacuation'      // 避難施設の管理
  | 'fireUse'         // 火気使用設備・器具
  | 'hazmat'          // 危険物・指定可燃物
  | 'flameRetardant'; // 防炎規制

/** 根拠法令 */
export type LawName =
  | '消防法'
  | '消防法施行令'
  | '消防法施行規則'
  | '高知市火災予防条例';

export interface LegalBasis {
  law: LawName;
  /** 条項(例: "第8条第1項") */
  article: string;
  /**
   * 条番号を原典で確認済みか。
   * 条例の条番号は火災予防条例(例)に準拠して記載しており、
   * 高知市例規集との照合が済むまで false とする。
   */
  verified: boolean;
}

/**
 * 適用条件(宣言的に記述し、抽出ロジックで評価する)。
 * 数値条件は「以上(gte)」で表す。
 */
export type ApplicabilityCondition =
  | { type: 'always' }
  | { type: 'usage'; in: UsageCategory[] }
  | { type: 'specified' }                           // 特定防火対象物
  | { type: 'totalFloorArea'; gte: number }
  | { type: 'capacity'; gte: number }
  | { type: 'floorsAbove'; gte: number }
  | { type: 'floorsBelow'; gte: number }
  | { type: 'flag'; flag: BuildingFlag }
  | { type: 'hasEquipment'; equipment: FireEquipmentType }
  | { type: 'hasFacility'; facility: FacilityType }
  | { type: 'and'; conditions: ApplicabilityCondition[] }
  | { type: 'or'; conditions: ApplicabilityCondition[] }
  | { type: 'not'; condition: ApplicabilityCondition };

/** BuildingInfo のうち真偽値の項目 */
export type BuildingFlag =
  | 'isHighRise'
  | 'hasWindowlessFloor'
  | 'isSingleStaircase'
  | 'hasMultipleOwners';

/** 違反時の重要度(指導の優先度の目安) */
export type Severity = 'high' | 'medium' | 'low';

export interface ChecklistItem {
  /** 一意なID(例: "FM-001")。保存済み案件の結果と紐づくため変更しないこと。 */
  id: string;
  category: CheckCategory;
  /** 項目名(現場画面の見出し) */
  title: string;
  /** 確認ポイント(何を見るか) */
  checkPoint: string;
  legalBasis: LegalBasis[];
  /** この項目を抽出する条件 */
  condition: ApplicabilityCondition;
  severity: Severity;
  /** 補足(設置基準の詳細・例外など) */
  note?: string;
  /** 判定・メモ以外に現場で記録する入力欄 */
  fields?: ItemFieldDef[];
}

/**
 * 項目ごとの追加入力欄の定義。
 * key は保存データと紐づくため変更しないこと。
 */
export type ItemFieldDef =
  | { key: string; kind: 'text'; label: string; placeholder?: string }
  | {
      key: string;
      /** 階ごとの数値入力(階は対象物の地上・地下階数から生成) */
      kind: 'perFloorNumber';
      label: string;
      unit: string;
      /** 小数を許可するか */
      decimal?: boolean;
    };

/** 階の識別子:地上は "1","2"…、地下は "B1","B2"… */
export type FloorKey = string;

/**
 * 追加入力欄の値。入力途中の空欄を許すため文字列で保持する。
 * text → string、perFloorNumber → 階ごとの文字列
 */
export type ItemFieldValue = string | Record<FloorKey, string>;

// ---------------------------------------------------------------------------
// 検査案件・チェック結果
// ---------------------------------------------------------------------------

/** 検査員(階級・氏名) */
export interface Inspector {
  /** 消防吏員の階級(例:消防司令補)。未選択は空文字 */
  rank: string;
  name: string;
}

/** 判定:適 / 否 / 該当なし */
export type CheckResult = 'compliant' | 'nonCompliant' | 'notApplicable';

export const CHECK_RESULT_LABELS: Record<CheckResult, string> = {
  compliant: '適',
  nonCompliant: '否',
  notApplicable: '該当なし',
};

export interface CheckEntry {
  itemId: string;
  /** 未判定は null */
  result: CheckResult | null;
  memo: string;
  /** 追加入力欄の値(ItemFieldDef.key → 値) */
  fields?: Record<string, ItemFieldValue>;
  /** 添付写真のID(撮影・追加順)。画像本体は PhotoRecord として別に保存する */
  photoIds?: string[];
  /** 写真ごとのコメント(撮影場所など)。写真ID → コメント */
  photoCaptions?: Record<string, string>;
  /** ISO 8601 */
  updatedAt: string;
}

export type CaseStatus = 'draft' | 'inspecting' | 'completed';

/** 検査案件(端末内に保存する単位) */
export interface InspectionCase {
  /** crypto.randomUUID() */
  id: string;
  status: CaseStatus;
  /** 検査日(YYYY-MM-DD) */
  inspectionDate: string;
  /** 検査員 */
  inspectors: Inspector[];
  building: BuildingInfo;
  /** 抽出された項目IDの並び(抽出時点のスナップショット) */
  itemIds: string[];
  /** 項目IDごとの結果 */
  entries: Record<string, CheckEntry>;
  /** 案件全体の備考 */
  remarks: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 添付写真(端末内のIndexedDBに案件とは別に保存)。
 * 画像は長辺を縮小したJPEGで保持し、一覧表示用に縮小版も持つ。
 */
export interface PhotoRecord {
  id: string;
  caseId: string;
  itemId: string;
  /** 表示・Excel出力用(JPEG) */
  blob: Blob;
  /** 一覧表示用の縮小版(JPEG) */
  thumb: Blob;
  width: number;
  height: number;
  /** 追加日時(ISO 8601) */
  createdAt: string;
}

/**
 * 参考資料(利用者が端末に取り込んだPDF・画像)。
 * 端末内のIndexedDBにのみ保存し、外部へは送信しない。案件とは独立。
 */
export interface ReferenceRecord {
  id: string;
  title: string;
  /** 分類(例:設置基準、点検要領)。未指定は空文字 */
  category: string;
  kind: 'pdf' | 'image';
  blob: Blob;
  /** PDFのページ数(画像は1) */
  pageCount: number;
  /** 取り込み元のファイル名 */
  fileName: string;
  createdAt: string;
  updatedAt: string;
}
