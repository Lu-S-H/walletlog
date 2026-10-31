// 統計頁的圖表（純 SVG / HTML）。顏色一律用 CSS 變數（--viz-*、--heat-*），淺色／深色各自定義。
// 規格：直條 ≤ 24px、頂端 4px 圓角、底部直角；格線與座標軸為實線細線；同一組直條間留 2px 空隙。
import { addDays, daysInMonth, fmt, html, parseDate, toDateStr, todayStr } from './util.js';

const NS = 'http://www.w3.org/2000/svg';

/** 座標軸刻度：1 萬以下寫完整數字，以上用「萬」 */
export function fmtTick(n) {
  if (n === 0) return '0';
  if (Math.abs(n) >= 10000) return `${Number((n / 10000).toFixed(1))}萬`;
  return fmt(n);
}

/** 讓最大值落在整齊的刻度上，最多 4 格 */
function niceScale(max) {
  if (!(max > 0)) return { top: 1000, step: 500 };
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw);
  return { top: Math.ceil(max / step) * step, step };
}

/** 頂端圓角、底部直角的直條 */
function barPath(x, y, w, h) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/**
 * 分組直條圖（畫進 el，寬度依容器）。
 * opts = { series: [{ key, cls }], rows: [{ label, values: [數字或 null] }], selected, onSelect(i), hideTicks }
 * hideTicks：金額隱藏時不顯示縱軸刻度（刻度會透露大約金額）
 */
export function drawColumns(el, { series, rows, selected = -1, onSelect, hideTicks = false }) {
  const W = Math.max(280, Math.round(el.clientWidth || 340));
  const H = 168;
  const pad = { l: 40, r: 4, t: 8, b: 22 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const max = Math.max(0, ...rows.flatMap((r) => r.values.filter((v) => v != null)));
  const { top, step } = niceScale(max);
  const y = (v) => pad.t + plotH - (Math.max(0, v) / top) * plotH;
  const band = plotW / rows.length;
  const k = series.length;
  const barW = Math.max(3, Math.min(24, (band - 6 - 2 * (k - 1)) / k));
  const groupW = barW * k + 2 * (k - 1);

  let out = '';
  // 格線與刻度
  for (let v = 0; v <= top + 1e-9; v += step) {
    const yy = Math.round(y(v)) + 0.5;
    out += `<line class="${v === 0 ? 'axis' : 'grid'}" x1="${pad.l}" x2="${W - pad.r}" y1="${yy}" y2="${yy}"/>`;
    if (!hideTicks) out += `<text class="tick" x="${pad.l - 6}" y="${yy + 4}" text-anchor="end">${fmtTick(v)}</text>`;
  }
  rows.forEach((row, i) => {
    const x0 = pad.l + band * i;
    if (i === selected) out += `<rect class="band-hi" x="${x0 + 1}" y="${pad.t}" width="${band - 2}" height="${plotH}" rx="6"/>`;
    const gx = x0 + (band - groupW) / 2;
    row.values.forEach((v, j) => {
      if (v == null || v <= 0) return;
      const yy = y(v);
      out += `<path class="bar ${series[j].cls}" d="${barPath(gx + j * (barW + 2), yy, barW, pad.t + plotH - yy)}"/>`;
    });
    out += `<text class="xlab ${i === selected ? 'on' : ''}" x="${x0 + band / 2}" y="${H - 6}" text-anchor="middle">${row.label}</text>`;
  });
  // 點擊／滑過的感應區：整個月份欄（比直條大）
  rows.forEach((row, i) => {
    out += `<rect class="hit" data-i="${i}" x="${pad.l + band * i}" y="0" width="${band}" height="${H}" tabindex="0" role="button" aria-label="${row.label}"/>`;
  });
  el.innerHTML = `<svg class="chart" xmlns="${NS}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${out}</svg>`;

  if (onSelect) {
    const svg = el.querySelector('svg');
    const pick = (e) => {
      const i = e.target.closest?.('.hit')?.dataset.i;
      if (i != null && Number(i) !== selected) onSelect(Number(i));
    };
    svg.addEventListener('pointerdown', pick);
    svg.addEventListener('pointermove', (e) => (e.pointerType === 'mouse' || e.buttons) && pick(e));
    svg.addEventListener('focusin', pick);
  }
}

/** 排名橫條：rows = [{ icon, name, value, share, note, href }]，單一顏色 */
export function rankedBars(rows) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return html`<div class="rank-list">${rows.map(
    (r) => html`<a class="rank-row ${r.href ? 'tap' : ''}" ${r.href ? html`href="${r.href}"` : ''}>
      ${r.icon ? html`<span class="ci small">${r.icon}</span>` : ''}
      <span class="rank-main">
        <span class="rank-head"><span class="rank-name">${r.name}</span>
          <span class="rank-val num">${fmt(r.value)}</span></span>
        <span class="rank-sub"><span class="rank-track"><i style="width:${Math.max(0, (r.value / max) * 100).toFixed(1)}%"></i></span>
          <span class="rank-share num">${r.share != null ? `${r.share < 1 && r.share > 0 ? '<1' : Math.round(r.share)}%` : ''}</span></span>
        ${r.note ? html`<span class="rank-note">${r.note}</span>` : ''}
      </span>
    </a>`,
  )}</div>`;
}

