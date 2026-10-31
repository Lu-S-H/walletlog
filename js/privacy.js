// 彙總金額隱藏（首頁卡片、統計摘要共用）：預設顯示 ****，點一下顯示；App 切到背景就重新隱藏
import { state } from './store.js';
import { fmt } from './util.js';

export const MASK = '****';

let revealed = false;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) revealed = false;
});

export function canHide() {
  return !!state.settings.hideSummary;
}

export function isHidden() {
  return canHide() && !revealed;
}

export function toggleReveal() {
  revealed = !revealed;
}

/** 金額：隱藏時回傳 ****（prefix 例如「+」只在顯示時加上） */
export function money(n, prefix = '') {
  return isHidden() ? MASK : `${prefix}${fmt(n)}`;
}

/** 讓一個區塊可以點一下（或鍵盤 Enter／空白鍵）切換顯示，切換後呼叫 rerender */
export function bindRevealToggle(el, rerender) {
  if (!el || !canHide()) return;
  const toggle = () => {
    toggleReveal();
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
