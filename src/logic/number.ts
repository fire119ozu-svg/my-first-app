/** 全角数字・カンマを許容して数値化。空欄・不正値は null */
export function parseNumber(raw: string): number | null {
  const s = raw
    .replace(/[０-９．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[,，\s]/g, '');
  if (s === '' || !/^\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}
