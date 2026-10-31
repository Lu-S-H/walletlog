// 匯出／匯入備份
import { groupOf, TYPE_LABEL } from './categories.js';
import { APP_NAME, BACKUP_REMIND_DAYS } from './config.js';
import { COLLECTIONS } from './db.js';
import { convertLegacy, isLegacyBackup } from './legacy.js';
import * as store from './store.js';
import { state } from './store.js';
import { alertMsg, dialog, toast } from './ui.js';
import { diffDays, fmt, isValidDateStr, toDateStr, todayStr } from './util.js';

const APP_ID = 'walletlog';
const FORMAT = 1;

/** ISO 時間轉成本地日期（避免 UTC 與台灣時間差 8 小時造成日期錯一天） */
const localDate = (iso) => toDateStr(new Date(iso));

// ---------- 備份提醒 ----------
/** 需要提醒時回傳 { days, never }，否則回傳 null */
export function backupReminder() {
  if (!state.transactions.length) return null;
  const s = state.settings;
  const today = todayStr();
  if (s.backupSnoozeUntil && today < s.backupSnoozeUntil) return null;
  if (!s.lastBackupAt) {
    const days = diffDays(localDate(s.createdAt), today);
    return days >= 3 ? { days, never: true } : null;
  }
  const days = diffDays(localDate(s.lastBackupAt), today);
  return days >= BACKUP_REMIND_DAYS ? { days, never: false } : null;
}

export function snoozeBackupReminder() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  store.saveSettings({ backupSnoozeUntil: toDateStr(d) });
}

export function lastBackupText() {
  const last = state.settings.lastBackupAt;
  if (!last) return '還沒有備份過';
  const days = diffDays(localDate(last), todayStr());
  return days === 0 ? '今天' : `${days} 天前`;
}

// ---------- 分享／下載檔案 ----------
async function deliverFiles(files) {
  if (navigator.canShare && navigator.canShare({ files })) {
    try {
      await navigator.share({ files });
      return true;
    } catch (err) {
      if (err.name === 'AbortError') return false; // 使用者取消
      // 其他錯誤改用下載
    }
  }
  for (const f of files) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(f);
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }
  return true;
}

export async function exportBackup() {
  const payload = { app: APP_ID, format: FORMAT, appName: APP_NAME, exportedAt: new Date().toISOString(), data: store.snapshot() };
  const name = `${APP_NAME}備份-${todayStr()}.json`;
  const file = new File([JSON.stringify(payload)], name, { type: 'application/json' });
  const ok = await deliverFiles([file]);
  if (ok) {
    store.saveSettings({ lastBackupAt: new Date().toISOString(), backupSnoozeUntil: null });
    toast('已匯出備份檔');
  }
  return ok;
}

// ---------- CSV（可以用 Excel 開，不能用來還原） ----------
function csv(rows) {
  const cell = (v) => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
}

export async function exportCSV() {
  if (!state.transactions.length) {
    await alertMsg('還沒有資料', '先記幾筆帳，再來匯出。');
    return;
  }
  const s = state.settings;
  const rows = [
    ['日期', '類型', '分類', '大類', '備註', '金額', '付款方式', '標籤'],
    ...state.transactions.map((t) => [
      t.date, TYPE_LABEL[t.type], t.category, t.type === 'income' ? '' : groupOf(s, t.category),
      t.note, t.type === 'expense' ? -t.amount : t.amount, t.payment, (t.tags || []).join(' '),
    ]),
  ];
  await deliverFiles([new File([csv(rows)], `${APP_NAME}-明細-${todayStr()}.csv`, { type: 'text/csv' })]);
}

// ---------- 匯入 ----------
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isStr = (v) => typeof v === 'string' && v.length > 0;
const isText = (v) => typeof v === 'string';

const RULES = {
  transactions: ['明細', {
    id: isStr, date: isValidDateStr, type: (v) => ['expense', 'income', 'refund'].includes(v),
    category: isStr, note: isText, amount: (v) => isNum(v) && v > 0, payment: isText, tags: Array.isArray,
  }],
  salarySlips: ['薪資單', { id: isStr }],
  monthlySummaries: ['月度彙總', { month: isStr, expense: isNum, income: isNum }],
  fixedExpenses: ['固定支出', { id: isStr }],
  installments: ['分期付款', { id: isStr }],
  yearlyExtras: ['年度額外項目', { id: isStr }],
  trips: ['旅行', { id: isStr }],
  badmintonRecords: ['羽球收支', { id: isStr }],
  badmintonMembers: ['羽球會員', { id: isStr }],
};
const FIELD_NAMES = { id: '編號', date: '日期', type: '類型', category: '分類', note: '備註', amount: '金額', payment: '付款方式', tags: '標籤', month: '月份', expense: '支出', income: '收入' };

