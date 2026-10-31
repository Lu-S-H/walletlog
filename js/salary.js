// 薪資單：計算、與收入明細的連結（自動入帳）、Excel 薪資歷史匯入的對帳。
// 規則見 docs/需求規格.md §4.4、§5.2。
import * as store from './store.js';
import { state } from './store.js';
import { addMonths, isValidDateStr, isValidMonthStr, uid } from './util.js';

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
 * 可以和這張薪資單連結的收入明細：還沒被其他薪資單連結的「收入」，
 * 日期在薪資月份當月到入帳日之後一個月內；薪水分類、金額相同的排前面。
 */
export function linkCandidates(slip, net) {
  const from = `${slip.period}-01`;
  const toMonth = addMonths(slip.payDate ? slip.payDate.slice(0, 7) : addMonths(slip.period, 1), 1);
  const to = `${toMonth}-31`;
  const score = (t) => (t.amount === net ? 0 : 2) + (t.category === SALARY_CATEGORY ? 0 : 1);
  return state.transactions
    .filter((t) => t.type === 'income' && (!t.salaryId || t.salaryId === slip.id) && t.date >= from && t.date <= to)
    .sort((a, b) => score(a) - score(b) || (a.date < b.date ? -1 : 1));
}

/**
 * 儲存薪資單並同步收入明細：
 * - linkTxId 有值：連結那筆既有明細，金額／日期／入帳方式改成薪資單的；
 * - 否則有入帳日且實領 > 0：新增或更新自動產生的那筆；
 * - 實領 ≤ 0 或沒有入帳日：解除連結（自動產生的那筆會刪除）。
 */
export function saveSlip(slip, { linkTxId = slip.txId } = {}) {
  const { net } = slipTotals(slip);
  const next = { ...slip, net };
  const prev = slip.txId ? state.transactions.find((t) => t.id === slip.txId) : null;
  const target = linkTxId ? state.transactions.find((t) => t.id === linkTxId) : null;

  // 換了連結對象：舊的那筆解除（自動產生的直接刪掉，原本就有的只拿掉連結）
  if (prev && prev.id !== target?.id) {
    if (prev.autoSalary) store.remove('transactions', prev.id);
    else store.put('transactions', { ...prev, salaryId: null });
  }

  if (net > 0 && next.payDate) {
    const base = target || (prev && prev.id === linkTxId ? prev : null);
    const tx = {
      ...(base || {
        id: `t-${uid()}`,
        type: 'income',
        category: SALARY_CATEGORY,
        note: slipTitle(next),
        tags: [],
        ts: Date.now(),
        autoSalary: true,
      }),
      type: 'income',
      date: next.payDate,
      amount: net,
      payment: next.payment || base?.payment || '',
      salaryId: next.id,
    };
    next.txId = tx.id;
    store.put('transactions', tx);
  } else {
    if (target && target.id !== prev?.id) store.put('transactions', { ...target, salaryId: null });
    if (prev && prev.id === target?.id) {
      if (prev.autoSalary) store.remove('transactions', prev.id);
      else store.put('transactions', { ...prev, salaryId: null });
    }
    next.txId = null;
  }
  store.put('salarySlips', next);
  if (next.payment) store.saveSettings({ salaryPayment: next.payment });
  return next;
}

/** 刪除薪資單；withTx = true 時連同連結的收入明細一起刪除，否則只解除連結 */
export function deleteSlip(slip, withTx) {
  const tx = slip.txId ? state.transactions.find((t) => t.id === slip.txId) : null;
  if (tx) {
    if (withTx) store.remove('transactions', tx.id);
    else store.put('transactions', { ...tx, salaryId: null, autoSalary: false });
  }
  store.remove('salarySlips', slip.id);
}

/**
 * 還沒有薪資單的薪水收入：開始使用薪資單之後（最早一張薪資單的入帳日起）入帳、分類是薪水、沒有連結薪資單的收入。
 * 還沒用過薪資功能時回傳空陣列（不提醒）。
 */
