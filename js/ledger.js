// 收支計算。退款從支出扣除、不算收入；固定支出／旅行／羽球是獨立帳，不在這裡計算。
import { groupOf } from './categories.js';
import { state } from './store.js';
import { daysInMonth, monthOf, thisMonth, todayStr } from './util.js';

export function txOfMonth(month) {
  return state.transactions.filter((t) => t.date.startsWith(month));
}

/** { expense: 支出總額, refund: 退款總額, net: 支出−退款, income } */
export function totals(list) {
  let expense = 0;
  let refund = 0;
  let income = 0;
  for (const t of list) {
    if (t.type === 'expense') expense += t.amount;
    else if (t.type === 'refund') refund += t.amount;
    else income += t.amount;
  }
  return { expense, refund, net: expense - refund, income };
}

/** 對支出的影響：支出為正、退款為負、收入為 0 */
export function expenseEffect(t) {
  return t.type === 'expense' ? t.amount : t.type === 'refund' ? -t.amount : 0;
}

/** 當月每天的淨支出（陣列索引 0 = 1 號） */
export function dailyNet(list, month) {
  const out = new Array(daysInMonth(month)).fill(0);
  for (const t of list) out[Number(t.date.slice(8, 10)) - 1] += expenseEffect(t);
  return out;
}

/** 計算日均時的天數：本月算到今天，過去的月份算整個月，未來月份為 0 */
export function elapsedDays(month) {
  const cur = thisMonth();
  if (month < cur) return daysInMonth(month);
  if (month > cur) return 0;
  return Number(todayStr().slice(8, 10));
}

/** 依日期分組（新的日期在前，同一天內依記錄順序） */
export function groupByDay(list) {
  const map = new Map();
  for (const t of list) {
    if (!map.has(t.date)) map.set(t.date, []);
    map.get(t.date).push(t);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, items]) => ({ date, items, net: items.reduce((s, t) => s + expenseEffect(t), 0) }));
}

/** 分類使用次數（支出與退款共用支出分類） */
export function categoryUsage(type) {
  const kind = type === 'income' ? 'income' : 'expense';
  const m = new Map();
  for (const t of state.transactions) {
    if ((t.type === 'income' ? 'income' : 'expense') !== kind) continue;
    m.set(t.category, (m.get(t.category) || 0) + 1);
  }
  return m;
}

export function paymentUsage() {
  const m = new Map();
  for (const t of state.transactions) if (t.payment) m.set(t.payment, (m.get(t.payment) || 0) + 1);
  return m;
}

export function tagUsage() {
  const m = new Map();
  for (const t of state.transactions) for (const tag of t.tags || []) m.set(tag, (m.get(tag) || 0) + 1);
  return m;
}

/** 依使用次數排序（次數相同時維持原本順序） */
export function sortByUsage(items, usage, key = (x) => x.name) {
  return items
    .map((x, i) => ({ x, i, n: usage.get(key(x)) || 0 }))
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .map((o) => o.x);
}

// ---------- 備註自動完成 ----------
let noteCache = { rev: -1, notes: [] };

/** 所有備註：[{ note, count, byType: { expense: { last, cats: Map(分類 → 最近一筆) } } }]，依次數排序 */
function noteIndex() {
  if (noteCache.rev === state.rev) return noteCache.notes;
  const m = new Map();
  for (const t of state.transactions) {
    const note = (t.note || '').trim();
    if (!note) continue;
    let e = m.get(note);
    if (!e) m.set(note, (e = { note, count: 0, byType: {} }));
    e.count++;
    const u = (e.byType[t.type] ||= { last: null, cats: new Map() });
    // 明細已依日期排序，最後一筆就是最近一次
    u.last = t;
    u.cats.set(t.category, t);
  }
  noteCache = { rev: state.rev, notes: [...m.values()].sort((a, b) => b.count - a.count) };
  return noteCache.notes;
}

/** 輸入中的備註建議：開頭相符優先，其次包含；同類型用過的優先 */
export function suggestNotes(query, type, limit = 8) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const starts = [];
  const contains = [];
  for (const e of noteIndex()) {
    const n = e.note.toLowerCase();
    if (n === q) continue;
    if (n.startsWith(q)) starts.push(e);
    else if (n.includes(q)) contains.push(e);
  }
  const usedHere = (e) => (e.byType[type] ? 0 : 1);
  const order = (a, b) => usedHere(a) - usedHere(b) || b.count - a.count;
  return [...starts.sort(order), ...contains.sort(order)].slice(0, limit);
}

// ---------- 依時間猜餐別 ----------
const MEAL_SLOTS = [
  // [開始時間（分鐘）, 分類]；null 代表非用餐時段
  [0, '宵夜'], [4 * 60, '早餐'], [10 * 60 + 30, '午餐'], [14 * 60 + 30, null], [17 * 60, '晚餐'], [21 * 60 + 30, '宵夜'],
];
const MEAL_NAMES = new Set(MEAL_SLOTS.map((m) => m[1]).filter(Boolean));

