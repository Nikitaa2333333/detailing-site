/* Справочник машин для поиска класса: прайс + вариации написания.

   Состав моделей и классы — только из prices.json (лист «Классификация машин»).
   car-aliases.json добавляет к ним человеческие названия и то, как люди их
   набирают. Прайс обновляется импортёром и перезаписывает prices.json целиком,
   поэтому вариации живут отдельно и привязаны к марке и модели как в xlsx.

   Если после обновления прайса вариация ссылается на модель, которой больше
   нет, сборка падает: иначе вариации тихо отваливаются и поиск слепнет.

   car-extra.json — машины, которых в прайсе нет (китайцы, новые поколения).
   Класс им не пишется руками: берётся у похожей модели из прайса (like), и такая
   модель несёт like — менеджер в заявке видит, что класс по аналогии.

   cars-base.json — мировой справочник (npm run cars-base): всё, чего нет ни в прайсе,
   ни в car-extra. Класс считается по сегменту — правила в car-base-rules.json.
   Порядок доверия: прайс → car-extra (ручной аналог) → мировая база (по сегменту). */
import { classes } from './services.js';
import aliases from '../data/car-aliases.json';
import extra from '../data/car-extra.json';
import base from '../data/cars-base.json';
import rules from '../data/car-base-rules.json';
import spell from '../data/car-base-aliases.json';
import codes from '../data/car-codes.json';
import overrides from '../data/car-overrides.json';
import { normalize } from './car-search.js';

const keysOf = (...lists) => [...new Set(lists.flat().map(normalize).filter(Boolean))];

const unknown = [];
for (const [brand, models] of Object.entries(aliases.models)) {
  const found = classes.flatMap((c) => c.brands).filter((b) => b.brand.trim() === brand);
  if (!found.length) unknown.push(`марка «${brand}»`);
  const known = new Set(found.flatMap((b) => b.models.map((m) => m.trim())));
  for (const model of Object.keys(models)) {
    if (!known.has(model)) unknown.push(`${brand} «${model}»`);
  }
}
for (const brand of Object.keys(aliases.brands)) {
  if (!classes.some((c) => c.brands.some((b) => b.brand.trim() === brand))) unknown.push(`марка «${brand}»`);
}
if (unknown.length) {
  throw new Error(
    `car-aliases.json ссылается на то, чего нет в prices.json: ${[...new Set(unknown)].join(', ')}. ` +
      'Прайс мог переименовать модель — поправьте ключ в car-aliases.json.'
  );
}

/* Одна запись на марку: марка встречается в нескольких классах, «Лада» и «Ваз» сливаются */
const byName = new Map();
for (const cls of classes) {
  for (const { brand: rawBrand, models } of cls.brands) {
    const raw = rawBrand.trim();
    const meta = aliases.brands[raw] ?? {};
    const name = meta.name ?? raw;
    if (!byName.has(name)) byName.set(name, { brand: name, keys: keysOf(name), models: [] });
    const entry = byName.get(name);
    entry.keys = keysOf(entry.keys, raw, meta.aliases ?? []);

    for (const rawModel of models) {
      const model = rawModel.trim();
      const spec = aliases.models[raw]?.[model];
      const { name: modelName = model, aliases: modelAliases = [] } = Array.isArray(spec)
        ? { aliases: spec }
        : spec ?? {};
      entry.models.push({
        model: modelName,
        cls: cls.id,
        label: cls.label,
        keys: keysOf(modelName, model, modelAliases),
      });
    }
  }
}

