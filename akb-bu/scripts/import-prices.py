# -*- coding: utf-8 -*-
"""Прайс-лист детейлинг-центра (xlsx) -> src/data/prices.json.

Запуск (из корня akb-bu):
    python scripts/import-prices.py "../Прайс-лист_сентябрь 2026г_new.xlsx"

Что делает:
  * каждый лист книги = категория прайса, внутри — группы и услуги;
  * цена разбирается в структуру {kind: exact|from|upto|range|text};
  * из услуги вытаскиваются длительность [~ 30 мин], состав работ и сноски;
  * ВЫКИДЫВАЕТ внутренние строки («Информация не для сайта! Для менеджера…»,
    разбивку заказ-наряда) и шаблонную простыню, повторяющуюся на каждом листе;
  * классификация авто (5 классов, бренд -> модели) собирается отдельно —
    из неё кормится виджет «марка -> модель -> класс».

Зависимость: openpyxl.
"""
import json
import re
import sys
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "data" / "prices.json"

# Шаблонные абзацы, повторяющиеся в подвале каждого листа.
BOILER = (
    "Прайс-лист на услуги регулярного ухода",
    "Уважаемые клиенты, обращаем",
    "Мойка автомобилей осуществляется исполнителем",
    "Koch Chemie GmbH производитель",
    "Если есть понятие VIP",
    "Все цены указаны в рублях",
    "Классификация автомобилей",
    "Спорткары и суперкары",
    "Мотоциклы относятся",
    "Данная таблица составлена",
    "О дополнительной потребности пробивки",
)
# Строки, которых на сайте быть не должно ни при каких условиях.
INTERNAL = ("Информация не для сайта", "Информация для менеджера")

CLASS_RE = re.compile(r"^\s*(\d)\s*класс\s+[Пп]о шкале\s*[-–]\s*(.+)$", re.S)
DUR_RE = re.compile(r"\[\s*~\s*([^\]]+)\]")
NUM_STEP_RE = re.compile(r"^\d+\.\s*\S")
ORDINAL_RE = re.compile(r"^\d+\.$")
PRICE_RE = re.compile(r"^(от|до)?\s*([\d\s]+)(?:\s*[-–]\s*([\d\s]+))?$")
TRANSLIT = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e",
    "ж": "zh", "з": "z", "и": "i", "й": "j", "к": "k", "л": "l", "м": "m",
    "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "h", "ц": "c", "ч": "ch", "ш": "sh", "щ": "sch",
    "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
}


def is_boiler(text):
    """Шаблонная простыня — сравниваем по НАЧАЛУ строки.

    Те же слова встречаются внутри описаний услуг (оговорка про гарантию
    сидит в описании мойки ДВС), поэтому поиск подстроки тут не годится.
    """
    head = text.lstrip("*").strip()
    return any(head.startswith(m) for m in BOILER)


def is_internal(text):
    return any(m in text for m in INTERNAL)


def slug(text):
    out = []
    for ch in text.lower():
        if ch in TRANSLIT:
            out.append(TRANSLIT[ch])
        elif ch.isalnum():
            out.append(ch)
        else:
            out.append("-")
    return re.sub(r"-+", "-", "".join(out)).strip("-")[:60]


def parse_price(raw):
    """'790' -> exact, 'от 600' -> from, '40 500 - 59 000' -> range."""
    if raw is None:
        return None
    text = str(raw).strip().replace("\xa0", " ")
    if not text or is_internal(text):
        return None
    m = PRICE_RE.match(text)
    if not m:
        return {"kind": "text", "text": text}
    prefix, low, high = m.group(1), m.group(2), m.group(3)
    low = int(low.replace(" ", ""))
    if high:
        return {"kind": "range", "min": low, "max": int(high.replace(" ", ""))}
    if prefix == "от":
        return {"kind": "from", "value": low}
    if prefix == "до":
        return {"kind": "upto", "value": low}
    return {"kind": "exact", "value": low}


def parse_brands(raw):
    """'AUDI A1, A3; BMW 1, Z3' -> [{brand, models}]."""
    brands = []
    for chunk in raw.split(";"):
        chunk = chunk.strip().rstrip(".")
        if not chunk:
            continue
        tokens = chunk.split()
        # единственная марка из двух слов в прайсе; остальные через дефис
        take = 2 if tokens[0] == "LAND" and len(tokens) > 1 else 1
        brand = " ".join(tokens[:take])
        rest = " ".join(tokens[take:])
        models = [m.strip() for m in rest.split(",") if m.strip()]
        brands.append({"brand": brand, "models": models})
    return brands


def cells(row):
    out = ["" if c is None else str(c).replace("\xa0", " ").strip() for c in row]
    return out + [""] * (8 - len(out))


