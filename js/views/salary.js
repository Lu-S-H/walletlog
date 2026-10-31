// 薪資頁：月（該薪資月份的月薪單＋獎金）／年（年度合計、各項目合計、每月實領）
import { drawColumns } from '../charts.js';
import { icon } from '../icons.js';
import { bindRevealToggle, canHide, isHidden, money as moneyOf } from '../privacy.js';
import {
  applySalaryImport, ITEM_ALIAS, parseSalaryImport, planSalaryImport, slipTitle, slipTotals, sortedSlips,
} from '../salary.js';
import { state } from '../store.js';
import { alertMsg, bindSegmented, dialog, toast } from '../ui.js';
import { addMonths, fmt, formatMonth, formatShortDate, html, isValidMonthStr, setHTML, thisMonth } from '../util.js';
import { openSlipEditor } from './slip.js';

const money = (n, prefix = '') => moneyOf(n, prefix, 'salary');
const signed = (n) => (isHidden('salary') ? '****' : `${n < 0 ? '−' : ''}${fmt(Math.abs(n))}`);

const period = { mode: 'month', month: null, year: null };
let yearPick = null;

function defaultMonth() {
  const last = sortedSlips().at(-1);
  return last ? last.period : addMonths(thisMonth(), -1);
}

export function renderSalary(el) {
  if (!period.month) {
    period.month = defaultMonth();
    period.year = period.month.slice(0, 4);
  }
  const rerender = () => renderSalary(el);
  setHTML(
    el,
    html`<header class="page-head"><h1 class="page-title">薪資</h1>
        <button type="button" class="icon-btn add-slip" aria-label="新增薪資單">${icon('plus')}</button></header>
      ${periodBar()}
      ${period.mode === 'month' ? monthView() : yearView()}
      <div class="list" style="margin-top:var(--s5)">
        <button type="button" class="row tap" data-import><span class="grow"><span class="title">匯入 Excel 薪資明細</span>
          <span class="detail">選擇電腦產生的「薪資歷史-匯入用.json」，會自動和已記的薪水收入對帳</span></span></button>
      </div>`,
  );
  // 期間切換
  bindSegmented(el.querySelector('.period-bar'), (_, v) => {
    period.mode = v;
    if (v === 'year') period.year = period.month.slice(0, 4);
    yearPick = null;
    rerender();
  });
  el.querySelectorAll('[data-step]').forEach((b) =>
    b.addEventListener('click', () => {
      const n = Number(b.dataset.step);
      if (period.mode === 'month') period.month = addMonths(period.month, n);
      else period.year = String(Number(period.year) + n);
      yearPick = null;
      rerender();
    }),
  );
  el.querySelector('.period-pick input')?.addEventListener('change', (e) => {
    if (!isValidMonthStr(e.target.value)) return;
    period.month = e.target.value;
    rerender();
  });
  el.querySelector('.period-pick select')?.addEventListener('change', (e) => {
    period.year = e.target.value;
    rerender();
  });
  // 新增／編輯
  // 「＋」：看的月份還沒有月薪單就新增那個月，否則新增最新一張的下一個月
  const hasMonthly = (m) => state.salarySlips.some((s) => s.kind === 'monthly' && s.period === m);
  el.querySelector('.add-slip').addEventListener('click', () =>
    openSlipEditor({ period: period.mode === 'month' && !hasMonthly(period.month) ? period.month : defaultNewPeriod() }),
  );
  el.querySelectorAll('[data-new]').forEach((b) => b.addEventListener('click', () => openSlipEditor({ kind: b.dataset.new, period: period.month })));
  el.querySelectorAll('[data-slip]').forEach((b) =>
    b.addEventListener('click', () => {
      const slip = state.salarySlips.find((s) => s.id === b.dataset.slip);
      if (slip) openSlipEditor({ slip });
    }),
  );
  el.querySelectorAll('[data-goto]').forEach((b) =>
    b.addEventListener('click', () => {
      period.mode = 'month';
      period.month = b.dataset.goto;
      rerender();
      window.scrollTo(0, 0);
    }),
  );
  bindRevealToggle(el.querySelector('[data-reveal]'), rerender, 'salary');
  el.querySelector('[data-import]').addEventListener('click', () => pickImport());
  const chart = el.querySelector('.sal-chart');
  if (chart) drawYearChart(chart, rerender);
}