/* Машины вне прайса: класс и подпись — у аналога, найденного по [марка, модель] как в xlsx */
const byRaw = new Map();
for (const cls of classes) {
  for (const { brand, models } of cls.brands) {
    for (const model of models) byRaw.set(`${brand.trim()}|${model.trim()}`, { cls, brand: brand.trim(), model: model.trim() });
  }
}
const lost = [];
for (const [brandName, models] of Object.entries(extra.models)) {
  if (!byName.has(brandName)) {
    if (!extra.brands[brandName]) lost.push(`марка «${brandName}» — нет ни в прайсе, ни в brands`);
    byName.set(brandName, { brand: brandName, keys: keysOf(brandName, extra.brands[brandName] ?? []), models: [] });
  } else if (extra.brands[brandName]) lost.push(`марка «${brandName}» уже есть в прайсе — убрать из brands`);
  const entry = byName.get(brandName);
  // у марки из прайса модели отсюда без top — второй ярус, под «Ещё N моделей»
  const priceBrand = !extra.brands[brandName];
  for (const [modelName, { like, top, aliases: modelAliases = [] }] of Object.entries(models)) {
    const analog = byRaw.get(like.join('|'));
    if (!analog) {
      lost.push(`${brandName} ${modelName}: аналог «${like.join(' ')}»`);
      continue;
    }
    if (entry.models.some((m) => normalize(m.model) === normalize(modelName))) {
      lost.push(`${brandName} ${modelName} появилась в прайсе — убрать из car-extra.json`);
      continue;
    }
    const analogName = aliases.models[analog.brand]?.[analog.model]?.name ?? analog.model;
    const analogBrand = aliases.brands[analog.brand]?.name ?? analog.brand;
    entry.models.push({
      model: modelName,
      cls: analog.cls.id,
      label: analog.cls.label,
      keys: keysOf(modelName, modelAliases),
      like: `${analogBrand} ${analogName}`,
      ...(priceBrand && !top ? { minor: 1 } : {}),
    });
  }
}
if (lost.length) throw new Error(`car-extra.json: ${lost.join('; ')}.`);

/* ---------- Мировой справочник (cars-base.json): всё, чего нет ни в прайсе, ни в car-extra ----------
   Класса в базе нет. Класс — правилом из car-base-rules.json: есть габариты поколений
   (платный ключ) — по объёму и виду кузова (sizeClass), нет — по сегменту (segmentClass);
   для элитных марок — не ниже заданного. На 39 моделях прайса габариты угадывают класс
   заказчика в 82% случаев, сегмент — в 54% (npm run cars-classes). */
const hidden = [];
for (const raw of rules.hidePriceBrands) {
  if (!classes.some((c) => c.brands.some((b) => b.brand.trim() === raw))) hidden.push(raw);
  byName.delete(aliases.brands[raw]?.name ?? raw);
}
if (hidden.length) throw new Error(`car-base-rules.json, hidePriceBrands: нет в прайсе — ${hidden.join(', ')}.`);

const squash = (s) => normalize(s).replace(/ /g, '');
const brandOf = new Map(); // марка базы → запись справочника
for (const entry of byName.values()) for (const key of entry.keys) brandOf.set(squash(key), entry);
// «Li Auto (Lixiang)» в базе = «Li Auto» у нас
const findBrand = (b) =>
  brandOf.get(squash(b.name)) ?? brandOf.get(squash(b.name.replace(/\(.*?\)/g, ''))) ?? (b.ru && brandOf.get(squash(b.ru)));

/* Модель базы ↔ модель справочника: совпал ключ; или название базы — это модель
   справочника плюс слово («C-Класс AMG» → C-класс, «Continental GT Speed» → Continental GT) */
/* «GL-Класс» = «GL», «Q50 (G)» и «QX70 / FX» = «Q50» и «QX70» */
const core = (s) => squash(normalize(String(s).replace(/\(.*?\)/g, '')).replace(/ класс$/, ''));
function sameModel(entry, m) {
  const names = [m.name, m.ru].filter(Boolean).map(normalize);
  let variant = null;
  for (const model of entry.models) {
    const cores = [...model.keys, ...model.model.split(' / ')].map(core).filter(Boolean);
    if (names.some((n) => cores.includes(core(n)))) return { model, exact: true };
    if (!variant && names.some((n) => model.keys.some((k) => k.length >= 2 && n.startsWith(k + ' ')))) variant = model;
  }
  return variant && { model: variant, exact: false };
}

/* Класс по правилу: сегмент → класс (segmentClass), марка поднимает не ниже brandMinClass.
   like — словами, откуда класс: менеджер видит его в заявке */
