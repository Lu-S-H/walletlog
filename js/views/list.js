// 明細（首頁）：月收支總覽＋每日支出長條＋依日期分組的明細
import { backupReminder, exportBackup, pickBackupFile, snoozeBackupReminder } from '../backup.js';
import { icon } from '../icons.js';
import { dailyNet, elapsedDays, groupByDay, totals, txOfMonth } from '../ledger.js';
import { bindRevealToggle, canHide, isHidden, money } from '../privacy.js';
import { state } from '../store.js';
import { addMonths, dayTitle, fmt, formatMonth, html, isValidMonthStr, setHTML, thisMonth, todayStr } from '../util.js';
import { openAddSheet } from './add.js';
import { openSearch } from './search.js';
import { bindTxRows, txRow } from './txrow.js';

let curMonth = thisMonth();

export function currentMonth() {
  return curMonth;
}

export function renderList(el) {
  const list = txOfMonth(curMonth);
  const tot = totals(list);
  const days = elapsedDays(curMonth);
  const daily = dailyNet(list, curMonth);
  const max = Math.max(0, ...daily);
  const maxDay = daily.indexOf(max) + 1;
  const today = todayStr();
  const groups = groupByDay(list);
  const remind = backupReminder();
  const hide = isHidden();

  setHTML(
    el,
    html`${remind
        ? html`<div class="banner" role="status">
            <div class="grow"><div>${remind.never ? '還沒有備份過' : `已經 ${remind.days} 天沒有備份`}</div>
              <div class="note">資料只存在這支手機，刪除 App 或換手機就會遺失。</div></div>
            <button type="button" class="link strong" data-backup>備份</button>
            <button type="button" class="link" data-snooze>明天</button>
          </div>`
        : ''}
      <header class="month-head">
        <button type="button" class="icon-btn" data-month="-1" aria-label="上個月">${icon('chevronLeft')}</button>
        <label class="month-pick"><h1 class="page-title">${formatMonth(curMonth)}</h1>
          <input type="month" value="${curMonth}" aria-label="選擇月份"></label>
        <button type="button" class="icon-btn" data-month="1" aria-label="下個月">${icon('chevronRight')}</button>
        <span class="grow"></span>
        <button type="button" class="icon-btn" data-search aria-label="搜尋">${icon('search')}</button>
      </header>

      <section class="hero-card ${canHide() ? 'can-hide' : ''}" ${canHide() ? html`role="button" tabindex="0" aria-pressed="${String(!hide)}" aria-label="${hide ? '顯示本月金額' : '隱藏本月金額'}"` : ''}>
        <div class="hero-label">本月支出${canHide() ? html`<span class="peek">${icon('eye')}${hide ? '點一下顯示' : '點一下隱藏'}</span>` : ''}</div>
        <div class="hero-num ${hide ? 'masked' : ''}">${money(tot.net)}</div>
        <div class="hero-stats">
          <div><span>收入</span><b class="num inc">${money(tot.income, '+')}</b></div>
          <div><span>結餘</span><b class="num">${money(tot.income - tot.net)}</b></div>
          <div><span>日均支出</span><b class="num">${days ? money(Math.round(tot.net / days)) : '—'}</b></div>
        </div>
        <div class="spark">
          <div class="spark-head"><span>每日支出</span>
            <span>${max > 0 ? `最高 ${Number(curMonth.slice(5))}/${maxDay} · ${money(max)}` : ''}${tot.refund ? `　已扣退款 ${money(tot.refund)}` : ''}</span></div>
          <div class="spark-bars">
            ${daily.map((v, i) => {
              const date = `${curMonth}-${String(i + 1).padStart(2, '0')}`;
              const h = max > 0 ? Math.max(3, (Math.max(v, 0) / max) * 44) : 3;
              const cls = date > today ? 'future' : v === max && max > 0 ? 'hi' : '';
              return html`<i class="${cls}" style="height:${h}px" data-day="${date}" title="${hide ? `${i + 1}日` : `${i + 1}日 ${fmt(v)}`}"></i>`;
            })}
          </div>
        </div>
      </section>

      ${groups.length
        ? html`<div class="tx-groups">${groups.map((g) => {
            const inc = g.items.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
            return html`<section class="day" id="d-${g.date}">
              <h2 class="day-h"><span>${dayTitle(g.date)}</span>
                <span class="num">${g.net ? `支出 ${fmt(g.net)}` : ''}${g.net && inc ? '　' : ''}${inc ? `收入 ${fmt(inc)}` : ''}</span></h2>
              <div class="tx-list">${g.items.map(txRow)}</div>
            </section>`;
          })}</div>`
        : state.transactions.length
          ? html`<div class="empty-box"><p>${formatMonth(curMonth)}還沒有紀錄</p>
              <button type="button" class="btn-secondary" data-add>記一筆</button></div>`
          : html`<div class="empty-box welcome">
              <p class="big-emoji">👛</p>
              <p><b>開始記帳吧</b></p>
              <p class="note">按下方的「＋」記第一筆。<br>之前用電腦版 AI記帳 的話，可以直接匯入舊資料。</p>
              <div class="actions">
                <button type="button" class="btn-primary" data-add>記第一筆</button>
                <button type="button" class="btn-secondary" data-import>匯入電腦版 AI記帳 備份</button>
              </div>
            </div>`}`,
  );

  el.querySelectorAll('[data-month]').forEach((b) =>
    b.addEventListener('click', () => {
      curMonth = addMonths(curMonth, Number(b.dataset.month));
      renderList(el);
      window.scrollTo(0, 0);
    }),
  );
  el.querySelector('.month-pick input').addEventListener('change', (e) => {
    if (!isValidMonthStr(e.target.value)) return;
    curMonth = e.target.value;
    renderList(el);
  });
  el.querySelector('[data-search]').addEventListener('click', () => openSearch());
  el.querySelector('[data-backup]')?.addEventListener('click', () => exportBackup());
  el.querySelector('[data-snooze]')?.addEventListener('click', () => snoozeBackupReminder());
  el.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => openAddSheet()));
  el.querySelector('[data-import]')?.addEventListener('click', () => pickBackupFile());
  el.querySelector('.spark-bars').addEventListener('click', (e) => {
    const day = e.target.closest('[data-day]')?.dataset.day;
    const target = day && document.getElementById(`d-${day}`);
    if (target) {
      e.stopPropagation(); // 點長條是跳到那一天，不是切換顯示金額
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
  bindRevealToggle(el.querySelector('.hero-card'), () => renderList(el));
  const groupsEl = el.querySelector('.tx-groups');
  if (groupsEl) bindTxRows(groupsEl);
}
