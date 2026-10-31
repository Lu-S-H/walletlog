// 設定：外觀、薪資隱藏、分類／付款方式／標籤管理、備份
import { exportBackup, exportCSV, lastBackupText, pickBackupFile } from '../backup.js';
import { FALLBACK_ICON } from '../categories.js';
import { APP_NAME, VERSION } from '../config.js';
import { icon } from '../icons.js';
import { categoryUsage, paymentUsage, tagUsage } from '../ledger.js';
import * as store from '../store.js';
import { defaultSettings, state } from '../store.js';
import { bindSegmented, confirmDanger, dialog, fieldError, openSheet, toast } from '../ui.js';
import { fmt, html, setHTML } from '../util.js';
import { pageHead } from './common.js';
import { allTags, cleanTag } from './tags.js';

const PAGES = {
  settings: settingsPage,
  'categories-expense': (el) => categoriesPage(el, 'expense'),
  'categories-income': (el) => categoriesPage(el, 'income'),
  payments: paymentsPage,
  tags: tagsPage,
};

export function renderSettings(el, sub) {
  (PAGES[sub] || settingsPage)(el);
}

const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

// ---------- 設定首頁 ----------
function settingsPage(el) {
  const s = state.settings;
  const cnt = (n) => html`<span class="value">${n}</span>`;
  setHTML(
    el,
    html`${pageHead('設定')}
      <h2 class="sec-h">外觀</h2>
      <div class="seg" data-seg="theme">
        ${[['auto', '跟隨系統'], ['light', '淺色'], ['dark', '深色']].map(([v, t]) => html`<button type="button" data-v="${v}" class="${s.theme === v ? 'on' : ''}" aria-pressed="${String(s.theme === v)}">${t}</button>`)}
      </div>

      <h2 class="sec-h">薪資</h2>
      <div class="form"><div class="field"><label for="hide-salary">預設隱藏薪資金額</label>
        <span class="switch"><input type="checkbox" id="hide-salary" ${s.hideSalary ? 'checked' : ''}><span></span></span></div></div>
      <p class="field-note">開啟時，薪資頁的金額顯示為 ****，點一下才顯示，避免被旁人看到。</p>

      <h2 class="sec-h">記帳項目</h2>
      <div class="list">
        <a class="row tap" href="#more/categories-expense"><span class="grow title">支出分類</span>${cnt(s.categories.expense.length)}${icon('chevronRight', 'chev')}</a>
        <a class="row tap" href="#more/categories-income"><span class="grow title">收入分類</span>${cnt(s.categories.income.length)}${icon('chevronRight', 'chev')}</a>
        <a class="row tap" href="#more/payments"><span class="grow title">付款方式</span>${cnt(s.payments.length)}${icon('chevronRight', 'chev')}</a>
        <a class="row tap" href="#more/tags"><span class="grow title">標籤</span>${cnt(allTags().length)}${icon('chevronRight', 'chev')}</a>
      </div>

      <h2 class="sec-h"><span>資料</span><span>上次備份：${lastBackupText()}</span></h2>
      <div class="list">
        <button type="button" class="row tap" data-act="backup"><span class="grow title">匯出備份檔</span>${icon('share', 'accent')}</button>
        <button type="button" class="row tap" data-act="restore"><span class="grow"><span class="title">從備份檔還原</span>
          <span class="detail">也可以匯入電腦版 AI記帳 的備份檔</span></span></button>
        <button type="button" class="row tap" data-act="csv"><span class="grow"><span class="title">匯出 CSV</span>
          <span class="detail">可以用 Excel 開啟，不能用來還原</span></span></button>
      </div>
      <p class="field-note">資料只存在這支手機。建議把備份檔存到 iCloud 雲碟或 OneDrive，超過 7 天沒備份首頁會提醒。</p>
      <div class="list" style="margin-top:var(--s5)">
        <button type="button" class="row tap danger" data-act="clear">清除全部資料</button>
      </div>

      <h2 class="sec-h">關於</h2>
      <div class="list">
        <div class="row"><span class="grow title">${APP_NAME}</span><span class="value">版本 ${VERSION}</span></div>
        ${isStandalone() ? '' : html`<div class="row"><span class="grow"><span class="title">加到主畫面</span>
          <span class="detail">用 Safari 開啟 → 分享 ${icon('share')} → 加入主畫面。之後請只從主畫面開啟（Safari 分頁的資料是分開的）。</span></span></div>`}
      </div>`,
  );
  bindSegmented(el, (_, v) => store.saveSettings({ theme: v }));
  el.querySelector('#hide-salary').addEventListener('change', (e) => store.saveSettings({ hideSalary: e.target.checked }));
  el.querySelectorAll('[data-act]').forEach((b) =>
    b.addEventListener('click', () => {
      const act = b.dataset.act;
      if (act === 'backup') exportBackup();
      else if (act === 'restore') pickBackupFile();
      else if (act === 'csv') exportCSV();
      else if (act === 'clear') clearAll();
    }),
  );
}