const label = (id) => classes.find((c) => c.id === String(id))?.label;
const badRule = [];
for (const [seg, id] of Object.entries(rules.segmentClass)) {
  if (!label(id)) badRule.push(`segmentClass ${seg}: класса ${id} нет в прайсе`);
  if (seg !== 'default' && !rules.segmentNames[seg]) badRule.push(`segmentNames: нет названия сегмента ${seg}`);
}
for (const [brand, id] of Object.entries(rules.brandMinClass)) {
  if (!label(id)) badRule.push(`brandMinClass ${brand}: класса ${id} нет в прайсе`);
  if (!base.brands.some((x) => x.name === brand)) badRule.push(`brandMinClass: марки «${brand}» нет в базе`);
}
for (const [kind, steps] of Object.entries(rules.sizeClass.steps)) {
  if (!rules.sizeClass.kindNames[kind]) badRule.push(`sizeClass.kindNames: нет названия вида ${kind}`);
  for (const [, id] of steps) if (!label(id)) badRule.push(`sizeClass.steps ${kind}: класса ${id} нет в прайсе`);
  if (steps.at(-1)[0] !== null) badRule.push(`sizeClass.steps ${kind}: последний порог должен быть [null, класс]`);
}
/* Габариты модели: вид кузова и объём Д×Ш×В, м³ (только с платным ключом cars-base).
   Машины растут от поколения к поколению (5 серии G60 больше F10), а класс у модели один —
   берём среднее по объёму поколение из выпущенных с sizeClass.fromYear; таких нет — новейшее */
const volOf = (g) => g.size.reduce((a, b) => a * b, 1);
export function sizeOf(m) {
  const sized = m.gens?.filter((g) => g.size) ?? [];
  if (!sized.length) return null;
  const recent = sized.filter((g) => (g.y[1] ?? 9999) >= rules.sizeClass.fromYear).sort((a, b) => volOf(a) - volOf(b));
  const gen = recent.length ? recent[Math.floor((recent.length - 1) / 2)] : sized.at(-1);
  const kind =
    Object.entries(rules.sizeClass.kinds).find(([, bodies]) => bodies.some((b) => gen.body?.startsWith(b)))?.[0] ?? 'car';
  const vol = Math.round(volOf(gen) / 1e8) / 10;
  return { kind, vol, gen };
}
/** Класс по размеру и марке (без прайса): число 1–5 или null, если габаритов нет */
export function sizeClass(brand, size) {
  if (!size) return null;
  const id = rules.sizeClass.steps[size.kind].find(([max]) => max === null || size.vol < max)[1];
  return Math.max(id, rules.brandMinClass[brand] ?? 0);
}
/** Словами, откуда размерный класс: «внедорожник 4,7×1,9×1,7 м» */
export function sizeWhy(size) {
  const [l, w, h] = size.gen.size.map((x) => (x / 1000).toFixed(1).replace('.', ','));
  return `${rules.sizeClass.kindNames[size.kind]} ${l}×${w}×${h} м`;
}
function ruleClass(brand, m) {
  const seg = m.seg;
  let id = rules.segmentClass[seg] ?? rules.segmentClass.default;
  let why = rules.segmentNames[seg] ?? 'сегмент неизвестен';
  const size = sizeOf(m);
  if (size) {
    id = rules.sizeClass.steps[size.kind].find(([max]) => max === null || size.vol < max)[1];
    why = sizeWhy(size);
  }
  const min = rules.brandMinClass[brand];
  if (min && min > id) [id, why] = [min, `марка ${brand}`];
  return { cls: String(id), label: label(id), like: `правило: ${why}`, size };
}

// одна машина, разные рынки и написания: без скобок, пробелов и дефисов; «+» различает (GO и GO+)
const twinKey = (s) => String(s).toLowerCase().replace(/\(.*?\)/g, '').replace(/[\s-]/g, '');

const baseBrands = base.brands.map((b) => ({ b, entry: findBrand(b) }));
const baseAliases = spell.models;
const orphan = Object.keys(spell.brands)
  .filter((brand) => !base.brands.some((x) => x.name === brand))
  .map((brand) => `марка «${brand}» в car-base-aliases.json`);
