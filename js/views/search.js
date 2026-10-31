// 搜尋與篩選：關鍵字（備註／分類／標籤）、類型、分類、付款方式、標籤、年份
import { TYPE_LABEL } from '../categories.js';
import { icon } from '../icons.js';
import { groupByDay, totals } from '../ledger.js';
import * as store from '../store.js';
import { state } from '../store.js';
import { openSheet } from '../ui.js';
import { dayTitle, fmt, html, setHTML } from '../util.js';
import { allTags } from './tags.js';
import { bindTxRows, txRow } from './txrow.js';

const SHOW_MAX = 300;
const ALL = '';

export function openSearch() {
  const f = { q: '', type: ALL, category: ALL, payment: ALL, tag: ALL, year: ALL };
  let unsubscribe = () => {};
  const sheet = openSheet({
    title: '搜尋',
    left: { label: '關閉', onClick: () => sheet.close() },
    onClose: () => unsubscribe(),
    render: (body) => {
      const s = state.settings;
      const years = [...new Set(state.transactions.map((t) => t.date.slice(0, 4)))].sort().reverse();
      const catNames = [...new Set([...s.categories.expense, ...s.categories.income].map((c) => c.name))];
      const sel = (key, label, options) =>
        html`<label class="filter-sel"><span class="visually-hidden">${label}</span>
          <select data-f="${key}"><option value="">${label}</option>${options.map(([v, t]) => html`<option value="${v}">${t}</option>`)}</select></label>`;
      setHTML(
        body,
        html`<div class="search">${icon('search')}
            <input type="search" data-f="q" placeholder="備註、分類或標籤" autocomplete="off" aria-label="關鍵字" data-autofocus></div>
          <div class="filters">
            ${sel('type', '全部類型', Object.entries(TYPE_LABEL))}
            ${sel('category', '全部分類', catNames.map((n) => [n, n]))}
            ${sel('payment', '全部付款方式', s.payments.map((p) => [p.name, p.name]))}
            ${sel('tag', '全部標籤', allTags().map((t) => [t, '#' + t]))}
            ${sel('year', '全部年份', years.map((y) => [y, `${y} 年`]))}
          </div>
          <div class="search-sum"></div>
          <div class="search-results"></div>`,
      );
      const sum = body.querySelector('.search-sum');
      const results = body.querySelector('.search-results');
      const draw = () => {
        const hits = filter(f);
        const tot = totals(hits);
        const active = Object.values(f).some((v) => v);
        setHTML(
          sum,
          active
            ? html`<b>${fmt(hits.length)}</b> 筆　支出 <b class="num">${fmt(tot.expense)}</b>${tot.refund ? html`　退款 <b class="num inc">${fmt(tot.refund)}</b>` : ''}　收入 <b class="num inc">${fmt(tot.income)}</b>`
            : html`<span class="note">輸入關鍵字或選擇條件</span>`,
        );
        const shown = active ? hits.slice(-SHOW_MAX) : [];
        setHTML(
          results,
          html`${groupByDay(shown).map((g) => html`<section class="day"><h2 class="day-h"><span>${dayTitle(g.date)}</span></h2>
              <div class="tx-list">${g.items.map(txRow)}</div></section>`)}
            ${hits.length > SHOW_MAX ? html`<p class="field-note">只列出最近 ${SHOW_MAX} 筆，加上條件可以縮小範圍。</p>` : ''}
            ${active && !hits.length ? html`<div class="empty-box"><p class="note">找不到符合的明細</p></div>` : ''}`,
        );
      };
      body.querySelectorAll('[data-f]').forEach((input) =>
        input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', () => {
          f[input.dataset.f] = input.value;
          input.closest('.filter-sel')?.classList.toggle('on', !!input.value);
          draw();
        }),
      );
      bindTxRows(results);
      unsubscribe = store.onChange(draw); // 編輯或刪除結果後即時更新
      draw();
    },
  });
}

function filter(f) {
  const q = f.q.trim().toLowerCase();
  return state.transactions.filter(
    (t) =>
      (!f.type || t.type === f.type) &&
      (!f.category || t.category === f.category) &&
      (!f.payment || t.payment === f.payment) &&
      (!f.tag || (t.tags || []).includes(f.tag)) &&
      (!f.year || t.date.startsWith(f.year)) &&
      (!q ||
        (t.note || '').toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        (t.tags || []).some((tag) => tag.toLowerCase().includes(q))),
  );
}
