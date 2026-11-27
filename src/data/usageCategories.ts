import type { UsageCategory, UsageCategoryInfo } from '../types/inspection';

/** 消防法施行令 別表第一 */
export const USAGE_CATEGORIES: UsageCategoryInfo[] = [
  { code: '1イ', label: '劇場・映画館・演芸場・観覧場', isSpecified: true },
  { code: '1ロ', label: '公会堂・集会場', isSpecified: true },
  { code: '2イ', label: 'キャバレー・カフェー・ナイトクラブ等', isSpecified: true },
  { code: '2ロ', label: '遊技場・ダンスホール', isSpecified: true },
  { code: '2ハ', label: '性風俗関連特殊営業店舗等', isSpecified: true },
  { code: '2ニ', label: 'カラオケボックス・インターネットカフェ等', isSpecified: true },
  { code: '3イ', label: '待合・料理店等', isSpecified: true },
  { code: '3ロ', label: '飲食店', isSpecified: true },
  { code: '4', label: '百貨店・マーケット・物品販売店舗・展示場', isSpecified: true },
  { code: '5イ', label: '旅館・ホテル・宿泊所等', isSpecified: true },
  { code: '5ロ', label: '寄宿舎・下宿・共同住宅', isSpecified: false },
  { code: '6イ(1)', label: '病院(特定診療科・療養病床等あり)', isSpecified: true },
  { code: '6イ(2)', label: '有床診療所(特定診療科あり)', isSpecified: true },
  { code: '6イ(3)', label: '病院・有床診療所((1)(2)以外)', isSpecified: true },
  { code: '6イ(4)', label: '無床診療所・助産所', isSpecified: true },
  { code: '6ロ', label: '要介護・避難困難者入所施設(老人ホーム等)', isSpecified: true },
  { code: '6ハ', label: '老人デイサービス・保育所等', isSpecified: true },
  { code: '6ニ', label: '幼稚園・特別支援学校', isSpecified: true },
  { code: '7', label: '学校', isSpecified: false },
  { code: '8', label: '図書館・博物館・美術館等', isSpecified: false },
  { code: '9イ', label: '公衆浴場(蒸気浴場・熱気浴場等)', isSpecified: true },
  { code: '9ロ', label: '公衆浴場(9イ以外)', isSpecified: false },
  { code: '10', label: '車両の停車場・船舶航空機の発着場', isSpecified: false },
  { code: '11', label: '神社・寺院・教会等', isSpecified: false },
  { code: '12イ', label: '工場・作業場', isSpecified: false },
  { code: '12ロ', label: '映画スタジオ・テレビスタジオ', isSpecified: false },
  { code: '13イ', label: '自動車車庫・駐車場', isSpecified: false },
  { code: '13ロ', label: '飛行機・回転翼航空機の格納庫', isSpecified: false },
  { code: '14', label: '倉庫', isSpecified: false },
  { code: '15', label: '事務所等(前各項以外)', isSpecified: false },
  { code: '16イ', label: '複合用途(特定用途を含む)', isSpecified: true },
  { code: '16ロ', label: '複合用途(16イ以外)', isSpecified: false },
  { code: '16の2', label: '地下街', isSpecified: true },
  { code: '16の3', label: '準地下街', isSpecified: true },
  { code: '17', label: '重要文化財等の建造物', isSpecified: false },
  { code: '18', label: '延長50m以上のアーケード', isSpecified: false },
  { code: '19', label: '市町村長の指定する山林', isSpecified: false },
  { code: '20', label: '総務省令で定める舟車', isSpecified: false },
];

const BY_CODE = new Map(USAGE_CATEGORIES.map((u) => [u.code, u]));

export function getUsageInfo(code: UsageCategory): UsageCategoryInfo {
  const info = BY_CODE.get(code);
  if (!info) throw new Error(`Unknown usage category: ${code}`);
  return info;
}

/** 6項イの全区分(条件記述の簡略化用) */
export const USAGE_6I: UsageCategory[] = ['6イ(1)', '6イ(2)', '6イ(3)', '6イ(4)'];
