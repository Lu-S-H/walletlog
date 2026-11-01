// 記一筆／編輯明細
import { catKind, TYPE_LABEL } from '../categories.js';
import { icon } from '../icons.js';
import { categoryUsage, lastUseOfNote, paymentUsage, sortByUsage, suggestNotes } from '../ledger.js';
import * as store from '../store.js';
import { state } from '../store.js';
import { bindSegmented, confirmDanger, openSheet, toast } from '../ui.js';
import { diffDays, fmt, formatShortDate, html, setHTML, todayStr, uid, weekdayName } from '../util.js';
import { openTagPicker } from './tags.js';

const MAX_DIGITS = 9;

// 連續記帳時延續上一筆的日期（例如補記 10/31 的多筆帳）；超過 15 分鐘沒記就恢復成今天，避免之後記新帳時日期還停在舊的那天
const STICKY_MS = 15 * 60 * 1000;
let sticky = null; // { date, at }

export function stickyDate() {
  return sticky && Date.now() - sticky.at < STICKY_MS ? sticky.date : null;
}

function rememberDate(date) {
  sticky = { date, at: Date.now() };
}

/** 通知其他畫面「記一筆選了這一天」（統計頁的每日支出月曆會跳過去） */
function announceDate(date) {
  window.dispatchEvent(new CustomEvent('walletlog:date', { detail: date }));
}

/**
 * openAddSheet({ date })：新增；openAddSheet({ tx })：編輯既有明細；
 * preset = { category, note, amount, payment }：首頁「快速記一筆」預先帶入（仍可修改後再按完成）
 */
