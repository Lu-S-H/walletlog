// 共用的表單面板（固定支出、旅行、羽球、額外項目的新增／編輯）
// fields: [{ key, label, type, options, placeholder, list, required, show(values) }]
//   type：text | amount（整數）| decimal（可有小數）| date | select | seg（分段按鈕）| switch
import { alertMsg, confirmDanger, fieldError, openSheet } from '../ui.js';
import { html, setHTML } from '../util.js';

const num = (v) => {
  const s = String(v ?? '').replace(/[,，\s]/g, '');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};

export function openFormSheet({ title, fields, values = {}, onSave, onDelete, deleteLabel = '刪除', deleteConfirm, note, onChange }) {
  const v = { ...values };
  let body;
  const sheet = openSheet({
    title,
    right: { label: '儲存', strong: true, onClick: () => save() },
    render: (b) => {
      body = b;
      draw();
    },
  });
  sheet.el.classList.add('compact');

  function control(f, i) {
    const id = `ff-${i}`;
    const val = v[f.key] ?? '';
    if (f.type === 'select') {
      return html`<div class="field" data-field="${f.key}"><label for="${id}">${f.label}</label>
        <select id="${id}" data-key="${f.key}">${f.options.map(([o, t]) => html`<option value="${o}" ${String(o) === String(val) ? 'selected' : ''}>${t}</option>`)}</select></div>`;
    }
    if (f.type === 'switch') {
      return html`<div class="field" data-field="${f.key}"><label for="${id}">${f.label}</label>
        <span class="switch"><input type="checkbox" id="${id}" data-key="${f.key}" ${val ? 'checked' : ''}><span></span></span></div>`;
    }
    const type = f.type === 'date' ? 'date' : 'text';
    const mode = f.type === 'amount' ? 'numeric' : f.type === 'decimal' ? 'decimal' : 'text';
    return html`<div class="field" data-field="${f.key}"><label for="${id}">${f.label}</label>
      <input id="${id}" type="${type}" inputmode="${mode}" data-key="${f.key}" value="${val}" placeholder="${f.placeholder || ''}" autocomplete="off" ${f.list ? html`list="${id}-l"` : ''}>
      ${f.list ? html`<datalist id="${id}-l">${f.list.map((o) => html`<option value="${o}"></option>`)}</datalist>` : ''}</div>`;
  }

  function draw() {
    // 連續的一般欄位放進同一個表單框，分段按鈕獨立一列
    const blocks = [];
    fields.forEach((f, i) => {
      if (f.type === 'seg') blocks.push({ seg: f, i });
      else if (blocks.length && blocks.at(-1).items) blocks.at(-1).items.push([f, i]);
      else blocks.push({ items: [[f, i]] });
    });
    setHTML(
      body,
      html`${blocks.map((bk) =>
          bk.seg
            ? html`<div class="seg form-seg" data-seg="${bk.seg.key}" data-field="${bk.seg.key}">
                ${bk.seg.options.map(([o, t]) => html`<button type="button" data-v="${o}" class="${String(v[bk.seg.key]) === String(o) ? 'on' : ''}">${t}</button>`)}</div>`
            : html`<div class="form form-block">${bk.items.map(([f, i]) => control(f, i))}</div>`,
        )}
        <p class="field-note form-note"></p>
        ${onDelete ? html`<div class="list" style="margin-top:var(--s5)"><button type="button" class="row tap danger" data-delete>${deleteLabel}</button></div>` : ''}`,
    );
    body.querySelectorAll('[data-seg]').forEach((seg) =>
      seg.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-v]');
        if (!b) return;
        v[seg.dataset.seg] = b.dataset.v;
        seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
        changed(seg.dataset.seg);
      }),
    );
    body.addEventListener('input', read);
    body.addEventListener('change', read);
    body.querySelector('[data-delete]')?.addEventListener('click', async () => {
      if (!(await confirmDanger(deleteConfirm || `${deleteLabel}？`, ''))) return;
      onDelete();
      sheet.close();
    });
    refresh();
  }

  function read(e) {
    const key = e.target.dataset?.key;
    if (!key) return;
    v[key] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    changed(key);
  }

  /** onChange 可以依某個欄位改別的欄位（例如換幣別時帶入上次的匯率），改完同步回畫面 */
  function changed(key) {
    if (onChange) {
      onChange(v, key);
      body.querySelectorAll('input[data-key], select[data-key]').forEach((inp) => {
        if (inp === document.activeElement || inp.type === 'checkbox') return;
        const val = v[inp.dataset.key] ?? '';
        if (inp.value !== String(val)) inp.value = val;
      });
    }
    refresh();
  }

  /** 依目前的值顯示／隱藏欄位，並更新說明文字 */
  function refresh() {
    for (const f of fields) {
      const row = body.querySelector(`[data-field="${f.key}"]`);
      if (row) row.hidden = f.show ? !f.show(v) : false;
    }
    body.querySelectorAll('.form-block').forEach((b) => (b.hidden = ![...b.children].some((c) => !c.hidden)));
    body.querySelector('.form-note').textContent = note ? note(v) || '' : '';
  }

  function save() {
    const out = { ...v };
    for (const f of fields) {
      if (f.show && !f.show(v)) continue;
      const input = body.querySelector(`[data-key="${f.key}"]`);
      if (f.type === 'amount' || f.type === 'decimal') {
        const n = num(v[f.key]);
        if (Number.isNaN(n) || (n != null && n < 0)) return input && fieldError(input, '請輸入數字');
        if (f.required && !(n > 0)) return input && fieldError(input, '請輸入金額');
        out[f.key] = n == null ? 0 : f.type === 'amount' ? Math.round(n) : n;
        if (input) fieldError(input, '');
      } else if (f.required && !String(v[f.key] ?? '').trim()) {
        return input && fieldError(input, `請填${f.label}`);
      } else if (typeof out[f.key] === 'string') {
        out[f.key] = out[f.key].trim();
      }
    }
    const err = onSave(out);
    if (typeof err === 'string') {
      alertMsg('無法儲存', err);
      return;
    }
    sheet.close();
  }
  return sheet;
}