for (const [brand, models] of Object.entries(baseAliases)) {
  const b = base.brands.find((x) => x.name === brand);
  if (!b) orphan.push(`марка «${brand}»`);
  else for (const model of Object.keys(models)) if (!b.models.some((m) => m.name === model)) orphan.push(`${brand} «${model}»`);
}
if (badRule.length || orphan.length) {
  throw new Error(`car-base-rules.json или car-base-aliases.json ссылаются на то, чего нет: ${[...badRule, ...orphan].join(', ')}.`);
}

for (const { b, entry: known } of baseBrands) {
  // base — малоизвестная марка из базы: в поиске ниже знакомых. Марка с написаниями
  // в car-base-aliases.json (Ferrari, Lamborghini…) — своя: «фер» — это Ferrari
  const entry = known ?? { brand: b.name, keys: keysOf(b.name, b.ru ?? []), models: [], ...(spell.brands[b.name] ? {} : { base: 1 }) };
  entry.keys = keysOf(entry.keys, spell.brands[b.name] ?? []);
  const added = [];
  for (const m of b.models) {
    const same = known && sameModel(known, m);
    // модель прайса или car-extra нашлась в базе — берёт у неё годы выпуска. Кроме тех, что
    // прайс сам делит по годам («Octavia (до 2006 г.)»): годы базы на них соврут
    if (same?.exact) {
      same.model.paired = true; // есть в мировой базе — для проверки валидности в автотесте
      same.model.size ??= sizeOf(m); // габариты — сверить правило с классом прайса (npm run cars-classes)
      if (m.y && !same.model.model.includes('(')) {
        const [from, to] = m.y;
        const had = same.model.years;
        same.model.years = had ? [Math.min(had[0], from), Math.max(had[1] ?? 0, to ?? 0) || null] : [from, to];
      }
      continue;
    }
    // снятые до minYear в детейлинг не приезжают — только шумят в поиске («02» → BMW 1966)
    if (m.y?.[1] && m.y[1] < rules.minYear) continue;
    // рыночная версия той же машины («Passat (North America)», «Sportage (China)», «X-Terra»
    // рядом с «Xterra») — не отдельная строка, а ещё одно написание основной модели
    // Две модели с разными скобками — разные машины: «Liberty (North America)» — это Cherokee,
    // «Liberty (Patriot)» — Patriot. Склеиваем, только если хотя бы у одной скобок нет
    const twin = [...entry.models, ...added].find(
      (x) => twinKey(x.model) === twinKey(m.name) && !(x.model.includes('(') && m.name.includes('('))
    );
    if (twin) {
      twin.keys = keysOf(twin.keys, m.name, m.ru ?? [], baseAliases[b.name]?.[m.name] ?? []);
      if (!twin.base) twin.paired = true;
      continue;
    }
    // вариант модели из прайса («C-Класс AMG», «911 GT3») — класс основной, иначе правило
    const variant = same;
    const cls = variant
      ? { cls: variant.model.cls, label: variant.model.label, like: variant.model.like ?? `${entry.brand} ${variant.model.model}` }
      : ruleClass(b.name, m);
    added.push({
      model: m.name,
      cls: cls.cls,
      label: cls.label,
      keys: keysOf(m.name, m.ru ?? [], baseAliases[b.name]?.[m.name] ?? []),
      like: cls.like,
      base: 1, // из мировой базы: в выдаче ниже прайса и car-extra
      ...(sizeOf(m) ? { size: sizeOf(m) } : {}), // габариты — для дашборда классов
      ...(m.y ? { years: m.y } : {}),
    });
  }
  if (!added.length) continue;
  entry.models.push(...added);
  if (!known) byName.set(entry.brand, entry);
}

/* ---------- Кузовные коды (car-codes.json) — поверх всех трёх источников ----------
   Код от трёх знаков — обычный ключ поиска («y62»). Все коды — ещё и в codes: их
   поиск засчитывает рядом с моделью («санта фе tm»), двухбуквенные — только так */
