import { raw } from './util.js';

// 單色線條圖示（24×24，線寬 1.75），顏色跟隨文字色 currentColor
const PATHS = {
  list: '<path d="M8.5 6.5h11M8.5 12h11M8.5 17.5h11"/><circle cx="4.75" cy="6.5" r="1" fill="currentColor" stroke="none"/><circle cx="4.75" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="4.75" cy="17.5" r="1" fill="currentColor" stroke="none"/>',
  stats: '<path d="M4 20.5h16"/><rect x="5" y="11" width="3.5" height="6.5" rx="1"/><rect x="10.25" y="5" width="3.5" height="12.5" rx="1"/><rect x="15.5" y="8.5" width="3.5" height="9" rx="1"/>',
  wallet: '<rect x="3.5" y="6" width="17" height="13.5" rx="3"/><path d="M3.5 10h17M15.5 14.75h2"/><path d="M6 6l9.5-2.5 1 2.5"/>',
  more: '<circle cx="6.5" cy="6.5" r="2.25"/><circle cx="17.5" cy="6.5" r="2.25"/><circle cx="6.5" cy="17.5" r="2.25"/><circle cx="17.5" cy="17.5" r="2.25"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chevronLeft: '<path d="M15 5l-7 7 7 7"/>',
  chevronRight: '<path d="M9 5l7 7-7 7"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  backspace: '<path d="M8.5 5.5h11a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5h-11L3 12z"/><path d="M11.5 9.5l5 5M16.5 9.5l-5 5"/>',
  calendar: '<rect x="3.5" y="4.5" width="17" height="16" rx="2.5"/><path d="M3.5 9.5h17M8 2.75v3.5M16 2.75v3.5"/>',
  tag: '<path d="M3.5 12.6V4.5a1 1 0 0 1 1-1h8.1a1 1 0 0 1 .7.3l7.4 7.4a1 1 0 0 1 0 1.4l-8.1 8.1a1 1 0 0 1-1.4 0l-7.4-7.4a1 1 0 0 1-.3-.7z"/><circle cx="8" cy="8" r="1.5"/>',
  note: '<path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z"/><path d="M13.5 8.5l3 3"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  share: '<path d="M12 15V3.5M8 7.5l4-4 4 4"/><path d="M6 11H5v9.5h14V11h-1"/>',
  addHome: '<rect x="4" y="4" width="17" height="17" rx="3"/><path d="M12.5 8.5v8M8.5 12.5h8"/>',
  settings: '<path d="M4 7.5h16M4 16.5h16"/><circle cx="9" cy="7.5" r="2.4" fill="var(--card)"/><circle cx="15" cy="16.5" r="2.4" fill="var(--card)"/>',
  eye: '<path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  arrowDown: '<path d="M12 5v14M6 13l6 6 6-6"/>',
};

export function icon(name, cls = '') {
  return raw(
    `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] || ''}</svg>`,
  );
}
