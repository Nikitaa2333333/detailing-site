"""Тексты страниц сайта → HTML для Google Docs: один документ на направление + главная.

Запуск из akb-bu/scripts/texts-gdocs/:
  node --import ./reg.mjs dump.mjs   # какие строки прайса на какой странице → rows.json
  python build.py                    # out/01.html … 07.html — их залили на Диск 22.10.2026
Папка на Диске: https://drive.google.com/drive/folders/1kObwIE2r_IewRDUesuvKv8zMM9nawX3W
Слепок для сравнения с правками заказчика — данные src/data/ в коммите выгрузки."""
import json, re, html, os

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../src/data/') + '/'
OUT = os.path.dirname(os.path.abspath(__file__)) + '/out/'
os.makedirs(OUT, exist_ok=True)
pages = json.load(open(D + 'pages.json'))
content = json.load(open(D + 'content.json'))
packs = json.load(open(D + 'season-packs.json'))
rows = json.load(open(os.path.dirname(os.path.abspath(__file__)) + '/rows.json'))

e = lambda s: html.escape(str(s), quote=False)
SITE = 'dssever.ru'
svc = {p['slug']: p for p in pages['services']}
rows_svc = {p['slug']: p for p in rows['services']}
rows_dir = {d['slug']: d for d in rows['directions']}
title_of = {**{p['slug']: p['h1'] for p in pages['services']},
            **{d['slug']: d['h1'] for d in pages['directions'] if 'slug' in d}}

TABLE = '<table border="1">'


def table(head, body):
    h = ''.join(f'<td><b>{e(x)}</b></td>' for x in head)
    b = ''.join('<tr>' + ''.join(f'<td>{e(c)}</td>' for c in r) + '</tr>' for r in body)
    return f'{TABLE}<tr>{h}</tr>{b}</table><p></p>'


def ul(items):
    return '<ul>' + ''.join(f'<li>{e(x)}</li>' for x in items) + '</ul>'


def questions(draft):
    if not draft:
        return [], []
    notes = re.findall(r'(Убран[^.]*\.)', draft)
    if 'Уточнить:' not in draft:
        if 'Срок службы керамики' in draft:
            return ['Сколько служит керамика Power Shield в два слоя? В прайсе срока нет, поэтому на странице его пока не пишем.'], notes
        return [], notes
    q = draft.split('Уточнить:', 1)[1].strip()
    parts = re.split(r'\s*\d\)\s*', q) if re.search(r'\b1\)', q) else re.split(r';\s*', q)
    out = []
    for x in parts:
        x = x.strip().rstrip(';').strip()
        if x:
            x = x[0].upper() + x[1:]
            qw = ('Сколько', 'Как', 'Какой', 'Какая', 'Какие', 'Какую', 'Можно', 'Есть', 'Когда', 'Через', 'Насколько', 'Пылесосим', 'Подходит', 'Берётесь', 'Снимаете', 'Уходит', 'Клеите', 'Осматриваете', 'Задерживает', 'Не', 'От', 'Светопропускание', 'Толщина', 'Этапы', 'Экокожа', 'Гарантия', 'Снимается', 'Считается', 'Уборка')
            if '?' in x:
                x = x if x[-1] in '.?' else x + '.'
            elif True:
                x = x.rstrip('.')
                x += '?' if (x.split()[0] in qw or ' ли ' in x or x.startswith('«')) else '.'
            out.append(x)
    return out, notes


def pairs(items):
    return [[x['t'], x['d']] for x in items]


def steps_rows(steps):
    return [[s['t'], s['d']] if isinstance(s, dict) else ['', s] for s in steps]


def price_rows(groups):
    h = ''
    for g in groups:
        if g['title'] and len(groups) > 1:
            h += f'<p><i>{e(g["title"])}</i></p>'
        for r in g['rows']:
            h += f'<h3>{e(r["name"])}</h3>'
            if r.get('lead'):
                h += f'<p>{e(r["lead"])}</p>'
            if r.get('includes'):
                h += '<p><b>Что входит:</b></p>' + ul(r['includes'])
            if r.get('terms'):
                h += '<p><b>Условия:</b></p>' + ul(r['terms'])
    return h


