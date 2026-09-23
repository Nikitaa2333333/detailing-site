/* Поиск машины по справочнику классов.

   Отвечает только тем, что есть в справочнике: свободный ввод — способ найти
   вариант, а не ответ. Что разбирает сам, без записей в car-aliases.json:
   - регистр, ё/е, дефисы, пробелы и точки («rav-4» = «rav 4» = «RAV4»);
   - неправильную раскладку («rfvhb» → «камри», «ыщдфкшы» → «solaris»);
   - кириллицу вместо латиницы в коротких кодах («х5», «е200», «рх350»);
   - марку и модель одной строкой в любом порядке слов («киа рио», «rio kia»);
   - лишнее после модели («камри 70 кузов», «320d»);
   - одну-две опечатки («хундай», «тигуан» → «тигуан», «kashkai»).

   Модуль общий для сборки (lib/cars.js готовит ключи) и браузера (виджет). */

const EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`";
const RU = 'йцукенгшщзхъфывапролджэячсмитьбюё';
const toRu = Object.fromEntries([...EN].map((c, i) => [c, RU[i]]));
const toEn = Object.fromEntries([...RU].map((c, i) => [c, EN[i]]));

/* Кириллица, которой набирают латинские коды моделей. «р» → r, «в» → v:
   «рх» пишут, имея в виду RX, «в40» — Volvo V40. */
const LOOKALIKE = {
  а: 'a', в: 'v', с: 'c', е: 'e', н: 'h', к: 'k', м: 'm',
  о: 'o', р: 'r', т: 't', х: 'x', у: 'y',
};

const DIACRITICS = { ë: 'e', é: 'e', è: 'e', š: 's', ä: 'a', ö: 'o', ü: 'u' };

/** Нижний регистр, ё → е, всё кроме букв и цифр — в пробел */
export function normalize(s) {
  return String(s)
    .toLowerCase()
    .replace(/[ëéèšäöü]/g, (c) => DIACRITICS[c])
    .replace(/ё/g, 'е')
    .replace(/[^a-z0-9а-я]+/g, ' ')
    .trim();
}

const compact = (s) => s.replace(/ /g, '');
const swap = (s, map) => [...s].map((c) => map[c] ?? c).join('');

/* Код модели — слово с цифрой или из одной-двух букв: там кириллицу меняем на латиницу */
const latinize = (s) =>
  s
    .split(' ')
    .map((w) => (/\d/.test(w) || w.length <= 2 ? swap(w, LOOKALIKE) : w))
    .join(' ');

/** Все прочтения запроса: как есть, в другой раскладке, с латиницей в кодах */
function readings(query) {
  const raw = String(query).toLowerCase();
  const out = new Set();
  for (const v of [raw, swap(raw, toRu), swap(raw, toEn)]) {
    const n = normalize(v);
    if (!n) continue;
    out.add(n);
    out.add(latinize(n));
  }
  return [...out].map(compact);
}

/* Точное совпадение, начало, «перебор» после модели, вхождение. Меньше — лучше. */
function score(key, q) {
  if (key === q) return 0;
  if (key.startsWith(q)) return 1;
  if (key.length >= 3 && q.startsWith(key)) return 2;
  if (q.length >= 3 && key.includes(q)) return 3;
  return Infinity;
}

/* Расстояние Дамерау — Левенштейна: опечатка, пропуск, лишняя буква, перестановка */
function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/* Опечатка в начале ключа: сравниваем запрос с началом ключа ± одна буква */
function fuzzy(key, q) {
  if (q.length < 4 || key.length < 4) return Infinity;
  const allowed = q.length >= 7 ? 2 : 1;
  let best = Infinity;
  for (let len = q.length - 1; len <= q.length + 1; len++) {
    if (len > key.length) break;
    best = Math.min(best, distance(q, key.slice(0, len)));
  }
  return best <= allowed ? 4 + best : Infinity;
}

/* Ключи для поиска модели без выбранной марки: модель отдельно и «марка модель» в обе стороны */
const entriesCache = new WeakMap();
function entries(index) {
  if (entriesCache.has(index)) return entriesCache.get(index);
  const list = [];
  for (const brand of index) {
    const brandKeys = brand.keys.map(compact);
    list.push({ type: 'brand', brand, keys: brandKeys });
    for (const model of brand.models) {
      const keys = model.keys.map(compact);
      const pairs = [];
      for (const b of brandKeys) for (const m of keys) pairs.push(b + m, m + b);
      list.push({ type: 'model', brand, model, keys, pairs });
    }
  }
  entriesCache.set(index, list);
  return list;
}

function rank(list, qs, limit) {
  const pass = (fn) => {
    const found = [];
    for (const item of list) {
      let best = Infinity;
      for (const q of qs) {
        // при равной оценке выше тот, чей ключ ближе по длине к запросу
        for (const key of item.keys) {
          const s = fn(key, q);
          if (s < Infinity) best = Math.min(best, s * 100 + Math.min(Math.abs(key.length - q.length), 49));
        }
        // «марка модель»: при наборе начала длину не сравниваем — модели марки идут по
        // порядку классов. Если набрано больше ключа («bmw 320d»), длиннее — точнее:
        // «bmw 320» должен обойти просто «bmw»
        for (const key of item.pairs ?? []) {
          const s = fn(key, q);
          if (s < Infinity) best = Math.min(best, s * 100 + (s >= 2 ? Math.min(Math.abs(key.length - q.length), 49) : 50));
        }
      }
      // одна буква — это начало марки, а не код модели вроде TT
      if (item.type === 'brand' && Math.max(...qs.map((q) => q.length)) === 1) best -= 100;
      if (best < Infinity) found.push({ item, best });
    }
    return found;
  };
  let found = pass(score);
  if (!found.length) found = pass(fuzzy);
  found.sort((a, b) => a.best - b.best);
  return found.slice(0, limit).map((f) => f.item);
}

/**
 * Поиск по справочнику.
 * Без марки — ищет и марки, и модели: [{type:'brand', brand} | {type:'model', brand, model}].
 * С маркой — только её модели: [{type:'model', brand, model}].
 */
export function searchCars(index, query, { brand = null, limit = 12 } = {}) {
  const qs = readings(query);
  if (brand) {
    const list = brand.models.map((model) => ({ type: 'model', brand, model, keys: model.keys.map(compact) }));
    if (!qs.length) return list;
    return rank(list, qs, limit);
  }
  if (!qs.length) return index.map((b) => ({ type: 'brand', brand: b }));
  return rank(entries(index), qs, limit);
}
