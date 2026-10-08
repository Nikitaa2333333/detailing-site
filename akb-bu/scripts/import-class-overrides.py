"""Классы от заказчика из заполненной таблицы → src/data/car-overrides.json.

Таблица — та, что собирали для заказчика (листы «1. Расходится с прайсом» … «5. Остальные»,
колонка «Ваш класс»: 1–5 или «отдельно»). Таблица — источник правды по классам: в json
попадает класс каждой модели (was — что было на сайте до таблицы). Формулы вида «=G130» (заказчик протянул «как на сайте»)
разворачиваются в значение ячейки.

    python scripts/import-class-overrides.py "../Классы_машин_заказчик.xlsx"

Дальше npm run build: модель, которой больше нет в справочнике, сборка назовёт сама."""
import json
import sys
from datetime import date
from pathlib import Path

import openpyxl

OUT = Path(__file__).resolve().parent.parent / 'src' / 'data' / 'car-overrides.json'


def norm(v):
    if v is None:
        return ''
    if isinstance(v, float):
        v = int(v)
    s = str(v).strip().lower()
    return 'premium' if s == 'отдельно' else s


def main(path):
    wb = openpyxl.load_workbook(path)
    models, kept, bad = {}, 0, []
    for ws in wb.worksheets:
        head = [c.value for c in ws[3]]
        if 'Ваш класс' not in head:
            continue  # «Как заполнять»
        mine = head.index('Ваш класс')
        note = head.index('Комментарий')
        site = head.index('Класс в вашем прайсе') if 'Класс в вашем прайсе' in head else head.index('Класс на сайте')
        for row in ws.iter_rows(min_row=4):
            brand, model = row[0].value, row[1].value
            if not brand:
                continue
            v = row[mine].value
            if isinstance(v, str) and v.startswith('='):
                v = ws[v[1:]].value  # «=G130» — ссылка на свою же строку
            cls, was = norm(v), norm(row[site].value)
            if not cls:
                continue
            if cls not in {'1', '2', '3', '4', '5', 'premium'}:
                bad.append(f'{ws.title}: {brand} {model} — «{v}»')
                continue
            kept += cls == was
            entry = {'cls': cls, 'was': was}
            if row[note].value and str(row[note].value).strip().lower() != 'подходит':
                entry['note'] = str(row[note].value).strip()
            models.setdefault(brand, {})[model] = entry
    if bad:
        sys.exit('Непонятные значения в «Ваш класс»:\n' + '\n'.join(bad))
    old = json.loads(OUT.read_text(encoding='utf-8'))
    old.update(updated=date.today().isoformat(), source=Path(path).name, models=models)
    OUT.write_text(json.dumps(old, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    n = sum(len(m) for m in models.values())
    prem = sum(1 for m in models.values() for e in m.values() if e['cls'] == 'premium')
    print(f'car-overrides.json: {n} моделей из таблицы — изменено {n - kept} (из них «отдельно» {prem}), как было {kept}')


if __name__ == '__main__':
    main(sys.argv[1])