def main(src_path):
    wb = openpyxl.load_workbook(src_path, data_only=True)
    categories = []
    car_classes = {}       # '1'..'5' -> сырая строка с марками
    moto_classes = {}      # то же для мототехники
    footnotes = {}         # '**' -> текст сквозной сноски
    dropped = []           # внутренние строки, для отчёта

    for ws in wb.worksheets:
        rows = [cells(r) for r in ws.iter_rows(values_only=True)]
        is_moto = "Мототехника" in ws.title

        header_rows = [i for i, r in enumerate(rows) if r[0] == "Наименование"]
        if not header_rows:
            continue
        price_cols = [
            (ci, rows[header_rows[0]][ci])
            for ci in range(2, 8)
            if rows[header_rows[0]][ci]
        ]

        head_lines = [
            r[0] for r in rows[: header_rows[0]]
            if r[0] and not is_boiler(r[0]) and not is_internal(r[0])
        ]
        cat = {
            "id": slug(ws.title),
            "sheet": ws.title,
            "title": ws.title,
            "headings": [t for t in head_lines if len(t) < 120],
            "classLabels": [label for _, label in price_cols],
            "intro": [t for t in head_lines if len(t) >= 120],
            "groups": [],
            "notes": [],
        }
        group = None
        svc = None
        seen_header = False

        def push_group(name):
            nonlocal group
            group = {"title": name, "services": []}
            cat["groups"].append(group)

        for i, r in enumerate(rows):
            a, b = r[0], r[1]
            prices_raw = [r[ci] for ci, _ in price_cols]
            has_price = any(p for p in prices_raw)
            joined = (a + " " + b).strip()

            if not joined and not has_price:
                continue
            if a == "Наименование":
                seen_header = True
                continue
            # сквозные сноски прайса (** шиномонтаж, *** гарантия)
            fm = re.match(r"^(\*{2,})\s*(.+)$", a, re.S)
            if fm and not has_price:
                footnotes.setdefault(fm.group(1), re.sub(r"\s+", " ", fm.group(2)).strip())
                continue
            if not b and is_boiler(joined):
                continue
            m = CLASS_RE.match(a)
            if m:
                target = moto_classes if is_moto else car_classes
                target.setdefault(m.group(1), m.group(2).strip())
                continue
            if is_internal(joined) or any(is_internal(str(p)) for p in prices_raw):
                dropped.append((ws.title, i + 1, joined[:70]))
                continue
            # разбивка заказ-наряда: '1.' | 'арматурные работы' | цены
            if has_price and (not a or ORDINAL_RE.match(a)):
                dropped.append((ws.title, i + 1, joined[:70]))
                continue

            if has_price and a:
                lines = [l.strip() for l in a.split("\n") if l.strip()]
                name = lines[0]
                rest = [l for l in lines[1:] if l != "Услуга состоит из:"]
                dur = DUR_RE.search(name)
                for l in rest:
                    if dur:
                        break
                    dur = DUR_RE.search(l)
                if group is None:
                    push_group("")
                clean = DUR_RE.sub("", name).strip(" .|")
                star = re.search(r"(\*+)\s*$", clean)
                svc = {
                    "id": slug(name),
                    "name": re.sub(r"\*+\s*$", "", clean).strip(),
                    "footnote": star.group(1) if star else "",
                    "duration": dur.group(1).strip() if dur else "",
                    "desc": [
                        DUR_RE.sub("", l).strip() for l in rest
                        if DUR_RE.sub("", l).strip()
                    ],
                    "steps": [],
                    "notes": [],
                    "prices": {
                        label: parse_price(raw)
                        for (_, label), raw in zip(price_cols, prices_raw)
                    },
                }
                group["services"].append(svc)
                continue

            # строка только в колонке A после шапки — подзаголовок-группа
            # («ЗАЩИТА ПЛЁНКОЙ SUNTEK», «Новое авто», «Авто с пробегом»)
            if a and not b and seen_header:
                if len(a) < 120 and "\n" not in a:
                    push_group(a)
                    svc = None
                else:
                    cat["notes"].append(a)
                continue

            for l in [l.strip() for l in (b or a).split("\n") if l.strip()]:
                if is_boiler(l) or is_internal(l) or l == "Услуга состоит из:":
                    continue
                if svc is None:
                    cat["intro"].append(l)
                    continue
                d = DUR_RE.search(l)
                if d and not svc["duration"]:
                    svc["duration"] = d.group(1).strip()
                    l = DUR_RE.sub("", l).strip()
                    if not l:
                        continue
                if NUM_STEP_RE.match(l):
                    svc["steps"].append(re.sub(r"^\d+\.\s*", "", l))
                elif l.startswith("*"):
                    svc["notes"].append(l.lstrip("* ").strip())
                else:
                    svc["desc"].append(l)

        cat["groups"] = [g for g in cat["groups"] if g["services"]]
        if len(cat["groups"]) == 1 and cat["groups"][0]["title"] in cat["headings"] + [""]:
            cat["groups"][0]["title"] = ""
        categories.append(cat)

    data = {
        "source": Path(src_path).name,
        "currency": "RUB",
        "classes": [
            {
                "id": k,
                "label": f"{k}-й класс",
                "raw": v,
                "brands": parse_brands(v),
            }
            for k, v in sorted(car_classes.items())
        ],
        "motoClasses": [
            {"id": k, "label": f"{k}-й класс", "raw": v}
            for k, v in sorted(moto_classes.items())
        ],
        "footnotes": [{"marker": k, "text": v} for k, v in sorted(footnotes.items())],
        "categories": categories,
    }
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    services = sum(len(g["services"]) for c in categories for g in c["groups"])
    brands = sum(len(c["brands"]) for c in data["classes"])
    print(f"{OUT.relative_to(ROOT)}: категорий {len(categories)}, услуг {services}, "
          f"марок в классификации {brands}, внутренних строк выкинуто {len(dropped)}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    if len(sys.argv) > 1:
        src = sys.argv[1]
    else:
        # по умолчанию — единственный xlsx рядом с репозиторием
        # (путь с кириллицей в аргументе PowerShell ломает, так удобнее)
        found = sorted(ROOT.parent.glob("*.xlsx"))
        if len(found) != 1:
            sys.exit(f"ожидал один xlsx в {ROOT.parent}, нашёл {len(found)}; "
                     f"укажите путь явно")
        src = str(found[0])
    main(src)
