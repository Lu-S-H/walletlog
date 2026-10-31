// 「更多」：獨立帳（固定支出、旅行、羽球、額外項目）與設定的入口。
import { badmintonTotals, fixedTotals, tripTotals } from '../books.js';
import { icon } from '../icons.js';
import { yearExtras } from '../ledger.js';
import { state } from '../store.js';
import { fmt, fmtSigned, html, setHTML, todayStr } from '../util.js';
import { renderBadminton } from './badminton.js';
import { renderExtras } from './extras.js';
import { renderFixed } from './fixed.js';
import { renderSettings } from './settings.js';
import { renderTrips } from './trips.js';

const thisYear = () => todayStr().slice(0, 4);

const SUBPAGES = {
  fixed: {
    title: '固定支出', icon: '🏠', render: renderFixed,
    summary: () => `今年 ${fmt(state.fixedExpenses.reduce((s, f) => s + (f.syncExtras === false ? 0 : fixedTotals(f, thisYear()).total), 0))}`,
  },
  trips: {
    title: '旅行', icon: '🧳', render: renderTrips,
    summary: () => `今年 ${fmt(state.trips.reduce((s, t) => s + tripTotals(t, thisYear()).net, 0))}`,
  },
  badminton: {
    title: '羽球', icon: '🏸', render: renderBadminton,
    summary: () => {
      return `今年 ${fmtSigned(badmintonTotals(state.badmintonRecords, thisYear()).net)}`;
    },
  },
  yearly: {
    title: '額外項目', icon: '📅', render: renderExtras,
    summary: () => {
      const x = yearExtras(thisYear());
      return `今年淨額 ${fmtSigned(x.extraTotal - x.fixedTotal - x.tripTotal)}`;
    },
  },
};

export function renderMore(el, sub) {
  const [page, ...rest] = (sub || '').split('/');
  if (SUBPAGES[page]) {
    SUBPAGES[page].render(el, rest.join('/'));
    return;
  }
  if (sub) {
    renderSettings(el, sub);
    return;
  }
  setHTML(
    el,
    html`<header class="page-head"><h1 class="page-title">更多</h1></header>
      <h2 class="sec-h">獨立帳（不計入每月收支，只算進年度結餘）</h2>
      <div class="list">
        ${Object.entries(SUBPAGES).map(([k, p]) => html`<a class="row tap" href="#more/${k}">
          <span class="ci small">${p.icon}</span><span class="grow title">${p.title}</span>
          <span class="value num">${p.summary()}</span>${icon('chevronRight', 'chev')}</a>`)}
      </div>
      <div class="list" style="margin-top:var(--s5)">
        <a class="row tap" href="#more/settings"><span class="ci small">⚙️</span><span class="grow title">設定</span>${icon('chevronRight', 'chev')}</a>
      </div>`,
  );
}
