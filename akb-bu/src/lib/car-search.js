/* Поиск машины по справочнику классов.

   Отвечает только тем, что есть в справочнике: свободный ввод — способ найти
   вариант, а не ответ. Что разбирает сам, без записей в car-aliases.json:
   - регистр, ё/е, дефисы, пробелы и точки («rav-4» = «rav 4» = «RAV4»);
   - неправильную раскладку («rfvhb» → «камри», «ыщдфкшы» → «solaris»);
   - кириллицу вместо латиницы в коротких кодах («х5», «е200», «рх350», «г30»);
   - марку и модель одной строкой в любом порядке слов («киа рио», «rio kia»);
   - лишнее после модели («камри 70 кузов», «320d»);
   - одну-две опечатки («хундай», «тигуан» → «тигуан», «kashkai»).

   Модуль общий для сборки (lib/cars.js готовит ключи) и браузера (виджет). */

const EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`";
const RU = 'йцукенгшщзхъфывапролджэячсмитьбюё';
const toRu = Object.fromEntries([...EN].map((c, i) => [c, RU[i]]));
const toEn = Object.fromEntries([...RU].map((c, i) => [c, EN[i]]));

/* Кириллица, которой набирают латинские коды моделей. «р» → r, «в» → v:
   «рх» пишут, имея в виду RX, «в40» — Volvo V40. Вторая строка — не похожие
   на вид, а те, что пишут вместо латиницы по звуку: «г30» — это BMW G30. */
const LOOKALIKE = {
  а: 'a', в: 'v', с: 'c', е: 'e', н: 'h', к: 'k', м: 'm',
  о: 'o', р: 'r', т: 't', х: 'x', у: 'y',
  г: 'g', ф: 'f', д: 'd', л: 'l', б: 'b', п: 'p', и: 'i', з: 'z',
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

/* Код модели — слово с цифрой или из одной-двух букв: там кириллицу меняем на латиницу.
   «в» в коде — и V (Volvo V40), и W (кузова Mercedes: «в212» = W212): второе прочтение */
const latinize = (s, extra = {}) =>
  s
    .split(' ')
    .map((w) => (/\d/.test(w) || w.length <= 2 ? swap(w, { ...LOOKALIKE, ...extra }) : w))
    .join(' ');

/* Что в другую раскладку не переводим:
   - код с цифрой: «f20» — это BMW F20, а не «а20» (→ a20 → Mercedes A200);
   - одну-две буквы: «v класс» — V-класс, а не «м класс»; «сх 30» — CX-30;
   - слово с х, ъ, ж, э, б, ю, ё: на их месте в латинице знаки препинания, а не
     буквы — латинское название так не набрать («х3» дало бы «[3» → BMW 3 серии).
   Кириллицу в кодах разбирает latinize */
const keepLayout = (w) => /\d/.test(w) || w.length <= 2 || /[хъжэбюё]/.test(w);
// дефис делит слова: «v-класс» — это «v» и «класс», а не одно слово для другой раскладки («м-класс»)
const swapWords = (s, map) => s.split(/(\s+|-)/).map((w) => (keepLayout(w) ? w : swap(w, map))).join('');

/** Все прочтения запроса: как есть, в другой раскладке, с латиницей в кодах — словами */
/* Фраза целиком одной раскладкой, и в ней есть длинное слово — раскладку не переключили
   на всю фразу: «fkmaf c5» — это «альфа с5», короткое «c5» тоже переводим (по одному слову
   оно осталось бы C5). Смешанную фразу («v класс») человек набирал, переключаясь сам */
const wholeLayout = (s) => {
  const words = s.split(/\s+|-/).filter(Boolean);
  return words.length >= 2 && words.some((w) => w.length >= 3 && !keepLayout(w));
};

function phrases(query) {
  const raw = String(query).toLowerCase();
  const out = new Set();
  const variants = [raw, swapWords(raw, toRu), swapWords(raw, toEn)];
  if (wholeLayout(raw) && !/[а-яё]/.test(raw)) variants.push(swap(raw, toRu));
  if (wholeLayout(raw) && !/[a-z]/.test(raw)) variants.push(swap(raw, toEn));
  for (const v of variants) {
    const n = normalize(v);
    if (!n) continue;
    out.add(n);
    out.add(latinize(n));
    out.add(latinize(n, { в: 'w' }));
  }
  return [...out];
}
const readings = (query) => phrases(query).map(compact);

/* «x5 g05», «бмв х5 f15», «gl x166»: каждое слово — марка, модель или код этой модели.
   Слитно такое не ловится: «x5g05» начинается с «x5», но двухбуквенное название
   «перебором после модели» не засчитываем — иначе «x5» нашёл бы и «x50», и «x55».
   Последнее слово может быть недописанным. Хотя бы одно слово — от самой модели */
// служебные слова между моделью и кодом: «s class w223», «3 серии f30», «камри кузов 70»
const FILLER = new Set(['класс', 'class', 'klass', 'серии', 'серия', 'series', 'кузов', 'кузове', 'body']);

/* 0 — не подошло, 1 — все слова совпали целиком, 2 — последнее недописано. Второе ниже
   точного названия: «hyundai sonata» — это Sonata, а не NF («sonata nf»), «ferrari f8» — F8 */
function wordHit(words, keys, brandKeys, codes = []) {
  if (words.length < 2) return 0;
  let own = false;
  let partial = false;
  let parts = 0;
  for (let i = 0; i < words.length; i++) {
    if (FILLER.has(words[i])) continue;
    // название из нескольких слов («mark 2», «land cruiser 200») — берём самое длинное,
    // что целиком совпало с ключом
    let j = words.length;
    let w = '';
    for (; j > i; j--) {
      w = words.slice(i, j).join('');
      if (keys.includes(w) || codes.includes(w) || brandKeys.includes(w)) break;
    }
    if (j === i) {
      // ничего не совпало целиком: последнее слово может быть недописанным
      w = words[i];
      if (i === words.length - 1 && w.length >= 2 && keys.some((k) => k.startsWith(w))) own = partial = true;
      else return 0;
      j = i + 1;
    } else if (brandKeys.includes(w) && !keys.includes(w) && !codes.includes(w)) {
      // марка — не довод в пользу модели
    } else own = true;
    parts++;
    i = j - 1;
  }
  // одно название целиком («land cruiser 200») уже ловит обычный поиск; нужен код или марка рядом
  if (!own || parts < 2) return 0;
  return partial ? 2 : 1;
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
      list.push({ type: 'model', brand, model, keys, pairs, brandKeys });
    }
  }
  entriesCache.set(index, list);
  return list;
}

function rank(list, qs, limit, words = []) {
  const pass = (fn) => {
    const found = [];
    for (const item of list) {
      let best = Infinity;
      // модель + её код словами («x5 g05») — как точное «марка модель» (оценка 50, см. ниже);
      // недописанное последнее слово — ступенью ниже, как начало названия
      if (fn === score && item.type === 'model') {
        const hits = words.map((w) => wordHit(w, item.keys, item.brandKeys ?? [], item.model.codes)).filter(Boolean);
        // 75 — выше любого начала названия (150), но ниже точного «марка модель» даже у модели
        // базы (50 + 20): «volkswagen golf gti» — это Golf GTI, а не Golf с написанием «gti»
        if (hits.length) best = Math.min(...hits) === 1 ? 75 : 150;
      }
      // мировая база — только с начала названия, опечатка одна и от шести букв: в 4000
      // моделях вхождение в середину слова и лишние опечатки находят мусор («лада» →
      // Honda Ballade, марки Adam и Radar; «веста» → Westfield; «уаз хантер» → JAC Hunter)
      const own = (item.model ?? item.brand).base
        ? (key, q) => {
            if (fn === score) return score(key, q) === 3 ? Infinity : score(key, q);
            const s = q.length < 6 ? Infinity : fn(key, q);
            return s <= 5 ? s : Infinity;
          }
        : fn;
      for (const q of qs) {
        // при равной оценке выше тот, чей ключ ближе по длине к запросу
        for (const key of item.keys) {
          const s = own(key, q);
          if (s < Infinity) best = Math.min(best, s * 100 + Math.min(Math.abs(key.length - q.length), 49));
        }
        // «марка модель»: при наборе начала длину не сравниваем — модели марки идут по
        // порядку классов. Если набрано больше ключа («bmw 320d»), длиннее — точнее:
        // «bmw 320» должен обойти просто «bmw»
        for (const key of item.pairs ?? []) {
          const s = own(key, q);
          if (s < Infinity) best = Math.min(best, s * 100 + (s >= 2 ? Math.min(Math.abs(key.length - q.length), 49) : 50));
        }
      }
      // одна буква — это начало марки, а не код модели вроде TT
      if (item.type === 'brand' && Math.max(...qs.map((q) => q.length)) === 1) best -= 100;
      // при равенстве модель из прайса выше модели по аналогии: «рх» — Lexus RX, а не Exeed RX
      if (item.model?.like) best += 0.5;
      // …а модель из мировой базы — ниже и тех, и марки: «фер» — Ferrari, а не Daihatsu Feroza
      // (в пределах той же ступени оценки: длина ключа весит до 49, ступень — 100)
      if (item.model?.base) best += 20;
      // малоизвестная марка базы — на ступень ниже: «мега» — Renault Megane, а не марка Mega
      if (item.type === 'brand' && item.brand.base) best += 150;
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
  const words = phrases(query).map((p) => p.split(' '));
  if (brand) {
    const brandKeys = brand.keys.map(compact);
    const list = brand.models.map((model) => ({ type: 'model', brand, model, keys: model.keys.map(compact), brandKeys }));
    if (!qs.length) return list;
    return rank(list, qs, limit, words);
  }
  if (!qs.length) return index.map((b) => ({ type: 'brand', brand: b }));
  return rank(entries(index), qs, limit, words);
}