// ---------- 月曆熱度 ----------
const HEAT_STEPS = 5;

/** 依過去一年「有支出的日子」的分位數切 5 級，數字取整齊；資料太少時用固定級距 */
export function heatThresholds(dailyNetByDate, endDate) {
  const start = addDays(endDate, -364);
  const vals = [];
  for (const [d, v] of dailyNetByDate) if (d >= start && d <= endDate && v > 0) vals.push(v);
  if (vals.length < 15) return [100, 300, 600, 1500];
  vals.sort((a, b) => a - b);
  const q = (p) => vals[Math.min(vals.length - 1, Math.floor(p * vals.length))];
  const nice = (v) => {
    const unit = v >= 1000 ? 100 : v >= 100 ? 10 : 5;
    return Math.max(unit, Math.round(v / unit) * unit);
  };
  const th = [0.2, 0.4, 0.6, 0.8].map((p) => nice(q(p)));
  for (let i = 1; i < th.length; i++) if (th[i] <= th[i - 1]) th[i] = th[i - 1] + (th[i - 1] >= 1000 ? 100 : 10);
  return th;
}

export function heatLevel(v, th) {
  if (!(v > 0)) return 0;
  let lv = 1;
  for (const t of th) if (v >= t) lv++;
  return Math.min(lv, HEAT_STEPS);
}

/** 月曆格（週日開始）。daily[i] = 第 i+1 天的淨支出 */
export function calendarGrid(month, daily, th, selectedDate) {
  const first = parseDate(`${month}-01`);
  const lead = first.getDay();
  const n = daysInMonth(month);
  const today = todayStr();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(html`<span class="cal-cell blank"></span>`);
  for (let d = 1; d <= n; d++) {
    const date = toDateStr(new Date(first.getFullYear(), first.getMonth(), d));
    const v = daily[d - 1];
    const lv = heatLevel(v, th);
    const cls = ['cal-cell', `h${lv}`, date === today ? 'today' : '', date > today ? 'future' : '', date === selectedDate ? 'on' : ''].join(' ');
    cells.push(html`<button type="button" class="${cls}" data-date="${date}" aria-label="${d}日 支出 ${fmt(Math.max(0, v))}">
      <span class="cal-d">${d}</span><span class="cal-v num">${v > 0 ? fmt(v) : ''}</span></button>`);
  }
  return html`<div class="cal-week">${['日', '一', '二', '三', '四', '五', '六'].map((w) => html`<span>${w}</span>`)}</div>
    <div class="cal-grid">${cells}</div>
    <div class="heat-legend"><span>少</span>${[1, 2, 3, 4, 5].map((lv, i) => html`<span class="heat-key"><i class="h${lv}"></i>${i === 0 ? `<${fmtTick(th[0])}` : `${fmtTick(th[i - 1])}+`}</span>`)}<span>多</span></div>`;
}
