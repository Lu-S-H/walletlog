// 第一次使用
import { APP_NAME } from '../config.js';
import { pickBackupFile } from '../backup.js';
import { icon } from '../icons.js';
import * as store from '../store.js';
import { html, setHTML } from '../util.js';

const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function renderOnboarding(el) {
  setHTML(
    el,
    html`<div class="onb">
      <img class="onb-logo" src="icons/icon-180.png" alt="" width="72" height="72">
      <h1>${APP_NAME}</h1>
      <p>記錄每天的收支與薪資明細。資料只存在這支手機，不會上傳到任何地方，也可以離線使用。</p>
      ${isIOS() && !isStandalone()
        ? html`<div class="card onb-install">
            <div class="card-label">先加到主畫面</div>
            <ol class="steps-list">
              <li>點 Safari 下方的「分享」${icon('share')}</li>
              <li>往下滑，選「加入主畫面」${icon('addHome')}</li>
              <li>之後從主畫面的「${APP_NAME}」圖示開啟</li>
            </ol>
            <p class="note">Safari 分頁和主畫面 App 的資料是分開的，請只在主畫面 App 裡記帳。</p>
          </div>`
        : ''}
      <div class="grow"></div>
      <div class="actions">
        <button type="button" class="btn-primary" data-start>開始使用</button>
        <button type="button" class="btn-secondary" data-restore>匯入備份檔</button>
        <p class="note center">可以匯入「${APP_NAME}」的備份檔，或電腦版「AI記帳」的備份檔（AI記帳備份-日期.json）。有 Excel 薪資匯入檔的話，匯入電腦版資料之後再匯入它。</p>
      </div>
    </div>`,
  );
  el.querySelector('[data-start]').addEventListener('click', () => store.saveSettings({ onboarded: true }));
  el.querySelector('[data-restore]').addEventListener('click', () => pickBackupFile());
}
