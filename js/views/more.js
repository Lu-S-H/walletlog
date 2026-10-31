// 「更多」：獨立帳（固定支出、旅行、羽球、年度總覽）與設定的入口。
// 獨立帳的完整功能在第 4 階段加入，目前先唯讀顯示已匯入的資料。
import { icon } from '../icons.js';
import { state } from '../store.js';
import { fmt, html, setHTML } from '../util.js';
import { pageHead } from './common.js';
import { renderSettings } from './settings.js';

const yearOf = (d) => (d || '').slice(0, 4);
const sum = (list, f) => list.reduce((s, x) => s + (Number(f(x)) || 0), 0);

const SUBPAGES = {
  fixed: { title: '固定支出', icon: '🏠', render: fixedPage, count: () => `${state.fixedExpenses.length} 個項目` },
  trips: { title: '旅行', icon: '🧳', render: tripsPage, count: () => `${state.trips.length} 個旅程` },
  badminton: { title: '羽球', icon: '🏸', render: badmintonPage, count: () => `${state.badmintonRecords.length} 筆收支` },
  yearly: { title: '年度總覽', icon: '📅', render: yearlyPage, count: () => '可用金額' },
};

export function renderMore(el, sub) {
  if (SUBPAGES[sub]) {
    const p = SUBPAGES[sub];
    setHTML(el, html`${pageHead(p.title)}
      <div class="banner"><div class="grow note">完整的${p.title}功能（新增、編輯、自動同步）會在下一個階段加入。以下是已匯入的資料，全部完整保存。</div></div>
      ${p.render()}`);
    return;
  }
  if (sub) {
    renderSettings(el, sub);
    return;
  }
  setHTML(
    el,
    html`<header class="page-head"><h1 class="page-title">更多</h1></header>
      <h2 class="sec-h">獨立帳（不計入每月收支）</h2>
      <div class="list">
        ${Object.entries(SUBPAGES).map(([k, p]) => html`<a class="row tap" href="#more/${k}">
          <span class="ci small">${p.icon}</span><span class="grow title">${p.title}</span>
          <span class="value">${p.count()}</span>${icon('chevronRight', 'chev')}</a>`)}
      </div>
      <div class="list" style="margin-top:var(--s5)">
        <a class="row tap" href="#more/settings"><span class="ci small">⚙️</span><span class="grow title">設定</span>${icon('chevronRight', 'chev')}</a>
      </div>`,
  );
}

function fixedPage() {
  if (!state.fixedExpenses.length) return html`<div class="empty-box"><p class="note">沒有固定支出項目</p></div>`;
  return html`${state.fixedExpenses.map((f) => {
    const recs = [...(f.records || [])].sort((a, b) => (a.date < b.date ? 1 : -1));
    return html`<h2 class="sec-h"><span>${f.name}</span><span class="num">累計 ${fmt(sum(recs, (r) => r.amount))}</span></h2>
      <div class="list">${recs.map((r) => html`<div class="row"><span class="grow"><span class="title">${r.note || f.name}</span>
        <span class="detail">${r.date}</span></span><span class="value strong num">${fmt(r.amount)}</span></div>`)}</div>`;
  })}`;
}

function tripsPage() {
  if (!state.trips.length) return html`<div class="empty-box"><p class="note">沒有旅程</p></div>`;
  return html`<div class="list">${state.trips.map((t) => {
    const recs = t.records || [];
    return html`<div class="row"><span class="grow"><span class="title">${t.name}</span>
      <span class="detail">${recs.length} 筆${recs[0]?.date ? ` · ${recs.map((r) => r.date).sort()[0]} 起` : ''}</span></span>
      <span class="value strong num">${fmt(Math.round(sum(recs, (r) => r.amount * (r.rate || 1))))}</span></div>`;
  })}</div>`;
}

function badmintonPage() {
  const recs = [...state.badmintonRecords].sort((a, b) => (a.date < b.date ? -1 : 1));
  let bal = 0;
  const rows = recs.map((r) => ({ ...r, bal: (bal += (r.income || 0) - (r.expense || 0)) })).reverse();
  return html`<h2 class="sec-h"><span>收支帳</span><span class="num">結餘 ${fmt(bal)}</span></h2>
    <div class="list">${rows.map((r) => html`<div class="row"><span class="grow"><span class="title">${r.item}${r.note ? ` · ${r.note}` : ''}</span>
      <span class="detail">${r.date} · 累計 ${fmt(r.bal)}</span></span>
      <span class="value strong num ${r.income ? 'inc' : ''}">${r.income ? '+' + fmt(r.income) : '−' + fmt(r.expense)}</span></div>`)}</div>
    <h2 class="sec-h">計次會員</h2>
    <div class="list">${state.badmintonMembers.map((m) => html`<div class="row"><span class="grow"><span class="title">${m.name}</span>
      <span class="detail">購買 ${m.sessions} 次 · 已打 ${(m.usedDates || []).length} 次 · 收款 ${fmt(m.paid)}</span></span>
      <span class="value strong num">剩 ${m.sessions - (m.usedDates || []).length} 次</span></div>`)}</div>`;
}

function yearlyPage() {
  const years = [...new Set(state.yearlyExtras.map((x) => String(x.year)))].sort().reverse();
  return html`${years.map((y) => {
    const items = state.yearlyExtras.filter((x) => String(x.year) === y);
    return html`<h2 class="sec-h"><span>${y} 年額外項目</span><span class="num">淨額 ${fmt(sum(items, (x) => x.income - x.expense))}</span></h2>
      <div class="list">${items.map((x) => html`<div class="row"><span class="grow title">${x.name}</span>
        <span class="value strong num ${x.income - x.expense > 0 ? 'inc' : ''}">${x.income - x.expense > 0 ? '+' : '−'}${fmt(Math.abs(x.income - x.expense))}</span></div>`)}</div>`;
  })}
  ${state.monthlySummaries.length
    ? html`<h2 class="sec-h"><span>歷史月度彙總</span><span>${state.monthlySummaries[0].month} – ${state.monthlySummaries.at(-1).month}</span></h2>
      <div class="list">${[...new Set(state.monthlySummaries.map((m) => yearOf(m.month)))].map((y) => {
        const ms = state.monthlySummaries.filter((m) => m.month.startsWith(y));
        return html`<div class="row"><span class="grow"><span class="title">${y} 年</span><span class="detail">${ms.length} 個月</span></span>
          <span class="value num">支出 ${fmt(sum(ms, (m) => m.expense))}<br>收入 ${fmt(sum(ms, (m) => m.income))}</span></div>`;
      })}</div>`
    : ''}`;
}
