// 統計：期間（月／年）→ 摘要、分類排名（大類 → 小類 → 分類詳情）、月曆熱度、年度趨勢、標籤
import { calendarGrid, drawColumns, heatThresholds, rankedBars } from '../charts.js';
import { catIcon, groupIcon, groupOf } from '../categories.js';
import { icon } from '../icons.js';
import {
  categoryTotals, dailyNet, dataYears, expenseEffect, groupByDay, groupTotals, monthTotals, noteTotals,
  sumSeries, tagTotals, totals, txOfPeriod, yearSeries,
} from '../ledger.js';
import { state } from '../store.js';
import { bindSegmented } from '../ui.js';
import { addMonths, dayTitle, fmt, formatMonth, formatMonthDay, html, isValidMonthStr, setHTML, thisMonth, todayStr, weekdayName } from '../util.js';
import { bindTxRows, txRow } from './txrow.js';

const period = { mode: 'month', month: thisMonth(), year: thisMonth().slice(0, 4) };
let calDay = null; // 月曆上點選的日期
let trendPick = null; // 年度趨勢上點選的月份索引（null = 預設）
const DETAIL_MAX = 120;

const enc = encodeURIComponent;
const periodYear = () => (period.mode === 'month' ? period.month.slice(0, 4) : period.year);
const periodName = () => (period.mode === 'month' ? formatMonth(period.month) : `${period.year}年`);

export function renderStats(el, sub = '') {
  const [kind, ...rest] = sub.split('/');
  const arg = rest.join('/');
  if (kind === 'g' && arg) groupPage(el, arg);
  else if (kind === 'c' && arg) categoryPage(el, arg);
  else if (kind === 't' && arg) tagPage(el, arg);
  else overviewPage(el);
}

// ---------- 共用：期間列 ----------
function periodBar() {
  const years = dataYears();
  return html`<div class="period-bar">
    <div class="seg mini" data-seg="mode">
      ${[['month', '月'], ['year', '年']].map(([v, t]) => html`<button type="button" data-v="${v}" class="${period.mode === v ? 'on' : ''}" aria-pressed="${String(period.mode === v)}">${t}</button>`)}
    </div>
    <div class="period-nav">
      <button type="button" class="icon-btn" data-step="-1" aria-label="上一期">${icon('chevronLeft')}</button>
      <label class="period-pick"><span>${periodName()}</span>
        ${period.mode === 'month'
          ? html`<input type="month" value="${period.month}" aria-label="選擇月份">`
          : html`<select aria-label="選擇年份">${years.map((y) => html`<option value="${y}" ${y === period.year ? 'selected' : ''}>${y}年</option>`)}</select>`}
      </label>
      <button type="button" class="icon-btn" data-step="1" aria-label="下一期">${icon('chevronRight')}</button>
    </div>
  </div>`;
}

function bindPeriod(el, rerender) {
  const changed = () => {
    calDay = null;
    trendPick = null;
    rerender();
  };
  bindSegmented(el.querySelector('.period-bar'), (_, v) => {
    period.mode = v;
    if (v === 'year') period.year = period.month.slice(0, 4);
    else if (!period.month.startsWith(period.year)) period.month = `${period.year}-${period.year === thisMonth().slice(0, 4) ? thisMonth().slice(5) : '12'}`;
    changed();
  });
  el.querySelectorAll('[data-step]').forEach((b) =>
    b.addEventListener('click', () => {
      const n = Number(b.dataset.step);
      if (period.mode === 'month') period.month = addMonths(period.month, n);
      else period.year = String(Number(period.year) + n);
      changed();
    }),
  );
  el.querySelector('.period-pick input')?.addEventListener('change', (e) => {
    if (!isValidMonthStr(e.target.value)) return;
    period.month = e.target.value;
    changed();
  });
  el.querySelector('.period-pick select')?.addEventListener('change', (e) => {
    period.year = e.target.value;
    changed();
  });
}

/**
 * 期間的收支與上一期的比較。進行中的期間（本月、今年）只和上一期的「同期」比，
 * 例如 10/15 時本月和上月 1–15 日比、今年 1–10 月和去年 1–10 月比，避免拿半個月去比整個月。
 */
