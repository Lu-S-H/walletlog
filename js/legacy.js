// 電腦版「AI記帳」備份檔（schemaVersion 1–4）轉換成錢包日誌的資料格式。
// 轉換規則見 docs/需求規格.md §5。
import { DEFAULT_GROUPS, DEFAULT_INCOME_NAMES, defaultExpenseCategory, defaultIncomeCategory } from './categories.js';
import { defaultSettings } from './store.js';
import { isValidDateStr, isValidMonthStr } from './util.js';

export function isLegacyBackup(obj) {
  return (
    !!obj && typeof obj === 'object' && Number.isInteger(obj.schemaVersion) && obj.schemaVersion <= 4 &&
    Array.isArray(obj.transactions) && !!obj.settings?.categories
  );
}

// 舊資料中「收入＋支出類分類」的紀錄預設轉成退款；以下例外維持收入，改到收入分類（已和使用者確認）
const KEEP_AS_INCOME = [
  { test: (t) => t.category === '刮刮樂', category: '刮刮樂' },
  { test: (t) => /紅包/.test(t.note), category: '紅包禮金' },
  { test: (t) => /麻將/.test(t.note), category: '其他' },
];

const strList = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()) : []);
const uniq = (arr) => [...new Set(arr)];
const withId = (list) => (Array.isArray(list) ? list.filter((r) => r && typeof r === 'object' && typeof r.id === 'string') : []);

/** 回傳 { data, report } 或 { error } */
export function convertLegacy(obj) {
  const s = obj.settings || {};
  const expenseNames = uniq(strList(s.categories?.expense));
  const legacyIncome = uniq(strList(s.categories?.income));
  const disabled = new Set(strList(s.disabledCategories));
  const expenseSet = new Set(expenseNames);
  const legacyIncomeSet = new Set(legacyIncome);

  const report = { total: obj.transactions.length, imported: 0, skipped: 0, toRefund: [], keptIncome: [] };
  const transactions = [];
  const seenIds = new Set();
  obj.transactions.forEach((t, i) => {
    const ok =
      t && typeof t === 'object' && isValidDateStr(t.date) && (t.type === 'expense' || t.type === 'income') &&
      typeof t.amount === 'number' && Number.isFinite(t.amount) && t.amount > 0;
    if (!ok) {
      report.skipped++;
      return;
    }
    let id = typeof t.id === 'string' && t.id ? t.id : `t-legacy-${i}`;
    if (seenIds.has(id)) id = `${id}-${i}`;
    seenIds.add(id);
    const rec = {
      id,
      date: t.date,
      type: t.type,
      category: typeof t.category === 'string' && t.category.trim() ? t.category.trim() : '其他',
      note: typeof t.note === 'string' ? t.note.trim() : '',
      amount: Math.round(t.amount),
      payment: typeof t.payment === 'string' ? t.payment.trim() : '',
      tags: strList(t.tags),
      ts: i, // 保留原本的輸入順序
    };
    if (rec.type === 'income' && expenseSet.has(rec.category) && !legacyIncomeSet.has(rec.category)) {
      const keep = KEEP_AS_INCOME.find((r) => r.test(rec));
      if (keep) {
        report.keptIncome.push({ ...rec, from: rec.category, to: keep.category });
        rec.category = keep.category;
      } else {
        rec.type = 'refund';
        report.toRefund.push(rec);
      }
    }
    transactions.push(rec);
  });
  report.imported = transactions.length;

  // 分類：舊設定的順序與停用狀態；用在明細上但不在清單裡的也補上
  const usedExpense = transactions.filter((t) => t.type !== 'income').map((t) => t.category);
  const usedIncome = transactions.filter((t) => t.type === 'income').map((t) => t.category);
  const expense = uniq([...expenseNames, ...usedExpense]).map((name) => ({ ...defaultExpenseCategory(name), hidden: disabled.has(name) }));
  const income = uniq([...DEFAULT_INCOME_NAMES, ...legacyIncome, ...usedIncome]).map((name) => ({ ...defaultIncomeCategory(name), hidden: disabled.has(name) }));
  const groupNames = new Set(DEFAULT_GROUPS.map((g) => g.name));
  for (const c of expense) if (!groupNames.has(c.group)) c.group = '其他';

  const payments = uniq([...strList(s.payments), ...transactions.map((t) => t.payment).filter(Boolean)]).map((name) => ({ name, hidden: false }));

  const settings = {
    ...defaultSettings(),
    categories: { expense, income },
    payments,
    tags: uniq(transactions.flatMap((t) => t.tags)),
    onboarded: true,
    // 舊備份檔本身就保存了匯入當下的全部資料
    lastBackupAt: new Date().toISOString(),
  };

  const monthlySummaries = (Array.isArray(obj.monthlySummaries) ? obj.monthlySummaries : [])
    .filter((m) => m && isValidMonthStr(m.month) && Number.isFinite(m.expense) && Number.isFinite(m.income))
    .map((m) => ({ month: m.month, expense: m.expense, income: m.income }));

  const data = {
    settings,
    transactions,
    salarySlips: [],
    monthlySummaries,
    fixedExpenses: withId(obj.fixedExpenses),
    installments: withId(obj.installments),
    yearlyExtras: withId(obj.yearlyExtras),
    trips: withId(obj.trips),
    badmintonRecords: withId(obj.badminton?.records),
    badmintonMembers: withId(obj.badminton?.members),
  };
  if (!transactions.length && !monthlySummaries.length) return { error: '這個電腦版備份檔裡沒有可以匯入的明細。' };
  return { data, report };
}
