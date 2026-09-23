/* Справочник машин для поиска класса: прайс + вариации написания.

   Состав моделей и классы — только из prices.json (лист «Классификация машин»).
   car-aliases.json добавляет к ним человеческие названия и то, как люди их
   набирают. Прайс обновляется импортёром и перезаписывает prices.json целиком,
   поэтому вариации живут отдельно и привязаны к марке и модели как в xlsx.

   Если после обновления прайса вариация ссылается на модель, которой больше
   нет, сборка падает: иначе вариации тихо отваливаются и поиск слепнет. */
import { classes } from './services.js';
import aliases from '../data/car-aliases.json';
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

/** [{ brand, keys, models: [{ model, cls, label, keys }] }] — по алфавиту */
export const carIndex = [...byName.values()].sort((a, b) => a.brand.localeCompare(b.brand, 'ru'));