function periodTotals() {
  const today = todayStr();
  if (period.mode === 'month') {
    const cur = monthTotals(period.month);
    const pm = addMonths(period.month, -1);
    let prev = monthTotals(pm);
    let prevName = '上月';
    if (period.month === today.slice(0, 7) && prev?.source === 'tx') {
      const day = today.slice(8, 10);
      const t = totals(txOfPeriod({ mode: 'month', month: pm }).filter((x) => x.date.slice(8, 10) <= day));
      prev = { net: t.net, income: t.income, source: 'tx' };
      prevName = '上月同期';
    }
    return { cur, prev, prevName, summaryOnly: cur?.source === 'summary' };
  }
  const ongoing = period.year === today.slice(0, 4);
  const upto = ongoing ? Number(today.slice(5, 7)) : 12;
  const cur = sumSeries(yearSeries(period.year).slice(0, upto));
  const prev = sumSeries(yearSeries(String(Number(period.year) - 1)).slice(0, upto));
  return {
    cur: cur.months ? cur : null,
    prev: prev.months ? prev : null,
    prevName: ongoing ? `去年同期（1–${upto} 月）` : '去年',
    summaryOnly: cur.months > 0 && cur.summaryMonths === cur.months,
    partial: cur.summaryMonths > 0 && cur.summaryMonths < cur.months,
  };
}

/** 增減：箭頭＋文字，不只靠顏色；支出增加為「不好」 */
function delta(cur, prev, upIsGood) {
  if (prev == null || cur == null) return '';
  const d = cur - prev;
  if (d === 0) return html`<span class="delta">相同</span>`;
  const good = d > 0 === upIsGood;
  return html`<span class="delta ${good ? 'good' : 'bad'}">${d > 0 ? '▲ 多' : '▼ 少'} ${fmt(Math.abs(d))}</span>`;
}

function kpiTiles() {
  const { cur, prev, prevName } = periodTotals();
  if (!cur) return html`<div class="card empty-box"><p class="note">${periodName()}沒有資料</p></div>`;
  const bal = cur.income - cur.net;
  return html`<div class="kpi-row">
    <div class="kpi"><span class="kpi-label">支出</span><b class="kpi-val">${fmt(cur.net)}</b>${delta(cur.net, prev?.net, false)}</div>
    <div class="kpi"><span class="kpi-label">收入</span><b class="kpi-val">${fmt(cur.income)}</b>${delta(cur.income, prev?.income, true)}</div>
    <div class="kpi"><span class="kpi-label">結餘</span><b class="kpi-val">${fmt(bal)}</b>${prev ? delta(bal, prev.income - prev.net, true) : ''}</div>
  </div>
  ${prev ? html`<p class="kpi-cap">▲▼ 與${prevName}比較</p>` : ''}`;
}

// ---------- 總覽 ----------
function overviewPage(el) {
  const list = txOfPeriod(period);
  const info = periodTotals();
  const groups = groupTotals(categoryTotals(list)).filter((g) => g.count > 0);
  const totalNet = groups.reduce((s, g) => s + Math.max(0, g.net), 0);
  const tags = tagTotals(list);

  setHTML(
    el,
    html`<header class="page-head"><h1 class="page-title">統計</h1></header>
      ${periodBar()}
      ${kpiTiles()}
      ${info.summaryOnly ? html`<p class="field-note">${periodName()}只有電腦版的月度彙總，沒有分類明細。</p>` : ''}
      ${info.partial ? html`<p class="field-note">${periodName()}有 ${periodTotals().cur.summaryMonths} 個月只有月度彙總，分類統計只包含有明細的月份。</p>` : ''}

      ${groups.length
        ? html`<section class="card chart-card">
            <div class="chart-head"><h2>支出分類</h2><span class="note num">${fmt(totalNet)}</span></div>
            ${rankedBars(groups.map((g) => ({
              icon: groupIcon(state.settings, g.name), name: g.name, value: g.net,
              share: totalNet > 0 ? (Math.max(0, g.net) / totalNet) * 100 : null,
              note: `${g.cats.length} 個分類 · ${g.count} 筆`, href: `#stats/g/${enc(g.name)}`,
            })))}
          </section>`
        : ''}

      ${period.mode === 'month' && list.length ? html`<section class="card chart-card cal-card"></section>` : ''}

      <section class="card chart-card trend-card"></section>

      ${tags.length
        ? html`<section class="card chart-card">
            <div class="chart-head"><h2>標籤</h2><span class="note">淨支出</span></div>
            ${rankedBars(tags.map((t) => ({
              name: `#${t.tag}`, value: Math.max(0, t.net), share: null,
              note: `${t.count} 筆${t.income ? ` · 收入 ${fmt(t.income)}` : ''}`, href: `#stats/t/${enc(t.tag)}`,
            })))}
          </section>`
        : ''}`,
  );
  bindPeriod(el, () => overviewPage(el));
  if (period.mode === 'month' && list.length) renderCalendar(el.querySelector('.cal-card'), list);
  renderTrend(el.querySelector('.trend-card'));
}

