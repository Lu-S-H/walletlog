// 尚未完成的分頁（薪資：第 3 階段）
import { html, setHTML } from '../util.js';

function comingSoon(el, title, emoji, lines) {
  setHTML(
    el,
    html`<header class="page-head"><h1 class="page-title">${title}</h1></header>
      <div class="empty-box">
        <p class="big-emoji">${emoji}</p>
        <p><b>下一階段加入</b></p>
        <ul class="soon-list">${lines.map((l) => html`<li>${l}</li>`)}</ul>
      </div>`,
  );
}

export function renderSalary(el) {
  comingSoon(el, '薪資', '💰', ['月薪單逐項登記，預帶上月數字', '獎金／禮金單，可一個月多筆', '自動產生薪水收入（算在入帳日月份）', '年薪、平均月薪、各項目年度合計', '匯入 Excel 薪資明細（2024/5 – 2026/4）']);
}