async function clearAll() {
  if (!(await confirmDanger('清除全部資料？', '所有明細、薪資單與設定都會刪除。建議先匯出備份。', '繼續'))) return;
  const ok = await dialog({
    title: '真的要清除嗎？',
    message: `清除後無法復原。目前共有 ${fmt(state.transactions.length)} 筆明細。`,
    buttons: [
      { label: '取消', value: false, role: 'cancel' },
      { label: '全部清除', value: true, role: 'destructive' },
    ],
  });
  if (!ok) return;
  await store.replaceAll({ settings: defaultSettings() });
  location.hash = '';
  toast('已清除全部資料');
}

// ---------- 分類管理 ----------
function categoriesPage(el, kind) {
  const s = state.settings;
  const usage = categoryUsage(kind);
  const row = (c) => html`<button type="button" class="row tap" data-cat="${c.name}">
      <span class="ci small">${c.icon}</span>
      <span class="grow"><span class="title">${c.name}${c.hidden ? html`<em class="badge">已隱藏</em>` : ''}</span></span>
      <span class="value">${fmt(usage.get(c.name) || 0)} 筆</span>${icon('chevronRight', 'chev')}</button>`;
  let body;
  if (kind === 'expense') {
    const groupNames = [...s.groups.map((g) => g.name)];
    for (const c of s.categories.expense) if (!groupNames.includes(c.group)) groupNames.push(c.group);
    body = groupNames.map((gn) => {
      const cats = s.categories.expense.filter((c) => c.group === gn);
      if (!cats.length) return '';
      const g = s.groups.find((x) => x.name === gn);
      return html`<h2 class="sec-h">${g?.icon || ''} ${gn}</h2><div class="list">${cats.map(row)}</div>`;
    });
  } else {
    body = html`<div class="list" style="margin-top:var(--s3)">${s.categories.income.map(row)}</div>`;
  }
  setHTML(
    el,
    html`${pageHead(kind === 'expense' ? '支出分類' : '收入分類', 'more/settings', '設定')}
      <div class="list"><button type="button" class="row tap add" data-new>${icon('plus')}<span class="grow">新增分類</span></button></div>
      ${body}
      <p class="field-note">記帳時分類會依使用次數自動排序。隱藏的分類不會出現在記帳畫面，但過去的紀錄會保留。${kind === 'expense' ? '退款也使用支出分類。' : ''}</p>`,
  );
  el.querySelector('[data-new]').addEventListener('click', () => editCategory(kind, null));
  el.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => editCategory(kind, b.dataset.cat)));
}

