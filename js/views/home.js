// 首頁：本月卡（含上月同期比較）、待辦提醒、今天的紀錄、快速記一筆、本月花在哪
import { backupReminder, exportBackup, pickBackupFile, snoozeBackupReminder } from '../backup.js';
import { catIcon, groupIcon } from '../categories.js';
import { icon } from '../icons.js';
import { categoryTotals, elapsedDays, groupTotals, prevMonthSamePeriod, quickSuggestions, totals, txOfMonth } from '../ledger.js';
import { bindRevealToggle, canHide, isHidden, money } from '../privacy.js';
import { openSheet, toast } from '../ui.js';
import { autoSalaryTx, clearAutoSalaryFlags, missingSlipMonths } from '../salary.js';
import { state } from '../store.js';
import { dayTitle, fmt, formatMonth, html, setHTML, thisMonth, todayStr, weekdayName } from '../util.js';
import { openAddSheet } from './add.js';
import { focusSalaryMonth } from './salary.js';
import { openSearch } from './search.js';
import { bindTxRows, txRow } from './txrow.js';

const TODAY_MAX = 5;

export function renderHome(el) {
  const today = todayStr();
  const month = thisMonth();
  const list = txOfMonth(month);
  const tot = totals(list);
  const days = elapsedDays(month);
  const prev = prevMonthSamePeriod(month);
  const hide = isHidden();
  const todays = list.filter((t) => t.date === today);
  const todayNet = todays.reduce((s, t) => s + (t.type === 'expense' ? t.amount : t.type === 'refund' ? -t.amount : 0), 0);
  const groups = groupTotals(categoryTotals(list)).filter((g) => g.net > 0).slice(0, 3);
  const quick = quickSuggestions();
  const remind = backupReminder();
  const missing = missingSlipMonths();
  const autoTx = autoSalaryTx();
  const [, m, d] = today.split('-').map(Number);

  let pace = '';
  if (prev) {
    const diff = tot.net - prev.net;
    pace = html`<div class="pace"><span>比上月同期（${prev.label}）</span>
      <b class="${diff > 0 ? 'up' : diff < 0 ? 'down' : ''}">${hide ? '****' : diff === 0 ? '相同' : `${diff > 0 ? '▲ 多' : '▼ 少'} ${fmt(Math.abs(diff))}`}</b></div>`;
  }

  // 第一次使用、還沒有任何明細
  if (!state.transactions.length) {
    setHTML(
      el,
      html`<header class="home-head"><div><div class="sub">${formatMonth(month)}</div><h1 class="page-title">${m}月${d}日 週${weekdayName(today)}</h1></div></header>
        <div class="empty-box welcome">
          <p class="big-emoji">👛</p>
          <p><b>開始記帳吧</b></p>
          <p class="note">按右下角的「＋」記第一筆。<br>之前用電腦版 AI記帳 的話，可以直接匯入舊資料。</p>
          <div class="actions">
            <button type="button" class="btn-primary" data-add>記第一筆</button>
            <button type="button" class="btn-secondary" data-import>匯入備份檔</button>
          </div>
        </div>`,
    );
    el.querySelector('[data-add]').addEventListener('click', () => openAddSheet());
    el.querySelector('[data-import]').addEventListener('click', () => pickBackupFile());
    return;
  }

  setHTML(
    el,
    html`<header class="home-head">
        <div><div class="sub">${formatMonth(month)}</div><h1 class="page-title">${m}月${d}日 週${weekdayName(today)}</h1></div>
        <button type="button" class="icon-btn" data-search aria-label="搜尋">${icon('search')}</button>
      </header>

      <section class="hero-card ${canHide() ? 'can-hide' : ''}" data-reveal ${canHide() ? html`role="button" tabindex="0" aria-pressed="${String(!hide)}" aria-label="${hide ? '顯示本月金額' : '隱藏本月金額'}"` : ''}>
        <div class="hero-label">本月支出${canHide() ? html`<span class="peek">${icon('eye')}${hide ? '點一下顯示' : '點一下隱藏'}</span>` : ''}</div>
        <div class="hero-num ${hide ? 'masked' : ''}">${money(tot.net)}</div>
        <div class="hero-stats">
          <div><span>收入</span><b class="num inc">${money(tot.income, '+')}</b></div>
          <div><span>結餘</span><b class="num">${money(tot.income - tot.net)}</b></div>
          <div><span>日均支出</span><b class="num">${days ? money(Math.round(tot.net / days)) : '—'}</b></div>
        </div>
        ${pace}
      </section>

      ${remind || missing.length || autoTx.length
        ? html`<div class="notices">
            ${remind
              ? html`<div class="notice"><span>💾</span><span class="grow">${remind.never ? '還沒有備份過' : `已經 ${remind.days} 天沒有備份`}</span>
                  <button type="button" class="link strong" data-backup>備份</button><button type="button" class="link" data-snooze>明天</button></div>`
              : ''}
            ${missing.length
              ? html`<a class="notice" href="#salary" data-salary="${missing[0]}"><span>💰</span>
                  <span class="grow"><b>${monthsLabel(missing)}</b>的薪資單還沒填</span><span class="go">填寫 ›</span></a>`
              : ''}
            ${autoTx.length
              ? html`<button type="button" class="notice" data-auto><span>🔍</span>
                  <span class="grow"><b>${autoTx.length} 筆收入</b>是舊版薪資單自動產生的，請確認有沒有重複</span><span class="go">檢查 ›</span></button>`
              : ''}
          </div>`
        : ''}

      <h2 class="sec-h"><span>今天${todayNet ? ` · 支出 ${fmt(todayNet)}` : ''}</span><a class="sec-link" href="#list">全部明細 ›</a></h2>
      ${todays.length
        ? html`<div class="tx-list today-list">${todays.slice(-TODAY_MAX).reverse().map(txRow)}</div>
            ${todays.length > TODAY_MAX ? html`<p class="field-note">今天還有 ${todays.length - TODAY_MAX} 筆，在「明細」查看。</p>` : ''}`
        : html`<button type="button" class="today-empty" data-add>${icon('plus')}<span>今天還沒有紀錄，記一筆</span></button>`}

      ${quick.length
        ? html`<section class="card home-card">
            <div class="home-card-h"><h2>快速記一筆</h2><span class="note">依時段推薦</span></div>
            <div class="quick">${quick.map((q, i) => html`<button type="button" data-quick="${i}">
                <span class="ci">${catIcon(state.settings, 'expense', q.category)}</span>
                <span class="q-txt"><b>${q.note}${q.multi && !q.note.includes(q.category) ? ` ${q.category}` : ''}</b><small>${fmt(q.amount)}${q.payment ? ` · ${q.payment}` : ''}</small></span>
              </button>`)}</div>
          </section>`
        : ''}

      ${groups.length
        ? html`<a class="card home-card tap" href="#stats">
            <div class="home-card-h"><h2>本月花在哪</h2><span class="sec-link">看統計 ›</span></div>
            <div class="mini-bars">${groups.map((g) => html`<div class="mb-row"><span class="mb-name">${groupIcon(state.settings, g.name)} ${g.name}</span>
              <span class="mb-track"><i style="width:${((g.net / groups[0].net) * 100).toFixed(1)}%"></i></span><b class="num">${fmt(g.net)}</b></div>`)}</div>
          </a>`
        : ''}`,
  );

  el.querySelector('[data-search]').addEventListener('click', () => openSearch());
  bindRevealToggle(el.querySelector('[data-reveal]'), () => renderHome(el));
  el.querySelector('[data-backup]')?.addEventListener('click', () => exportBackup());
  el.querySelector('[data-snooze]')?.addEventListener('click', () => snoozeBackupReminder());
  el.querySelector('[data-salary]')?.addEventListener('click', (e) => {
    focusSalaryMonth(e.currentTarget.dataset.salary); // 打開最早還沒填的那個月
  });
  el.querySelector('[data-auto]')?.addEventListener('click', () => reviewAutoSalary());
  // 「今天還沒有紀錄」的按鈕一定記在今天；其他新增延續上一筆的日期（15 分鐘內）
  el.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => openAddSheet({ date: today })));
  el.querySelectorAll('[data-quick]').forEach((b) =>
    b.addEventListener('click', () => {
      const q = quick[Number(b.dataset.quick)];
      openAddSheet({ preset: { category: q.category, note: q.note, amount: q.amount, payment: q.payment } });
    }),
  );
  const todayEl = el.querySelector('.today-list');
  if (todayEl) bindTxRows(todayEl);
}

