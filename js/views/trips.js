// 旅行：每個旅程一本帳；多幣別（台幣＝外幣×匯率，手動填）；可記「收回」（朋友還錢、補助），旅費算淨額。
// 旅費依每筆紀錄的日期計入年度結餘，不計入每月收支。
import { currencyName, CURRENCIES, toTWD, tripTotals } from '../books.js';
import { icon } from '../icons.js';
import * as store from '../store.js';
import { state } from '../store.js';
import { toast } from '../ui.js';
import { fmt, formatShortDate, html, setHTML, todayStr, uid } from '../util.js';
import { pageHead } from './common.js';
import { openFormSheet } from './form.js';

const fmtAmt = (n) => fmt(n, Number.isInteger(n) ? 0 : 2);

export function renderTrips(el, id) {
  if (id) return detailPage(el, id);
  const trips = [...state.trips].sort((a, b) => (tripTotals(b).to || '').localeCompare(tripTotals(a).to || ''));
  setHTML(
    el,
    html`${pageHead('旅行')}
      <div class="list"><button type="button" class="row tap add" data-new>${icon('plus')}<span class="grow">新增旅程</span></button></div>
      ${trips.length
        ? html`<div class="list" style="margin-top:var(--s3)">${trips.map((t) => {
            const tt = tripTotals(t);
            const range = tt.from ? (tt.from === tt.to ? tt.from : `${tt.from} – ${formatShortDate(tt.to)}`) : '還沒有紀錄';
            return html`<a class="row tap" href="#more/trips/${t.id}"><span class="grow">
                <span class="title">${t.name}</span>
                <span class="detail">${range}${tt.back ? ` · 收回 ${fmt(tt.back)}` : ''}</span></span>
              <span class="value strong num">${fmt(tt.net)}</span>${icon('chevronRight', 'chev')}</a>`;
          })}</div>`
        : html`<div class="empty-box"><p class="note">還沒有旅程</p></div>`}
      <p class="field-note">旅費不計入每月收支，依每筆紀錄的日期算進「統計 → 年」的旅費（花費扣掉收回）。</p>`,
  );
  el.querySelector('[data-new]').addEventListener('click', () => editTrip(null));
}

function editTrip(trip) {
  openFormSheet({
    title: trip ? '編輯旅程' : '新增旅程',
    fields: [{ key: 'name', label: '名稱', type: 'text', placeholder: '例如 2026.12 京都', required: true }],
    values: { name: trip?.name || '' },
    onSave: (v) => {
      const next = { ...(trip || { id: `tr-${uid()}`, records: [] }), name: v.name };
      store.put('trips', next);
      if (!trip) location.hash = `more/trips/${next.id}`;
      toast(trip ? '已更新旅程' : '已新增旅程');
    },
    onDelete: trip
      ? () => {
          store.remove('trips', trip.id);
          location.hash = 'more/trips';
          toast('已刪除旅程');
        }
      : null,
    deleteLabel: '刪除這個旅程',
    deleteConfirm: trip ? `刪除「${trip.name}」和它的 ${trip.records?.length || 0} 筆紀錄？` : '',
  });
}

function detailPage(el, id) {
  const trip = state.trips.find((t) => t.id === id);
  if (!trip) {
    setHTML(el, html`${pageHead('旅行', 'more/trips', '旅行')}<div class="empty-box"><p class="note">找不到這個旅程</p></div>`);
    return;
  }
  const tt = tripTotals(trip);
  const recs = [...(trip.records || [])].sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : 0));
  const curs = [...tt.byCurrency.entries()];
  setHTML(
    el,
    html`<header class="sub-head">
        <a class="back" href="#more/trips">${icon('chevronLeft')}<span>旅行</span></a>
        <div class="title-row"><h1 class="page-title">${trip.name}</h1><button type="button" class="link" data-edit>編輯</button></div>
      </header>
      <div class="kpi-row">
        <div class="kpi"><span class="kpi-label">旅費淨額</span><b class="kpi-val">${fmt(tt.net)}</b></div>
        <div class="kpi"><span class="kpi-label">花費</span><b class="kpi-val">${fmt(tt.spend)}</b></div>
        ${tt.back ? html`<div class="kpi"><span class="kpi-label">收回</span><b class="kpi-val">${fmt(tt.back)}</b></div>` : ''}
      </div>
      ${curs.length > 1 || (curs[0] && curs[0][0] !== 'TWD')
        ? html`<h2 class="sec-h">各幣別小計</h2><div class="list">${curs.map(([c, x]) => html`<div class="row"><span class="grow">
            <span class="title">${c} ${currencyName(c)}</span>
            <span class="detail">花費 ${fmtAmt(x.spend)}${x.back ? ` · 收回 ${fmtAmt(x.back)}` : ''}</span></span>
            <span class="value strong num">NT$ ${fmt(x.twd)}</span></div>`)}</div>`
        : ''}
      <div class="btn-pair">
        <button type="button" class="btn-primary" data-add="spend">${icon('plus')}花費</button>
        <button type="button" class="btn-secondary" data-add="back">${icon('plus')}收回</button>
      </div>
      ${recs.length
        ? html`<h2 class="sec-h"><span>紀錄</span><span>${recs.length} 筆</span></h2>
          <div class="list">${recs.map((r) => html`<button type="button" class="row tap" data-rec="${r.id}"><span class="grow">
              <span class="title">${r.note || (r.kind === 'back' ? '收回' : '花費')}${r.kind === 'back' ? html`<em class="badge refund">收回</em>` : ''}</span>
              <span class="detail">${r.date}${r.currency && r.currency !== 'TWD' ? ` · ${r.currency} ${fmtAmt(Number(r.amount))} × ${r.rate}` : ''}</span></span>
            <span class="value strong num ${r.kind === 'back' ? 'inc' : ''}">${r.kind === 'back' ? '+' : ''}${fmt(toTWD(r))}</span></button>`)}</div>`
        : html`<div class="empty-box"><p class="note">還沒有紀錄。花費可以用外幣記，填當時的匯率會自動換算台幣。</p></div>`}`,
  );
  el.querySelector('[data-edit]').addEventListener('click', () => editTrip(trip));
  el.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => editRecord(trip, null, b.dataset.add)));
  el.querySelectorAll('[data-rec]').forEach((b) =>
    b.addEventListener('click', () => editRecord(trip, trip.records.find((r) => r.id === b.dataset.rec))),
  );
}