export function unlinkedSalaryTx() {
  const firstPay = state.salarySlips.map((s) => s.payDate).filter(Boolean).sort()[0];
  if (!firstPay) return [];
  return state.transactions.filter((t) => t.type === 'income' && t.category === SALARY_CATEGORY && !t.salaryId && t.date >= firstPay);
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
 * 對帳：每個月先找「整欄總額」對得上的收入（獎金和月薪一起入帳），
 * 找不到再分別找月薪與各筆獎金。只看薪資月份當月到之後兩個月內、還沒被連結的收入。
 * 對不到的薪資單不產生收入明細（2024–2025 只有月度彙總，產生明細會重複計算）。
 * 回傳 { slips, links: Map(slipId → txId), skipped, unmatched: [說明] }
 */
export function planSalaryImport(months) {
  const used = new Set(state.transactions.filter((t) => t.salaryId).map((t) => t.id));
  const exists = (period, kind, title) =>
    state.salarySlips.some((s) => s.period === period && s.kind === kind && (kind === 'monthly' || s.title === title));
  const find = (period, amount) => {
    const from = `${period}-01`;
    const to = `${addMonths(period, 2)}-31`;
    const hit = state.transactions
      .filter((t) => t.type === 'income' && !used.has(t.id) && t.amount === amount && t.date >= from && t.date <= to)
      .sort((a, b) => (a.category === SALARY_CATEGORY ? 0 : 1) - (b.category === SALARY_CATEGORY ? 0 : 1) || (a.date < b.date ? -1 : 1))[0];
    if (hit) used.add(hit.id);
    return hit || null;
  };
  const slips = [];
  const links = new Map();
  const unmatched = [];
  let skipped = 0;
  const hasTxAround = (period) => state.transactions.some((t) => t.date >= `${period}-01` && t.date <= `${addMonths(period, 1)}-31`);
  const make = (kind, period, lines, title, tx, note = '') => {
    const slip = { id: `s-${uid()}`, kind, period, title: kind === 'bonus' ? title : '', payDate: tx?.date || null, payment: tx?.payment || '', lines, note, txId: null, source: 'excel' };
    slip.net = slipTotals(slip).net;
    slips.push(slip);
    if (tx) links.set(slip.id, tx.id);
    else if (hasTxAround(period)) unmatched.push(`${slipTitle(slip)}（${period}）${slip.net.toLocaleString('zh-TW')}`);
  };

  for (const m of months) {
    const lines = m.lines.filter((l) => l.amount !== 0).map((l) => ({ name: l.name, amount: Math.round(l.amount), ...(l.note ? { note: l.note } : {}) }));
    const bonus = m.bonus.filter((b) => b.amount !== 0).map((b) => ({ name: b.name, amount: Math.round(b.amount) }));
    const reg = sum(lines, (l) => l.amount);
    const all = reg + sum(bonus, (b) => b.amount);
    if (lines.length && exists(m.period, 'monthly')) {
      skipped++;
    } else if (lines.length && bonus.length) {
      const together = find(m.period, all);
      if (together) make('monthly', m.period, [...lines, ...bonus], '', together);
      else {
        make('monthly', m.period, lines, '', find(m.period, reg));
        for (const b of bonus) {
          if (exists(m.period, 'bonus', b.name)) skipped++;
          else make('bonus', m.period, [b], b.name, find(m.period, b.amount));
        }
      }
      continue;
    } else if (lines.length) {
      make('monthly', m.period, lines, '', find(m.period, reg));
    }
    if (!lines.length) {
      for (const b of bonus) {
        if (exists(m.period, 'bonus', b.name)) skipped++;
        else make('bonus', m.period, [b], b.name, find(m.period, b.amount));
      }
    }
  }
  return { slips, links, skipped, unmatched };
}

/** 套用匯入計畫：寫入薪資單，並在對上的收入明細記錄連結 */
export function applySalaryImport(plan) {
  const slips = plan.slips.map((s) => ({ ...s, txId: plan.links.get(s.id) || null }));
  const txs = slips
    .filter((s) => s.txId)
    .map((s) => ({ ...state.transactions.find((t) => t.id === s.txId), salaryId: s.id }));
  store.putMany('salarySlips', slips);
  store.putMany('transactions', txs);
}

export function isValidSlip(s) {
  return s && typeof s.id === 'string' && isValidMonthStr(s.period) && (s.payDate == null || isValidDateStr(s.payDate)) && Array.isArray(s.lines);
}
