"""把 Excel 記帳簿的「薪資明細」工作表轉成錢包日誌可匯入的 JSON（薪資頁 →「匯入 Excel 薪資明細」）。

用法：python tools/salary_from_excel.py <記帳簿.xlsx> <輸出.json>（需要 openpyxl）

工作表格式（每年一個區塊）：
  第一列：年份, 1月 … 12月（2024 年另有「年終」欄）
  之後每列：項目名稱, 各月金額（扣除項目為負數，「-」視為 0）
  區塊以「總計」列結束；「總計」之後的列（例如伙食代扣）不計入。
績效／分潤獎金列會另外標成獎金，App 匯入時會先試著和月薪一起對帳，對不上再拆成獨立的獎金單。
"""
import json
import re
import sys
from datetime import datetime, timezone

from openpyxl import load_workbook

BONUS_ROWS = {'績效獎金': '績效獎金', '績效(年終)獎金': '績效獎金', '分潤獎金': '分潤獎金'}
SHEET = '薪資明細'

# 已和使用者確認的修正：2026/1 薪資另有健檢補貼 1,200（2026-02-10 入帳 71,103），併入應發「其他」
EXTRA_LINES = {'2026-01': [{'name': '其他', 'amount': 1200, 'note': '健檢補貼'}]}


def num(v):
    if v is None or v == '-' or v == '':
        return 0
    return round(float(v))


def main(src, dst):
    ws = load_workbook(src, data_only=True, read_only=True)[SHEET]
    rows = [list(r) + [None] for r in ws.iter_rows(values_only=True)]  # 補一格，空白列也有第 0 欄
    months, problems = [], []
    i = 0
    while i < len(rows):
        head = rows[i]
        year = head[0]
        if year is None or not re.fullmatch(r'\d{4}(\.0)?', str(year)):
            i += 1
            continue
        year = int(float(year))
        cols = {}  # 欄位索引 → 期間（或「年終」）
        for c, label in enumerate(head[1:], start=1):
            if label is None:
                continue
            m = re.fullmatch(r'(\d{1,2})月', str(label))
            if m:
                cols[c] = f'{year}-{int(m.group(1)):02d}'
            elif str(label) == '年終':
                cols[c] = 'yearend'
        data = {c: {'lines': [], 'bonus': []} for c in cols}
        totals = {}
        i += 1
        while i < len(rows) and rows[i][0] is not None and str(rows[i][0]) != '總計':
            name = str(rows[i][0]).strip()
            for c in cols:
                v = num(rows[i][c] if c < len(rows[i]) else None)
                if v == 0:
                    continue
                if name in BONUS_ROWS:
                    data[c]['bonus'].append({'name': BONUS_ROWS[name], 'amount': v})
                else:
                    data[c]['lines'].append({'name': name, 'amount': v})
            i += 1
        if i < len(rows) and str(rows[i][0]) == '總計':
            for c in cols:
                totals[c] = num(rows[i][c] if c < len(rows[i]) else None)
        for c, period in cols.items():
            d = data[c]
            got = sum(x['amount'] for x in d['lines'] + d['bonus'])
            if not d['lines'] and not d['bonus']:
                continue
            if c in totals and got != totals[c]:
                problems.append(f'{year} {period}: 加總 {got} ≠ 總計 {totals[c]}')
            if period == 'yearend':  # 年終欄：整欄當成一張年終獎金單
                months.append({'period': f'{year}-12', 'lines': [], 'bonus': [{'name': '年終獎金', 'amount': got}]})
            else:
                months.append({'period': period, 'lines': d['lines'] + EXTRA_LINES.get(period, []), 'bonus': d['bonus']})
        i += 1

    out = {
        'app': 'walletlog-salary',
        'format': 1,
        'source': f'{src.replace(chr(92), "/").split("/")[-1]}「{SHEET}」',
        'createdAt': datetime.now(timezone.utc).isoformat(),
        'months': months,
    }
    with open(dst, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    return months, problems


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    months, problems = main(sys.argv[1], sys.argv[2])
    print(f'{len(months)} 個月份 → {sys.argv[2]}')
    for p in problems:
        print('⚠', p)
    for m in months:
        total = sum(x['amount'] for x in m['lines'] + m['bonus'])
        print(m['period'], f'{total:>9,}', ' 獎金:' + '、'.join(f"{b['name']} {b['amount']:,}" for b in m['bonus']) if m['bonus'] else '')
