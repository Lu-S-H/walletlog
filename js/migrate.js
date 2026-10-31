// 資料整理（每次載入、匯入時執行；可重複執行，沒有要改的就不動）。
// 1. 旅程與固定支出的每筆紀錄補上 id（編輯用），旅程紀錄補上類型（花費／收回）。
// 2. 電腦版「年度額外項目」裡和旅程重複的旅費：花費金額和旅程一致時，把「收回」轉成旅程裡的收回紀錄，
//    並移除這個年度項目，改由旅程即時計算（年度結餘不變）。已和使用者確認（2026-10-31）。
import { toTWD } from './books.js';
import { uid } from './util.js';

export function migrateData(data) {
  let changed = false;
  const withId = (prefix, r) => {
    if (r.id) return r;
    changed = true;
    return { ...r, id: `${prefix}-${uid()}` };
  };

  const trips = (data.trips || []).map((t) => ({
    ...t,
    records: (t.records || []).map((r) => {
      let x = withId('r', r);
      if (!x.kind) {
        changed = true;
        x = { ...x, kind: 'spend' };
      }
      return x;
    }),
  }));

  const fixedExpenses = (data.fixedExpenses || []).map((f) => ({ ...f, records: (f.records || []).map((r) => withId('r', r)) }));

  const yearlyExtras = [];
  for (const x of data.yearlyExtras || []) {
    const y = String(x.year);
    const trip = !x.kind && trips.find((t) => t.name && String(x.name).includes(t.name) && t.records.some((r) => (r.date || '').startsWith(y)));
    if (trip) {
      const recs = trip.records.filter((r) => (r.date || '').startsWith(y));
      const spend = recs.filter((r) => r.kind !== 'back').reduce((s, r) => s + toTWD(r), 0);
      if (spend === Math.round(Number(x.expense) || 0)) {
        const income = Math.round(Number(x.income) || 0);
        if (income > 0) {
          const last = recs.map((r) => r.date).sort().at(-1);
          trip.records.push({ id: `r-${uid()}`, date: last, note: '收回（電腦版年度項目轉入）', currency: 'TWD', amount: income, rate: 1, kind: 'back' });
        }
        changed = true;
        continue; // 不保留這個年度項目
      }
    }
    yearlyExtras.push(x);
  }

  return { data: { ...data, trips, fixedExpenses, yearlyExtras }, changed };
}