// ---------- 月曆熱度 ----------
function renderCalendar(card, list) {
  const month = period.month;
  const daily = dailyNet(list, month);
  const byDate = new Map();
  for (const t of state.transactions) byDate.set(t.date, (byDate.get(t.date) || 0) + expenseEffect(t));
  const end = `${month}-${String(daily.length).padStart(2, '0')}`;
  const th = heatThresholds(byDate, end < todayStr() ? end : todayStr());
  const dayItems = calDay ? list.filter((t) => t.date === calDay) : [];
  setHTML(
    card,
    html`<div class="chart-head"><h2>每日支出</h2><span class="note">點日期看明細</span></div>
      ${calendarGrid(month, daily, th, calDay)}
      ${calDay
        ? html`<div class="cal-day"><h3 class="day-h"><span>${formatMonthDay(calDay)} 週${weekdayName(calDay)}</span>
            <span class="num">${dayItems.length ? `支出 ${fmt(dayItems.reduce((s, t) => s + expenseEffect(t), 0))}` : ''}</span></h3>
            ${dayItems.length ? html`<div class="tx-list">${dayItems.map(txRow)}</div>` : html`<p class="note">這天沒有紀錄</p>`}</div>`
        : ''}`,
  );
  card.querySelector('.cal-grid').addEventListener('click', (e) => {
    const d = e.target.closest('[data-date]')?.dataset.date;
    if (!d) return;
    calDay = calDay === d ? null : d;
    renderCalendar(card, list);
  });
  const dayEl = card.querySelector('.cal-day');
  if (dayEl) bindTxRows(dayEl);
}

// ---------- 年度趨勢（支出／收入分組直條） ----------
function renderTrend(card) {
  const year = periodYear();
  const series = yearSeries(year);
  const def = period.mode === 'month' ? Number(period.month.slice(5)) - 1 : -1;
  const sel = trendPick ?? def;
  const sum = sumSeries(series);
  const line = (cls, label, v) => html`<span class="rd"><i class="key ${cls}"></i>${label} <b class="num">${v == null ? '—' : fmt(v)}</b></span>`;
  const m = series[sel];
  setHTML(
    card,
    html`<div class="chart-head"><h2>${year} 年收支</h2>
        <span class="legend"><span><i class="sw s-exp"></i>支出</span><span><i class="sw s-inc"></i>收入</span></span></div>
      <div class="chart-readout">${m
        ? html`<span class="rd-title">${Number(m.month.slice(5))}月${m.source === 'summary' ? '（彙總）' : ''}</span>
            ${line('s-exp', '支出', m.net)}${line('s-inc', '收入', m.income)}
            ${m.source ? html`<span class="rd">結餘 <b class="num">${fmt(m.income - m.net)}</b></span>` : ''}`
        : html`<span class="rd-title">全年</span>${line('s-exp', '支出', sum.net)}${line('s-inc', '收入', sum.income)}
            <span class="rd">結餘 <b class="num">${fmt(sum.income - sum.net)}</b></span>`}</div>
      <div class="chart-box"></div>
      <details class="chart-table"><summary>以表格檢視</summary>
        <table><thead><tr><th>月份</th><th>支出</th><th>收入</th><th>結餘</th></tr></thead>
          <tbody>${series.filter((x) => x.source).map((x) => html`<tr><td>${Number(x.month.slice(5))}月${x.source === 'summary' ? '＊' : ''}</td>
            <td>${fmt(x.net)}</td><td>${fmt(x.income)}</td><td>${fmt(x.income - x.net)}</td></tr>`)}
            <tr class="total"><td>合計</td><td>${fmt(sum.net)}</td><td>${fmt(sum.income)}</td><td>${fmt(sum.income - sum.net)}</td></tr></tbody></table>
        ${sum.summaryMonths ? html`<p class="note">＊ 電腦版匯入的月度彙總</p>` : ''}
      </details>`,
  );
  drawColumns(card.querySelector('.chart-box'), {
    series: [{ cls: 's-exp' }, { cls: 's-inc' }],
    rows: series.map((x) => ({ label: String(Number(x.month.slice(5))), values: [x.net, x.income] })),
    selected: sel,
    onSelect: (i) => {
      trendPick = i;
      renderTrend(card);
    },
  });
}

