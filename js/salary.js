// 薪資單：計算、還沒填的月份、Excel 薪資歷史匯入。薪資單和收支明細完全獨立（不連結、不自動入帳）。
// 規則見 docs/需求規格.md §4.4、§5.2。
import * as store from './store.js';
import { state } from './store.js';
import { addMonths, isValidDateStr, isValidMonthStr, thisMonth, uid } from './util.js';

export const SALARY_CATEGORY = '薪水';

/** 預設項目清單；括號內是常見的別名，顯示在項目旁邊 */
export const DEFAULT_SALARY_ITEMS = {
  earn: ['本薪', '伙食津貼', '免稅加班', '績效獎金', '分潤獎金', '其他'],
  deduct: ['請假扣款', '勞退自提', '福利金', '勞保費', '健保費', '伙食代扣', '其他'],
  bonus: ['績效獎金', '年終獎金', '分潤獎金', '尾牙紅包', '開工紅包', '三節禮金', '其他獎金'],
};
export const ITEM_ALIAS = { 伙食津貼: '餐補', 免稅加班: '加班費', 福利金: '福委會' };

const sum = (list, f = (x) => x) => list.reduce((s, x) => s + (Number(f(x)) || 0), 0);

export function slipTotals(slip) {
  const earn = sum(slip.lines.filter((l) => l.amount > 0), (l) => l.amount);
  const deduct = -sum(slip.lines.filter((l) => l.amount < 0), (l) => l.amount);
  return { earn, deduct, net: earn - deduct };
}

export function slipTitle(slip) {
  return slip.kind === 'bonus' ? slip.title || '獎金' : `${Number(slip.period.slice(5))}月薪資`;
}

/** 含年份的完整名稱：「2026年5月薪資」「2026年6月 三節禮金」 */
export function slipFullName(slip) {
  const [y, m] = slip.period.split('-').map(Number);
  return slip.kind === 'bonus' ? `${y}年${m}月 ${slip.title || '獎金'}` : `${y}年${m}月薪資`;
}

/** 依薪資月份排序（同月份月薪單在前） */
export function sortedSlips() {
  return [...state.salarySlips].sort((a, b) =>
    a.period !== b.period ? (a.period < b.period ? -1 : 1) : a.kind === b.kind ? (a.payDate || '') < (b.payDate || '') ? -1 : 1 : a.kind === 'monthly' ? -1 : 1,
  );
}

/** 上一張月薪單（新增時預先帶入它的項目與金額） */
export function lastMonthlySlip(beforePeriod = '9999-12') {
  const list = sortedSlips().filter((s) => s.kind === 'monthly' && s.period < beforePeriod);
  return list.at(-1) || null;
}

/**
 * 儲存薪資單。薪資單只記錄每月薪資的組成，和收支明細完全獨立：
 * 不新增、不連結、不改動任何明細（發薪時使用者會另外記一筆收入）。已和使用者確認（2026-11-01）。
 */
export function saveSlip(slip) {
  const next = { ...slip, net: slipTotals(slip).net, txId: null };
  store.put('salarySlips', next);
  if (next.payment) store.saveSettings({ salaryPayment: next.payment });
  return next;
}

export function deleteSlip(slip) {
  store.remove('salarySlips', slip.id);
}

/** 還沒填的月薪單：最新一張月薪單之後、到上個月為止的月份。還沒用過薪資功能時回傳空陣列（不提醒） */
export function missingSlipMonths() {
  const last = sortedSlips().filter((s) => s.kind === 'monthly').at(-1);
  if (!last) return [];
  const out = [];
  const end = addMonths(thisMonth(), -1);
  for (let m = addMonths(last.period, 1); m <= end; m = addMonths(m, 1)) out.push(m);
  return out;
}

/** 舊版存薪資單時自動產生的收入明細；改成獨立後保留為一般明細，請使用者確認是否和自己記的重複 */
export function autoSalaryTx() {
  return state.transactions.filter((t) => t.autoSalary);
}

export function clearAutoSalaryFlags() {
  store.putMany('transactions', autoSalaryTx().map((t) => ({ ...t, autoSalary: false })));
}

// ---------- Excel 薪資歷史匯入 ----------
export const IMPORT_APP = 'walletlog-salary';

/** 回傳 { months } 或 { error } */
export function parseSalaryImport(obj) {
  if (!obj || obj.app !== IMPORT_APP || !Array.isArray(obj.months)) return { error: '這不是薪資歷史匯入檔。' };
  const okLine = (l) => l && typeof l.name === 'string' && l.name && Number.isFinite(l.amount);
  for (const m of obj.months) {
    if (!isValidMonthStr(m?.period) || !Array.isArray(m.lines) || !Array.isArray(m.bonus) || !m.lines.every(okLine) || !m.bonus.every(okLine)) {
      return { error: `匯入檔的格式不正確（${m?.period || '月份不明'}）。` };
    }
  }
  return { months: [...obj.months].sort((a, b) => (a.period < b.period ? -1 : 1)) };
}

/**
 * 把 Excel 的月份轉成薪資單：一般項目成為月薪單，績效／分潤等獎金列各自成為獎金單。
 * 不和收支明細對帳（薪資單和明細是獨立的）；已經有的月份會略過。回傳 { slips, skipped }
 */
export function planSalaryImport(months) {
  const exists = (period, kind, title) =>
    state.salarySlips.some((s) => s.period === period && s.kind === kind && (kind === 'monthly' || s.title === title));
  const slips = [];
  let skipped = 0;
  const make = (kind, period, lines, title) => {
    const slip = { id: `s-${uid()}`, kind, period, title: kind === 'bonus' ? title : '', payDate: null, payment: '', lines, note: '', txId: null, source: 'excel' };
    slip.net = slipTotals(slip).net;
    slips.push(slip);
  };
  for (const m of months) {
    const lines = m.lines.filter((l) => l.amount !== 0).map((l) => ({ name: l.name, amount: Math.round(l.amount), ...(l.note ? { note: l.note } : {}) }));
    const bonus = m.bonus.filter((b) => b.amount !== 0).map((b) => ({ name: b.name, amount: Math.round(b.amount) }));
    if (lines.length) {
      if (exists(m.period, 'monthly')) skipped++;
      else make('monthly', m.period, lines, '');
    }
    for (const b of bonus) {
      if (exists(m.period, 'bonus', b.name)) skipped++;
      else make('bonus', m.period, [b], b.name);
    }
  }
  return { slips, skipped };
}

export function applySalaryImport(plan) {
  store.putMany('salarySlips', plan.slips);
}

export function isValidSlip(s) {
  return s && typeof s.id === 'string' && isValidMonthStr(s.period) && (s.payDate == null || isValidDateStr(s.payDate)) && Array.isArray(s.lines);
}
