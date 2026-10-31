// 羽球：收支帳（臨打收入、場地費…），依時間顯示累計結餘。年度淨額算進年度結餘的「額外收入」，不計入每月收支。
// 電腦版的計次會員資料仍保留在備份裡，但已確認不再使用（2026-10-31）。
import { badmintonTotals, withBalance } from '../books.js';
import { icon } from '../icons.js';
import * as store from '../store.js';
import { state } from '../store.js';
import { toast } from '../ui.js';
import { fmt, formatShortDate, html, setHTML, todayStr, uid } from '../util.js';
import { pageHead } from './common.js';
import { openFormSheet } from './form.js';

let year = null;

export function renderBadminton(el) {
  const years = [...new Set([...state.badmintonRecords.map((r) => (r.date || '').slice(0, 4)), todayStr().slice(0, 4)])].filter(Boolean).sort();
  if (!year || !years.includes(year)) year = years.at(-1);
  const all = withBalance(state.badmintonRecords);
  const rows = all.filter((r) => (r.date || '').startsWith(year)).reverse();
  const t = badmintonTotals(state.badmintonRecords, year);
  const balance = all.at(-1)?.balance ?? 0;
  setHTML(
    el,
    html`${pageHead('羽球')}
      <div class="period-bar">
        <span class="note">收支帳</span>
        <div class="period-nav">
          <button type="button" class="icon-btn" data-step="-1" aria-label="上一年" ${years.indexOf(year) <= 0 ? 'disabled' : ''}>${icon('chevronLeft')}</button>
          <span class="period-pick"><span>${year}年</span></span>
          <button type="button" class="icon-btn" data-step="1" aria-label="下一年" ${years.indexOf(year) >= years.length - 1 ? 'disabled' : ''}>${icon('chevronRight')}</button>
        </div>
      </div>
      <div class="kpi-row">
        <div class="kpi"><span class="kpi-label">收入</span><b class="kpi-val">${fmt(t.income)}</b></div>
        <div class="kpi"><span class="kpi-label">支出</span><b class="kpi-val">${fmt(t.expense)}</b></div>
        <div class="kpi"><span class="kpi-label">${year} 淨額</span><b class="kpi-val">${t.net > 0 ? '+' : ''}${fmt(t.net)}</b></div>
      </div>
      <p class="kpi-cap"><span>累計結餘（全部年份）${fmt(balance)}</span></p>
      <button type="button" class="btn-primary" data-add>${icon('plus')}新增收支</button>
      ${rows.length
        ? html`<h2 class="sec-h"><span>${year} 年</span><span>${rows.length} 筆</span></h2>
          <div class="list">${rows.map((r) => html`<button type="button" class="row tap" data-rec="${r.id}"><span class="grow">
              <span class="title">${r.item || (r.income ? '收入' : '支出')}${r.note ? html`<em class="alias">${r.note}</em>` : ''}</span>
              <span class="detail">${r.date} · 累計 ${fmt(r.balance)}</span></span>
            <span class="value strong num ${r.income ? 'inc' : ''}">${r.income ? `+${fmt(r.income)}` : `−${fmt(r.expense)}`}</span></button>`)}</div>`
        : html`<div class="empty-box"><p class="note">${year} 年還沒有紀錄</p></div>`}
      <p class="field-note">羽球收支不計入每月收支；每年的淨額會算進「統計 → 年」的額外收入。</p>`,
  );
  el.querySelectorAll('[data-step]').forEach((b) =>
    b.addEventListener('click', () => {
      year = years[years.indexOf(year) + Number(b.dataset.step)] || year;
      renderBadminton(el);
    }),
  );
  el.querySelector('[data-add]').addEventListener('click', () => editRecord(null));
  el.querySelectorAll('[data-rec]').forEach((b) =>
    b.addEventListener('click', () => editRecord(state.badmintonRecords.find((r) => r.id === b.dataset.rec))),
  );
}

function editRecord(rec) {
  const items = [...new Set(state.badmintonRecords.map((r) => r.item).filter(Boolean))];
  const last = [...state.badmintonRecords].sort((a, b) => (a.date < b.date ? -1 : 1)).at(-1);
  openFormSheet({
    title: rec ? '編輯收支' : '新增羽球收支',
    fields: [
      { key: 'type', type: 'seg', options: [['income', '收入'], ['expense', '支出']] },
      { key: 'date', label: '日期', type: 'date', required: true },
      { key: 'item', label: '項目', type: 'text', placeholder: '例如 臨打、場地費用', list: items, required: true },
      { key: 'amount', label: '金額', type: 'amount', placeholder: '0', required: true },
      { key: 'note', label: '備註', type: 'text', placeholder: '選填' },
    ],
    values: {
      type: rec ? (rec.income ? 'income' : 'expense') : 'income',
      date: rec?.date || todayStr(),
      item: rec?.item || (rec ? '' : last?.item || '臨打'),
      amount: rec ? String(rec.income || rec.expense) : '',
      note: rec?.note || '',
    },
    onSave: (v) => {
      const next = {
        ...(rec || { id: `b-${uid()}`, ts: Date.now() }),
        date: v.date,
        item: v.item,
        income: v.type === 'income' ? v.amount : 0,
        expense: v.type === 'expense' ? v.amount : 0,
        note: v.note,
      };
      store.put('badmintonRecords', next);
      year = v.date.slice(0, 4);
      toast(rec ? '已更新' : `已記下 ${v.item} ${v.type === 'income' ? '+' : '−'}${fmt(v.amount)}`);
    },
    onDelete: rec
      ? () => {
          store.remove('badmintonRecords', rec.id);
          toast('已刪除');
        }
      : null,
    deleteLabel: '刪除這筆',
    deleteConfirm: rec ? `刪除 ${formatShortDate(rec.date)} ${rec.item}？` : '',
  });
}