def page_html(p, is_dir=False):
    slug = p.get('slug')
    h = f'<h1>{e(p["h1"])}</h1>'
    h += f'<p><i>Страница {SITE}/{slug}/</i></p>'
    qs, notes = questions(p.get('draft'))
    if qs or notes:
        h += '<h2>Вопросы к вам по этой странице</h2>'
        if qs:
            h += '<ol>' + ''.join(f'<li>{e(x)}</li>' for x in qs) + '</ol>'
        if notes:
            h += '<p>Сняли со страницы, потому что этого нет в прайсе: ' + e(' '.join(re.sub(r'^Убран(ы)? ответ(ы)? ', '', n.split(':', 1)[-1].strip()).replace(' — его нет в прайсе', '') for n in notes)) + ' Подтвердите, и вернём.</p>'
    h += '<h2>Первый экран</h2>'
    h += table(['Что', 'Текст'], [['Заголовок', p['h1']], ['Подзаголовок', p.get('lead', '')]])
    if p.get('outcomes'):
        h += '<h2>Что вы получите</h2>' + table(['Заголовок', 'Текст'], pairs(p['outcomes']))
    if p.get('scenarios') or p.get('about') or p.get('tasks'):
        h += f'<h2>{e(p.get("scenariosTitle", "Кому подходит"))}</h2>'
        for a in p.get('about', []):
            h += f'<p>{e(a)}</p>'
        if p.get('scenarios'):
            h += table(['Ситуация', 'Что предлагаем'], pairs(p['scenarios']))
        if p.get('tasks'):
            h += '<p><b>Когда это нужно:</b></p>' + ul(p['tasks'])
    if p.get('compare'):
        c = p['compare']
        h += f'<h2>{e(c["title"])}</h2><p><i>Сравнение двух услуг. Цены «от» сайт подставит сам.</i></p>'
        h += table([title_of.get(i['slug'], i['slug']) for i in c['items']],
                   [list(row) for row in zip(*[i['points'] + [''] * (max(len(j['points']) for j in c['items']) - len(i['points'])) for i in c['items']])])
    # Стоимость: описания строк прайса
    if is_dir:
        rd = rows_dir[slug]
        if rd['sections']:
            h += '<h2>Стоимость: услуги без своей страницы</h2><p><i>Цены здесь не пишем: сайт берёт их из прайса по классу машины. Править можно названия и описания.</i></p>'
            for s in rd['sections']:
                h += f'<p><b>Раздел «{e(s["title"])}»</b></p>'
                lead = p.get('sectionLeads', {}).get(s['id'])
                if lead:
                    h += f'<p>{e(lead)}</p>'
                h += price_rows(s['groups'])
    else:
        rs = rows_svc[slug]
        h += '<h2>Стоимость</h2><p><i>Цены здесь не пишем: сайт берёт их из прайса по классу машины. Править можно названия и описания.</i></p>'
        h += price_rows(rs['groups'])
    if p.get('steps'):
        h += '<h2>Как мы это делаем</h2>' + table(['Шаг', 'Текст'], steps_rows(p['steps']))
        if p.get('stepsNote'):
            h += f'<p>{e(p["stepsNote"])}</p>'
    if p.get('care'):
        h += '<h2>Как ухаживать после</h2>' + table(['Заголовок', 'Текст'], pairs(p['care']))
    if p.get('faq'):
        h += '<h2>Вопросы</h2>' + table(['Вопрос', 'Ответ'], [[f['q'], f['a']] for f in p['faq']])
    seo = [['Описание для поиска (Яндекс показывает под ссылкой)', p.get('description', '')]]
    if p.get('card'):
        seo.append(['Подпись на карточке в меню и в «Смежных услугах»', p['card']])
    if p.get('tab'):
        seo.append(['Короткое название во вкладках', p['tab']])
    h += '<h2>Для поиска и меню</h2>' + table(['Где', 'Текст'], seo)
    return h


INTRO = ('<p>Здесь тексты страниц сайта {site} в том порядке, в каком они идут на странице. '
         'Правьте прямо в документе: лучше в режиме «Советовать» (справа вверху, значок карандаша), '
         'тогда мы увидим каждую правку. Вопрос или сомнение оставляйте комментарием к фразе.</p>'
         '<p>Цен в документе нет: сайт подставляет их из прайса по классу машины. Подзаголовки '
         'показывают, где блок стоит на странице, их менять не нужно. Раздел «Вопросы к вам» в начале '
         'страницы: ответьте на них, и мы допишем текст.</p>').format(site=SITE)

