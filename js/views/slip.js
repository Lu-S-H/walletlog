// 薪資單編輯：月薪單（逐項）／獎金單；儲存時自動產生或連結收入明細
import { icon } from '../icons.js';
import { paymentUsage, sortByUsage } from '../ledger.js';
import {
  deleteSlip, DEFAULT_SALARY_ITEMS, ITEM_ALIAS, lastMonthlySlip, linkCandidates, SALARY_CATEGORY, saveSlip, slipFullName, slipTotals,
} from '../salary.js';
import { state } from '../store.js';
import { alertMsg, bindSegmented, dialog, openSheet, toast } from '../ui.js';
import { addMonths, daysInMonth, fmt, formatMonth, formatShortDate, html, isValidDateStr, isValidMonthStr, setHTML, thisMonth, todayStr, uid } from '../util.js';

const parseAmount = (v) => {
  const n = Number(String(v).replace(/[,，\s]/g, ''));
  return Number.isFinite(n) ? Math.round(Math.abs(n)) : NaN;
};

/** 用過的項目名稱（預設清單＋所有薪資單上出現過的） */
function itemNames(kind) {
  const used = new Set(DEFAULT_SALARY_ITEMS[kind]);
  for (const s of state.salarySlips) {
    for (const l of s.lines) {
      if (kind === 'earn' && l.amount > 0) used.add(l.name);
      if (kind === 'deduct' && l.amount < 0) used.add(l.name);
    }
    if (kind === 'bonus' && s.kind === 'bonus' && s.title) used.add(s.title);
  }
  return [...used];
}

/** 下個月的同一天（月底時取該月最後一天） */
function payDateFor(period, day) {
  const m = addMonths(period, 1);
  const d = Math.min(Number(day) || 10, daysInMonth(m));
  return `${m}-${String(d).padStart(2, '0')}`;
}

/**
 * openSlipEditor({ slip })：編輯；openSlipEditor({ kind, period })：新增
 */