/** 回傳 { data, info } 或 { error: '白話的錯誤說明' }；info.legacy 有值代表是電腦版備份 */
export function validateBackup(text) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    return { error: '檔案內容無法讀取，可能不是備份檔，或檔案已損壞。' };
  }
  if (isLegacyBackup(obj)) {
    const res = convertLegacy(obj);
    if (res.error) return res;
    return { data: res.data, info: { exportedAt: obj.meta?.exportedAt || null, legacy: res.report } };
  }
  if (!obj || typeof obj !== 'object' || obj.app !== APP_ID || !obj.data) {
    return { error: `這不是「${APP_NAME}」或電腦版「AI記帳」的備份檔。請選擇檔名像「${APP_NAME}備份-日期.json」的檔案。` };
  }
  if (obj.format > FORMAT) return { error: '這個備份檔來自較新版本的 App，請先更新 App 再匯入。' };
  const data = obj.data;
  const s = data.settings;
  if (!s || typeof s !== 'object' || !Array.isArray(s.categories?.expense) || !Array.isArray(s.categories?.income) || !Array.isArray(s.payments)) {
    return { error: '備份檔缺少設定資料，可能已損壞。' };
  }
  const problems = [];
  for (const [name, [label, rules]] of Object.entries(RULES)) {
    const list = data[name] ?? [];
    if (!Array.isArray(list)) {
      problems.push(`「${label}」的格式不正確`);
      continue;
    }
    list.forEach((rec, i) => {
      if (!rec || typeof rec !== 'object') {
        problems.push(`第 ${i + 1} 筆${label}是空的`);
        return;
      }
      for (const [field, ok] of Object.entries(rules)) {
        if (!ok(rec[field])) problems.push(`第 ${i + 1} 筆${label}的「${FIELD_NAMES[field] || field}」不正確`);
      }
    });
    const key = COLLECTIONS[name];
    const keys = new Set(list.map((r) => r?.[key]));
    if (keys.size !== list.length) problems.push(`「${label}」有重複的資料`);
  }
  if (problems.length) {
    const more = problems.length > 4 ? `……等共 ${problems.length} 個問題` : '';
    return { error: `備份檔裡有資料不正確：${problems.slice(0, 4).join('、')}${more}。` };
  }
  const clean = { settings: s };
  for (const name of Object.keys(COLLECTIONS)) clean[name] = data[name] ?? [];
  return { data: clean, info: { exportedAt: obj.exportedAt } };
}

function summaryLines(d) {
  const lines = [`${fmt(d.transactions.length)} 筆明細`];
  if (d.salarySlips.length) lines.push(`${fmt(d.salarySlips.length)} 張薪資單`);
  if (d.monthlySummaries.length) lines.push(`${fmt(d.monthlySummaries.length)} 個月的月度彙總`);
  if (d.fixedExpenses.length) lines.push(`${fmt(d.fixedExpenses.length)} 個固定支出項目`);
  if (d.trips.length) lines.push(`${fmt(d.trips.length)} 個旅程`);
  if (d.badmintonRecords.length || d.badmintonMembers.length) lines.push(`羽球收支 ${fmt(d.badmintonRecords.length)} 筆、會員 ${fmt(d.badmintonMembers.length)} 人`);
  if (d.yearlyExtras.length) lines.push(`${fmt(d.yearlyExtras.length)} 個年度額外項目`);
  return lines.join('、');
}

export async function importBackupFile(file) {
  let text;
  try {
    text = await file.text();
  } catch {
    await alertMsg('無法讀取檔案', '請確認檔案沒有損壞後再試一次。手機上的資料沒有任何變動。');
    return false;
  }
  const res = validateBackup(text);
  if (res.error) {
    await alertMsg('無法匯入', [res.error, '手機上的資料沒有任何變動。']);
    return false;
  }
  const d = res.data;
  const legacy = res.info.legacy;
  const when = res.info.exportedAt ? new Date(res.info.exportedAt).toLocaleString('zh-TW', { dateStyle: 'medium', timeStyle: 'short' }) : '不明';
  const message = [`備份時間：${when}`, `包含 ${summaryLines(d)}。`];
  if (legacy) {
    const refundSum = legacy.toRefund.reduce((s, t) => s + t.amount, 0);
    if (legacy.toRefund.length) message.push(`${legacy.toRefund.length} 筆掛在支出分類的收入會轉成「退款」（共 ${fmt(refundSum)} 元）。`);
    if (legacy.keptIncome.length) {
      const kinds = new Map();
      for (const t of legacy.keptIncome) {
        const k = `${t.note || t.from} → ${t.to}`;
        kinds.set(k, (kinds.get(k) || 0) + 1);
      }
      const list = [...kinds].map(([k, n]) => (n > 1 ? k.replace(' →', ` ×${n} →`) : k)).join('、');
      message.push(`${legacy.keptIncome.length} 筆維持收入，改到收入分類：${list}。`);
    }
    if (legacy.skipped) message.push(`有 ${legacy.skipped} 筆資料不完整，不會匯入。`);
  }
  if (store.hasAnyData()) message.push('匯入後，手機上目前的資料會被這個備份「完全取代」。');
  const ok = await dialog({
    title: legacy ? '匯入電腦版 AI記帳 資料？' : '從備份檔還原？',
    message,
    buttons: [
      { label: '取消', value: false, role: 'cancel' },
      { label: legacy ? '匯入' : '還原', value: true, role: store.hasAnyData() ? 'destructive' : 'default' },
    ],
  });
  if (!ok) return false;
  try {
    // 備份檔本身就代表已備份到這個時間點
    if (!legacy) d.settings = { ...d.settings, lastBackupAt: res.info.exportedAt || d.settings.lastBackupAt || null };
    d.settings = { ...d.settings, onboarded: true };
    await store.replaceAll(d);
    toast(legacy ? '已匯入電腦版資料' : '已從備份檔還原');
    return true;
  } catch (err) {
    await alertMsg('匯入失敗', [`原因：${err?.message || err}`, '手機上的資料沒有任何變動。']);
    return false;
  }
}

export function pickBackupFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.addEventListener('change', () => {
    const f = input.files?.[0];
    if (f) importBackupFile(f);
  });
  input.click();
}