function defaultNewPeriod() {
  const last = sortedSlips().filter((s) => s.kind === 'monthly').at(-1);
  return last ? addMonths(last.period, 1) : addMonths(thisMonth(), -1);
}

function periodBar() {
  const years = [...new Set([...state.salarySlips.map((s) => s.period.slice(0, 4)), thisMonth().slice(0, 4), period.year])].sort();
  return html`<div class="period-bar">
    <div class="seg mini" data-seg="mode">
      ${[['month', '月'], ['year', '年']].map(([v, t]) => html`<button type="button" data-v="${v}" class="${period.mode === v ? 'on' : ''}" aria-pressed="${String(period.mode === v)}">${t}</button>`)}
    </div>
    <div class="period-nav">
      <button type="button" class="icon-btn" data-step="-1" aria-label="上一期">${icon('chevronLeft')}</button>
      <label class="period-pick"><span>${period.mode === 'month' ? formatMonth(period.month) : `${period.year}年`}</span>
        ${period.mode === 'month'
          ? html`<input type="month" value="${period.month}" aria-label="選擇薪資月份">`
          : html`<select aria-label="選擇年份">${years.map((y) => html`<option value="${y}" ${y === period.year ? 'selected' : ''}>${y}年</option>`)}</select>`}
      </label>
      <button type="button" class="icon-btn" data-step="1" aria-label="下一期">${icon('chevronRight')}</button>
    </div>
  </div>`;
}

function peek() {
  return canHide('salary') ? html`<span class="peek">${icon('eye')}${isHidden('salary') ? '點一下顯示' : '點一下隱藏'}</span>` : '';
}

function revealAttrs() {
  if (!canHide('salary')) return '';
  return html`role="button" tabindex="0" aria-pressed="${String(!isHidden('salary'))}" aria-label="${isHidden('salary') ? '顯示薪資金額' : '隱藏薪資金額'}"`;
}

function lineRows(lines) {
  return html`${lines.map((l) => html`<div class="row"><span class="grow"><span class="title">${l.name}${ITEM_ALIAS[l.name] ? html`<em class="alias">${ITEM_ALIAS[l.name]}</em>` : ''}${l.note ? html`<em class="alias">${l.note}</em>` : ''}</span></span>
    <span class="value strong num ${l.amount > 0 ? 'inc' : 'neg'}">${signed(l.amount)}</span></div>`)}`;
}

function payInfo(slip) {
  const tx = slip.txId ? state.transactions.find((t) => t.id === slip.txId) : null;
  const parts = [slip.payDate ? `${formatShortDate(slip.payDate)} 入帳` : '未填入帳日', slip.payment].filter(Boolean);
  return { text: parts.join(' · '), tx };
}