export function openSlipEditor({ slip = null, kind = 'monthly', period = thisMonth() } = {}) {
  const s = state.settings;
  const last = lastMonthlySlip(slip?.period || period);
  const f = {
    kind: slip?.kind || kind,
    period: slip?.period || period,
    title: slip?.title || '',
    payDate: slip ? slip.payDate || '' : '',
    payment: slip ? slip.payment || '' : s.salaryPayment || last?.payment || '',
    note: slip?.note || '',
    earn: [],
    deduct: [],
    link: slip?.txId || null, // null = 新增一筆；'none' = 不產生
    linkTouched: !!slip,
  };
  const fromLines = (lines) => {
    f.earn = lines.filter((l) => l.amount > 0).map((l) => ({ name: l.name, value: String(l.amount), note: l.note || '' }));
    f.deduct = lines.filter((l) => l.amount < 0).map((l) => ({ name: l.name, value: String(-l.amount), note: l.note || '' }));
  };
  const resetForKind = () => {
    if (f.kind === 'monthly') {
      if (last) fromLines(last.lines);
      else {
        f.earn = ['本薪', '伙食津貼', '免稅加班'].map((name) => ({ name, value: '' }));
        f.deduct = ['福利金', '勞保費', '健保費'].map((name) => ({ name, value: '' }));
      }
      if (!f.payDate) f.payDate = payDateFor(f.period, last?.payDate?.slice(8, 10));
    } else {
      f.title = f.title || DEFAULT_SALARY_ITEMS.bonus[0];
      f.earn = [{ name: f.title, value: '' }];
      f.deduct = [];
      f.payDate = todayStr();
    }
  };
  if (slip) fromLines(slip.lines);
  else resetForKind();

  let body;
  const sheet = openSheet({
    title: slip ? '編輯薪資單' : '新增薪資單',
    right: { label: '儲存', strong: true, onClick: () => save() },
    render: (b) => {
      body = b;
      draw();
    },
  });
  sheet.el.classList.add('slip-sheet');

  // ---------- 畫面 ----------
  function rows(kind) {
    const list = f[kind];
    return html`${list.map((r, i) => html`<div class="field sl-row">
        <label for="sl-${kind}-${i}">${r.name}${ITEM_ALIAS[r.name] ? html`<em>${ITEM_ALIAS[r.name]}</em>` : ''}${r.note ? html`<em>${r.note}</em>` : ''}</label>
        <span class="sl-sign">${kind === 'deduct' ? '−' : ''}</span>
        <input id="sl-${kind}-${i}" type="text" inputmode="numeric" autocomplete="off" data-kind="${kind}" data-i="${i}" value="${r.value}" placeholder="0">
        <button type="button" class="sl-del" data-del="${kind}:${i}" aria-label="移除${r.name}">${icon('close')}</button>
      </div>`)}`;
  }

  function addChips(kind) {
    const have = new Set(f[kind].map((r) => r.name));
    const rest = itemNames(kind === 'earn' && f.kind === 'bonus' ? 'bonus' : kind).filter((n) => !have.has(n));
    return html`<div class="chips sl-add">${rest.map((n) => html`<button type="button" data-add="${kind}:${n}">＋ ${n}</button>`)}
      <button type="button" data-custom="${kind}">＋ 自訂</button></div>`;
  }

  function draw() {
    const pays = sortByUsage(s.payments.filter((p) => !p.hidden || p.name === f.payment), paymentUsage());
    setHTML(
      body,
      html`${slip ? '' : html`<div class="seg" data-seg="kind">
            ${[['monthly', '月薪單'], ['bonus', '獎金／禮金']].map(([v, t]) => html`<button type="button" data-v="${v}" class="${f.kind === v ? 'on' : ''}" aria-pressed="${String(f.kind === v)}">${t}</button>`)}
          </div>`}
        <div class="sl-net" aria-live="polite"></div>

        <div class="form" style="margin-top:var(--s3)">
          <div class="field"><label for="sl-period">薪資月份</label><input id="sl-period" type="month" value="${f.period}"></div>
          ${f.kind === 'bonus'
            ? html`<div class="field"><label for="sl-title">名稱</label><input id="sl-title" type="text" list="sl-bonus-names" value="${f.title}" autocomplete="off">
                <datalist id="sl-bonus-names">${itemNames('bonus').map((n) => html`<option value="${n}"></option>`)}</datalist></div>`
            : ''}
          <div class="field"><label for="sl-pay">入帳日</label><input id="sl-pay" type="date" value="${f.payDate}"></div>
        </div>
        <h2 class="sec-h">入帳方式</h2>
        <div class="chips sl-payments">${pays.map((p) => html`<button type="button" class="${p.name === f.payment ? 'on' : ''}" data-pay="${p.name}">${p.name}</button>`)}</div>

        <h2 class="sec-h"><span>應發項目</span><span class="sl-sum" data-sum="earn"></span></h2>
        <div class="form">${rows('earn')}</div>
        ${addChips('earn')}

        <h2 class="sec-h"><span>扣除項目</span><span class="sl-sum" data-sum="deduct"></span></h2>
        ${f.deduct.length ? html`<div class="form">${rows('deduct')}</div>` : ''}
        ${addChips('deduct')}

        <h2 class="sec-h">對應的收入明細</h2>
        <div class="form"><div class="field"><label for="sl-link">收入明細</label><select id="sl-link"></select></div></div>
        <p class="field-note sl-link-note"></p>

        <div class="form" style="margin-top:var(--s4)">
          <div class="field"><input id="sl-note" class="wide" type="text" value="${f.note}" placeholder="備註（選填）" autocomplete="off"></div>
        </div>
        ${slip ? html`<div class="list" style="margin-top:var(--s5)"><button type="button" class="row tap danger" data-remove>刪除薪資單</button></div>` : ''}`,
    );
    bind();
    update();
  }

  function bind() {
    bindSegmented(body, (_, v) => {
      f.kind = v;
      f.payDate = '';
      f.linkTouched = false;
      resetForKind();
      draw();
    });
    body.querySelector('#sl-period').addEventListener('change', (e) => {
      if (!isValidMonthStr(e.target.value)) return;
      const old = f.period;
      f.period = e.target.value;
      // 月薪單的入帳日跟著薪資月份移動
      if (f.kind === 'monthly' && f.payDate && f.payDate.slice(0, 7) === addMonths(old, 1)) f.payDate = payDateFor(f.period, f.payDate.slice(8, 10));
      body.querySelector('#sl-pay').value = f.payDate;
      update();
    });
    body.querySelector('#sl-pay').addEventListener('change', (e) => {
      f.payDate = isValidDateStr(e.target.value) ? e.target.value : '';
      update();
    });
    body.querySelector('#sl-title')?.addEventListener('input', (e) => {
      const oldTitle = f.title;
      f.title = e.target.value.trim();
      if (f.earn[0] && (f.earn[0].name === oldTitle || !f.earn[0].name)) {
        f.earn[0].name = f.title || '獎金';
        const lab = body.querySelector('label[for="sl-earn-0"]');
        if (lab) lab.textContent = f.earn[0].name;
      }
    });
    body.querySelector('.sl-payments').addEventListener('click', (e) => {
      const p = e.target.closest('[data-pay]')?.dataset.pay;
      if (!p) return;
      f.payment = f.payment === p ? '' : p;
      body.querySelectorAll('.sl-payments button').forEach((b) => b.classList.toggle('on', b.dataset.pay === f.payment));
    });
    body.addEventListener('input', (e) => {
      const k = e.target.dataset?.kind;
      if (!k) return;
      f[k][Number(e.target.dataset.i)].value = e.target.value;
      update();
    });
    body.addEventListener('click', (e) => {
      const del = e.target.closest('[data-del]')?.dataset.del;
      const add = e.target.closest('[data-add]')?.dataset.add;
      const custom = e.target.closest('[data-custom]')?.dataset.custom;
      if (del) {
        const [k, i] = del.split(':');
        f[k].splice(Number(i), 1);
        draw();
      } else if (add) {
        const [k, ...n] = add.split(':');
        f[k].push({ name: n.join(':'), value: '' });
        draw();
        focusLast(k);
      } else if (custom) {
        const name = window.prompt(custom === 'deduct' ? '扣除項目名稱' : '應發項目名稱');
        if (!name || !name.trim()) return;
        f[custom].push({ name: name.trim(), value: '' });
        draw();
        focusLast(custom);
      }
    });
    body.querySelector('#sl-link').addEventListener('change', (e) => {
      f.link = e.target.value === '' ? null : e.target.value;
      f.linkTouched = true;
      update();
    });
    body.querySelector('#sl-note').addEventListener('input', (e) => (f.note = e.target.value));
    body.querySelector('[data-remove]')?.addEventListener('click', () => remove());
  }

  function focusLast(k) {
    const inputs = body.querySelectorAll(`input[data-kind="${k}"]`);
    inputs[inputs.length - 1]?.focus();
  }

  function currentLines() {
    const out = [];
    for (const r of f.earn) {
      const n = parseAmount(r.value || 0);
      if (n > 0) out.push({ name: r.name, amount: n, ...(r.note ? { note: r.note } : {}) });
    }
    for (const r of f.deduct) {
      const n = parseAmount(r.value || 0);
      if (n > 0) out.push({ name: r.name, amount: -n, ...(r.note ? { note: r.note } : {}) });
    }
    return out;
  }

  /** 金額或日期變動時：更新合計、實領，以及收入明細的連結選項 */
  function update() {
    const lines = currentLines();
    const t = slipTotals({ lines });
    body.querySelector('[data-sum="earn"]').textContent = t.earn ? fmt(t.earn) : '';
    body.querySelector('[data-sum="deduct"]').textContent = t.deduct ? `−${fmt(t.deduct)}` : '';
    setHTML(
      body.querySelector('.sl-net'),
      html`<span class="sl-net-l">實領 · ${formatMonth(f.period)}${f.kind === 'bonus' ? ` ${f.title || '獎金'}` : ' 薪資'}</span>
        <b class="sl-net-v">${fmt(t.net)}</b>
        <span class="sl-net-s">應發 ${fmt(t.earn)}　應扣 ${fmt(t.deduct)}</span>`,
    );

    const draft = { id: slip?.id || '__new__', period: f.period, payDate: f.payDate };
    const cands = f.payDate ? linkCandidates(draft, t.net) : [];
    if (!f.linkTouched) {
      const exact = cands.find((c) => c.amount === t.net && c.category === SALARY_CATEGORY && c.date.slice(0, 7) === f.payDate.slice(0, 7));
      f.link = exact ? exact.id : null;
    }
    if (f.link && f.link !== 'none' && !cands.some((c) => c.id === f.link)) f.link = null;
    const sel = body.querySelector('#sl-link');
    const label = (c) => `${formatShortDate(c.date)} ${c.category}${c.note ? ` · ${c.note}` : ''} ${fmt(c.amount)}${c.salaryId && c.salaryId === slip?.id ? '（目前）' : ''}`;
    setHTML(
      sel,
      html`<option value="">${t.net > 0 && f.payDate ? '新增一筆收入明細' : '不產生收入明細'}</option>
        ${cands.map((c) => html`<option value="${c.id}" ${c.id === f.link ? 'selected' : ''}>${label(c)}</option>`)}`,
    );
    const chosen = cands.find((c) => c.id === f.link);
    body.querySelector('.sl-link-note').textContent = !f.payDate
      ? '沒有入帳日時不會產生收入明細（例如過去月份的紀錄）。'
      : t.net <= 0
        ? '實領為 0，不會產生收入明細。'
        : chosen
          ? `會和這筆既有明細連結，金額改成 ${fmt(t.net)}、日期改成 ${formatShortDate(f.payDate)}，不會重複記帳。`
          : `儲存時會新增一筆「收入 · ${SALARY_CATEGORY}」${fmt(t.net)}，日期 ${formatShortDate(f.payDate)}。如果這筆薪水之前已經記過，請在上面選它，避免重複。`;
  }

  // ---------- 儲存／刪除 ----------
  async function save() {
    const lines = currentLines();
    const bad = [...f.earn, ...f.deduct].find((r) => r.value !== '' && Number.isNaN(parseAmount(r.value)));
    if (bad) return alertMsg('金額格式不正確', `「${bad.name}」請輸入數字。`);
    if (!lines.length) return alertMsg('還沒有填金額', '至少填一個項目的金額。');
    if (f.kind === 'bonus' && !f.title) return alertMsg('請填獎金名稱', '例如 績效獎金、三節禮金。');
    if (f.kind === 'monthly' && state.salarySlips.some((x) => x.kind === 'monthly' && x.period === f.period && x.id !== slip?.id)) {
      return alertMsg(`${formatMonth(f.period)}已經有月薪單`, '一個月只能有一張月薪單。請改薪資月份，或回去編輯原本那張；獎金請用「獎金／禮金」。');
    }
    const next = {
      id: slip?.id || `s-${uid()}`,
      kind: f.kind,
      period: f.period,
      title: f.kind === 'bonus' ? f.title : '',
      payDate: f.payDate || null,
      payment: f.payment,
      lines,
      note: f.note.trim(),
      txId: slip?.txId || null,
      source: slip?.source || 'app',
    };
    const saved = saveSlip(next, { linkTxId: f.link && f.link !== 'none' ? f.link : null });
    sheet.close();
    toast(`已儲存 ${slipFullName(saved)}${saved.txId ? '，收入明細已同步' : ''}`);
  }

  async function remove() {
    const tx = slip.txId ? state.transactions.find((t) => t.id === slip.txId) : null;
    const choice = await dialog({
      title: `刪除「${slipFullName(slip)}」？`,
      message: tx ? `這張薪資單連結了 ${formatShortDate(tx.date)} 的收入明細 ${fmt(tx.amount)}。` : '',
      buttons: tx
        ? [
            { label: '連同收入明細一起刪除', value: 'both', role: 'destructive' },
            { label: '只刪薪資單（保留收入明細）', value: 'slip' },
            { label: '取消', value: null, role: 'cancel' },
          ]
        : [
            { label: '取消', value: null, role: 'cancel' },
            { label: '刪除', value: 'slip', role: 'destructive' },
          ],
    });
    if (!choice) return;
    deleteSlip(slip, choice === 'both');
    sheet.close();
    toast('已刪除薪資單');
  }
}
