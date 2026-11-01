// 一筆明細的列（明細頁與搜尋結果共用）
import { catIcon } from '../categories.js';
import { state } from '../store.js';
import { fmt, html } from '../util.js';
import { openAddSheet } from './add.js';

export function txRow(t) {
  const s = state.settings;
  const sign = t.type === 'expense' ? '−' : '+';
  const detail = [t.note, t.payment].filter(Boolean).join(' · ');
  return html`<button type="button" class="tx-row" data-tx="${t.id}">
    <span class="ci">${catIcon(s, t.type, t.category)}</span>
    <span class="grow">
      <span class="title">${t.category}${t.type === 'refund' ? html`<em class="badge refund">退款</em>` : ''}</span>
      <span class="detail">${detail || '　'}${(t.tags || []).map((tag) => html`<i class="tag">#${tag}</i>`)}</span>
    </span>
    <span class="amt num ${t.type}">${sign}${fmt(t.amount)}</span>
  </button>`;
}

export function bindTxRows(root) {
  root.addEventListener('click', (e) => {
    const id = e.target.closest('[data-tx]')?.dataset.tx;
    if (!id) return;
    const tx = state.transactions.find((t) => t.id === id);
    if (tx) openAddSheet({ tx });
  });
}

