/**
 * チェック項目マスタ(サンプル)
 *
 * 消防法・消防法施行令・同施行規則および高知市火災予防条例に基づく立入検査の
 * 代表的な確認項目。適用条件は主要な設置基準を簡略化して記述しており、
 * 構造(耐火・準耐火)による面積緩和、階ごとの判定、各種の免除・特例は
 * 含まない。抽出結果は「確認すべき候補」として扱い、最終判断は検査員が行うこと。
 *
 * 高知市火災予防条例の条番号・内容は、条例本文(平成28年4月1日条例第62号による改正まで)と
 * 照合済み(verified: true)。それ以降の改正の有無は高知市例規集で確認すること。
 */
import type {
  ApplicabilityCondition,
  CheckCategory,
  ChecklistItem,
  FacilityType,
  FireEquipmentType,
  LawName,
  LegalBasis,
  UsageCategory,
} from '../types/inspection';
import { USAGE_6I } from './usageCategories';

// ---------------------------------------------------------------------------
// 条件記述ヘルパー
// ---------------------------------------------------------------------------

const usage = (...codes: UsageCategory[]): ApplicabilityCondition => ({ type: 'usage', in: codes });
const area = (gte: number): ApplicabilityCondition => ({ type: 'totalFloorArea', gte });
const capacity = (gte: number): ApplicabilityCondition => ({ type: 'capacity', gte });
const floorsAbove = (gte: number): ApplicabilityCondition => ({ type: 'floorsAbove', gte });
const floorsBelow = (gte: number): ApplicabilityCondition => ({ type: 'floorsBelow', gte });
const has = (equipment: FireEquipmentType): ApplicabilityCondition => ({ type: 'hasEquipment', equipment });
const facility = (f: FacilityType): ApplicabilityCondition => ({ type: 'hasFacility', facility: f });
const and = (...conditions: ApplicabilityCondition[]): ApplicabilityCondition => ({ type: 'and', conditions });
const or = (...conditions: ApplicabilityCondition[]): ApplicabilityCondition => ({ type: 'or', conditions });
const not = (condition: ApplicabilityCondition): ApplicabilityCondition => ({ type: 'not', condition });
const specified: ApplicabilityCondition = { type: 'specified' };
const highRise: ApplicabilityCondition = { type: 'flag', flag: 'isHighRise' };
const windowless: ApplicabilityCondition = { type: 'flag', flag: 'hasWindowlessFloor' };
const singleStaircase: ApplicabilityCondition = { type: 'flag', flag: 'isSingleStaircase' };
const multipleOwners: ApplicabilityCondition = { type: 'flag', flag: 'hasMultipleOwners' };

/** 法令上の設置義務がある、または(任意設置を含め)設置済みであれば維持管理を確認する */
const requiredOrInstalled = (eq: FireEquipmentType, required: ApplicabilityCondition) =>
  or(required, has(eq));

const law = (name: LawName, article: string, verified = true): LegalBasis => ({
  law: name,
  article,
  verified,
});
/** 高知市火災予防条例(平成28年4月1日改正までの本文と照合済み) */
const kochi = (article: string, verified = true): LegalBasis =>
  law('高知市火災予防条例', article, verified);

// ---------------------------------------------------------------------------
// 用途グループ
// ---------------------------------------------------------------------------

const U1: UsageCategory[] = ['1イ', '1ロ'];
const U2: UsageCategory[] = ['2イ', '2ロ', '2ハ', '2ニ'];
const U3: UsageCategory[] = ['3イ', '3ロ'];
const U5: UsageCategory[] = ['5イ', '5ロ'];
const U6: UsageCategory[] = [...USAGE_6I, '6ロ', '6ハ', '6ニ'];
const U9: UsageCategory[] = ['9イ', '9ロ'];
const U12: UsageCategory[] = ['12イ', '12ロ'];
const U13: UsageCategory[] = ['13イ', '13ロ'];

/** 防火管理者の選任が必要な防火対象物(令第1条の2第3項) */
const needsFireManager = or(
  // 6項ロ(及びこれを含む16項イ・16の2)は収容人員10人以上
  and(usage('6ロ', '16イ', '16の2'), capacity(10)),
  and(specified, capacity(30)),
  and(not(specified), not(usage('18', '19', '20')), capacity(50)),
);