/** 單一數列的每月直條（大類、分類、標籤詳情用） */
function renderMonthly(card, title, filterFn) {
  const year = periodYear();
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  const vals = months.map((mo) => {
    const items = state.transactions.filter((t) => t.date.startsWith(mo) && filterFn(t));
    return items.length ? items.reduce((s, t) => s + expenseEffect(t), 0) : null;
  });
  const def = period.mode === 'month' ? Number(period.month.slice(5)) - 1 : -1;
  let sel = def;
  const draw = () => {
    const v = sel >= 0 ? vals[sel] : vals.reduce((s, x) => s + (x || 0), 0);
    setHTML(
      card,
      html`<div class="chart-head"><h2>${year} 年${title}每月支出</h2></div>
        <div class="chart-readout"><span class="rd-title">${sel >= 0 ? `${sel + 1}月` : '全年'}</span>
          <span class="rd"><i class="key s-exp"></i>支出 <b class="num">${v == null ? '—' : fmt(v)}</b></span></div>
        <div class="chart-box"></div>`,
    );
    drawColumns(card.querySelector('.chart-box'), {
      series: [{ cls: 's-exp' }],
      rows: months.map((mo, i) => ({ label: String(i + 1), values: [vals[i]] })),
      selected: sel,
      onSelect: (i) => {
        sel = i;
        draw();
      },
    });
  };
  draw();
}

// ---------- 大類 → 小類 ----------
function groupPage(el, groupName) {
  const s = state.settings;
  const list = txOfPeriod(period);
  const allCats = categoryTotals(list);
  const totalNet = allCats.reduce((sum, c) => sum + Math.max(0, c.net), 0);
  const cats = allCats.filter((c) => groupOf(s, c.name) === groupName);
  const net = cats.reduce((sum, c) => sum + c.net, 0);
  const count = cats.reduce((sum, c) => sum + c.count, 0);
  setHTML(
    el,
    html`${subHead('統計', '#stats', `${groupIcon(s, groupName)} ${groupName}`)}
      ${periodBar()}
      <div class="kpi-row">
        <div class="kpi"><span class="kpi-label">支出</span><b class="kpi-val">${fmt(net)}</b></div>
        <div class="kpi"><span class="kpi-label">占總支出</span><b class="kpi-val">${totalNet > 0 ? Math.round((Math.max(0, net) / totalNet) * 100) : 0}%</b></div>
        <div class="kpi"><span class="kpi-label">筆數</span><b class="kpi-val">${fmt(count)}</b></div>
      </div>
      ${cats.length
        ? html`<section class="card chart-card"><div class="chart-head"><h2>分類</h2><span class="note">占${groupName}</span></div>
            ${rankedBars(cats.map((c) => ({
              icon: catIcon(s, 'expense', c.name), name: c.name, value: c.net,
              share: net > 0 ? (Math.max(0, c.net) / net) * 100 : null,
              note: `${c.count} 筆`, href: `#stats/c/${enc(c.name)}`,
            })))}</section>`
        : html`<div class="card empty-box"><p class="note">${periodName()}沒有「${groupName}」的支出</p></div>`}
      <section class="card chart-card monthly-card"></section>`,
  );
  bindPeriod(el, () => groupPage(el, groupName));
  renderMonthly(el.querySelector('.monthly-card'), groupName, (t) => t.type !== 'income' && groupOf(s, t.category) === groupName);
}

