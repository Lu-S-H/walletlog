// IndexedDB 存取。所有資料啟動時一次讀進記憶體，之後每次修改都同步寫回。
const DB_NAME = 'walletlog';
const DB_VERSION = 1;

/** 資料集合與主鍵。固定支出、旅行、羽球等目前先完整保存，畫面在後續階段加入。 */
export const COLLECTIONS = {
  transactions: 'id',
  salarySlips: 'id',
  monthlySummaries: 'month',
  fixedExpenses: 'id',
  installments: 'id',
  yearlyExtras: 'id',
  trips: 'id',
  badmintonRecords: 'id',
  badmintonMembers: 'id',
};
const KV = 'kv';

let dbPromise = null;

function req(r) {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error('交易中止'));
    tx.onerror = () => reject(tx.error);
  });
}

export function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, DB_VERSION);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains(KV)) db.createObjectStore(KV, { keyPath: 'key' });
        for (const [name, keyPath] of Object.entries(COLLECTIONS)) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath });
        }
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.onblocked = () => reject(new Error('資料庫被其他分頁占用，請關閉其他分頁後重試'));
    });
  }
  return dbPromise;
}

export async function loadAll() {
  const db = await openDB();
  const tx = db.transaction([KV, ...Object.keys(COLLECTIONS)], 'readonly');
  const out = {};
  const settingsRec = await req(tx.objectStore(KV).get('settings'));
  out.settings = settingsRec ? settingsRec.value : null;
  for (const name of Object.keys(COLLECTIONS)) {
    out[name] = await req(tx.objectStore(name).getAll());
  }
  return out;
}

/** 在同一個交易裡寫入多筆（例如分類改名時一起更新所有明細） */
export async function putRecords(store, values) {
  const db = await openDB();
  const tx = db.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  for (const v of values) os.put(v);
  return txDone(tx);
}

export function putRecord(store, value) {
  return putRecords(store, [value]);
}

export async function deleteRecord(store, key) {
  const db = await openDB();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(key);
  return txDone(tx);
}

export function putSettings(settings) {
  return putRecord(KV, { key: 'settings', value: settings });
}

/** 整包取代（匯入備份、清除資料）。在同一個交易裡完成，失敗時不會留下一半的資料。 */
export async function replaceAll(data) {
  const db = await openDB();
  const names = [KV, ...Object.keys(COLLECTIONS)];
  const tx = db.transaction(names, 'readwrite');
  for (const name of names) tx.objectStore(name).clear();
  if (data.settings) tx.objectStore(KV).put({ key: 'settings', value: data.settings });
  for (const name of Object.keys(COLLECTIONS)) {
    const store = tx.objectStore(name);
    for (const rec of data[name] || []) store.put(rec);
  }
  return txDone(tx);
}