dirs = [d for d in pages['directions']]
docs = []
for i, d in enumerate(dirs, start=2):
    if 'page' in d:
        main = svc[d['page']]
        title = {'himchistka': 'Химчистка', 'pdr': 'Удаление вмятин без покраски'}[d['cat']]
        body = page_html(main)
        children = [p for p in pages['services'] if p['cat'] == d['cat'] and p['slug'] != d['page']]
    else:
        title = rows_dir[d['slug']]['catTitle']
        body = page_html(d, is_dir=True)
        children = [p for p in pages['services'] if p['cat'] == d['cat']]
    for c in children:
        body += '<hr>' + page_html(c)
    n = 1 + len(children)
    name = f'{i:02d}. {title}'
    docs.append({'file': f'{i:02d}.html', 'title': f'{name} · тексты сайта', 'pages': n,
                 'list': [d.get('h1') or svc[d['page']]['h1']] + [c['h1'] for c in children] if 'slug' in d else [main['h1']] + [c['h1'] for c in children]})
    open(OUT + f'{i:02d}.html', 'w').write(f'<html><head><meta charset="utf-8"></head><body>{INTRO}{body}</body></html>')

# Главная
c = content
h = f'<h1>Главная страница</h1><p><i>Страница {SITE}/</i></p>'
h += '<h2>Первый экран</h2>' + table(['Что', 'Текст'], [['Заголовок', c['hero']['title']], ['Подзаголовок', c['hero']['subtitle']], ['Текст', c['hero']['text']], ['Кнопка', c['hero']['cta']]])
h += '<h2>Направления</h2>' + table(['Что', 'Текст'], [['Заголовок блока', c['services']['title']], ['Подпись в меню «Услуги»', c['services']['menuNote']],
                                                        ['Призыв под плитками: заголовок', c['services']['cta']['title']], ['Призыв: текст', c['services']['cta']['text']], ['Призыв: кнопка', c['services']['cta']['button']]])
h += '<p><i>Названия направлений и разделов приходят из таблицы «Услуги и цены», их правим там.</i></p>'
h += '<h2>Сезонные пакеты</h2><p><i>Состав пакета и цену собирает сайт из прайса. Здесь можно править заголовки и пояснения.</i></p>'
h += table(['Что', 'Текст'], [['Подпись над блоком', packs['season']['label']], ['Заголовок блока', packs['season']['title']], ['Под ценой', packs['priceNote']], ['Кнопка', packs['button']]])
h += table(['Пакет', 'Зачем он'], [[x['title'], x['why']] for x in packs['packs']])
h += '<h2>Цифры о компании</h2><p>Проверьте цифры: они стоят на главной и на страницах направлений.</p>' + table(['Цифра', 'Подпись'], [[x['value'], x['label']] for x in c['numbers']])
h += '<h2>Работы</h2>' + table(['Что', 'Текст'], [['Заголовок блока', c['works']['title']]] + [[x['car'], x['caption']] for x in c['works']['items']])
h += '<p><i>Перешив салона на сайте сейчас скрыт как услуга. Если пример оставляем, напишите, какую работу показать вместо него.</i></p>'
h += '<h2>Гарантии</h2><p>Черновик: проверьте, что каждое обещание вы готовы выполнять, и уточните сроки гарантий.</p>' + table(['Заголовок', 'Текст'], [[x['title'], x['text']] for x in c['guarantees']['items']])
h += '<h2>Вопрос-ответ</h2>' + table(['Вопрос', 'Ответ'], [[x['q'], x['a']] for x in c['faq']['items']])
h += '<h2>Форма заявки</h2>' + table(['Что', 'Текст'], [['Заголовок', c['calc']['title']], ['Кнопка', c['calc']['button']], ['Согласие', c['calc']['consent']]])
h += '<h2>Подвал сайта</h2>' + table(['Что', 'Текст'], [['О компании', c['footer']['about']], ['Оговорка', c['footer']['disclaimer']]])
h += ('<h2>Контакты</h2><p>Сейчас на сайте временные контакты. Пришлите настоящие: телефон, WhatsApp, Telegram, почту, адреса всех филиалов, часы работы, ссылки на соцсети.</p>'
      + table(['Что', 'Сейчас на сайте'], [['Телефон', c['contacts']['phone']], ['Почта', c['contacts']['email']], ['Адрес', c['contacts']['address']], ['Часы', c['contacts'].get('hours', '')]]))
h += '<h2>Для поиска</h2>' + table(['Где', 'Текст'], [['Заголовок в поиске', c['meta']['title']], ['Описание в поиске', c['meta']['description']]])
open(OUT + '01.html', 'w').write(f'<html><head><meta charset="utf-8"></head><body>{INTRO}{h}</body></html>')
docs.insert(0, {'file': '01.html', 'title': '01. Главная и общие блоки · тексты сайта', 'pages': 1, 'list': ['Главная страница: первый экран, пакеты, цифры, гарантии, вопросы, контакты']})
json.dump(docs, open(OUT + 'docs.json', 'w'), ensure_ascii=False, indent=1)
for d in docs:
    print(d['title'], d['pages'], os.path.getsize(OUT + d['file']), d['list'])
