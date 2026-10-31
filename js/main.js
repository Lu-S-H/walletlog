import * as store from './store.js';
import { state } from './store.js';
import { icon } from './icons.js';
import { toast } from './ui.js';
import { html, setHTML, thisMonth, todayStr } from './util.js';
import { openAddSheet } from './views/add.js';
import { currentMonth, renderList } from './views/list.js';
import { renderMore } from './views/more.js';
import { renderOnboarding } from './views/onboarding.js';
import { renderSalary, renderStats } from './views/placeholder.js';

const TABS = {
  list: { label: '明細', icon: 'list', render: renderList },
  stats: { label: '統計', icon: 'stats', render: renderStats },
  salary: { label: '薪資', icon: 'wallet', render: renderSalary },
  more: { label: '更多', icon: 'more', render: renderMore },
};

const THEME_COLOR = { light: '#F4F4EF', dark: '#0B0B0C' };

const appEl = document.getElementById('app');
const onbEl = document.getElementById('onb');
const viewEl = document.getElementById('view');
const bannerEl = document.getElementById('top-banner');
const tabbarEl = document.getElementById('tabbar');

let waitingWorker = null;

/** 網址 #more/settings → { tab: 'more', sub: 'settings' } */
function route() {
  const [tab, ...rest] = location.hash.slice(1).split('/');
  return TABS[tab] ? { tab, sub: rest.join('/') } : { tab: 'list', sub: '' };
}

function applyTheme() {
  const t = state.settings.theme;
  const root = document.documentElement;
  if (t === 'light' || t === 'dark') root.dataset.theme = t;
  else delete root.dataset.theme;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    const scheme = m.media.includes('dark') ? 'dark' : 'light';
    m.content = THEME_COLOR[t === 'light' || t === 'dark' ? t : scheme];
  });
}

function renderTabbar() {
  const cur = route().tab;
  const tab = (k) =>
    html`<button type="button" class="tab" data-tab="${k}" ${k === cur ? 'aria-current="page"' : ''}>${icon(TABS[k].icon)}<span>${TABS[k].label}</span></button>`;
  setHTML(
    tabbarEl,
    html`${tab('list')}${tab('stats')}
      <div class="tab-add"><button type="button" data-add aria-label="記一筆">${icon('plus')}</button></div>
      ${tab('salary')}${tab('more')}`,
  );
}

function renderBanner() {
  setHTML(
    bannerEl,
    waitingWorker
      ? html`<div class="banner" role="status">
          <div class="grow"><div>有新版本</div><div class="note">更新只會換掉程式，你的資料不會受影響。</div></div>
          <button type="button" class="link strong" data-update>更新</button>
        </div>`
      : html``,
  );
}

function render() {
  applyTheme();
  if (!state.settings.onboarded) {
    appEl.hidden = true;
    onbEl.hidden = false;
    renderOnboarding(onbEl);
    return;
  }
  onbEl.hidden = true;
  onbEl.innerHTML = '';
  appEl.hidden = false;
  renderTabbar();
  renderBanner();
  const { tab, sub } = route();
  TABS[tab].render(viewEl, sub);
}

let pending = false;
function scheduleRender() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    render();
  });
}

tabbarEl.addEventListener('click', (e) => {
  if (e.target.closest('[data-add]')) {
    // 在明細頁看其他月份時，預設記在那個月的 1 號（看本月時是今天）
    const m = route().tab === 'list' ? currentMonth() : thisMonth();
    openAddSheet({ date: m === thisMonth() ? todayStr() : `${m}-01` });
    return;
  }
  const t = e.target.closest('[data-tab]')?.dataset.tab;
  if (!t) return;
  if (t === route().tab && !route().sub) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  location.hash = t;
});

window.addEventListener('hashchange', () => {
  window.scrollTo(0, 0);
  render();
});

bannerEl.addEventListener('click', (e) => {
  if (e.target.closest('[data-update]') && waitingWorker) {
    updateRequested = true;
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  }
});

// ---------- 新版本偵測 ----------
let updateRequested = false;
let registration = null;

async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    registration = await navigator.serviceWorker.register('sw.js');
  } catch (err) {
    console.warn('Service worker 註冊失敗', err);
    return;
  }
  if (!registration) return;
  const onWaiting = (w) => {
    waitingWorker = w;
    if (state.settings.onboarded) renderBanner();
  };
  if (registration.waiting && navigator.serviceWorker.controller) onWaiting(registration.waiting);
  registration.addEventListener('updatefound', () => {
    const nw = registration.installing;
    nw?.addEventListener('statechange', () => {
      if (nw.state === 'installed' && navigator.serviceWorker.controller) onWaiting(nw);
    });
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updateRequested) location.reload();
  });
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  registration?.update().catch(() => {});
  // 隔夜打開時，「今天」要換成新的日期
  if (state.settings.onboarded) scheduleRender();
});

// ---------- 啟動 ----------
async function boot() {
  try {
    await store.load();
  } catch (err) {
    console.error(err);
    onbEl.hidden = false;
    appEl.hidden = true;
    setHTML(
      onbEl,
      html`<div class="onb"><h1>無法開啟資料</h1>
        <p>這個瀏覽器無法儲存資料（可能是無痕模式，或儲存空間不足）。請用一般模式的 Safari 開啟，或從主畫面的 App 開啟。</p>
        <p class="note">錯誤訊息：${err?.message || String(err)}</p></div>`,
    );
    return;
  }
  store.onChange(scheduleRender);
  store.onError((msg) => toast(msg));
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
  render();
  // 請求「持續保存」，降低資料被系統清除的機會
  navigator.storage?.persist?.().catch(() => {});
  registerSW();
}

boot();
