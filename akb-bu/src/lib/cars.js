/* Справочник машин для поиска класса: прайс + вариации написания.

   Состав моделей и классы — только из prices.json (лист «Классификация машин»).
   car-aliases.json добавляет к ним человеческие названия и то, как люди их
   набирают. Прайс обновляется импортёром и перезаписывает prices.json целиком,
   поэтому вариации живут отдельно и привязаны к марке и модели как в xlsx.

   Если после обновления прайса вариация ссылается на модель, которой больше
   нет, сборка падает: иначе вариации тихо отваливаются и поиск слепнет.

   car-extra.json — машины, которых в прайсе нет (китайцы, новые поколения).
   Класс им не пишется руками: берётся у похожей модели из прайса (like), и такая
   модель несёт like — менеджер в заявке видит, что класс по аналогии. */
import { classes } from './services.js';
import aliases from '../data/car-aliases.json';
import extra from '../data/car-extra.json';
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

/** [{ brand, keys, models: [{ model, cls, label, keys, like? }] }] — по алфавиту */
export const carIndex = [...byName.values()].sort((a, b) => a.brand.localeCompare(b.brand, 'ru'));
