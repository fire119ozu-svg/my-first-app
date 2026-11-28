/**
 * 査察結果通知書等(高知市査察事務処理マニュアルの様式)用の書式。
 */
import type { LegalBasis } from '../types/inspection';

/**
 * 和暦(令和以降。それ以前は平成)。
 * 例:2026-11-27 → 令和8年11月27日
 */
export function toWareki(isoDate: string): string {
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return isoDate;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const reiwa = y > 2019 || (y === 2019 && mo >= 5);
  const era = reiwa ? '令和' : '平成';
  const n = reiwa ? y - 2018 : y - 1988;
  return `${era}${n === 1 ? '元' : n}年${mo}月${d}日`;
}

const SHORT_LAW: Record<LegalBasis['law'], string> = {
  消防法: '法',
  消防法施行令: '令',
  消防法施行規則: '規則',
  高知市火災予防条例: '火災予防条例',
};

/**
 * 根拠法令を様式第5号の書き方にする。
 * 例:[消防法 第8条の3, 消防法施行令 第4条の3] → 「法第8条の3、令第4条の3」
 *     「第6条〜第9条」→「第6条から第9条」
 */
export function formatCitation(list: LegalBasis[]): string {
  return list.map((l) => `${SHORT_LAW[l.law]}${l.article.replace(/〜/g, 'から')}`).join('、');
}

/** 所属から消防署名を取り出す(例:高知市中央消防署庶務予防係 → 高知市中央消防署) */
export function stationOf(department: string): string {
  const m = department.match(/^(.*?消防署)/);
  return m ? m[1] : '';
}
