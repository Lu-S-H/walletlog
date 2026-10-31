// 固定支出（房租、孝親費…）：項目 → 多筆紀錄。不計入每月收支；開啟「計入年度」的項目算進年度結餘。
import { fixedTotals } from '../books.js';
import { icon } from '../icons.js';
import * as store from '../store.js';
import { state } from '../store.js';
import { toast } from '../ui.js';
import { fmt, formatShortDate, html, setHTML, todayStr, uid } from '../util.js';
import { pageHead } from './common.js';
import { openFormSheet } from './form.js';

const thisYear = () => todayStr().slice(0, 4);

export function renderFixed(el, id) {
  if (id) return detailPage(el, id);
  const y = thisYear();
  const items = [...state.fixedExpenses].sort((a, b) => (fixedTotals(b).last || '').localeCompare(fixedTotals(a).last || ''));
  setHTML(
    el,
    html`${pageHead('固定支出')}
      <div class="list"><button type="button" class="row tap add" data-new>${icon('plus')}<span class="grow">新增項目</span></button></div>
      ${items.length
        ? html`<div class="list" style="margin-top:var(--s3)">${items.map((f) => {
            const t = fixedTotals(f);
            const ty = fixedTotals(f, y);
            return html`<a class="row tap" href="#more/fixed/${f.id}"><span class="grow">
                <span class="title">${f.name}${f.syncExtras === false ? html`<em class="badge">不計入年度</em>` : ''}</span>
                <span class="detail">${t.count} 筆${t.last ? ` · 最近 ${t.last}` : ''} · 累計 ${fmt(t.total)}</span></span>
              <span class="value strong num">${y} 年 ${fmt(ty.total)}</span>${icon('chevronRight', 'chev')}</a>`;
          })}</div>`
        : html`<div class="empty-box"><p class="note">還沒有固定支出項目</p></div>`}
      <p class="field-note">固定支出（例如房租、孝親費）不計入每月收支；開啟「計入年度」的項目，會算進「統計 → 年」的年度結餘。</p>`,
  );
  el.querySelector('[data-new]').addEventListener('click', () => editItem(null));
}

function editItem(item) {
  openFormSheet({
    title: item ? '編輯項目' : '新增固定支出項目',
    fields: [
      { key: 'name', label: '名稱', type: 'text', placeholder: '例如 房租', required: true },
      { key: 'syncExtras', label: '計入年度結餘', type: 'switch' },
    ],
    values: { name: item?.name || '', syncExtras: item ? item.syncExtras !== false : true },
    note: () => '計入年度：這個項目的支出會算進「統計 → 年」的固定支出與年度結餘。',
    onSave: (v) => {
      if (state.fixedExpenses.some((f) => f.name === v.name && f.id !== item?.id)) return '已經有同名的項目。';
      const next = { ...(item || { id: `f-${uid()}`, cycle: 'custom', records: [] }), name: v.name, syncExtras: v.syncExtras };
      store.put('fixedExpenses', next);
      if (!item) location.hash = `more/fixed/${next.id}`;
      toast(item ? '已更新項目' : '已新增項目');
    },
    onDelete: item
      ? () => {
          store.remove('fixedExpenses', item.id);
          location.hash = 'more/fixed';
          toast('已刪除項目');
        }
      : null,
    deleteLabel: '刪除這個項目',
    deleteConfirm: item ? `刪除「${item.name}」和它的 ${item.records?.length || 0} 筆紀錄？` : '',
  });
}

function detailPage(el, id) {
  const item = state.fixedExpenses.find((f) => f.id === id);
  if (!item) {
    setHTML(el, html`${pageHead('固定支出', 'more/fixed', '固定支出')}<div class="empty-box"><p class="note">找不到這個項目</p></div>`);
    return;
  }
  const y = thisYear();
  const all = fixedTotals(item);
  const ty = fixedTotals(item, y);
  const recs = [...(item.records || [])].sort((a, b) => (a.date < b.date ? 1 : -1));
  const years = [...new Set(recs.map((r) => (r.date || '').slice(0, 4)))];
  setHTML(
    el,
    html`<header class="sub-head">
        <a class="back" href="#more/fixed">${icon('chevronLeft')}<span>固定支出</span></a>
        <div class="title-row"><h1 class="page-title">${item.name}</h1><button type="button" class="link" data-edit>編輯</button></div>
      </header>
      <div class="kpi-row">
        <div class="kpi"><span class="kpi-label">${y} 年</span><b class="kpi-val">${fmt(ty.total)}</b></div>
        <div class="kpi"><span class="kpi-label">累計</span><b class="kpi-val">${fmt(all.total)}</b></div>
        <div class="kpi"><span class="kpi-label">筆數</span><b class="kpi-val">${all.count}</b></div>
      </div>
      ${item.syncExtras === false ? html`<p class="field-note">這個項目設定為「不計入年度結餘」。</p>` : ''}
      <button type="button" class="btn-primary" data-add>${icon('plus')}新增紀錄</button>
      ${years.map((yy) => {
        const rs = recs.filter((r) => (r.date || '').startsWith(yy));
        return html`<h2 class="sec-h"><span>${yy} 年</span><span class="num">${fmt(rs.reduce((s, r) => s + (Number(r.amount) || 0), 0))}</span></h2>
          <div class="list">${rs.map((r) => html`<button type="button" class="row tap" data-rec="${r.id}"><span class="grow">
              <span class="title">${r.note || item.name}</span><span class="detail">${r.date}</span></span>
            <span class="value strong num">${fmt(r.amount)}</span></button>`)}</div>`;
      })}`,
  );
  el.querySelector('[data-edit]').addEventListener('click', () => editItem(item));
  el.querySelector('[data-add]').addEventListener('click', () => editRecord(item, null));
  el.querySelectorAll('[data-rec]').forEach((b) =>
    b.addEventListener('click', () => editRecord(item, (item.records || []).find((r) => r.id === b.dataset.rec))),
  );
}

function editRecord(item, rec) {
  const notes = [...new Set((item.records || []).map((r) => r.note).filter(Boolean))];
  openFormSheet({
    title: rec ? '編輯紀錄' : `新增紀錄 · ${item.name}`,
    fields: [
      { key: 'date', label: '日期', type: 'date', required: true },
      { key: 'amount', label: '金額', type: 'amount', placeholder: '0', required: true },
      { key: 'note', label: '備註', type: 'text', placeholder: '例如 1/20 - 4/19、電費', list: notes },
    ],
    values: { date: rec?.date || todayStr(), amount: rec ? String(rec.amount) : '', note: rec?.note || '' },
    onSave: (v) => {
      const next = { ...(rec || { id: `r-${uid()}` }), date: v.date, amount: v.amount, note: v.note };
      const records = rec ? item.records.map((r) => (r.id === rec.id ? next : r)) : [...(item.records || []), next];
      store.put('fixedExpenses', { ...item, records });
      toast(rec ? '已更新紀錄' : `已記下 ${item.name} ${fmt(v.amount)}`);
    },
    onDelete: rec
      ? () => {
          store.put('fixedExpenses', { ...item, records: item.records.filter((r) => r.id !== rec.id) });
          toast('已刪除紀錄');
        }
      : null,
    deleteLabel: '刪除這筆紀錄',
    deleteConfirm: rec ? `刪除 ${formatShortDate(rec.date)} ${fmt(rec.amount)}？` : '',
  });
}
