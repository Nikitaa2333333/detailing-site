/* Выгрузка всего, что понимает поиск калькулятора, в одну страницу для чтения:
   машины (марка → модели → как их можно набрать, класс), ситуации «беда → услуги»
   и все услуги с тем, по каким ситуациям они подбираются. На странице — фильтр.

   Запуск: npm run variants → ../ВАРИАНТЫ_ПОИСКА.html (в корне репозитория).
   Страница собирается из тех же модулей, что и сайт, — руками её не править:
   правки вносятся в car-aliases.json и service-intents.json, потом перезапуск. */
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = fileURLToPath(new URL('../../ВАРИАНТЫ_ПОИСКА.html', import.meta.url));
const server = await createServer({ root, configFile: false, logLevel: 'error', server: { middlewareMode: true } });

try {
  const { carIndex } = await server.ssrLoadModule('/src/lib/cars.js');
  const { normalize } = await server.ssrLoadModule('/src/lib/car-search.js');
  const { intents } = await server.ssrLoadModule('/src/lib/service-intents.js');
  const { serviceText } = await server.ssrLoadModule('/src/lib/service-texts.js');
  const prices = (await server.ssrLoadModule('/src/data/prices.json')).default;
  const content = (await server.ssrLoadModule('/src/data/content.json')).default;
  const dict = (await server.ssrLoadModule('/src/data/service-intents.json')).default;

  /* ---------- Услуги калькулятора ---------- */
  const names = new Map(); // «раздел:услуга» → название на сайте
  const services = content.services.categories.map((cat) => ({
    title: cat.title,
    sheets: cat.sheets
      .map(({ sheet: name, title }) => ({ sheet: prices.categories.find((s) => s.sheet === name), title }))
      .filter(({ sheet }) => sheet && sheet.classLabels.length === prices.classes.length)
      .map(({ sheet, title }) => ({
        title,
        list: sheet.groups.flatMap((g) => g.services).map((s) => {
          const key = `${sheet.id}:${s.id}`;
          names.set(key, serviceText(sheet.id, s).name);
          return { key, name: names.get(key) };
        }),
      })),
  }));
  const bySvc = new Map();
  for (const i of intents) for (const key of i.services) bySvc.set(key, [...(bySvc.get(key) ?? []), i.title]);
  for (const cat of services) for (const sheet of cat.sheets) for (const s of sheet.list) s.intents = bySvc.get(s.key) ?? [];

  /* ---------- Машины: варианты сверх самого названия ---------- */
  // «octavia до 2006г в», «qx80 qx» — сырое написание из прайса; поиску нужно, читателю — шум
  const raw = (alt, model) => alt.startsWith(model.split(' ')[0] + ' ') && /\d/.test(alt) && alt.split(' ').length > 2;
  const cars = carIndex.map((b) => ({
    brand: b.brand,
    keys: b.keys,
    models: [...b.models]
      .sort((x, y) => x.model.localeCompare(y.model, 'ru'))
      .map((m) => {
        const own = normalize(m.model);
        return { model: m.model, cls: m.label, like: m.like ?? '', alt: m.keys.filter((k) => k !== own && !raw(k, own)) };
      }),
  }));

  const situations = dict.intents.map((i) => {
    const built = intents.find((x) => x.id === i.id);
    return { title: built.title, lead: built.lead, phrases: i.phrases, services: i.services.map((k) => names.get(k) ?? k) };
  });

  const data = { date: new Date().toISOString().slice(0, 10), cars, situations, services };
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  writeFileSync(out, page(json));

  const models = cars.reduce((n, b) => n + b.models.length, 0);
  console.log(`✓ ${out}: марок ${cars.length}, моделей ${models}, ситуаций ${situations.length}, услуг ${names.size}`);
} finally {
  await server.close();
}

