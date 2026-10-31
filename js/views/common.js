// 各頁共用的小元件
import { icon } from '../icons.js';
import { html } from '../util.js';

/** 子頁標題：左上返回連結＋大標題 */
export function pageHead(title, back = 'more', backLabel = '更多') {
  return html`<header class="sub-head">
    <a class="back" href="#${back}">${icon('chevronLeft')}<span>${backLabel}</span></a>
    <h1 class="page-title">${title}</h1>
  </header>`;
}
