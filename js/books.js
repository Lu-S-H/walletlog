// 獨立帳（固定支出、旅行、羽球）的計算。這些都不計入每月收支，只在年度結餘合併（見 ledger.yearExtras）。

export const CURRENCIES = [
  ['TWD', '新台幣'], ['JPY', '日圓'], ['USD', '美元'], ['EUR', '歐元'], ['KRW', '韓元'], ['THB', '泰銖'],
  ['HKD', '港幣'], ['CNY', '人民幣'], ['SGD', '新加坡幣'], ['MYR', '馬幣'], ['VND', '越南盾'],
];
export const currencyName = (c) => CURRENCIES.find((x) => x[0] === c)?.[1] || c;

const inYear = (d, year) => !year || (typeof d === 'string' && d.startsWith(String(year)));
const sum = (list, f) => list.reduce((s, x) => s + (Number(f(x)) || 0), 0);

/** 旅程紀錄換算成台幣（台幣匯率固定 1） */
export function toTWD(r) {
  return Math.round((Number(r.amount) || 0) * (r.currency === 'TWD' || !r.currency ? 1 : Number(r.rate) || 0));
}

/**
 * 旅程合計（台幣）：spend 花費、back 收回（朋友還錢、補助）、net 淨額＝花費−收回；
 * byCurrency：各幣別的外幣小計與台幣；year 有值時只算那一年的紀錄。
 */
export function tripTotals(trip, year = null) {
  const recs = (trip.records || []).filter((r) => inYear(r.date, year));
  let spend = 0;
  let back = 0;
  const byCurrency = new Map();
  for (const r of recs) {
    const v = toTWD(r);
    const isBack = r.kind === 'back';
    if (isBack) back += v;
    else spend += v;
    const cur = r.currency || 'TWD';
    const c = byCurrency.get(cur) || { spend: 0, back: 0, twd: 0 };
    if (isBack) c.back += Number(r.amount) || 0;
    else c.spend += Number(r.amount) || 0;
    c.twd += isBack ? -v : v;
    byCurrency.set(cur, c);
  }
  const dates = recs.map((r) => r.date).filter(Boolean).sort();
  return { spend, back, net: spend - back, count: recs.length, byCurrency, from: dates[0] || null, to: dates.at(-1) || null };
}

/** 固定支出項目合計：total、count、last（最近一筆日期） */
export function fixedTotals(item, year = null) {
  const recs = (item.records || []).filter((r) => inYear(r.date, year));
  const dates = recs.map((r) => r.date).filter(Boolean).sort();
  return { total: sum(recs, (r) => r.amount), count: recs.length, last: dates.at(-1) || null };
}

/** 羽球收支合計 */
export function badmintonTotals(records, year = null) {
  const recs = records.filter((r) => inYear(r.date, year));
  const income = sum(recs, (r) => r.income);
  const expense = sum(recs, (r) => r.expense);
  return { income, expense, net: income - expense, count: recs.length };
}

/** 依日期排序並加上累計結餘（由舊到新） */
export function withBalance(records) {
  let bal = 0;
  return [...records]
    .sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : (a.ts || 0) - (b.ts || 0)))
    .map((r) => ({ ...r, balance: (bal += (Number(r.income) || 0) - (Number(r.expense) || 0)) }));
}
