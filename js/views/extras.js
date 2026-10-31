// 額外項目（原「年度總覽」）：每年的固定支出、額外收入、旅費。
// 有帳本的自動帶入（點了到該帳本）；手動項目（2024–2025 匯入的數字、股票收益等）可新增／編輯。
// 年度結餘的完整計算在「統計 → 年」。
import { icon } from '../icons.js';
import { dataYears, extraKind, yearExtras } from '../ledger.js';
import * as store from '../store.js';
import { state } from '../store.js';
import { toast } from '../ui.js';
import { fmt, html, setHTML, todayStr, uid } from '../util.js';
import { pageHead } from './common.js';
import { openFormSheet } from './form.js';

let year = null;
const KIND_LABEL = { fixed: '固定支出', extra: '額外收入', trip: '旅費' };
const AUTO_LINK = { fixed: (id) => `#more/fixed/${id}`, trip: (id) => `#more/trips/${id}`, badminton: () => '#more/badminton' };

function years() {
  const ys = new Set(dataYears());
  for (const x of state.yearlyExtras) ys.add(String(x.year));
  for (const f of state.fixedExpenses) for (const r of f.records || []) if (r.date) ys.add(r.date.slice(0, 4));
  for (const t of state.trips) for (const r of t.records || []) if (r.date) ys.add(r.date.slice(0, 4));
  return [...ys].sort();
}

export function renderExtras(el) {
  const ys = years();
  if (!year || !ys.includes(year)) year = todayStr().slice(0, 4);
  const x = yearExtras(year);
  const signed = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt(Math.abs(n))}`;
  const row = (item, amount, detail) => {
    const auto = item.ref.type !== 'manual';
    const inner = html`<span class="grow"><span class="title">${item.name}${auto ? html`<em class="badge">自動</em>` : ''}</span>
        ${detail ? html`<span class="detail">${detail}</span>` : ''}</span>
      <span class="value strong num">${amount}</span>${icon('chevronRight', 'chev')}`;
    return auto
      ? html`<a class="row tap" href="${AUTO_LINK[item.ref.type](item.ref.id)}">${inner}</a>`
      : html`<button type="button" class="row tap" data-manual="${item.ref.id}">${inner}</button>`;
  };
  const section = (title, list, total, render) =>
    html`<h2 class="sec-h"><span>${title}</span><span class="num">${total}</span></h2>
      ${list.length ? html`<div class="list">${list.map(render)}</div>` : html`<div class="list"><div class="row"><span class="grow note">無</span></div></div>`}`;
  const net = x.extraTotal - x.fixedTotal - x.tripTotal;

  setHTML(
    el,
    html`${pageHead('額外項目')}
      <div class="period-bar">
        <span class="note">不計入每月收支</span>
        <div class="period-nav">
          <button type="button" class="icon-btn" data-step="-1" aria-label="上一年" ${ys.indexOf(year) <= 0 ? 'disabled' : ''}>${icon('chevronLeft')}</button>
          <span class="period-pick"><span>${year}年</span></span>
          <button type="button" class="icon-btn" data-step="1" aria-label="下一年" ${ys.indexOf(year) >= ys.length - 1 ? 'disabled' : ''}>${icon('chevronRight')}</button>
        </div>
      </div>
      <div class="kpi-row">
        <div class="kpi"><span class="kpi-label">固定支出</span><b class="kpi-val">${fmt(x.fixedTotal)}</b></div>
        <div class="kpi"><span class="kpi-label">額外收入</span><b class="kpi-val">${signed(x.extraTotal)}</b></div>
        <div class="kpi"><span class="kpi-label">旅費</span><b class="kpi-val">${fmt(x.tripTotal)}</b></div>
      </div>
      <p class="kpi-cap"><span>合計 ${signed(net)}，已算進「統計 → 年」的年度結餘</span></p>
      <button type="button" class="btn-secondary" data-add>${icon('plus')}新增手動項目</button>
      ${section('固定支出', x.fixed, fmt(x.fixedTotal), (f) => row(f, fmt(f.amount)))}
      ${section('額外收入', x.extra, signed(x.extraTotal), (e) => row(e, signed(e.amount)))}
      ${section('旅費', x.trips, fmt(x.tripTotal), (t) => row(t, fmt(t.net), t.back ? `花費 ${fmt(t.cost)}、收回 ${fmt(t.back)}` : ''))}
      <p class="field-note">標示「自動」的項目來自固定支出、羽球、旅行帳本，點進去修改；其他是手動項目（例如股票收益、電腦版匯入的 2024–2025 年度數字），點一下可以編輯。</p>`,
  );
  el.querySelectorAll('[data-step]').forEach((b) =>
    b.addEventListener('click', () => {
      year = ys[ys.indexOf(year) + Number(b.dataset.step)] || year;
      renderExtras(el);
    }),
  );
  el.querySelector('[data-add]').addEventListener('click', () => editManual(null));
  el.querySelectorAll('[data-manual]').forEach((b) =>
    b.addEventListener('click', () => editManual(state.yearlyExtras.find((e) => e.id === b.dataset.manual))),
  );
}

function editManual(item) {
  const income = Number(item?.income) || 0;
  const expense = Number(item?.expense) || 0;
  openFormSheet({
    title: item ? '編輯手動項目' : '新增手動項目',
    fields: [
      { key: 'type', type: 'seg', options: [['income', '收入'], ['expense', '支出']] },
      { key: 'name', label: '名稱', type: 'text', placeholder: '例如 股票投資（已實現）', required: true },
      { key: 'kind', label: '類別', type: 'select', options: Object.entries(KIND_LABEL) },
      { key: 'year', label: '年份', type: 'amount', placeholder: todayStr().slice(0, 4), required: true },
      { key: 'amount', label: '金額', type: 'amount', placeholder: '0', required: true },
    ],
    values: {
      type: item ? (income - expense >= 0 ? 'income' : 'expense') : 'income',
      name: item?.name || '',
      kind: item ? extraKind(item) : 'extra',
      year: String(item?.year || year),
      amount: item ? String(Math.abs(income - expense)) : '',
    },
    note: (v) => (v.kind === 'fixed' && v.type === 'income' ? '固定支出類的項目通常是支出。' : ''),
    onSave: (v) => {
      if (!(v.year >= 2000 && v.year <= 2100)) return '請填正確的年份。';
      const next = {
        ...(item || { id: `x-${uid()}` }),
        name: v.name,
        kind: v.kind,
        year: v.year,
        income: v.type === 'income' ? v.amount : 0,
        expense: v.type === 'expense' ? v.amount : 0,
      };
      store.put('yearlyExtras', next);
      year = String(v.year);
      toast(item ? '已更新' : '已新增手動項目');
    },
    onDelete: item
      ? () => {
          store.remove('yearlyExtras', item.id);
          toast('已刪除');
        }
      : null,
    deleteLabel: '刪除這個項目',
    deleteConfirm: item ? `刪除「${item.name}」（${item.year} 年）？` : '',
  });
}