export function openAddSheet({ tx = null, date = stickyDate() || todayStr(), type = 'expense', preset = null } = {}) {
  const s = state.settings;
  const f = {
    type: tx?.type || type,
    expr: tx ? String(tx.amount) : preset?.amount ? String(preset.amount) : '',
    category: tx?.category || preset?.category || null,
    payment: tx ? tx.payment : preset?.payment ?? defaultPayment(),
    note: tx?.note || preset?.note || '',
    date: tx?.date || date,
    tags: [...(tx?.tags || [])],
  };
  let els = {};

  const sheet = openSheet({
    title: tx ? '編輯明細' : '記一筆',
    right: tx ? { label: '刪除', danger: true, onClick: () => removeTx() } : null,
    render: (body) => {
      setHTML(
        body,
        html`<div class="seg type-seg" data-seg="type">
            ${['expense', 'income', 'refund'].map((t) => html`<button type="button" data-v="${t}" class="${f.type === t ? 'on' : ''}" aria-pressed="${String(f.type === t)}">${TYPE_LABEL[t]}</button>`)}
          </div>
          <div class="amount" aria-live="polite"></div>
          <div class="cat-grid" role="radiogroup" aria-label="分類"></div>
          <div class="chips pay-chips" role="radiogroup" aria-label="付款方式"></div>
          <div class="meta-row">
            <label class="meta-chip date-chip">${icon('calendar')}<span class="date-text"></span>
              <input type="date" class="date-input" value="${f.date}" aria-label="日期"></label>
            <button type="button" class="meta-chip tag-btn">${icon('tag')}<span class="tag-text"></span></button>
          </div>
          <div class="note-box">${icon('note')}<input type="text" class="note-input" value="${f.note}" placeholder="備註（例如 seven）" enterkeyhint="done" autocomplete="off" aria-label="備註"></div>
          <div class="chips note-sugg" aria-label="備註建議"></div>
          <div class="keypad">
            ${['1', '2', '3', 'back', '4', '5', '6', 'done', '7', '8', '9', '00', '0', '+'].map((k) =>
              k === 'back'
                ? html`<button type="button" class="key" data-k="back" aria-label="刪除一位">${icon('backspace')}</button>`
                : k === 'done'
                  ? html`<button type="button" class="key done" data-k="done">${tx ? '儲存' : '完成'}</button>`
                  : html`<button type="button" class="key" data-k="${k}">${k}</button>`)}
          </div>`,
      );
      els = {
        amount: body.querySelector('.amount'),
        cats: body.querySelector('.cat-grid'),
        pays: body.querySelector('.pay-chips'),
        dateText: body.querySelector('.date-text'),
        dateInput: body.querySelector('.date-input'),
        tagText: body.querySelector('.tag-text'),
        note: body.querySelector('.note-input'),
        sugg: body.querySelector('.note-sugg'),
      };
      bindSegmented(body, (_, v) => {
        const kindChanged = catKind(v) !== catKind(f.type);
        f.type = v;
        if (kindChanged) f.category = null;
        renderAmount();
        renderCats();
        renderSugg();
      });
      els.cats.addEventListener('click', (e) => {
        const b = e.target.closest('[data-cat]');
        if (!b) return;
        f.category = b.dataset.cat;
        renderCats();
      });
      els.pays.addEventListener('click', (e) => {
        const b = e.target.closest('[data-pay]');
        if (!b) return;
        f.payment = f.payment === b.dataset.pay ? '' : b.dataset.pay;
        renderPays();
      });
      els.dateInput.addEventListener('change', () => {
        if (els.dateInput.value) f.date = els.dateInput.value;
        announceDate(f.date); // 只通知月曆；延續日期要等真的存檔（取消就不記）
        renderDate();
      });
      body.querySelector('.tag-btn').addEventListener('click', () =>
        openTagPicker(f.tags, (tags) => {
          f.tags = tags;
          renderTags();
        }),
      );
      els.note.addEventListener('input', () => {
        f.note = els.note.value;
        renderSugg();
      });
      els.note.addEventListener('change', () => applyNote(false));
      els.note.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') els.note.blur();
      });
      // 按下建議時不要先讓輸入框失焦（失焦會觸發 change 重畫建議列，點擊就落空）
      els.sugg.addEventListener('pointerdown', (e) => e.preventDefault());
      els.sugg.addEventListener('mousedown', (e) => e.preventDefault());
      els.sugg.addEventListener('click', (e) => {
        const b = e.target.closest('[data-note]');
        if (!b) return;
        f.note = b.dataset.note;
        els.note.value = f.note;
        applyNote(true);
        els.note.blur();
      });
      body.querySelector('.keypad').addEventListener('click', (e) => {
        const k = e.target.closest('[data-k]')?.dataset.k;
        if (k) press(k);
      });
      renderAmount();
      renderCats();
      renderPays();
      renderDate();
      renderTags();
      renderSugg();
    },
  });
  sheet.el.classList.add('add-sheet');

  // ---------- 各區塊 ----------
  function renderAmount() {
    const total = evalExpr(f.expr);
    const showExpr = f.expr.includes('+');
    setHTML(
      els.amount,
      html`<span class="amount-main">
          ${showExpr ? html`<span class="amount-expr num">${f.expr.replace(/\+/g, ' + ')}</span>` : ''}
          <span class="amount-num num ${f.expr ? f.type : 'empty'}"><small>NT$</small>${fmt(total)}</span>
        </span>`,
    );
  }

  function renderCats() {
    const kind = catKind(f.type);
    const usage = categoryUsage(f.type);
    const list = sortByUsage(s.categories[kind].filter((c) => !c.hidden || c.name === f.category), usage);
    setHTML(
      els.cats,
      html`${list.map((c) => html`<button type="button" class="cat ${c.name === f.category ? 'on' : ''}" data-cat="${c.name}" role="radio" aria-checked="${String(c.name === f.category)}">
          <span class="ci">${c.icon}</span><span class="cn">${c.name}</span></button>`)}`,
    );
  }

  function renderPays() {
    const usage = paymentUsage();
    const list = sortByUsage(s.payments.filter((p) => !p.hidden || p.name === f.payment), usage);
    setHTML(
      els.pays,
      html`${list.map((p) => html`<button type="button" class="${p.name === f.payment ? 'on' : ''}" data-pay="${p.name}" role="radio" aria-checked="${String(p.name === f.payment)}">${p.name}</button>`)}`,
    );
  }

  function renderDate() {
    const n = diffDays(f.date, todayStr());
    const rel = n === 0 ? '今天 ' : n === 1 ? '昨天 ' : '';
    els.dateText.textContent = `${rel}${formatShortDate(f.date)}（${weekdayName(f.date)}）`;
    els.dateText.parentElement.classList.toggle('not-today', n !== 0); // 不是今天時用金色提醒
  }

  function renderTags() {
    els.tagText.textContent = f.tags.length ? f.tags.map((t) => '#' + t).join(' ') : '標籤';
    els.tagText.parentElement.classList.toggle('has', f.tags.length > 0);
  }

  function renderSugg() {
    const list = suggestNotes(f.note, f.type);
    els.sugg.hidden = list.length === 0;
    setHTML(els.sugg, html`${list.map((e) => html`<button type="button" data-note="${e.note}">${e.note}</button>`)}`);
  }

  /** 選了備註：帶入上次同類型用這個備註時的分類與付款方式（常見於多個餐別的備註會依現在時間挑餐別） */
  function applyNote(fromSuggestion) {
    f.note = els.note.value.trim();
    els.note.value = f.note;
    renderSugg();
    if (!f.note) return;
    const last = lastUseOfNote(f.note, f.type);
    if (!last) return;
    // 手動打字時，只在還沒選分類時才幫忙帶入，避免蓋掉使用者的選擇
    if (fromSuggestion || !f.category) {
      if (s.categories[catKind(f.type)].some((c) => c.name === last.category && !c.hidden)) f.category = last.category;
      if (!last.payment || s.payments.some((p) => p.name === last.payment && !p.hidden)) f.payment = last.payment;
      renderCats();
      renderPays();
    }
  }

  // ---------- 數字鍵 ----------
  function press(k) {
    if (document.activeElement === els.note) els.note.blur();
    if (k === 'done') return save();
    if (k === 'back') f.expr = f.expr.slice(0, -1);
    else if (k === '+') {
      if (f.expr && !f.expr.endsWith('+')) f.expr += '+';
    } else {
      const terms = f.expr.split('+');
      let last = terms.pop();
      if (last === '0') last = '';
      if (!(last === '' && k === '00')) last = (last + k).replace(/^0+(?=\d)/, '');
      if (last.length > MAX_DIGITS) return;
      f.expr = [...terms, last].join('+');
    }
    renderAmount();
  }

  // ---------- 儲存／刪除 ----------
  function save() {
    const amount = evalExpr(f.expr);
    if (!(amount > 0)) {
      flash(els.amount);
      toast('請輸入金額');
      return;
    }
    if (!f.category) {
      flash(els.cats);
      toast('請選擇分類');
      return;
    }
    const rec = {
      id: tx?.id || `t-${uid()}`,
      date: f.date,
      type: f.type,
      category: f.category,
      note: els.note.value.trim(),
      amount,
      payment: f.payment || '',
      tags: f.tags,
      ts: tx?.ts ?? Date.now(),
    };
    store.put('transactions', rec);
    if (!tx) rememberDate(rec.date);
    announceDate(rec.date);
    const newTags = rec.tags.filter((t) => !s.tags.includes(t));
    store.saveSettings({ lastPayment: rec.payment || s.lastPayment, ...(newTags.length ? { tags: [...s.tags, ...newTags] } : {}) });
    sheet.close();
    if (tx) toast('已更新');
    else toast(`已記一筆 ${TYPE_LABEL[rec.type]} ${fmt(amount)}`, { label: '再記一筆', onClick: () => openAddSheet({ date: rec.date, type: rec.type }) });
  }

  async function removeTx() {
    if (!(await confirmDanger('刪除這筆明細？', `${tx.category}${tx.note ? ' · ' + tx.note : ''} ${fmt(tx.amount)} 元`))) return;
    const removed = store.remove('transactions', tx.id);
    sheet.close();
    if (removed) toast('已刪除', { label: '復原', onClick: () => store.put('transactions', removed) });
  }
}

function defaultPayment() {
  const s = state.settings;
  const visible = s.payments.filter((p) => !p.hidden);
  if (s.lastPayment && visible.some((p) => p.name === s.lastPayment)) return s.lastPayment;
  return sortByUsage(visible, paymentUsage())[0]?.name || '';
}

function evalExpr(expr) {
  return expr.split('+').reduce((sum, t) => sum + (Number(t) || 0), 0);
}

function flash(el) {
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
}
