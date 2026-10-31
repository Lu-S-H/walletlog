// 預設分類、大類與圖示。分類一律以名稱（字串）存在明細上，改名時由設定頁同步更新所有明細。

export const DEFAULT_GROUPS = [
  { name: '飲食', icon: '🍽️' },
  { name: '交通', icon: '🚇' },
  { name: '休閒娛樂', icon: '🏸' },
  { name: '購物', icon: '🛍️' },
  { name: '生活必要', icon: '🏠' },
  { name: '人情', icon: '🎁' },
  { name: '其他', icon: '🗂️' },
];

// [名稱, 圖示, 大類]
const EXPENSE = [
  ['早餐', '🍳', '飲食'], ['午餐', '🍱', '飲食'], ['晚餐', '🍜', '飲食'], ['宵夜', '🌙', '飲食'],
  ['飲料', '🧋', '飲食'], ['咖啡廳', '☕', '飲食'], ['點心零嘴', '🍪', '飲食'], ['食材', '🥬', '飲食'],
  ['聚餐', '🍻', '飲食'], ['水', '💧', '飲食'],
  ['交通', '🚇', '交通'], ['汽機車', '🛵', '交通'],
  ['運動', '🏸', '休閒娛樂'], ['娛樂', '🎤', '休閒娛樂'], ['旅遊', '🧳', '休閒娛樂'], ['刮刮樂', '🎫', '休閒娛樂'],
  ['服飾', '👕', '購物'], ['網購', '📦', '購物'], ['文具', '✏️', '購物'], ['居家生活', '🧺', '購物'],
  ['必要開銷', '📱', '生活必要'], ['醫療', '💊', '生活必要'], ['理容', '💈', '生活必要'], ['分期', '💳', '生活必要'],
  ['送禮請客', '🎁', '人情'],
  ['其他', '🧾', '其他'],
];

// [名稱, 圖示]
const INCOME = [
  ['薪水', '💰'], ['零用錢', '🪙'], ['刮刮樂', '🎫'], ['紅包禮金', '🧧'], ['其他', '🧾'],
];

export const FALLBACK_ICON = '🏷️';
export const FALLBACK_GROUP = '其他';

export const TYPE_LABEL = { expense: '支出', income: '收入', refund: '退款' };

export function defaultExpenseCategory(name) {
  const hit = EXPENSE.find((c) => c[0] === name);
  return { name, icon: hit ? hit[1] : FALLBACK_ICON, group: hit ? hit[2] : FALLBACK_GROUP, hidden: false };
}

export function defaultIncomeCategory(name) {
  const hit = INCOME.find((c) => c[0] === name);
  return { name, icon: hit ? hit[1] : FALLBACK_ICON, hidden: false };
}

export function defaultCategories() {
  return {
    expense: EXPENSE.map(([name]) => defaultExpenseCategory(name)),
    income: INCOME.map(([name]) => defaultIncomeCategory(name)),
  };
}

export const DEFAULT_INCOME_NAMES = INCOME.map((c) => c[0]);

/** 退款使用支出分類 */
export function catKind(type) {
  return type === 'income' ? 'income' : 'expense';
}

export function findCat(settings, type, name) {
  return settings.categories[catKind(type)].find((c) => c.name === name) || null;
}

export function catIcon(settings, type, name) {
  return findCat(settings, type, name)?.icon || FALLBACK_ICON;
}

export function groupOf(settings, name) {
  return settings.categories.expense.find((c) => c.name === name)?.group || FALLBACK_GROUP;
}

export function groupIcon(settings, name) {
  return settings.groups.find((g) => g.name === name)?.icon || FALLBACK_ICON;
}
