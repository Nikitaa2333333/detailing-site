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
  for (const [modelName, { like, aliases: modelAliases = [] }] of Object.entries(models)) {
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
    });
  }
}
if (lost.length) throw new Error(`car-extra.json: ${lost.join('; ')}.`);

/* ---------- Мировой справочник (cars-base.json): всё, чего нет ни в прайсе, ни в car-extra ----------
   Класса в базе нет — только сегмент. Класс — простым правилом из car-base-rules.json:
   сегмент → класс, для элитных марок — не ниже заданного. Проверено на прайсе: таблица
   угадывает класс заказчика точнее, чем «как у моделей той же марки» (57% против 44%). */
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
function ruleClass(brand, seg) {
  let id = rules.segmentClass[seg] ?? rules.segmentClass.default;
  let why = rules.segmentNames[seg] ?? 'сегмент неизвестен';
  const min = rules.brandMinClass[brand];
  if (min && min > id) [id, why] = [min, `марка ${brand}`];
  return { cls: String(id), label: label(id), like: `правило: ${why}` };
}

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
      if (m.y && !same.model.model.includes('(')) {
        const [from, to] = m.y;
        const had = same.model.years;
        same.model.years = had ? [Math.min(had[0], from), Math.max(had[1] ?? 0, to ?? 0) || null] : [from, to];
      }
      continue;
    }
    // вариант модели из прайса («C-Класс AMG», «911 GT3») — класс основной, иначе правило
    const variant = same;
    const cls = variant
      ? { cls: variant.model.cls, label: variant.model.label, like: variant.model.like ?? `${entry.brand} ${variant.model.model}` }
      : ruleClass(b.name, m.seg);
    added.push({
      model: m.name,
      cls: cls.cls,
      label: cls.label,
      keys: keysOf(m.name, m.ru ?? [], baseAliases[b.name]?.[m.name] ?? []),
      like: cls.like,
      base: 1, // из мировой базы: в выдаче ниже прайса и car-extra
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

/** [{ brand, keys, models: [{ model, cls, label, keys, like?, years?: [с, по], codes? }] }] — по алфавиту */
export const carIndex = [...byName.values()].sort((a, b) => a.brand.localeCompare(b.brand, 'ru'));
