// 金額隱藏：預設顯示 ****，點一下顯示；App 切到背景就重新隱藏。
// 兩個範圍各自獨立：summary（首頁卡片、統計摘要）、salary（薪資頁），設定裡各有一個開關。
import { state } from './store.js';
import { fmt } from './util.js';

export const MASK = '****';

const SETTING = { summary: 'hideSummary', salary: 'hideSalary' };
const revealed = { summary: false, salary: false };
document.addEventListener('visibilitychange', () => {
  if (document.hidden) for (const k of Object.keys(revealed)) revealed[k] = false;
});

export function canHide(scope = 'summary') {
  return !!state.settings[SETTING[scope]];
}

export function isHidden(scope = 'summary') {
  return canHide(scope) && !revealed[scope];
}

export function toggleReveal(scope = 'summary') {
  revealed[scope] = !revealed[scope];
}

/** 金額：隱藏時回傳 ****（prefix 例如「+」只在顯示時加上） */
export function money(n, prefix = '', scope = 'summary') {
  return isHidden(scope) ? MASK : `${prefix}${fmt(n)}`;
}

/** 讓一個區塊可以點一下（或鍵盤 Enter／空白鍵）切換顯示，切換後呼叫 rerender */
export function bindRevealToggle(el, rerender, scope = 'summary') {
  if (!el || !canHide(scope)) return;
  const toggle = () => {
    toggleReveal(scope);
    rerender();
  };
  el.addEventListener('click', toggle);
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle();
    }
  });
}
