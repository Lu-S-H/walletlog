import { DEFAULT_GROUPS, defaultCategories } from './categories.js';
import * as db from './db.js';
import { COLLECTIONS } from './db.js';

export function defaultSettings() {
  return {
    categories: defaultCategories(), // { expense: [{ name, icon, group, hidden }], income: [{ name, icon, hidden }] }
    groups: DEFAULT_GROUPS.map((g) => ({ ...g })),
    payments: [{ name: '現金', hidden: false }],
    tags: [],
    theme: 'auto', // auto | light | dark
    hideSalary: true,
    hideSummary: true, // 首頁本月支出／收入／結餘／日均預設顯示 ****
    lastPayment: null,
    lastBackupAt: null,
    backupSnoozeUntil: null,
    onboarded: false,
    createdAt: new Date().toISOString(),
  };
}

export const state = { settings: defaultSettings(), rev: 0 };
for (const name of Object.keys(COLLECTIONS)) state[name] = [];

const bus = new EventTarget();

/** 回傳取消訂閱的函式 */
export function onChange(fn) {
  bus.addEventListener('change', fn);
  return () => bus.removeEventListener('change', fn);
}

export function onError(fn) {
  bus.addEventListener('error', (e) => fn(e.detail));
}

function changed() {
  state.rev++;
  bus.dispatchEvent(new Event('change'));
}

function persist(p) {
  p.catch((err) => {
    console.error(err);
    bus.dispatchEvent(new CustomEvent('error', { detail: '儲存失敗：' + (err?.message || err) }));
  });
}

/** 明細依日期、再依建立順序（ts）排列 */
export function compareTx(a, b) {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return (a.ts || 0) - (b.ts || 0);
}

function sortCollections() {
  state.transactions.sort(compareTx);
  state.monthlySummaries.sort((a, b) => (a.month < b.month ? -1 : 1));
}

export async function load() {
  const data = await db.loadAll();
  state.settings = { ...defaultSettings(), ...(data.settings || {}) };
  for (const name of Object.keys(COLLECTIONS)) state[name] = data[name] || [];
  sortCollections();
  changed();
}

export function saveSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  persist(db.putSettings(state.settings));
  changed();
}

/** 新增或更新多筆（依 COLLECTIONS 指定的主鍵判斷） */
export function putMany(collection, records) {
  if (!records.length) return;
  const key = COLLECTIONS[collection];
  const list = state[collection];
  for (const record of records) {
    const i = list.findIndex((r) => r[key] === record[key]);
    if (i >= 0) list[i] = record;
    else list.push(record);
  }
  sortCollections();
  persist(db.putRecords(collection, records));
  changed();
}

export function put(collection, record) {
  putMany(collection, [record]);
  return record;
}

export function remove(collection, keyValue) {
  const key = COLLECTIONS[collection];
  const list = state[collection];
  const i = list.findIndex((r) => r[key] === keyValue);
  if (i < 0) return null;
  const [removed] = list.splice(i, 1);
  persist(db.deleteRecord(collection, keyValue));
  changed();
  return removed;
}

export function snapshot() {
  const out = { settings: state.settings };
  for (const name of Object.keys(COLLECTIONS)) out[name] = state[name];
  return out;
}

/** 整包取代。先寫入資料庫，成功後才更新畫面上的資料。 */
export async function replaceAll(data) {
  await db.replaceAll(data);
  state.settings = { ...defaultSettings(), ...(data.settings || {}) };
  for (const name of Object.keys(COLLECTIONS)) state[name] = [...(data[name] || [])];
  sortCollections();
  changed();
}

export function hasAnyData() {
  return Object.keys(COLLECTIONS).some((name) => state[name].length > 0);
}