const noCode = [];
for (const [brandName, models] of Object.entries(codes)) {
  if (brandName.startsWith('_')) continue;
  const entry = byName.get(brandName);
  if (!entry) {
    noCode.push(`марка «${brandName}»`);
    continue;
  }
  for (const [modelName, list] of Object.entries(models)) {
    const model = entry.models.find((m) => m.model === modelName);
    if (!model) {
      noCode.push(`${brandName} «${modelName}»`);
      continue;
    }
    model.codes = keysOf(list);
    model.keys = keysOf(model.keys, list.filter((c) => c.length >= 3));
  }
}
if (noCode.length) throw new Error(`car-codes.json ссылается на то, чего нет в справочнике: ${noCode.join(', ')}.`);

/* ---------- Валидность: что в поиск не попадает ----------
   hideModels — модели прайса, которых не существует или не той марки (Chevrolet Sebring —
   это Chrysler, Mulsanne — Bentley); car-extra, снятые до minYear. Прайс не трогаем */
const noHide = [];
for (const [brandName, list] of Object.entries(rules.hideModels)) {
  const entry = byName.get(brandName);
  for (const modelName of list) {
    const i = entry?.models.findIndex((m) => m.model === modelName) ?? -1;
    if (i < 0) noHide.push(`${brandName} «${modelName}»`);
    else entry.models.splice(i, 1);
  }
}
if (noHide.length) throw new Error(`car-base-rules.json, hideModels: нет в справочнике — ${noHide.join(', ')}. Прайс мог убрать модель — уберите и отсюда.`);
for (const entry of byName.values()) {
  entry.models = entry.models.filter((m) => !(m.like && !m.base && m.years?.[1] && m.years[1] < rules.minYear));
  if (!entry.models.length) byName.delete(entry.brand);
}

/* ---------- Классы от заказчика (car-overrides.json, из его таблицы Классы_машин.xlsx) ----------
   Таблица — источник правды по классам: в ней класс каждой модели, которую находит сайт,
   включая модели прайса. Прайс, car-extra и правило по размеру работают только для машин,
   которых в таблице ещё нет (новые в базе) — они уйдут в следующую таблицу заказчику.
   «Отдельно» (premium) — класс p: цен по классу нет, на сайте «цена после осмотра».
   auto — что было бы без таблицы. Модель пропала из справочника — сборка падает и называет её */
export const PREMIUM = 'p';
const noOverride = [];
for (const [brandName, models] of Object.entries(overrides.models)) {
  const entry = byName.get(brandName);
  for (const [modelName, { cls, note }] of Object.entries(models)) {
    const model = entry?.models.find((m) => m.model === modelName);
    if (!model) {
      noOverride.push(`${brandName} «${modelName}»`);
      continue;
    }
    if (cls !== 'premium' && !label(cls)) {
      noOverride.push(`${brandName} «${modelName}»: класса ${cls} нет в прайсе`);
      continue;
    }
    model.auto = { cls: model.cls, ...(model.like ? { like: model.like } : {}) };
    model.cls = cls === 'premium' ? PREMIUM : String(cls);
    model.label = cls === 'premium' ? 'цена после осмотра' : label(cls);
    model.client = 1; // класс из таблицы заказчика
    // у модели прайса like нет и не появляется: в выдаче она остаётся выше
    if (model.like) model.like = `класс от заказчика${note ? `: ${note}` : ''}`;
  }
}
if (noOverride.length) {
  throw new Error(`car-overrides.json (классы из таблицы заказчика): нет в справочнике — ${noOverride.join(', ')}. Модель переименовали — перенести строку в таблице и импортировать заново.`);
}

/** [{ brand, keys, models: [{ model, cls, label, keys, like?, base?, minor?, years?: [с, по], codes?, size?, auto?, client? }] }] — по алфавиту.
    cls — '1'…'5' или PREMIUM ('p', «отдельно»); client — класс из таблицы заказчика.
    base — из мировой базы, minor — из car-extra без top: оба во втором ярусе списка марки */
export const carIndex = [...byName.values()].sort((a, b) => a.brand.localeCompare(b.brand, 'ru'));