// ---------- 月 ----------
function monthView() {
  const slips = sortedSlips().filter((s) => s.period === period.month);
  const monthly = slips.find((s) => s.kind === 'monthly');
  const bonuses = slips.filter((s) => s.kind === 'bonus');
  if (!slips.length) {
    return html`<div class="card empty-box">
      <p><b>${formatMonth(period.month)}還沒有薪資單</b></p>
      <p class="note">新增月薪單時會帶入上一張的項目與金額，只要改有變動的地方。</p>
      <div class="actions">
        <button type="button" class="btn-primary" data-new="monthly">新增月薪單</button>
        <button type="button" class="btn-secondary" data-new="bonus">新增獎金／禮金</button>
      </div></div>`;
  }
  const total = slips.reduce((s, x) => s + slipTotals(x).net, 0);
  let hero;
  if (monthly) {
    const t = slipTotals(monthly);
    const prev = sortedSlips().filter((s) => s.kind === 'monthly' && s.period < monthly.period).at(-1);
    const d = prev ? t.net - slipTotals(prev).net : null;
    const info = payInfo(monthly);
    hero = html`<section class="sal-hero" data-reveal ${revealAttrs()}>
        <div class="sal-hero-top"><span>${formatMonth(monthly.period)}薪資 · ${info.text}</span>${peek()}</div>
        <div class="sal-hero-num">${money(t.net)}</div>
        <div class="sal-hero-sub"><span>應發 <b>${money(t.earn)}</b></span><span>應扣 <b>${money(t.deduct)}</b></span>
          ${d != null ? html`<span>較上月 <b>${isHidden('salary') ? '****' : `${d > 0 ? '▲ ' : d < 0 ? '▼ ' : ''}${fmt(Math.abs(d))}`}</b></span>` : ''}</div>
      </section>
      ${bonuses.length ? html`<p class="field-note">本月含獎金合計實領 ${money(total)}</p>` : ''}
      <h2 class="sec-h"><span>應發項目</span><button type="button" class="link small" data-slip="${monthly.id}">編輯</button></h2>
      <div class="list">${lineRows(monthly.lines.filter((l) => l.amount > 0))}</div>
      ${monthly.lines.some((l) => l.amount < 0)
        ? html`<h2 class="sec-h">扣除項目</h2><div class="list">${lineRows(monthly.lines.filter((l) => l.amount < 0))}</div>`
        : ''}
      <p class="field-note">${info.tx ? `已記入 ${formatShortDate(info.tx.date)} 的收入明細（${info.tx.category}${info.tx.note ? ` · ${info.tx.note}` : ''}）。` : '沒有對應的收入明細。'}${monthly.note ? `　備註：${monthly.note}` : ''}</p>`;
  } else {
    hero = html`<section class="sal-hero" data-reveal ${revealAttrs()}>
        <div class="sal-hero-top"><span>${formatMonth(period.month)} · 獎金／禮金</span>${peek()}</div>
        <div class="sal-hero-num">${money(total)}</div>
        <div class="sal-hero-sub"><span>還沒有月薪單</span></div>
      </section>
      <div class="actions"><button type="button" class="btn-secondary" data-new="monthly">新增月薪單</button></div>`;
  }
  return html`${hero}
    ${bonuses.length
      ? html`<h2 class="sec-h">獎金／禮金</h2><div class="list">${bonuses.map((b) => {
          const info = payInfo(b);
          return html`<button type="button" class="row tap" data-slip="${b.id}"><span class="grow"><span class="title">${slipTitle(b)}</span>
            <span class="detail">${info.text}${info.tx ? ' · 已記入收入' : ''}</span></span>
            <span class="value strong num inc">${money(slipTotals(b).net)}</span>${icon('chevronRight', 'chev')}</button>`;
        })}</div>`
      : ''}
    <div class="chips sal-more"><button type="button" data-new="bonus">＋ 這個月的獎金／禮金</button></div>`;
}

// ---------- 年 ----------
function yearSlips() {
  return sortedSlips().filter((s) => s.period.startsWith(period.year));
}

function yearView() {
  const slips = yearSlips();
  if (!slips.length) {
    return html`<div class="card empty-box"><p><b>${period.year} 年還沒有薪資單</b></p>
      <p class="note">可以用下方的「匯入 Excel 薪資明細」匯入過去的紀錄。</p></div>`;
  }
  const monthly = slips.filter((s) => s.kind === 'monthly');
  const totals = slips.map(slipTotals);
  const net = totals.reduce((s, t) => s + t.net, 0);
  const gross = totals.reduce((s, t) => s + t.earn, 0);
  const deduct = totals.reduce((s, t) => s + t.deduct, 0);
  const avg = monthly.length ? Math.round(monthly.reduce((s, x) => s + slipTotals(x).net, 0) / monthly.length) : 0;
  const bonusNet = slips.filter((s) => s.kind === 'bonus').reduce((s, x) => s + slipTotals(x).net, 0);
  // 各項目年度合計
  const items = new Map(); // 應發與扣除分開加總（例如「其他」兩邊都有）
  for (const s of slips) {
    for (const l of s.lines) {
      const key = `${l.amount < 0 ? '-' : '+'}${l.name}`;
      items.set(key, { name: l.name, amount: (items.get(key)?.amount || 0) + l.amount });
    }
  }
  const earnItems = [...items.values()].filter((i) => i.amount > 0).sort((a, b) => b.amount - a.amount);
  const deductItems = [...items.values()].filter((i) => i.amount < 0).sort((a, b) => a.amount - b.amount);
  const months = [...new Set(slips.map((s) => s.period))].sort().reverse();

  return html`<section class="sal-hero" data-reveal ${revealAttrs()}>
      <div class="sal-hero-top"><span>${period.year} 年實領合計 · 依薪資月份</span>${peek()}</div>
      <div class="sal-hero-num">${money(net)}</div>
      <div class="sal-hero-sub"><span>平均月薪 <b>${money(avg)}</b></span><span>獎金 <b>${money(bonusNet)}</b></span><span>${monthly.length} 張月薪單</span></div>
    </section>
    <div class="kpi-row">
      <div class="kpi"><span class="kpi-label">應發合計</span><b class="kpi-val">${money(gross)}</b></div>
      <div class="kpi"><span class="kpi-label">應扣合計</span><b class="kpi-val">${money(deduct)}</b></div>
    </div>
    <section class="card chart-card"><div class="chart-head"><h2>每月實領</h2><span class="note">含獎金</span></div>
      <div class="chart-readout sal-readout"></div><div class="chart-box sal-chart"></div></section>
    <h2 class="sec-h">應發項目合計</h2><div class="list">${lineRows(earnItems)}</div>
    <h2 class="sec-h">扣除項目合計</h2><div class="list">${lineRows(deductItems)}</div>
    <h2 class="sec-h">各月薪資單</h2>
    <div class="list">${months.map((m) => {
      const ss = slips.filter((s) => s.period === m);
      const n = ss.reduce((s, x) => s + slipTotals(x).net, 0);
      return html`<button type="button" class="row tap" data-goto="${m}"><span class="grow"><span class="title">${Number(m.slice(5))}月</span>
        <span class="detail">${ss.map(slipTitle).join('、')}</span></span><span class="value strong num">${money(n)}</span>${icon('chevronRight', 'chev')}</button>`;
    })}</div>`;
}

