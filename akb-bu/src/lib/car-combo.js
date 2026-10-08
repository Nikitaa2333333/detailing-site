/* Поведение поля выбора машины (разметка — components/CarCombo.astro).

   Выдача группами по маркам, как в каталогах auto.ru и drom:
   - пустое поле — 30 популярных марок и «Все марки»;
   - выбрали марку — поле ищет только её модели: ходовые (прайс и car-extra) по алфавиту,
     остальные из мировой базы свёрнуты в «Ещё N моделей»;
   - набрали текст — совпадения под заголовками своих марок, марки сверх трёх свёрнуты
     в «Ещё у других марок»; набрали марку целиком — вся марка, как при выборе.

   Что делать с выбранной машиной, решает родитель:
   carCombo(root, {
     cars: () => справочник,               // приходит асинхронно (lib/car-index-client.js)
     car: () => выбранная машина | null,   // { brand, model, cls, like? } — для плашек
     onPick(car),                          // выбрали модель
     missText(q), onMiss(),                // «не нашли» — строка списка и что по ней делать
     onSearchMiss(q),                      // запрос без единого совпадения (для заявки)
   }) → { sync, render, close, pickFirst(q) } */
import { searchCars, similarModels } from './car-search.js';

const NBSP = ' ';
const GROUPS = 3;
const plural = (n, f) => {
  const a = n % 10, b = n % 100;
  return a === 1 && b !== 11 ? f[0] : a >= 2 && a <= 4 && (b < 10 || b >= 20) ? f[1] : f[2];
};
const models = (n) => `${n}${NBSP}${plural(n, ['модель', 'модели', 'моделей'])}`;
const byName = (a, b) => a.model.localeCompare(b.model, 'en', { sensitivity: 'base' });
const byBrand = (a, b) => a.brand.localeCompare(b.brand, 'en', { sensitivity: 'base' });

// марка целиком, два яруса — каждый по алфавиту: сразу прайс и ходовые из car-extra (top),
// под «Ещё N моделей» мировая база и car-extra без top (электрички, фургоны, редкие версии)
/** Подпись класса: «3-й класс»; премиум (класс p, заказчик отметил «отдельно») — «цена после осмотра» */
export const PREMIUM = 'p';
export const classText = (cls) => (cls === PREMIUM ? 'цена после осмотра' : `${cls}-й класс`);

export function wholeBrand(brand) {
  const all = [...brand.models].sort(byName);
  const top = all.filter((m) => !m.base && !m.minor);
  const shown = top.length ? top : all.slice(0, 8);
  return { shown, rest: all.filter((m) => !shown.includes(m)) };
}

// в выдаче по тексту у марки не больше трёх моделей мировой базы — остальные под «Ещё»
const BASE_SHOWN = 3;
function splitFound(models) {
  let base = 0;
  const shown = [];
  const rest = [];
  for (const m of models) (m.base && ++base > BASE_SHOWN ? rest : shown).push(m);
  return { shown, rest };
}

function carGroups(cars, q) {
  const groups = new Map();
  for (const item of searchCars(cars, q, { limit: 40 })) {
    const g = groups.get(item.brand) ?? { brand: item.brand, models: [], whole: false };
    groups.set(item.brand, g);
    // марка целиком — только если она в выдаче выше своих моделей: «мерседес г» — это
    // модели на «Г», а не весь Mercedes
    if (item.type === 'brand') g.whole = !g.models.length;
    else if (!g.models.includes(item.model)) g.models.push(item.model);
  }
  return [...groups.values()].map((g) => ({ brand: g.brand, whole: g.whole, ...(g.whole ? wholeBrand(g.brand) : splitFound(g.models)) }));
}

/* Подсветка набранного в названии модели: «x5» → X5, «кам» → Camry не подсветится
   (совпадение по написанию, не по буквам) — это нормально, как у auto.ru.
   Засчитываем слово запроса от двух знаков, совпавшее с началом слова в названии */
function hit(name, q) {
  const low = name.toLowerCase();
  for (const word of q.toLowerCase().split(/\s+/).sort((a, b) => b.length - a.length)) {
    if (word.length < 2) continue;
    let at = low.indexOf(word);
    while (at > 0 && /[\p{L}\p{N}]/u.test(low[at - 1])) at = low.indexOf(word, at + 1);
    if (at >= 0) return [at, at + word.length];
  }
  return null;
}