// ---------------------------------------------------------------------------
// マスタ本体
// ---------------------------------------------------------------------------

export const CHECKLIST_ITEMS: ChecklistItem[] = [
  // ===== 防火管理 =====
  {
    id: 'FM-001',
    category: 'fireManagement',
    title: '防火管理者の選任',
    checkPoint:
      '防火管理者が選任され、届出がされているか。資格(甲種・乙種)が対象物の規模に適合しているか。',
    legalBasis: [law('消防法', '第8条第1項・第2項'), law('消防法施行令', '第1条の2第3項・第3条')],
    condition: needsFireManager,
    severity: 'high',
    note: '特定防火対象物は延べ300㎡以上、非特定は500㎡以上で甲種防火管理者が必要。6項ロ等は面積によらず甲種。',
  },
  {
    id: 'FM-002',
    category: 'fireManagement',
    title: '消防計画の作成・届出',
    checkPoint: '消防計画が作成・届出されているか。内容が現状(用途・テナント・設備)と一致しているか。',
    legalBasis: [law('消防法', '第8条第1項'), law('消防法施行規則', '第3条')],
    condition: needsFireManager,
    severity: 'high',
  },
  {
    id: 'FM-003',
    category: 'fireManagement',
    title: '消火・通報・避難訓練の実施',
    checkPoint:
      '消防計画に基づく訓練を実施しているか。特定防火対象物は消火訓練・避難訓練を年2回以上実施しているか。実施記録があるか。',
    legalBasis: [law('消防法施行規則', '第3条第10項・第11項')],
    condition: needsFireManager,
    severity: 'medium',
    note: '特定防火対象物では消火訓練・避難訓練の実施前に消防機関への通報が必要。',
  },
  {
    id: 'FM-004',
    category: 'fireManagement',
    title: '統括防火管理者の選任',
    checkPoint: '管理権原が分かれている場合に、統括防火管理者が選任・届出され、全体についての消防計画が作成されているか。',
    legalBasis: [law('消防法', '第8条の2'), law('消防法施行令', '第3条の3')],
    condition: and(
      multipleOwners,
      or(
        highRise,
        and(usage('6ロ', '16イ'), floorsAbove(3), capacity(10)),
        and(specified, floorsAbove(3), capacity(30)),
        and(usage('16ロ'), floorsAbove(5), capacity(50)),
        usage('16の3'),
      ),
    ),
    severity: 'high',
    note: '地下街(16の2)は消防長等が指定したもの。',
  },
  {
    id: 'FM-005',
    category: 'fireManagement',
    title: '防火対象物定期点検報告',
    checkPoint: '防火対象物点検資格者による点検を1年に1回実施し、消防長等へ報告しているか。点検済表示の有無。',
    legalBasis: [law('消防法', '第8条の2の2'), law('消防法施行令', '第4条の2の2')],
    condition: and(needsFireManager, or(and(specified, capacity(300)), singleStaircase)),
    severity: 'high',
  },

  // ===== 各種届出・報告 =====
  {
    id: 'NT-001',
    category: 'notification',
    title: '防火対象物使用開始届出',
    checkPoint: '使用開始の7日前までに使用開始届出がされているか。用途・営業者変更時に届出がされているか。',
    legalBasis: [kochi('第43条')],
    // 令別表第1(19)項・(20)項は届出の対象外
    condition: not(usage('19', '20')),
    severity: 'medium',
  },
  {
    id: 'NT-002',
    category: 'notification',
    title: '火を使用する設備等の設置届出',
    checkPoint: '一定規模以上の厨房設備・ボイラー・炉・変電設備・蓄電池設備等について、設置の届出がされているか。',
    legalBasis: [kochi('第44条')],
    condition: or(
      facility('kitchen'),
      facility('boiler'),
      facility('furnace'),
      facility('heater'),
      facility('substation'),
      facility('storageBattery'),
    ),
    severity: 'medium',
    note: '届出対象(条例第44条):据付面積2㎡以上の炉、同一厨房室の入力合計350kW以上の厨房設備、入力70kW以上の温風暖房機・給湯湯沸設備、ボイラー、乾燥設備、サウナ設備、高圧・特別高圧の変電設備(全出力50kW以下を除く)、燃料電池発電設備、固定の内燃機関発電設備、蓄電池設備、2kVA以上のネオン管灯設備など(個人の住居に設けるものを除く場合あり)。',
  },
  {
    id: 'NT-003',
    category: 'notification',
    title: '少量危険物貯蔵取扱届出',
    checkPoint: '指定数量の1/5以上指定数量未満の危険物について、貯蔵・取扱いの届出がされているか。廃止した場合に届出がされているか。',
    legalBasis: [kochi('第46条')],
    condition: facility('smallQuantityHazmat'),
    severity: 'medium',
    note: '個人の住居で貯蔵・取り扱う場合は指定数量の1/2以上が届出対象(条例第46条第1項)。廃止時も届出が必要(同条第2項)。',
  },
  {
    id: 'NT-004',
    category: 'notification',
    title: '指定可燃物貯蔵取扱届出',
    checkPoint: '届出対象数量以上の指定可燃物について、貯蔵・取扱いの届出がされているか。',
    legalBasis: [kochi('第46条')],
    condition: facility('designatedCombustibles'),
    severity: 'medium',
    note: '届出対象は条例別表の数量の5倍以上(品名によっては同数量以上)。',
  },
  {
    id: 'NT-005',
    category: 'notification',
    title: '消防用設備等点検結果報告',
    checkPoint:
      '機器点検(6か月ごと)・総合点検(1年ごと)を実施し、特定防火対象物は1年に1回、非特定は3年に1回報告しているか。不良箇所の改修状況。',
    legalBasis: [law('消防法', '第17条の3の3'), law('消防法施行規則', '第31条の6')],
    condition: or(
      has('extinguisher'), has('indoorHydrant'), has('sprinkler'), has('specialExtinguishing'),
      has('outdoorHydrant'), has('autoFireAlarm'), has('gasLeakAlarm'), has('leakageAlarm'),
      has('fireDeptNotification'), has('emergencyAlarm'), has('evacuationDevice'), has('guideLight'),
      has('fireWater'), has('smokeExhaust'), has('connectedSprinkler'), has('standpipe'),
      has('emergencyOutlet'),
    ),
    severity: 'high',
  },
  {
    id: 'NT-006',
    category: 'notification',
    title: '消防設備士等による点検',
    checkPoint: '消防設備士または消防設備点検資格者が点検を実施しているか(点検者の資格を報告書で確認)。',
    legalBasis: [law('消防法', '第17条の3の3'), law('消防法施行令', '第36条第2項')],
    condition: or(and(specified, area(1000)), singleStaircase),
    severity: 'medium',
    note: '非特定防火対象物は延べ1000㎡以上で消防長等が指定したもの。',
  },

  // ===== 消防用設備等 =====
  {
    id: 'EQ-001',
    category: 'equipment',
    title: '消火器',
    checkPoint:
      '適正な能力単位・歩行距離20m以内で設置されているか。標識、設置位置(床面から1.5m以下)、使用期限、本体の腐食・変形、安全栓の脱落がないか。',
    legalBasis: [law('消防法', '第17条'), law('消防法施行令', '第10条'), law('消防法施行規則', '第6条〜第9条')],
    condition: requiredOrInstalled(
      'extinguisher',
      or(
        usage('1イ', ...U2, '6イ(1)', '6イ(2)', '6イ(3)', '6ロ', '16の2', '16の3', '17', '20'),
        and(usage(...U3), or(facility('kitchen'), facility('furnace'), facility('heater'))),
        and(usage('1ロ', ...U3, '4', ...U5, '6イ(4)', '6ハ', '6ニ', ...U9, ...U12, ...U13, '14', '16イ', '16ロ'), area(150)),
        and(usage('7', '8', '10', '11', '15'), area(300)),
        floorsBelow(1),
        windowless,
        floorsAbove(3),
      ),
    ),
    severity: 'high',
    note: '地階・無窓階・3階以上の階は床面積50㎡以上で設置が必要(階ごとに判定)。3項は火を使用する設備器具があれば面積によらず必要。',
    fields: [
      { key: 'abilityUnits', kind: 'perFloorNumber', label: '設置能力単位(階ごと)', unit: '単位', decimal: true },
    ],
  },
  {
    id: 'EQ-002',
    category: 'equipment',
    title: '屋内消火栓設備',
    checkPoint:
      '消火栓箱の前に障害物がないか。表示灯が点灯しているか。ホース・ノズルの損傷、ポンプの起動・非常電源の状態。',
    legalBasis: [law('消防法', '第17条'), law('消防法施行令', '第11条'), law('消防法施行規則', '第12条')],
    condition: requiredOrInstalled(
      'indoorHydrant',
      or(
        and(usage(...U1), area(500)),
        and(usage(...U2, ...U3, '4', ...U5, ...U6, ...U9, '10', ...U12, '14'), area(700)),
        and(usage('11', '15'), area(1000)),
        and(usage('16の2'), area(150)),
      ),
    ),
    severity: 'high',
    note: '主要構造部が耐火構造・準耐火構造で内装制限ありの場合は基準面積が2倍・3倍となる。地階・無窓階・4階以上の階は別基準。',
  },
  {
    id: 'EQ-003',
    category: 'equipment',
    title: 'スプリンクラー設備',
    checkPoint:
      'ヘッド周囲の散水障害(物品の積み上げ・間仕切り)がないか。制御弁の開閉状態、送水口の表示・障害物、ポンプ・非常電源の状態。',
    legalBasis: [law('消防法', '第17条'), law('消防法施行令', '第12条'), law('消防法施行規則', '第13条〜第14条')],
    condition: requiredOrInstalled(
      'sprinkler',
      or(
        usage('6イ(1)', '6イ(2)', '6ロ'),
        and(usage('4', '6イ(1)', '6イ(2)', '6イ(3)'), area(3000)),
        and(usage(...U1, ...U2, ...U3, '5イ', ...U6, '9イ'), area(6000), floorsAbove(2)),
        and(usage('16の2'), area(1000)),
        floorsAbove(11),
      ),
    ),
    severity: 'high',
    note: '6項イ(1)(2)・6項ロは延焼抑制構造等による免除あり。11階以上の階は階ごとに判定。',
  },
  {
    id: 'EQ-016',
    category: 'equipment',
    title: '特殊消火設備',
    checkPoint:
      '(水噴霧・泡・不活性ガス・ハロゲン化物・粉末)手動起動装置の表示・障害物、放出表示灯・音響警報装置の状態。貯蔵容器・選択弁・配管の損傷、容器の圧力・薬剤量。防護区画の開口部・換気装置の自動閉止。不活性ガス等は防護区画への出入口の注意表示。',
    legalBasis: [law('消防法', '第17条'), law('消防法施行令', '第13条〜第18条'), law('消防法施行規則', '第16条〜第21条')],
    condition: has('specialExtinguishing'),
    severity: 'high',
    note: '設置義務は駐車場・電気室・ボイラー室・通信機器室など部分の用途と床面積で判定(入力項目にないため、設置済みの場合に抽出する)。',
    fields: [
      { key: 'type', kind: 'text', label: '種類・防護区画', placeholder: '例:不活性ガス(二酸化炭素) 地下駐車場' },
    ],
  },
  {
    id: 'EQ-004',
    category: 'equipment',
    title: '自動火災報知設備',
    checkPoint:
      '受信機の電源・地区表示灯、ベル停止・音響停止スイッチが定位置か。感知器の未警戒区域(間仕切り変更・塗装)や障害がないか。発信機の前に障害物がないか。',
    legalBasis: [law('消防法', '第17条'), law('消防法施行令', '第21条'), law('消防法施行規則', '第23条〜第24条の2')],
    condition: requiredOrInstalled(
      'autoFireAlarm',
      or(
        usage('2ニ', '5イ', '6イ(1)', '6イ(2)', '6イ(3)', '6ロ', '13ロ', '17'),
        and(usage('9イ'), area(200)),
        and(usage(...U1, '2イ', '2ロ', '2ハ', ...U3, '4', '6イ(4)', '6ハ', '6ニ', '16イ', '16の2'), area(300)),
        and(usage('5ロ', '7', '8', '9ロ', '10', ...U12, '13イ', '14'), area(500)),
        and(usage('11', '15'), area(1000)),
        floorsAbove(11),
        singleStaircase,
      ),
    ),
    severity: 'high',
    note: '6項ハは利用者を入居・宿泊させるものは面積によらず必要。地階・無窓階・3階以上の階は階ごとの基準あり。',
    fields: [
      { key: 'receiverLocation', kind: 'text', label: '受信機設置場所', placeholder: '例:1階 管理人室' },
    ],
  },
  {
    id: 'EQ-005',
    category: 'equipment',
    title: '消防機関へ通報する火災報知設備',
    checkPoint:
      '火災通報装置の電源、通報先・通報内容の設定が適正か。6項イ(1)(2)・6項ロ等は自動火災報知設備と連動しているか。',
    legalBasis: [law('消防法', '第17条'), law('消防法施行令', '第23条'), law('消防法施行規則', '第25条')],
    condition: requiredOrInstalled(
      'fireDeptNotification',
      or(
        usage('6イ(1)', '6イ(2)', '6ロ', '16の2', '16の3'),
        and(usage(...U1, ...U2, '4', '5イ', '6イ(3)', '6イ(4)', '6ハ', '6ニ', '12イ', '17'), area(500)),
        area(1000),
      ),
    ),
    severity: 'high',
    note: '消防機関が存する建築物内、消防機関から著しく離れた場所等は除く。',
  },
  {
    id: 'EQ-006',
    category: 'equipment',
    title: '非常警報設備(非常ベル・放送設備等)',
    checkPoint: '起動装置・表示灯の状態、音響装置の鳴動、非常電源。放送設備は操作部の位置・スピーカーの障害。',
    legalBasis: [law('消防法', '第17条'), law('消防法施行令', '第24条'), law('消防法施行規則', '第25条の2')],
    condition: requiredOrInstalled(
      'emergencyAlarm',
      or(capacity(50), and(windowless, capacity(20)), floorsAbove(11), floorsBelow(3)),
    ),
    severity: 'medium',
    note: '地上11階以上・地階3以上、または特定用途で収容人員が多いものは放送設備が必要。自動火災報知設備の設置により一部免除あり。',
  },
  {
    id: 'EQ-007',
    category: 'equipment',
    title: '避難器具',
    checkPoint: '設置場所に障害物がないか。降下空間・降着面が確保されているか。標識・操作方法の表示、器具の損傷。',
    legalBasis: [law('消防法', '第17条'), law('消防法施行令', '第25条'), law('消防法施行規則', '第26条〜第27条')],
    condition: requiredOrInstalled(
      'evacuationDevice',
      and(
        or(floorsAbove(2), floorsBelow(1)),
        or(
          and(usage(...U6), capacity(20)),
          and(usage(...U5), capacity(30)),
          and(usage(...U1, ...U2, ...U3, '4', '7', '8', ...U9, '10', '11'), capacity(50)),
          and(usage(...U12, '15'), floorsAbove(3), capacity(150)),
          singleStaircase,
        ),
      ),
    ),
    severity: 'high',
    note: '設置義務は階ごとの収容人員で判定する(建物全体の収容人員ではない)。',
  },
  {
    id: 'EQ-008',
    category: 'equipment',
    title: '誘導灯・誘導標識',
    checkPoint: '誘導灯が常時点灯しているか。視認障害(物品・看板)がないか。非常電源(バッテリー)の点検。',
    legalBasis: [law('消防法', '第17条'), law('消防法施行令', '第26条'), law('消防法施行規則', '第28条の2〜第28条の3')],
    condition: requiredOrInstalled(
      'guideLight',
      or(
        usage(...U1, ...U2, ...U3, '4', '5イ', ...U6, '9イ', '16イ', '16の2', '16の3'),
        floorsBelow(1),
        windowless,
        floorsAbove(11),
      ),
    ),
    severity: 'medium',
  },
  {
    id: 'EQ-009',
    category: 'equipment',
    title: '漏電火災警報器',
    checkPoint: '受信機の電源表示、作動試験の状態、変流器の設置状況。',
    legalBasis: [law('消防法', '第17条'), law('消防法施行令', '第22条'), law('消防法施行規則', '第24条の3')],
    condition: has('leakageAlarm'),
    severity: 'low',
    note: '設置義務は壁・床・天井が鉄網入り(ラスモルタル造等)の建築物で用途・面積・契約電流による。',
  },
  {
    id: 'EQ-010',
    category: 'equipment',
    title: '連結送水管',
    checkPoint: '送水口の表示・障害物・キャップの有無。放水口格納箱の表示と内部の状態。',
    legalBasis: [law('消防法', '第17条'), law('消防法施行令', '第29条'), law('消防法施行規則', '第30条の4')],
    condition: requiredOrInstalled(
      'standpipe',
      or(floorsAbove(7), and(floorsAbove(5), area(6000)), and(usage('16の2'), area(1000))),
    ),
    severity: 'medium',
    fields: [
      { key: 'inletLocation', kind: 'text', label: '送水口の場所', placeholder: '例:建物正面 北側道路沿い' },
    ],
  },
  {
    id: 'EQ-015',
    category: 'equipment',
    title: '連結散水設備',
    checkPoint:
      '送水口の表示・障害物・キャップの有無。送水区域・選択弁の系統図が掲示されているか。散水ヘッド周囲の散水障害がないか。',
    legalBasis: [law('消防法', '第17条'), law('消防法施行令', '第28条の2'), law('消防法施行規則', '第30条の2〜第30条の3')],
    condition: requiredOrInstalled('connectedSprinkler', and(usage('16の2'), area(700))),
    severity: 'medium',
    note: '設置義務は地階の床面積の合計700㎡以上で判定(地下街は延べ700㎡以上)。地階の床面積は入力項目にないため、設置済みの場合に抽出する。',
    fields: [
      { key: 'inletLocation', kind: 'text', label: '送水口の場所', placeholder: '例:建物東側 駐車場入口横' },
    ],
  },
  {
    id: 'EQ-011',
    category: 'equipment',
    title: '非常コンセント設備',
    checkPoint: '表示灯の点灯、保護箱の表示・障害物、非常電源。',
    legalBasis: [law('消防法', '第17条'), law('消防法施行令', '第29条の2'), law('消防法施行規則', '第31条の2')],
    condition: requiredOrInstalled('emergencyOutlet', or(floorsAbove(11), and(usage('16の2'), area(1000)))),
    severity: 'medium',
  },
  {
    id: 'EQ-012',
    category: 'equipment',
    title: '排煙設備',
    checkPoint: '手動起動装置の表示・障害物、排煙口の開放障害、排煙機・非常電源の状態。',
    legalBasis: [law('消防法', '第17条'), law('消防法施行令', '第28条'), law('消防法施行規則', '第30条')],
    condition: requiredOrInstalled(
      'smokeExhaust',
      or(
        and(usage('16の2'), area(1000)),
        and(usage(...U2, '4', '10', ...U13), area(1000), or(floorsBelow(1), windowless)),
      ),
    ),
    severity: 'medium',
    note: '1項の舞台部(500㎡以上)、2・4・10・13項は地階・無窓階の床面積1000㎡以上で判定。',
  },
  {
    id: 'EQ-013',
    category: 'equipment',
    title: '屋外消火栓設備',
    checkPoint: '消火栓・ホース格納箱の表示・障害物、ホースの損傷、ポンプの状態。',
    legalBasis: [law('消防法', '第17条'), law('消防法施行令', '第19条'), law('消防法施行規則', '第22条')],
    condition: has('outdoorHydrant'),
    severity: 'medium',
    note: '設置義務は1階・2階の床面積合計(耐火9000㎡、準耐火6000㎡、その他3000㎡以上)で判定。',
  },
  {
    id: 'EQ-017',
    category: 'equipment',
    title: '消防用水',
    checkPoint: '標識の掲出、採水口・吸管投入孔の障害物、消防ポンプ自動車が接近できる経路の確保、必要な水量が保たれているか。',
    legalBasis: [law('消防法', '第17条'), law('消防法施行令', '第27条')],
    condition: requiredOrInstalled('fireWater', and(highRise, area(25000))),
    severity: 'medium',
    note: '高さ31m超で延べ面積(地階を除く)25000㎡以上のもののほか、敷地面積20000㎡以上で1階・2階の床面積合計(耐火15000㎡、準耐火10000㎡、その他5000㎡以上)のものも対象(敷地面積は入力項目にないため、設置済みの場合に抽出する)。',
  },
  {
    id: 'EQ-014',
    category: 'equipment',
    title: 'ガス漏れ火災警報設備',
    checkPoint: '受信機の電源・表示、検知器の設置位置・有効期限。',
    legalBasis: [law('消防法', '第17条'), law('消防法施行令', '第21条の2'), law('消防法施行規則', '第24条の2の2〜第24条の2の4')],
    condition: requiredOrInstalled('gasLeakAlarm', and(usage('16の2', '16の3'), area(1000))),
    severity: 'medium',
    note: '特定用途の地階で床面積1000㎡以上のもの等にも設置義務あり。',
  },

  // ===== 避難施設の管理 =====
  {
    id: 'EV-001',
    category: 'evacuation',
    title: '廊下・階段・避難口の物件存置',
    checkPoint: '廊下・階段・避難口等に避難の支障となる物件が置かれていないか。床面がつまずき・すべりを生じない状態に維持されているか。',
    legalBasis: [law('消防法', '第8条の2の4'), law('消防法施行令', '第4条の2の3'), kochi('第40条')],
    condition: not(usage('18', '19', '20')),
    severity: 'high',
  },
  {
    id: 'EV-002',
    category: 'evacuation',
    title: '防火戸の閉鎖障害',
    checkPoint: '防火戸の閉鎖範囲に物品・くさび・ドアストッパー等の閉鎖障害がないか。防火設備の近くに延焼の媒介となる可燃物が置かれていないか。',
    legalBasis: [law('消防法', '第8条の2の4'), law('消防法施行令', '第4条の2の3'), kochi('第41条')],
    condition: not(usage('18', '19', '20')),
    severity: 'high',
  },
  {
    id: 'EV-003',
    category: 'evacuation',
    title: '避難口の施錠管理',
    checkPoint: '営業中・在館中に避難口が施錠されていないか。屋内から鍵を用いずに解錠できるか(または非常時に自動解錠するか)。避難口の戸は外開きか。',
    legalBasis: [law('消防法', '第8条の2の4'), kochi('第40条第2号・第3号')],
    // 誘導灯(避難口誘導灯等)が設置されている棟のみ確認する
    condition: and(not(usage('18', '19', '20')), has('guideLight')),
    severity: 'high',
    note: '対象物情報の「設置済みの消防用設備等」で誘導灯・誘導標識を選んだ棟のみ抽出する。',
  },
  {
    id: 'EV-004',
    category: 'evacuation',
    title: '客席の避難通路・定員',
    checkPoint: '客席の避難通路の幅員が確保されているか。定員を超えて入場させていないか。',
    legalBasis: [kochi('第35条〜第39条')],
    condition: usage(...U1, ...U2, ...U3, '4'),
    severity: 'medium',
    note: '劇場等の客席(第35条・第36条)、キャバレー等・飲食店で客席150㎡以上の階は幅1.6m(飲食店1.2m)以上の避難通路(第37条)、ディスコ等(第37条の2)、個室型店舗(第37条の3)、百貨店等で売場150㎡以上の階は主要避難通路1.2m(300㎡以上1.6m)以上(第38条)、劇場等の定員(第39条)。',
  },

  // ===== 火気使用設備・器具 =====
  {
    id: 'FU-001',
    category: 'fireUse',
    title: '厨房設備',
    checkPoint:
      '可燃物との離隔距離が確保されているか。天蓋・排気ダクト・グリスフィルターの清掃状況(油脂の付着)。火炎伝送防止装置の設置・作動状態。',
    legalBasis: [kochi('第3条の4')],
    condition: facility('kitchen'),
    severity: 'high',
    note: '排気ダクト等は可燃物から10cm以上離隔。油脂を含む蒸気を発生する厨房設備の天蓋にはグリス除去装置・火炎伝送防止装置。特定用途の地階または高さ31m超の建築物で、同一厨房室の入力合計350kW以上の場合は自動消火装置とする(第3条の4第1項第2号エ)。',
  },
  {
    id: 'FU-002',
    category: 'fireUse',
    title: 'ボイラー・給湯湯沸設備',
    checkPoint: '可燃物との離隔距離、燃料タンク・配管の漏れ、安全装置の作動状態。',
    legalBasis: [kochi('第4条'), kochi('第8条の2')],
    condition: facility('boiler'),
    severity: 'medium',
  },
  {
    id: 'FU-003',
    category: 'fireUse',
    title: '炉',
    checkPoint: '設置場所の不燃区画、可燃物との離隔距離、燃焼排気の処理。',
    legalBasis: [kochi('第3条')],
    condition: facility('furnace'),
    severity: 'medium',
  },
  {
    id: 'FU-004',
    category: 'fireUse',
    title: '暖房機・ストーブ等',
    checkPoint: '可燃物との離隔距離、給油時の消火、転倒時の安全装置、周囲での可燃物の乾燥・放置がないか。',
    legalBasis: [kochi('第3条の3'), kochi('第5条'), kochi('第18条〜第21条')],
    condition: facility('heater'),
    severity: 'medium',
  },
  {
    id: 'FU-005',
    category: 'fireUse',
    title: '変電設備・発電設備',
    checkPoint: '設置室の区画・換気、可燃物の存置がないか、標識の掲示、定期点検の実施状況。',
    legalBasis: [kochi('第11条'), kochi('第12条')],
    condition: facility('substation'),
    severity: 'medium',
  },
  {
    id: 'FU-006',
    category: 'fireUse',
    title: '蓄電池設備',
    checkPoint: '設置場所の換気・区画、転倒防止措置、標識の掲示。',
    legalBasis: [kochi('第13条')],
    condition: facility('storageBattery'),
    severity: 'low',
    note: '定格容量と電槽数の積の合計が4,800Ah・セル未満のものを除く(条例第13条)。',
  },
  {
    id: 'FU-007',
    category: 'fireUse',
    title: '喫煙・裸火使用等の制限',
    checkPoint: '指定場所(劇場・百貨店等の舞台・客席・売場等)で喫煙・裸火使用・危険物持込みがされていないか。禁止標識・喫煙所の標識が掲示されているか。',
    legalBasis: [kochi('第23条')],
    note: '対象は劇場等の舞台・客席、百貨店等の売場・展示部分、重要文化財等の建造物の内部・周囲などのうち消防長が指定する場所。標識は地を赤、文字を白(同条第2項)。',
    condition: usage(...U1, '4', '16イ', '16の2', '16の3', '17'),
    severity: 'medium',
  },

  // ===== 危険物・指定可燃物 =====
  {
    id: 'HZ-001',
    category: 'hazmat',
    title: '少量危険物の貯蔵・取扱い',
    checkPoint:
      '容器の転倒・漏れ防止、標識・掲示板、消火器の設置、火気の管理。指定数量以上に達していないか(無許可貯蔵の有無)。',
    legalBasis: [kochi('第30条〜第32条'), law('消防法', '第10条第1項')],
    condition: facility('smallQuantityHazmat'),
    severity: 'high',
  },
  {
    id: 'HZ-002',
    category: 'hazmat',
    title: '指定可燃物の貯蔵・取扱い',
    checkPoint: '集積単位・離隔距離の確保、標識・掲示板、火気の管理、消火設備。',
    legalBasis: [kochi('第33条〜第34条の3')],
    condition: facility('designatedCombustibles'),
    severity: 'medium',
  },

  // ===== 防炎規制 =====
  {
    id: 'FR-001',
    category: 'flameRetardant',
    title: '防炎物品の使用',
    checkPoint: 'カーテン・暗幕・じゅうたん・展示用合板等が防炎性能を有し、防炎ラベルが付されているか。',
    legalBasis: [law('消防法', '第8条の3'), law('消防法施行令', '第4条の3')],
    condition: or(
      usage(...U1, ...U2, ...U3, '4', '5イ', ...U6, '9イ', '12ロ', '16イ', '16の2', '16の3'),
      highRise,
    ),
    severity: 'medium',
    note: '16項イは特定用途部分が対象。工事中の建築物も対象となる場合あり。',
  },
];

// ---------------------------------------------------------------------------
// 表示用ラベル
// ---------------------------------------------------------------------------

export const CATEGORY_LABELS: Record<CheckCategory, string> = {
  fireManagement: '防火管理',
  notification: '届出・報告',
  equipment: '消防用設備等',
  evacuation: '避難施設',
  fireUse: '火気使用設備',
  hazmat: '危険物・指定可燃物',
  flameRetardant: '防炎',
};

export const CATEGORY_ORDER: CheckCategory[] = [
  'fireManagement',
  'notification',
  'equipment',
  'evacuation',
  'fireUse',
  'hazmat',
  'flameRetardant',
];

const ITEM_BY_ID = new Map(CHECKLIST_ITEMS.map((item) => [item.id, item]));

export function getChecklistItem(id: string): ChecklistItem | undefined {
  return ITEM_BY_ID.get(id);
}