function drawYearChart(box, rerender) {
  const slips = yearSlips();
  const vals = Array.from({ length: 12 }, (_, i) => {
    const m = `${period.year}-${String(i + 1).padStart(2, '0')}`;
    const ss = slips.filter((s) => s.period === m);
    return ss.length ? ss.reduce((s, x) => s + slipTotals(x).net, 0) : null;
  });
  const readout = box.parentElement.querySelector('.sal-readout');
  const show = () => {
    const i = yearPick;
    const v = i == null ? vals.reduce((s, x) => s + (x || 0), 0) : vals[i];
    setHTML(readout, html`<span class="rd-title">${i == null ? '全年' : `${i + 1}月`}</span>
      <span class="rd"><i class="key s-inc"></i>實領 <b class="num">${v == null ? '—' : money(v)}</b></span>`);
  };
  const draw = () => {
    drawColumns(box, {
      series: [{ cls: 's-inc' }],
      rows: vals.map((v, i) => ({ label: String(i + 1), values: [v] })),
      selected: yearPick ?? -1,
      hideTicks: isHidden('salary'),
      onSelect: (i) => {
        yearPick = i;
        draw();
      },
    });
    show();
  };
  draw();
}

// ---------- Excel 匯入 ----------
function pickImport() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    let obj;
    try {
      obj = JSON.parse(await file.text());
    } catch {
      await alertMsg('無法讀取檔案', '檔案內容不是有效的匯入檔。');
      return;
    }
    const res = parseSalaryImport(obj);
    if (res.error) {
      await alertMsg('無法匯入', res.error);
      return;
    }
    const plan = planSalaryImport(res.months);
    const nm = plan.slips.filter((s) => s.kind === 'monthly').length;
    const nb = plan.slips.length - nm;
    if (!plan.slips.length) {
      await alertMsg('沒有新的薪資單', plan.skipped ? `匯入檔裡的 ${plan.skipped} 張薪資單都已經存在。` : '匯入檔裡沒有薪資資料。');
      return;
    }
    const range = `${plan.slips[0].period} – ${plan.slips.at(-1).period}`;
    const message = [
      `${range}：${nm} 張月薪單、${nb} 張獎金單。`,
      `其中 ${plan.links.size} 張和已記的收入明細對上，會直接連結（不重複記帳）。`,
      '沒對上的不會產生收入明細（2024–2025 只有月度彙總）。',
    ];
    if (plan.unmatched.length) message.push(`這些在有明細的月份卻沒對上，匯入後請確認：${plan.unmatched.join('、')}`);
    if (plan.skipped) message.push(`${plan.skipped} 張已經存在，會略過。`);
    const ok = await dialog({
      title: '匯入薪資歷史？',
      message,
      buttons: [
        { label: '取消', value: false, role: 'cancel' },
        { label: '匯入', value: true },
      ],
    });
    if (!ok) return;
    // 匯入後跳到最新一張薪資單的月份
    period.mode = 'month';
    period.month = plan.slips.reduce((m, x) => (x.period > m ? x.period : m), plan.slips[0].period);
    applySalaryImport(plan);
    toast(`已匯入 ${plan.slips.length} 張薪資單`);
  });
  input.click();
}
