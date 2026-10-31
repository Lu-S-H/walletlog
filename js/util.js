// ---------- 日期（一律用本地時間的 YYYY-MM-DD 字串；月份用 YYYY-MM） ----------
const pad = (n) => String(n).padStart(2, '0');

export function toDateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayStr() {
  return toDateStr(new Date());
}

export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

export function diffDays(a, b) {
  // b - a，以天為單位
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}

export function isValidDateStr(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return toDateStr(parseDate(s)) === s;
}

export function isValidMonthStr(s) {
  return typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

export function monthOf(dateStr) {
  return dateStr.slice(0, 7);
}

export function thisMonth() {
  return monthOf(todayStr());
}

export function addMonths(month, n) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function daysInMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

export function formatMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return `${y}年${m}月`;
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export function weekdayName(s) {
  return WEEKDAYS[parseDate(s).getDay()];
}

export function formatMonthDay(s) {
  const d = parseDate(s);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function formatShortDate(s) {
  const d = parseDate(s);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 明細的日期標題：今天 / 昨天 / 10月18日，後面接週幾 */
export function dayTitle(s) {
  const n = diffDays(s, todayStr());
  const name = n === 0 ? '今天' : n === 1 ? '昨天' : formatMonthDay(s);
  const y = parseDate(s).getFullYear() !== new Date().getFullYear() ? `${parseDate(s).getFullYear()}年` : '';
  return `${y}${name} 週${weekdayName(s)}`;
}

// ---------- 數字 ----------
export function fmt(n, digits = 0) {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('zh-TW', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** 帶正負號：+280 / −350 / 0 */
export function fmtSigned(n, digits = 0) {
  if (n == null || !Number.isFinite(n)) return '—';
  const r = Number(n.toFixed(digits));
  if (r === 0) return fmt(0, digits);
  return (r > 0 ? '+' : '−') + fmt(Math.abs(r), digits);
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ---------- HTML 樣板（自動跳脫，避免匯入的資料插入程式碼） ----------
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ESC[c]);
}

export function raw(s) {
  return { __html: s };
}

function part(v) {
  if (v == null || v === false) return '';
  if (Array.isArray(v)) return v.map(part).join('');
  if (typeof v === 'object' && '__html' in v) return v.__html;
  return esc(v);
}

export function html(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += part(vals[i]) + strings[i + 1];
  return raw(out);
}

export function setHTML(el, tpl) {
  el.innerHTML = tpl.__html;
}