// ---------- 分類／標籤詳情 ----------
function categoryPage(el, name) {
  const s = state.settings;
  const g = groupOf(s, name);
  detailPage(el, {
    back: [`${groupIcon(s, g)} ${g}`, `#stats/g/${enc(g)}`],
    title: `${catIcon(s, 'expense', name)} ${name}`,
    match: (t) => t.type !== 'income' && t.category === name,
    rerender: () => categoryPage(el, name),
    monthlyTitle: name,
  });
}

function tagPage(el, tag) {
  detailPage(el, {
    back: ['統計', '#stats'],
    title: `#${tag}`,
    match: (t) => (t.tags || []).includes(tag),
    rerender: () => tagPage(el, tag),
    monthlyTitle: `#${tag} `,
    showIncome: true,
  });
}

function detailPage(el, { back, title, match, rerender, monthlyTitle, showIncome }) {
  const list = txOfPeriod(period);
  const items = list.filter(match);
  const spend = items.filter((t) => t.type !== 'income');
  const tot = totals(items);
  const periodNet = totals(list).net;
  const tops = noteTotals(spend).slice(0, 8);
  const shown = items.slice(-DETAIL_MAX);
  setHTML(
    el,
    html`${subHead(back[0], back[1], title)}
      ${periodBar()}
      <div class="kpi-row">
        <div class="kpi"><span class="kpi-label">支出</span><b class="kpi-val">${fmt(tot.net)}</b>
          ${tot.refund ? html`<span class="delta">已扣退款 ${fmt(tot.refund)}</span>` : ''}</div>
        <div class="kpi"><span class="kpi-label">筆數</span><b class="kpi-val">${fmt(spend.length)}</b></div>
        <div class="kpi"><span class="kpi-label">平均每筆</span><b class="kpi-val">${spend.length ? fmt(Math.round(tot.net / spend.length)) : '—'}</b></div>
        <div class="kpi"><span class="kpi-label">占總支出</span><b class="kpi-val">${periodNet > 0 ? Math.round((Math.max(0, tot.net) / periodNet) * 100) : 0}%</b></div>
        ${showIncome && tot.income ? html`<div class="kpi"><span class="kpi-label">收入</span><b class="kpi-val">${fmt(tot.income)}</b></div>` : ''}
      </div>
      <section class="card chart-card monthly-card"></section>
      ${tops.length
        ? html`<section class="card chart-card"><div class="chart-head"><h2>常見項目</h2><span class="note">依備註</span></div>
            ${rankedBars(tops.map((n) => ({ name: n.note, value: Math.max(0, n.net), share: null, note: `${n.count} 次 · 平均 ${fmt(Math.round(n.net / n.count))}` })))}</section>`
        : ''}
      <h2 class="sec-h"><span>明細</span><span>${items.length > DETAIL_MAX ? `最近 ${DETAIL_MAX} 筆` : `${items.length} 筆`}</span></h2>
      ${shown.length
        ? html`<div class="detail-list">${groupByDay(shown).map((d) => html`<section class="day"><h3 class="day-h"><span>${dayTitle(d.date)}</span></h3>
            <div class="tx-list">${d.items.map(txRow)}</div></section>`)}</div>`
        : html`<div class="empty-box"><p class="note">${periodName()}沒有紀錄</p></div>`}`,
  );
  bindPeriod(el, rerender);
  renderMonthly(el.querySelector('.monthly-card'), monthlyTitle, (t) => t.type !== 'income' && match(t));
  const dl = el.querySelector('.detail-list');
  if (dl) bindTxRows(dl);
}

function subHead(backLabel, href, title) {
  return html`<header class="sub-head">
    <a class="back" href="${href}">${icon('chevronLeft')}<span>${backLabel}</span></a>
    <h1 class="page-title">${title}</h1>
  </header>`;
}