/** 現在時段對應的餐別：4:00 早餐、10:30 午餐、14:30 非用餐、17:00 晚餐、21:30 宵夜 */
export function mealByTime(d = new Date()) {
  const min = d.getHours() * 60 + d.getMinutes();
  let meal = null;
  for (const [start, cat] of MEAL_SLOTS) if (min >= start) meal = cat;
  return meal;
}

/**
 * 選了某個備註時要帶入的那一筆（取它的分類與付款方式）。
 * 預設是這個備註上次用在同類型時的紀錄；但如果這個備註用在兩種以上的餐別（例如 seven 早午晚餐都有），
 * 且過去用過現在時段的餐別，就改帶入那個餐別最近一次的紀錄。
 */
export function lastUseOfNote(note, type, now = new Date()) {
  const u = noteIndex().find((x) => x.note === note.trim())?.byType[type];
  if (!u) return null;
  const meal = mealByTime(now);
  const mealsUsed = [...u.cats.keys()].filter((c) => MEAL_NAMES.has(c));
  if (meal && mealsUsed.length >= 2 && u.cats.has(meal)) return u.cats.get(meal);
  return u.last;
}

export function monthsWithData() {
  return new Set(state.transactions.map((t) => monthOf(t.date)));
}

// ---------- 統計 ----------
/** 期間內的明細：period = { mode: 'month', month } 或 { mode: 'year', year } */
export function txOfPeriod(period) {
  return period.mode === 'year' ? state.transactions.filter((t) => t.date.startsWith(period.year)) : txOfMonth(period.month);
}

/** 各分類的淨支出（支出−退款）：[{ name, net, count, items }]，依淨支出由大到小 */
export function categoryTotals(list) {
  const m = new Map();
  for (const t of list) {
    if (t.type === 'income') continue;
    let e = m.get(t.category);
    if (!e) m.set(t.category, (e = { name: t.category, net: 0, count: 0, items: [] }));
    e.net += expenseEffect(t);
    e.count++;
    e.items.push(t);
  }
  return [...m.values()].sort((a, b) => b.net - a.net);
}

/** 依大類彙總：[{ name, net, count, cats: [分類彙總] }]，依淨支出由大到小 */
export function groupTotals(cats) {
  const s = state.settings;
  const m = new Map();
  for (const c of cats) {
    const g = groupOf(s, c.name);
    let e = m.get(g);
    if (!e) m.set(g, (e = { name: g, net: 0, count: 0, cats: [] }));
    e.net += c.net;
    e.count += c.count;
    e.cats.push(c);
  }
  return [...m.values()].sort((a, b) => b.net - a.net);
}

/** 依備註彙總（常見項目）：[{ note, net, count }] */
export function noteTotals(items) {
  const m = new Map();
  for (const t of items) {
    const note = (t.note || '').trim() || '（無備註）';
    let e = m.get(note);
    if (!e) m.set(note, (e = { note, net: 0, count: 0 }));
    e.net += expenseEffect(t);
    e.count++;
  }
  return [...m.values()].sort((a, b) => b.count - a.count || b.net - a.net);
}

/** 依標籤彙總淨支出與收入：[{ tag, net, income, count }] */
export function tagTotals(list) {
  const m = new Map();
  for (const t of list) {
    for (const tag of t.tags || []) {
      let e = m.get(tag);
      if (!e) m.set(tag, (e = { tag, net: 0, income: 0, count: 0 }));
      if (t.type === 'income') e.income += t.amount;
      else e.net += expenseEffect(t);
      e.count++;
    }
  }
  return [...m.values()].sort((a, b) => b.net - a.net || b.count - a.count);
}

/** 某月的支出（淨）與收入：有明細用明細，沒有明細時用電腦版匯入的月度彙總；都沒有回傳 null */
export function monthTotals(month) {
  const list = txOfMonth(month);
  if (list.length) {
    const t = totals(list);
    return { net: t.net, income: t.income, source: 'tx' };
  }
  const sm = state.monthlySummaries.find((x) => x.month === month);
  return sm ? { net: sm.expense, income: sm.income, source: 'summary' } : null;
}

/** 一年 12 個月的收支（沒有資料的月份為 null） */
export function yearSeries(year) {
  return Array.from({ length: 12 }, (_, i) => {
    const month = `${year}-${String(i + 1).padStart(2, '0')}`;
    return { month, ...(monthTotals(month) || { net: null, income: null, source: null }) };
  });
}

export function sumSeries(series) {
  const has = series.filter((m) => m.source);
  return {
    net: has.reduce((s, m) => s + m.net, 0),
    income: has.reduce((s, m) => s + m.income, 0),
    months: has.length,
    summaryMonths: has.filter((m) => m.source === 'summary').length,
  };
}

/** 有資料的年份（含月度彙總），由舊到新，並包含今年 */
export function dataYears() {
  const ys = new Set([todayStr().slice(0, 4)]);
  for (const t of state.transactions) ys.add(t.date.slice(0, 4));
  for (const m of state.monthlySummaries) ys.add(m.month.slice(0, 4));
  return [...ys].sort();
}