function editCategory(kind, name) {
  const s = state.settings;
  const cat = name ? s.categories[kind].find((c) => c.name === name) : null;
  const count = cat ? categoryUsage(kind).get(cat.name) || 0 : 0;
  let saveBtn;
  const sheet = openSheet({
    title: cat ? '編輯分類' : '新增分類',
    right: { label: '儲存', strong: true, onClick: () => save(), ref: (b) => (saveBtn = b) },
    render: (body) => {
      setHTML(
        body,
        html`<div class="form">
            <div class="field"><label for="c-name">名稱</label><input id="c-name" type="text" value="${cat?.name || ''}" placeholder="例如 早餐" autocomplete="off" ${cat ? '' : 'data-autofocus'}></div>
            <div class="field"><label for="c-icon">圖示</label><input id="c-icon" type="text" value="${cat?.icon || ''}" placeholder="輸入一個 emoji" autocomplete="off"></div>
            ${kind === 'expense'
              ? html`<div class="field"><label for="c-group">大類</label><select id="c-group">
                  ${s.groups.map((g) => html`<option value="${g.name}" ${(cat?.group || '其他') === g.name ? 'selected' : ''}>${g.icon} ${g.name}</option>`)}</select></div>`
              : ''}
            <div class="field"><label for="c-hidden">隱藏</label><span class="switch"><input type="checkbox" id="c-hidden" ${cat?.hidden ? 'checked' : ''}><span></span></span></div>
          </div>
          ${cat && count ? html`<p class="field-note">有 ${fmt(count)} 筆紀錄使用這個分類，改名時會一起更新。</p>` : ''}
          ${cat
            ? html`<div class="list" style="margin-top:var(--s5)">${count
                ? html`<div class="row"><span class="grow note">使用中的分類不能刪除，可以改用「隱藏」。</span></div>`
                : html`<button type="button" class="row tap danger" data-del>刪除分類</button>`}</div>`
            : ''}`,
      );
      body.querySelector('[data-del]')?.addEventListener('click', async () => {
        if (!(await confirmDanger(`刪除「${cat.name}」？`, ''))) return;
        store.saveSettings({ categories: { ...s.categories, [kind]: s.categories[kind].filter((c) => c !== cat) } });
        sheet.close();
        toast('已刪除分類');
      });
    },
  });
  sheet.el.classList.add('compact');

  function save() {
    const body = sheet.body;
    const nameEl = body.querySelector('#c-name');
    const newName = nameEl.value.trim();
    if (!newName) return fieldError(nameEl, '請輸入名稱');
    if (s.categories[kind].some((c) => c.name === newName && c !== cat)) return fieldError(nameEl, '已經有同名的分類');
    const next = {
      ...(cat || {}),
      name: newName,
      icon: body.querySelector('#c-icon').value.trim() || FALLBACK_ICON,
      hidden: body.querySelector('#c-hidden').checked,
      ...(kind === 'expense' ? { group: body.querySelector('#c-group').value } : {}),
    };
    const list = cat ? s.categories[kind].map((c) => (c === cat ? next : c)) : [...s.categories[kind], next];
    store.saveSettings({ categories: { ...s.categories, [kind]: list } });
    if (cat && cat.name !== newName) {
      const inKind = (t) => (kind === 'income' ? t.type === 'income' : t.type !== 'income');
      const changed = state.transactions.filter((t) => inKind(t) && t.category === cat.name).map((t) => ({ ...t, category: newName }));
      store.putMany('transactions', changed);
    }
    saveBtn.disabled = true;
    sheet.close();
    toast(cat ? '已更新分類' : '已新增分類');
  }
}

// ---------- 付款方式管理 ----------
function paymentsPage(el) {
  const s = state.settings;
  const usage = paymentUsage();
  setHTML(
    el,
    html`${pageHead('付款方式', 'more/settings', '設定')}
      <div class="list"><button type="button" class="row tap add" data-new>${icon('plus')}<span class="grow">新增付款方式</span></button></div>
      <div class="list" style="margin-top:var(--s3)">
        ${s.payments.map((p) => html`<button type="button" class="row tap" data-pay="${p.name}">
          <span class="grow title">${p.name}${p.hidden ? html`<em class="badge">已隱藏</em>` : ''}</span>
          <span class="value">${fmt(usage.get(p.name) || 0)} 筆</span>${icon('chevronRight', 'chev')}</button>`)}
      </div>
      <p class="field-note">記帳時依使用次數排序，並預設上次用的付款方式。</p>`,
  );
  el.querySelector('[data-new]').addEventListener('click', () => editPayment(null));
  el.querySelectorAll('[data-pay]').forEach((b) => b.addEventListener('click', () => editPayment(b.dataset.pay)));
}

function editPayment(name) {
  const s = state.settings;
  const pay = name ? s.payments.find((p) => p.name === name) : null;
  const count = pay ? paymentUsage().get(pay.name) || 0 : 0;
  const sheet = openSheet({
    title: pay ? '編輯付款方式' : '新增付款方式',
    right: { label: '儲存', strong: true, onClick: () => save() },
    render: (body) => {
      setHTML(
        body,
        html`<div class="form">
            <div class="field"><label for="p-name">名稱</label><input id="p-name" type="text" value="${pay?.name || ''}" placeholder="例如 Pi 中信" autocomplete="off" ${pay ? '' : 'data-autofocus'}></div>
            <div class="field"><label for="p-hidden">隱藏</label><span class="switch"><input type="checkbox" id="p-hidden" ${pay?.hidden ? 'checked' : ''}><span></span></span></div>
          </div>
          ${pay && count ? html`<p class="field-note">有 ${fmt(count)} 筆紀錄使用這個付款方式，改名時會一起更新。</p>` : ''}
          ${pay
            ? html`<div class="list" style="margin-top:var(--s5)">${count
                ? html`<div class="row"><span class="grow note">使用中的付款方式不能刪除，可以改用「隱藏」。</span></div>`
                : html`<button type="button" class="row tap danger" data-del>刪除付款方式</button>`}</div>`
            : ''}`,
      );
      body.querySelector('[data-del]')?.addEventListener('click', async () => {
        if (!(await confirmDanger(`刪除「${pay.name}」？`, ''))) return;
        store.saveSettings({ payments: s.payments.filter((p) => p !== pay) });
        sheet.close();
        toast('已刪除付款方式');
      });
    },
  });
  sheet.el.classList.add('compact');

  function save() {
    const nameEl = sheet.body.querySelector('#p-name');
    const newName = nameEl.value.trim();
    if (!newName) return fieldError(nameEl, '請輸入名稱');
    if (s.payments.some((p) => p.name === newName && p !== pay)) return fieldError(nameEl, '已經有同名的付款方式');
    const next = { ...(pay || {}), name: newName, hidden: sheet.body.querySelector('#p-hidden').checked };
    const payments = pay ? s.payments.map((p) => (p === pay ? next : p)) : [...s.payments, next];
    const renamed = pay && pay.name !== newName;
    store.saveSettings({ payments, ...(renamed && s.lastPayment === pay.name ? { lastPayment: newName } : {}) });
    if (renamed) store.putMany('transactions', state.transactions.filter((t) => t.payment === pay.name).map((t) => ({ ...t, payment: newName })));
    sheet.close();
    toast(pay ? '已更新付款方式' : '已新增付款方式');
  }
}

