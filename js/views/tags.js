// 標籤選擇（記一筆時使用）
import { tagUsage } from '../ledger.js';
import { state } from '../store.js';
import { html, setHTML } from '../util.js';
import { openSheet } from '../ui.js';

export function cleanTag(s) {
  return s.trim().replace(/^#+/, '').replace(/\s+/g, '');
}

/** 所有標籤（設定裡的＋明細上用過的），依使用次數排序 */
export function allTags() {
  const usage = tagUsage();
  const names = [...new Set([...state.settings.tags, ...usage.keys()])];
  return names.sort((a, b) => (usage.get(b) || 0) - (usage.get(a) || 0));
}

export function openTagPicker(selected, onDone) {
  const picked = new Set(selected);
  const extra = []; // 這次新增、還沒存進設定的標籤
  let addTyped = () => {};
  const sheet = openSheet({
    title: '標籤',
    right: { label: '完成', strong: true, onClick: () => done() },
    render: (body) => {
      setHTML(
        body,
        html`<div class="tag-add">
            <input type="text" class="tag-input" placeholder="新增標籤，例如 約會" enterkeyhint="done" autocomplete="off" aria-label="新增標籤">
            <button type="button" class="btn-small" data-add>加入</button>
          </div>
          <div class="tag-cloud"></div>
          <p class="field-note">點選標籤可加上或取消。標籤可跨分類統計，例如「#出差」包含交通、餐費、住宿。</p>`,
      );
      const input = body.querySelector('.tag-input');
      const cloud = body.querySelector('.tag-cloud');
      const draw = () => {
        const list = [...new Set([...allTags(), ...extra, ...picked])];
        setHTML(
          cloud,
          list.length
            ? html`${list.map((t) => html`<button type="button" class="tag-pill ${picked.has(t) ? 'on' : ''}" data-tag="${t}" aria-pressed="${String(picked.has(t))}">#${t}</button>`)}`
            : html`<p class="note">還沒有標籤，在上面輸入名稱新增。</p>`,
        );
      };
      const add = () => {
        const t = cleanTag(input.value);
        if (!t) return;
        if (!extra.includes(t)) extra.push(t);
        picked.add(t);
        input.value = '';
        draw();
      };
      addTyped = add;
      body.querySelector('[data-add]').addEventListener('click', add);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          add();
        }
      });
      cloud.addEventListener('click', (e) => {
        const t = e.target.closest('[data-tag]')?.dataset.tag;
        if (!t) return;
        if (picked.has(t)) picked.delete(t);
        else picked.add(t);
        draw();
      });
      draw();
    },
  });
  sheet.el.classList.add('compact');

  function done() {
    addTyped(); // 打了字但沒按「加入」也算
    onDone([...picked]);
    sheet.close();
  }
}