function page(json) {
  return `<title>Словарь поиска DS Sever</title>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600&display=swap">
<style>
  /* Токены сайта dssever.ru: монохром, пилюли, подсветка — чёрная подложка */
  :root {
    --bg: #f5f5f5;
    --surface: #ffffff;
    --tile: #ebebed;
    --ink: #0a0a0b;
    --line: rgba(10, 10, 11, 0.12);
    --mark-bg: #0a0a0b;
    --mark-fg: #ffffff;
    --placeholder: #8a8a8f;
    --r-tile: 20px;
    --r-pill: 999px;
    --measure: 68ch;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      color-scheme: dark;
      --bg: #0a0a0b; --surface: #1c1c20; --tile: #2a2a30; --ink: #ffffff;
      --line: rgba(255, 255, 255, 0.14); --mark-bg: #ffffff; --mark-fg: #0a0a0b; --placeholder: #a9a9b0;
    }
  }
  :root[data-theme="dark"] {
    color-scheme: dark;
    --bg: #0a0a0b; --surface: #1c1c20; --tile: #2a2a30; --ink: #ffffff;
    --line: rgba(255, 255, 255, 0.14); --mark-bg: #ffffff; --mark-fg: #0a0a0b; --placeholder: #a9a9b0;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 400 16px/1.5 'Onest', system-ui, -apple-system, 'Segoe UI', sans-serif; }
  .page { max-width: 1040px; margin: 0 auto; padding-inline: 16px; padding-block: 40px 80px; display: grid; gap: 28px; }
  h1, h2, h3 { margin: 0; font-weight: 600; letter-spacing: -0.03em; line-height: 1.1; text-wrap: balance; }
  h1 { font-size: clamp(2rem, 5vw, 3rem); max-width: 18ch; }
  h2 { font-size: 1.5rem; }
  h3 { font-size: 1.25rem; }
  p { margin: 0; }
  mark { background: var(--mark-bg); color: var(--mark-fg); padding: 0 2px; border-radius: 0; }
  ::selection { background: var(--mark-bg); color: var(--mark-fg); }

  .intro { display: grid; gap: 16px; }
  .intro p { max-width: var(--measure); }
  .stats { display: flex; flex-wrap: wrap; gap: 8px 24px; font-size: 0.875rem; font-weight: 500; font-variant-numeric: tabular-nums; }
  .note { padding: 20px 24px; border-radius: var(--r-tile); background: var(--surface); display: grid; gap: 8px; }
  .note p { max-width: var(--measure); font-size: 0.9375rem; }

  /* Панель: фильтр + вкладки, прилипает при прокрутке */
  .bar { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 5; display: grid; gap: 12px; padding-block: 12px; background: var(--bg); }
  .find { position: relative; display: block; }
  .find svg { position: absolute; left: 20px; top: 50%; translate: 0 -50%; width: 20px; height: 20px; pointer-events: none; }
  .find input {
    width: 100%; padding: 16px 20px 16px 52px; border: 1.5px solid transparent; border-radius: var(--r-pill);
    background: var(--surface); color: var(--ink); font: inherit; outline: none;
  }
  .find input::placeholder { color: var(--placeholder); }
  .find input:focus-visible { border-color: var(--ink); }
  .tabs { display: flex; flex-wrap: wrap; gap: 8px; }
  .tab {
    display: inline-flex; align-items: center; gap: 8px; padding: 8px 16px; border: none; border-radius: var(--r-pill);
    background: transparent; box-shadow: inset 0 0 0 1.5px var(--line); color: inherit; font: inherit; font-weight: 500; cursor: pointer;
  }
  .tab:hover { background: var(--tile); }
  .tab:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
  .tab[aria-selected="true"] { background: var(--ink); color: var(--bg); box-shadow: none; }
  .tab .n { font-size: 0.8125rem; font-variant-numeric: tabular-nums; }

  .panel { display: grid; gap: 16px; }
  .empty { padding: 24px; border-radius: var(--r-tile); background: var(--surface); }
  .block { padding: 24px; border-radius: var(--r-tile); background: var(--surface); display: grid; gap: 14px; min-width: 0; }
  .block .lead { max-width: var(--measure); }
  .label { font-size: 0.875rem; font-weight: 500; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { padding: 4px 12px; border-radius: var(--r-pill); background: var(--tile); font-size: 0.875rem; }
  .list { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; }
  .list li { position: relative; padding-left: 18px; }
  .list li::before { content: ''; position: absolute; left: 2px; top: 0.62em; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }

  /* Таблицы — строки разделяются линией: это структура, не список */
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 0.9375rem; }
  th { text-align: left; font-size: 0.8125rem; font-weight: 500; padding: 0 12px 8px 0; }
  td { padding: 9px 12px 9px 0; border-top: 1px solid var(--line); vertical-align: top; }
  td.model { width: 30%; font-weight: 500; }
  td.cls { width: 22%; font-variant-numeric: tabular-nums; }
  td.svc { width: 55%; }
  .cat { display: grid; gap: 16px; }

  @media (max-width: 600px) {
    .page { padding-block: 24px 60px; }
    .block { padding: 18px 16px; }
    td.model { width: auto; }
  }
</style>

<div class="page">
  <header class="intro">
    <h1>Что понимает поиск калькулятора</h1>
    <p>Все варианты ввода на сайте dssever.ru: как можно набрать марку и модель машины, какие описания проблемы поиск переводит в подборку услуг и в какие подборки входит каждая услуга.</p>
    <div class="stats" id="stats"></div>
    <div class="note">
      <p>Поиск сам понимает регистр, «ё» и «е», дефисы и пробелы (x-trail = x trail = xtrail), текст в неправильной раскладке («иьц» → BMW), кириллицу в кодах моделей («бмв х5» → BMW X5), окончания в описании проблемы («царапина», «поцарапали» — одно и то же) и недописанное последнее слово — с трёх букв. Эти варианты в списках ниже не перечислены.</p>
      <p id="date"></p>
    </div>
  </header>

  <div class="bar">
    <label class="find" for="q">
      <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m13.5 13.5 4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      <input id="q" type="search" placeholder="Найти в словаре: камри, царапины, химчистка…" aria-label="Найти в словаре" autocomplete="off">
    </label>
    <div class="tabs" role="tablist">
      <button class="tab" role="tab" id="tab-cars" data-tab="cars" aria-selected="true">Машины <span class="n"></span></button>
      <button class="tab" role="tab" id="tab-situations" data-tab="situations" aria-selected="false">Ситуации <span class="n"></span></button>
      <button class="tab" role="tab" id="tab-services" data-tab="services" aria-selected="false">Услуги <span class="n"></span></button>
    </div>
  </div>

  <main class="panel" id="panel" aria-live="polite"></main>
</div>

<script>
  const DATA = ${json};
  const norm = (s) => String(s).toLowerCase().replace(/ё/g, 'е').replace(/[^a-z0-9а-я]+/g, ' ').trim();
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const plural = (n, f) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? f[0] : a >= 2 && a <= 4 && (b < 10 || b >= 20) ? f[1] : f[2]; };

  /* Подсветка совпадения: ищем без учёта регистра и ё, подсвечиваем исходный текст */
  function hl(text, q) {
    if (!q) return esc(text);
    const src = String(text);
    const i = src.toLowerCase().replace(/ё/g, 'е').indexOf(q);
    return i < 0 ? esc(src) : esc(src.slice(0, i)) + '<mark>' + esc(src.slice(i, i + q.length)) + '</mark>' + esc(src.slice(i + q.length));
  }
  const has = (text, q) => !q || norm(text).includes(q);

  const models = DATA.cars.reduce((n, b) => n + b.models.length, 0);
  const svcCount = DATA.services.reduce((n, c) => n + c.sheets.reduce((m, s) => m + s.list.length, 0), 0);
  const phrases = DATA.situations.reduce((n, s) => n + s.phrases.length, 0);
  document.getElementById('stats').innerHTML = [
    DATA.cars.length + ' ' + plural(DATA.cars.length, ['марка', 'марки', 'марок']) + ', ' + models + ' ' + plural(models, ['модель', 'модели', 'моделей']),
    DATA.situations.length + ' ' + plural(DATA.situations.length, ['ситуация', 'ситуации', 'ситуаций']) + ', ' + phrases + ' ' + plural(phrases, ['фраза', 'фразы', 'фраз']),
    svcCount + ' ' + plural(svcCount, ['услуга', 'услуги', 'услуг']) + ' в калькуляторе',
  ].map((s) => '<span>' + s + '</span>').join('');
  document.getElementById('date').textContent = 'Собрано ' + DATA.date.split('-').reverse().join('.') + ' из прайса и словарей сайта. Добавить вариант: машины — car-aliases.json, проблемы — service-intents.json, затем npm run variants.';

  /* ---------- Вкладки: каждая возвращает html и число найденного ---------- */
  function renderCars(q) {
    let n = 0;
    const html = DATA.cars.map((b) => {
      const brandHit = !q || b.keys.some((k) => k.includes(q)) || has(b.brand, q);
      const rows = b.models.filter((m) => brandHit || has(m.model, q) || m.alt.some((a) => a.includes(q)));
      if (!rows.length) return '';
      n += rows.length;
      return '<section class="block"><h3>' + hl(b.brand, q) + '</h3>' +
        '<p class="label">Марку находят по</p><div class="chips">' + b.keys.map((k) => '<span class="chip">' + hl(k, q) + '</span>').join('') + '</div>' +
        '<div class="table-wrap"><table><thead><tr><th>Модель</th><th>Класс</th><th>Как ещё можно набрать</th></tr></thead><tbody>' +
        rows.map((m) => '<tr><td class="model">' + hl(m.model, q) + '</td><td class="cls">' + esc(m.cls) + (m.like ? '<br>по аналогии: ' + esc(m.like) : '') + '</td><td>' +
          (m.alt.length ? m.alt.map((a) => hl(a, q)).join(', ') : 'только по названию') + '</td></tr>').join('') +
        '</tbody></table></div></section>';
    }).join('');
    return { html, n };
  }

  function renderSituations(q) {
    const list = DATA.situations.filter((s) => !q || has(s.title, q) || has(s.lead, q) || s.phrases.some((p) => has(p, q)) || s.services.some((x) => has(x, q)));
    const html = list.map((s) => '<section class="block"><h3>' + hl(s.title, q) + '</h3><p class="lead">' + hl(s.lead, q) + '</p>' +
      '<p class="label">Срабатывает на</p><div class="chips">' + s.phrases.map((p) => '<span class="chip">' + hl(p, q) + '</span>').join('') + '</div>' +
      '<p class="label">Подбирает</p><ul class="list">' + s.services.map((x) => '<li>' + hl(x, q) + '</li>').join('') + '</ul></section>').join('');
    return { html, n: list.length };
  }

  function renderServices(q) {
    let n = 0;
    const html = DATA.services.map((c) => {
      const sheets = c.sheets.map((s) => {
        const rows = s.list.filter((x) => !q || has(x.name, q) || has(s.title, q) || has(c.title, q) || x.intents.some((i) => has(i, q)));
        if (!rows.length) return '';
        n += rows.length;
        return '<section class="block"><h3>' + hl(s.title, q) + '</h3><div class="table-wrap"><table><thead><tr><th>Услуга</th><th>Подбирается по ситуациям</th></tr></thead><tbody>' +
          rows.map((x) => '<tr><td class="svc">' + hl(x.name, q) + '</td><td>' + (x.intents.length ? x.intents.map((i) => hl(i, q)).join(', ') : 'только по названию') + '</td></tr>').join('') +
          '</tbody></table></div></section>';
      }).join('');
      return sheets ? '<div class="cat"><h2>' + hl(c.title, q) + '</h2>' + sheets + '</div>' : '';
    }).join('');
    return { html, n };
  }

  const tabs = { cars: renderCars, situations: renderSituations, services: renderServices };
  const panel = document.getElementById('panel');
  const input = document.getElementById('q');
  let current = 'cars';
  try { current = localStorage.getItem('dict-tab') || 'cars'; } catch (e) {}
  if (!tabs[current]) current = 'cars';

  function update() {
    const q = norm(input.value);
    const results = Object.fromEntries(Object.entries(tabs).map(([k, fn]) => [k, fn(q)]));
    document.querySelectorAll('.tab').forEach((t) => {
      t.setAttribute('aria-selected', String(t.dataset.tab === current));
      t.querySelector('.n').textContent = results[t.dataset.tab].n;
    });
    const r = results[current];
    panel.innerHTML = r.n ? r.html : '<p class="empty">В этой вкладке ничего не нашлось' + (q ? ' — число совпадений в соседних видно на вкладках' : '') + '.</p>';
  }

  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
    current = t.dataset.tab;
    try { localStorage.setItem('dict-tab', current); } catch (e) {}
    update();
  }));
  input.addEventListener('input', update);
  update();
</script>
`;
}