/** ['2026-05', …, '2026-10'] → 「5–10 月」；跨年時加年份 */
function monthsLabel(months) {
  const label = (m) => `${Number(m.slice(5))} 月`;
  const first = months[0];
  const last = months.at(-1);
  if (first === last) return label(first);
  if (first.slice(0, 4) !== last.slice(0, 4)) return `${first.slice(0, 4)}/${Number(first.slice(5))} – ${last.slice(0, 4)}/${Number(last.slice(5))}`;
  return `${Number(first.slice(5))}–${label(last)}`;
}

/**
 * 舊版存薪資單時會自動新增收入明細；改成獨立後這些明細保留，
 * 讓使用者逐筆確認：和自己記的重複就刪掉（點一筆可以編輯／刪除），沒問題就按「都確認了」。
 */
function reviewAutoSalary() {
  const sheet = openSheet({
    title: '確認收入明細',
    right: { label: '都確認了', strong: true, onClick: () => done() },
    render: (body) => {
      const list = autoSalaryTx().sort((a, b) => (a.date < b.date ? 1 : -1));
      setHTML(
        body,
        html`<p class="field-note" style="margin:0 0 var(--s3)">以下是以前存薪資單時，App 自動新增的收入明細。現在薪資單和收支明細已經分開，請確認這些是否和你自己記的薪水重複：重複的點進去刪除，其餘按右上角「都確認了」。</p>
          ${list.length
            ? html`${groupDays(list).map((g) => html`<h3 class="day-h"><span>${dayTitle(g.date)}</span></h3><div class="tx-list">${g.items.map(txRow)}</div>`)}`
            : html`<div class="empty-box"><p class="note">都處理完了</p></div>`}`,
      );
      bindTxRows(body);
    },
  });
  function done() {
    clearAutoSalaryFlags();
    sheet.close();
    toast('已確認');
  }
}

function groupDays(list) {
  const map = new Map();
  for (const t of list) map.set(t.date, [...(map.get(t.date) || []), t]);
  return [...map.entries()].map(([date, items]) => ({ date, items }));
}