/** 這個旅程裡某幣別上次用的匯率 */
function lastRate(trip, cur) {
  const r = [...(trip.records || [])].reverse().find((x) => x.currency === cur && Number(x.rate) > 0);
  return r ? String(r.rate) : '';
}

function editRecord(trip, rec, kind = 'spend') {
  const lastCur = rec?.currency || [...(trip.records || [])].reverse().find((r) => r.kind !== 'back')?.currency || 'TWD';
  const v0 = {
    kind: rec?.kind || kind,
    date: rec?.date || todayStr(),
    note: rec?.note || '',
    currency: lastCur,
    amount: rec ? String(rec.amount) : '',
    rate: rec ? String(rec.rate ?? '') : lastRate(trip, lastCur),
  };
  openFormSheet({
    title: rec ? '編輯紀錄' : `${kind === 'back' ? '收回' : '花費'} · ${trip.name}`,
    fields: [
      { key: 'kind', type: 'seg', options: [['spend', '花費'], ['back', '收回']] },
      { key: 'date', label: '日期', type: 'date', required: true },
      { key: 'note', label: '說明', type: 'text', placeholder: '例如 機票、飯店、朋友還錢' },
      { key: 'currency', label: '幣別', type: 'select', options: CURRENCIES.map(([c, n]) => [c, `${c} ${n}`]) },
      { key: 'amount', label: '金額', type: 'decimal', placeholder: '0', required: true },
      { key: 'rate', label: '匯率（1 外幣＝？台幣）', type: 'decimal', placeholder: '例如 0.21', show: (v) => v.currency !== 'TWD' },
    ],
    values: v0,
    onChange: (v, key) => {
      if (key === 'currency') v.rate = v.currency === 'TWD' ? '' : lastRate(trip, v.currency);
    },
    note: (v) => {
      const amt = Number(String(v.amount).replace(/,/g, ''));
      if (v.currency === 'TWD' || !(amt > 0)) return '';
      const rate = Number(v.rate);
      return rate > 0 ? `約台幣 ${fmt(Math.round(amt * rate))}` : '請填匯率，才能換算成台幣。';
    },
    onSave: (v) => {
      if (v.currency !== 'TWD' && !(v.rate > 0)) return '外幣請填匯率（1 外幣等於多少台幣）。';
      const next = {
        ...(rec || { id: `r-${uid()}` }),
        kind: v.kind,
        date: v.date,
        note: v.note,
        currency: v.currency,
        amount: v.amount,
        rate: v.currency === 'TWD' ? 1 : v.rate,
      };
      const records = rec ? trip.records.map((r) => (r.id === rec.id ? next : r)) : [...(trip.records || []), next];
      store.put('trips', { ...trip, records });
      toast(rec ? '已更新紀錄' : `已記下 ${v.kind === 'back' ? '收回' : '花費'} NT$ ${fmt(toTWD(next))}`);
    },
    onDelete: rec
      ? () => {
          store.put('trips', { ...trip, records: trip.records.filter((r) => r.id !== rec.id) });
          toast('已刪除紀錄');
        }
      : null,
    deleteLabel: '刪除這筆紀錄',
    deleteConfirm: rec ? `刪除 ${formatShortDate(rec.date)} ${rec.note || ''}？` : '',
  });
}