// ---------- 標籤管理 ----------
function tagsPage(el) {
  const usage = tagUsage();
  const tags = allTags();
  setHTML(
    el,
    html`${pageHead('標籤', 'more/settings', '設定')}
      <div class="list"><button type="button" class="row tap add" data-new>${icon('plus')}<span class="grow">新增標籤</span></button></div>
      ${tags.length
        ? html`<div class="list" style="margin-top:var(--s3)">${tags.map((t) => html`<button type="button" class="row tap" data-tag="${t}">
            <span class="grow title">#${t}</span><span class="value">${fmt(usage.get(t) || 0)} 筆</span>${icon('chevronRight', 'chev')}</button>`)}</div>`
        : html`<div class="empty-box"><p class="note">還沒有標籤。記帳時可以幫一筆加上標籤，例如 #約會 #出差，之後能跨分類統計。</p></div>`}`,
  );
  el.querySelector('[data-new]').addEventListener('click', () => editTag(null));
  el.querySelectorAll('[data-tag]').forEach((b) => b.addEventListener('click', () => editTag(b.dataset.tag)));
}

function editTag(name) {
  const s = state.settings;
  const count = name ? tagUsage().get(name) || 0 : 0;
  const sheet = openSheet({
    title: name ? '編輯標籤' : '新增標籤',
    right: { label: '儲存', strong: true, onClick: () => save() },
    render: (body) => {
      setHTML(
        body,
        html`<div class="form"><div class="field"><label for="t-name">名稱</label>
            <input id="t-name" type="text" value="${name || ''}" placeholder="例如 約會" autocomplete="off" ${name ? '' : 'data-autofocus'}></div></div>
          ${name && count ? html`<p class="field-note">有 ${fmt(count)} 筆紀錄使用這個標籤。改成已存在的標籤名稱會合併。</p>` : ''}
          ${name ? html`<div class="list" style="margin-top:var(--s5)"><button type="button" class="row tap danger" data-del>刪除標籤</button></div>` : ''}`,
      );
      body.querySelector('[data-del]')?.addEventListener('click', async () => {
        if (!(await confirmDanger(`刪除「#${name}」？`, count ? `會從 ${fmt(count)} 筆紀錄上移除這個標籤，紀錄本身不會刪除。` : ''))) return;
        store.saveSettings({ tags: s.tags.filter((t) => t !== name) });
        store.putMany('transactions', state.transactions.filter((t) => (t.tags || []).includes(name)).map((t) => ({ ...t, tags: t.tags.filter((x) => x !== name) })));
        sheet.close();
        toast('已刪除標籤');
      });
    },
  });
  sheet.el.classList.add('compact');

  function save() {
    const input = sheet.body.querySelector('#t-name');
    const newName = cleanTag(input.value);
    if (!newName) return fieldError(input, '請輸入名稱');
    if (!name) {
      if (allTags().includes(newName)) return fieldError(input, '已經有這個標籤');
      store.saveSettings({ tags: [...s.tags, newName] });
    } else if (newName !== name) {
      store.saveSettings({ tags: [...new Set(s.tags.map((t) => (t === name ? newName : t)))] });
      store.putMany(
        'transactions',
        state.transactions.filter((t) => (t.tags || []).includes(name)).map((t) => ({ ...t, tags: [...new Set(t.tags.map((x) => (x === name ? newName : x)))] })),
      );
    }
    sheet.close();
    toast(name ? '已更新標籤' : '已新增標籤');
  }
}