export function carCombo(root, { cars, car, onPick, missText, onMiss, onSearchMiss = () => {} }) {
  const $ = (s) => root.querySelector(s);
  const input = $('[data-car-input]');
  const list = $('[data-car-list]');
  const field = $('[data-car-field]');
  const brandPlate = $('[data-car-brand]');
  const modelPlate = $('[data-car-model]');
  const closeBtn = $('[data-car-close]');
  const placeholder = input.placeholder;

  // Телефон: поле раскрывается на весь экран (стили .is-sheet в CarCombo.astro).
  // Высота листа — по visualViewport: клавиатура открылась — лист сжался, нижние строки
  // не прячутся под ней. Клавиатуру убрали — лист остаётся, пока не закрыт крестиком
  // или выбором модели.
  const narrow = window.matchMedia('(max-width: 760px)');
  const vv = window.visualViewport;
  let sheet = false;
  function fitSheet() {
    if (!sheet || !vv) return;
    root.style.setProperty('--sheet-h', `${Math.round(vv.height)}px`);
    root.style.setProperty('--sheet-top', `${Math.round(vv.offsetTop)}px`);
  }
  function openSheet() {
    if (sheet || !narrow.matches) return;
    sheet = true;
    root.classList.add('is-sheet');
    document.documentElement.classList.add('has-car-sheet');
    fitSheet();
    vv?.addEventListener('resize', fitSheet);
    vv?.addEventListener('scroll', fitSheet);
  }
  function closeSheet() {
    if (!sheet) return;
    sheet = false;
    root.classList.remove('is-sheet');
    document.documentElement.classList.remove('has-car-sheet');
    root.style.removeProperty('--sheet-h');
    root.style.removeProperty('--sheet-top');
    vv?.removeEventListener('resize', fitSheet);
    vv?.removeEventListener('scroll', fitSheet);
  }
  // повернули телефон в ширину ПК — обычный выпадающий список
  narrow.addEventListener('change', (e) => {
    if (!e.matches) closeSheet();
  });

  let found = []; // строки, которые можно выбрать, — по порядку в списке
  let active = -1;
  let missed = '';
  // Марка выбрана — поле ищет только её модели. Печатать модель сразу, без марки, можно
  let scope = null;
  let editing = false; // человек меняет модель — вместо плашки поле
  let openBrands = new Set();
  let openOthers = false;
  let openAllBrands = false;
  let lastQuery = '';
  let topBrands = [];

  const brandOf = (c) => (c?.model ? cars().find((b) => b.brand === c.brand) ?? null : null);

  function paint() {
    const c = car();
    const chosen = !editing && scope && c?.model && c.brand === scope.brand;
    brandPlate.hidden = !scope;
    if (scope) $('[data-car-brand-name]').textContent = scope.brand;
    modelPlate.hidden = !chosen;
    field.hidden = !!chosen;
    if (chosen) {
      $('[data-car-model-name]').textContent = c.model;
      $('[data-car-model-class]').textContent = classText(c.cls);
    }
    input.placeholder = scope ? `Модель ${scope.brand}` : placeholder;
  }
  // плашки показывают выбранную машину; keep — не стирать набранное (справочник пришёл,
  // пока человек печатал)
  function sync({ keep = false } = {}) {
    scope = brandOf(car());
    editing = false;
    if (!keep) input.value = '';
    paint();
  }

  // спрятать список (лист на телефоне остаётся: справочник ещё грузится — покажем, как придёт)
  function close() {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    active = -1;
  }
  // закрыть совсем: и список, и лист на телефоне
  function dismiss() {
    closeSheet();
    close();
  }
  function highlight() {
    [...list.querySelectorAll('.combo-option')].forEach((el, i) => {
      el.classList.toggle('is-active', i === active);
      // прокручиваем только сам список, не страницу
      if (i !== active) return;
      const top = el.offsetTop - list.scrollTop;
      if (top < 0) list.scrollTop = el.offsetTop - 8;
      else if (top + el.offsetHeight > list.clientHeight) list.scrollTop = el.offsetTop + el.offsetHeight - list.clientHeight + 8;
    });
  }

  // Пустое поле — марки. Популярные — у кого больше всего моделей с известным классом
  function brandLines() {
    const all = cars();
    if (!topBrands.length) {
      const known = (b) => b.models.filter((m) => !m.base).length;
      topBrands = all.filter(known).sort((a, b) => known(b) - known(a)).slice(0, 30).sort(byBrand);
    }
    const lines = [{ type: 'head', text: 'Популярные марки' }];
    topBrands.forEach((brand) => lines.push({ type: 'brand', brand }));
    if (openAllBrands) {
      lines.push({ type: 'head', text: 'Все марки' });
      [...all].sort(byBrand).forEach((brand) => lines.push({ type: 'brand', brand }));
    } else lines.push({ type: 'allbrands', text: `Все марки — ${all.length}` });
    return lines;
  }

  // модели выбранной марки: пустое поле — вся марка, иначе совпадения в ней
  function scopeLines(q) {
    const lines = [];
    if (!q) {
      const { shown, rest } = wholeBrand(scope);
      const open = openBrands.has(scope);
      [...shown, ...(open ? rest : [])].forEach((model) => lines.push({ type: 'model', brand: scope, model }));
      if (rest.length && !open) lines.push({ type: 'more', brand: scope, text: `Ещё ${models(rest.length)}` });
      return lines;
    }
    searchCars(cars(), q, { brand: scope, limit: 40 }).forEach((item) => lines.push({ type: 'model', brand: scope, model: item.model }));
    if (lines.length) return lines;
    // у этой марки не нашли: похожие модели марки — сверху, или человек набирает другую машину
    const near = similarModels(scope, q);
    if (near?.models.length) {
      lines.push({ type: 'head', text: `Не нашли «${q}» — похожие модели ${scope.brand}` });
      near.models.forEach((model) => lines.push({ type: 'model', brand: scope, model }));
    }
    lines.push({
      type: 'unscope',
      text: lines.length ? `Искать «${q}» среди всех марок` : `У ${scope.brand} такой модели нет — искать «${q}» среди всех марок`,
    });
    return lines;
  }

  function modelLines(q) {
    const groups = carGroups(cars(), q);
    const visible = openOthers ? groups : groups.slice(0, GROUPS);
    const hidden = groups.slice(visible.length);
    const lines = [];
    for (const g of visible) {
      // марку узнали, модель — нет («ауди с44»): не тупик, а модели марки, похожие — сверху
      const near = g.whole ? similarModels(g.brand, q) : null;
      lines.push({ type: 'head', text: near ? `Не нашли «${near.rest}» — выберите из моделей ${g.brand.brand}` : g.brand.brand });
      const open = openBrands.has(g.brand);
      const first = near?.models ?? [];
      [...first, ...(open ? [...g.shown, ...g.rest] : g.shown).filter((m) => !first.includes(m))].forEach((model) =>
        lines.push({ type: 'model', brand: g.brand, model })
      );
      if (g.rest.length && !open) lines.push({ type: 'more', brand: g.brand, text: `Ещё ${models(g.rest.length)} ${g.brand.brand}` });
    }
    if (hidden.length) {
      const names = hidden.slice(0, 3).map((g) => g.brand.brand).join(', ');
      lines.push({ type: 'others', text: `Ещё у других марок: ${names}${hidden.length > 3 ? '…' : ''}` });
    }
    return lines;
  }

  function line(item) {
    const li = document.createElement('li');
    if (item.type === 'head') {
      li.className = 'combo-head';
      li.setAttribute('role', 'presentation');
      li.textContent = item.text;
      return li;
    }
    const i = found.indexOf(item);
    li.className = { model: 'combo-option', brand: 'combo-option combo-brand' }[item.type] ?? 'combo-option combo-more';
    li.setAttribute('role', 'option');
    if (item.type === 'brand') li.textContent = item.brand.brand;
    else if (item.type === 'model') {
      const name = document.createElement('span');
      const text = item.model.model;
      const span = hit(text, input.value.trim());
      if (span) {
        const b = document.createElement('span');
        b.className = 'combo-hit';
        b.textContent = text.slice(span[0], span[1]);
        name.append(text.slice(0, span[0]), b, text.slice(span[1]));
      } else name.textContent = text;
      // годы выпуска — только у снятых и новых моделей (см. era в car-index-pack.js)
      if (item.model.era) {
        const era = document.createElement('span');
        era.className = 'combo-era';
        era.textContent = item.model.era;
        name.append(era);
      }
      const cls = document.createElement('span');
      cls.className = 'combo-class';
      cls.textContent = item.model.label;
      li.append(name, cls);
    } else li.textContent = item.text;
    li.addEventListener('mousedown', (e) => {
      e.preventDefault(); // не даём полю потерять фокус раньше выбора
      pick(i);
    });
    return li;
  }

  function render() {
    const q = input.value.trim();
    // справочник ещё грузится — не говорим «нет в списке», покажем, как придёт
    if (!cars().length) return close();
    const key = `${scope?.brand ?? ''}|${q}`;
    if (key !== lastQuery) {
      openBrands = new Set();
      openOthers = false;
      openAllBrands = false;
      lastQuery = key;
      list.scrollTop = 0;
    }
    // строки: заголовок, марка, модель, «ещё» — выбрать можно всё, кроме заголовка
    const lines = scope ? scopeLines(q) : q ? modelLines(q) : brandLines();
    found = lines.filter((l) => l.type !== 'head');
    missed = q && !found.some((l) => l.type === 'model') ? q : '';
    if (q && !found.length && q.length >= 3) onSearchMiss(q);
    active = found.length ? 0 : -1;
    list.classList.toggle('is-brands', !scope && !q);
    list.innerHTML = '';
    // не нашли — сама подсказка ведёт дальше
    if (!found.length) {
      const li = document.createElement('li');
      li.className = 'combo-option combo-miss is-active';
      li.setAttribute('role', 'option');
      li.textContent = missText(q);
      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        miss();
      });
      list.append(li);
    }
    lines.forEach((item) => list.append(line(item)));
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    highlight();
  }

  function miss() {
    dismiss();
    input.blur();
    onMiss();
  }

  function pick(i) {
    const item = found[i];
    if (!item) return;
    // «ещё» раскрывает список на месте, фокус остаётся на той же строке
    if (['more', 'others', 'allbrands'].includes(item.type)) {
      if (item.type === 'more') openBrands.add(item.brand);
      else if (item.type === 'others') openOthers = true;
      else openAllBrands = true;
      render();
      active = Math.min(i, found.length - 1);
      highlight();
      return;
    }
    // марка — дальше её модели, в том же поле
    if (item.type === 'brand' || item.type === 'unscope') {
      scope = item.type === 'brand' ? item.brand : null;
      editing = true;
      if (scope) input.value = '';
      paint();
      render();
      return;
    }
    scope = item.brand;
    dismiss();
    input.blur();
    const picked = { brand: item.brand.brand, model: item.model.model, cls: item.model.cls };
    if (item.model.like) picked.like = item.model.like;
    onPick(picked);
    document.dispatchEvent(new CustomEvent('carclass:selected', { detail: picked }));
  }

  input.addEventListener('input', render);
  input.addEventListener('focus', () => {
    openSheet();
    render();
  });
  input.addEventListener('keydown', (e) => {
    // стёрли всё и жмут дальше — снимаем марку, как чип
    if (e.key === 'Backspace' && !input.value && scope) {
      scope = null;
      editing = true;
      paint();
      render();
      return;
    }
    if (list.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      active = Math.max(0, Math.min(found.length - 1, active + (e.key === 'ArrowDown' ? 1 : -1)));
      highlight();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (found.length) pick(active);
      else miss();
    } else if (e.key === 'Escape') dismiss();
  });
  // ушли из поля, ничего не выбрав
  function leave() {
    close();
    // плашки снова показывают выбранную машину
    if (car()?.model && !input.value.trim()) sync();
    else editing = false;
    // что искали и не нашли — по этим запросам дополняем car-aliases.json
    if (missed.length >= 3) {
      document.dispatchEvent(new CustomEvent('carclass:notfound', { detail: { query: missed } }));
      missed = '';
    }
  }
  input.addEventListener('blur', () => {
    // на телефоне убрали клавиатуру — лист и список остаются, чтобы листать дальше
    if (sheet) return;
    leave();
  });
  closeBtn.addEventListener('click', () => {
    closeSheet();
    if (document.activeElement === input) input.blur(); // blur → leave()
    else leave();
  });
  // плашка марки — выбрать другую марку, плашка модели — другую модель той же марки
  brandPlate.addEventListener('click', () => {
    scope = null;
    editing = true;
    input.value = '';
    paint();
    input.focus();
  });
  modelPlate.addEventListener('click', () => {
    editing = true;
    paint();
    input.focus();
  });

  return {
    sync,
    close: dismiss,
    // машина уже выбрана — видны плашки, поле скрыто: фокус не нужен
    focus(options) {
      if (!field.hidden) input.focus(options);
    },
    // справочник пришёл: плашки по сохранённой машине, открытый список — перерисовать
    ready() {
      if (!editing) sync({ keep: true });
      if (document.activeElement === input) render();
    },
    // примеры под полем: «Камри» → сразу первая модель
    pickFirst(q) {
      scope = null;
      input.value = q;
      render();
      pick(found.findIndex((l) => l.type === 'model'));
    },
  };
}
