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

# Лист «ДОБАВИТЬ» (заказчик, 09.10.2026): «Марка | Модель | Класс | Комментарии» его словами —
# «Ауди А3 c 2020 по н.в.», «BMW М8» (кириллицей). Строка → наша модель в справочнике.
# replaces — строка основных листов, которую эта заменяет (А3 разделили по годам).
# Новая строка на листе, которой здесь нет, — импорт падает и называет её: дописать сюда.
ADD_SHEET = 'ДОБАВИТЬ'
ADD_NAMES = {
    ('ауди', 'rs 5'): ('Audi', 'RS 5', None),
    ('ауди', 'rs 6'): ('Audi', 'RS 6', None),
    ('ауди', 'а3 c 1996 по 2020'): ('Audi', 'A3 (до 2020 г.)', 'A3'),
    ('ауди', 'а3 c 2020 по н.в.'): ('Audi', 'A3 (с 2020 г.)', None),
    ('bmw', 'x6 m'): ('BMW', 'X6 M', None),
    ('bmw', 'x5 m'): ('BMW', 'X5 M', None),
    ('bmw', 'м8'): ('BMW', 'M8', None),
    ('bmw', 'м6'): ('BMW', 'M6', None),
    ('bmw', 'м5'): ('BMW', 'M5', None),
    ('bmw', 'м4'): ('BMW', 'M4', None),
    ('bmw', 'м3'): ('BMW', 'M3', None),
    ('bmw', 'м2'): ('BMW', 'M2', None),
    ('maybach', 'sl с 2024'): ('Mercedes-Benz', 'Maybach SL', None),
}
# кириллица и латиница, которые пишут вперемешку («А3», «М8», «c 2020»), — к одному виду
LOOK = str.maketrans('асеорхмктувн', 'aceopxmktybh')


def key(v):
    return ' '.join(str(v or '').lower().translate(LOOK).split())


ADD_KEYS = {(key(b), key(m)): v for (b, m), v in ADD_NAMES.items()}


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
        if ws.title.strip() == ADD_SHEET:
            continue  # ниже, поверх основных листов
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
    # «ДОБАВИТЬ» — поверх основных листов: новые модели и правки класса
    added, unknown = 0, []
    for ws in wb.worksheets:
        if ws.title.strip() != ADD_SHEET:
            continue
        for row in ws.iter_rows(min_row=2):
            brand, model, v = (c.value for c in row[:3])
            if not brand and not model:
                continue
            target = ADD_KEYS.get((key(brand), key(model)))
            if not target:
                unknown.append(f'{str(brand).strip()} {str(model).strip()}')
                continue
            cls = norm(v)
            if cls not in {'1', '2', '3', '4', '5', 'premium'}:
                bad.append(f'{ws.title}: {brand} {model} — «{v}»')
                continue
            our_brand, our_model, replaces = target
            mine = models.setdefault(our_brand, {})
            was = (mine.pop(replaces, None) if replaces else None) or mine.get(our_model) or {}
            entry = {'cls': cls, 'was': was.get('was', '')}
            note = row[3].value if len(row) > 3 else None
            if note and key(note) not in {key('изменить'), key('добавить')}:
                entry['note'] = str(note).strip()
            mine[our_model] = entry
            added += 1
    if unknown:
        sys.exit(f'Лист «{ADD_SHEET}»: не знаю, какая это модель на сайте — допишите в ADD_NAMES:\n' + '\n'.join(unknown))
    if added:
        print(f'Лист «{ADD_SHEET}»: {added} строк поверх основных листов')
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
