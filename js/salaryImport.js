// Excel 薪資歷史匯入（一次性）：由一般的「匯入備份檔」辨認檔案類型後呼叫。
// 和備份還原不同：只把薪資單「加進去」，不覆蓋任何資料，也不碰收支明細；已存在的薪資單會略過。
import { applySalaryImport, parseSalaryImport, planSalaryImport } from './salary.js';
import * as store from './store.js';
import { state } from './store.js';
import { alertMsg, dialog, toast } from './ui.js';
import { focusSalaryMonth } from './views/salary.js';

export async function importSalaryHistory(obj) {
  const res = parseSalaryImport(obj);
  if (res.error) {
    await alertMsg('無法匯入', [res.error, '手機上的資料沒有任何變動。']);
    return false;
  }
  const plan = planSalaryImport(res.months);
  const nm = plan.slips.filter((s) => s.kind === 'monthly').length;
  const nb = plan.slips.length - nm;
  if (!plan.slips.length) {
    await alertMsg('沒有新的薪資單', plan.skipped ? '這個匯入檔的內容都已經匯入過了，不需要再匯入。' : '匯入檔裡沒有薪資資料。');
    return false;
  }
  const range = `${plan.slips[0].period} – ${plan.slips.at(-1).period}`;
  const message = [
    `${range}：${nm} 張月薪單、${nb} 張獎金單，會加入「薪資」。`,
    '只記錄薪資組成，不會新增或改動任何收支明細，現有資料也不會被覆蓋。',
  ];
  if (!state.transactions.length) message.push('目前還沒有收支明細。如果要匯入電腦版 AI記帳 備份，請先匯入那個（它會取代全部資料），再匯入薪資。');
  if (plan.skipped) message.push('部分月份的薪資單已經在 App 裡，會略過、不會重複。');
  const ok = await dialog({
    title: '匯入 Excel 薪資歷史？',
    message,
    buttons: [
      { label: '取消', value: false, role: 'cancel' },
      { label: '匯入', value: true },
    ],
  });
  if (!ok) return false;
  applySalaryImport(plan);
  if (!state.settings.onboarded) store.saveSettings({ onboarded: true });
  // 匯入後打開薪資頁最新一張的月份
  focusSalaryMonth(plan.slips.reduce((m, x) => (x.period > m ? x.period : m), plan.slips[0].period));
  location.hash = 'salary';
  toast(`已匯入 ${plan.slips.length} 張薪資單`);
  return true;
}
