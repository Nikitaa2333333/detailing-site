"""Воздух в выгруженном Google-документе: поля в ячейках, межстрочный, отступы у заголовков,
списков и подписей «Что входит» / «Условия». Индексы не сдвигает — только стили.

  python style.py DOC.json > requests.json   # DOC.json — ответ read_doc (documents.get)
Печатает {"requests": [...], "writeControl": {...}} для update_doc."""
import json, sys

doc = json.load(open(sys.argv[1]))
doc = doc.get('content', doc)
tab = doc['tabs'][0]
tab_id = tab['tabProperties']['tabId']
body = tab['documentTab']['body']['content']
PT = lambda v: {'magnitude': v, 'unit': 'PT'}
req = []


def para(start, end, **style):
    req.append({'updateParagraphStyle': {
        'range': {'startIndex': start, 'endIndex': end},
        'paragraphStyle': {k: (PT(v) if k.startswith('space') else v) for k, v in style.items()},
        'fields': ','.join(style)}})


HEAD = {'HEADING_1': (32, 12), 'HEADING_2': (22, 8), 'HEADING_3': (16, 4)}
LABEL_COL = {'Что', 'Заголовок', 'Ситуация', 'Шаг', 'Вопрос', 'Где', 'Раздел', 'Пакет', 'Цифра', 'Документ'}

end = body[-1]['endIndex']
para(1, end - 1, lineSpacing=130, spaceAbove=0, spaceBelow=8)
runs = []  # (start, end, kind) подряд идущих абзацев одного вида — сливаем в один запрос
for i, el in enumerate(body):
    if 'paragraph' in el:
        p = el['paragraph']
        kind = p['paragraphStyle'].get('namedStyleType', 'NORMAL_TEXT')
        s, e = el['startIndex'], el['endIndex']
        text = ''.join(r.get('textRun', {}).get('content', '') for r in p['elements']).strip()
        nxt = body[i + 1] if i + 1 < len(body) else {}
        k = (kind if kind in HEAD else 'bullet' if 'bullet' in p else 'label' if text in ('Что входит:', 'Условия:')
             else 'empty' if not text else 'beforetable' if 'table' in nxt else None)
        if k and runs and runs[-1][2] == k and runs[-1][1] == s:
            runs[-1][1] = e
        elif k:
            runs.append([s, e, k])
    elif 'table' in el:
        t = el['table']
        start = el['startIndex']
        para(start + 1, el['endIndex'] - 1, lineSpacing=125, spaceBelow=0)
        # Поля ячеек
        req.append({'updateTableCellStyle': {
            'tableStartLocation': {'index': start},
            'tableCellStyle': {'paddingTop': PT(7), 'paddingBottom': PT(7), 'paddingLeft': PT(9), 'paddingRight': PT(9)},
            'fields': 'paddingTop,paddingBottom,paddingLeft,paddingRight'}})
        # Узкая левая колонка у таблиц «где — текст», сравнение — пополам
        first = ''.join(r.get('textRun', {}).get('content', '') for r in
                        t['tableRows'][0]['tableCells'][0]['content'][0]['paragraph']['elements']).strip()
        widths = [150, 318] if first in LABEL_COL else [234, 234]
        if t['columns'] == 2:
            for col, w in enumerate(widths):
                req.append({'updateTableColumnProperties': {
                    'tableStartLocation': {'index': start}, 'columnIndices': [col],
                    'tableColumnProperties': {'widthType': 'FIXED_WIDTH', 'width': PT(w)}, 'fields': 'widthType,width'}})

for st, en, k in runs:
    if k in HEAD:
        para(st, en, spaceAbove=HEAD[k][0], spaceBelow=HEAD[k][1], keepWithNext=True)
    elif k == 'bullet':
        para(st, en, lineSpacing=125, spaceBelow=4)
    elif k == 'label':
        para(st, en, spaceAbove=10, spaceBelow=4, keepWithNext=True)
    elif k == 'empty':
        para(st, en, spaceBelow=0)
    else:
        para(st, en, spaceBelow=12)

json.dump({'requests': req, 'writeControl': {'requiredRevisionId': doc['revisionId']}}, sys.stdout, ensure_ascii=False, separators=(',', ':'))
