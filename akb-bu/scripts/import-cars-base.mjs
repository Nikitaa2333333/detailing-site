/* Мировой справочник марок и моделей → src/data/cars-base.json.

   Источник — бесплатная база github.com/blanzh/carsBase (cars-base.ru), собрана
   с каталога auto.ru: ~425 марок, ~4900 моделей, русские написания, страна марки,
   сегмент модели (A–F по размеру, J — внедорожник, M — минивэн, S — спорткар).

   Здесь только названия, сегменты и годы выпуска — классов в базе нет. Класс считает lib/cars.js
   по прайсу заказчика (правила — car-base-rules.json).

   npm run cars-base               — скачать свежую
   npm run cars-base -- file.json  — взять локальный файл */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const SOURCE = 'https://raw.githubusercontent.com/blanzh/carsBase/master/cars.json';
const OUT = fileURLToPath(new URL('../src/data/cars-base.json', import.meta.url));
const RULES = fileURLToPath(new URL('../src/data/car-base-rules.json', import.meta.url));

const rules = JSON.parse(await readFile(RULES, 'utf8'));
const local = process.argv[2];
const raw = local
  ? JSON.parse(await readFile(local, 'utf8'))
  : await fetch(SOURCE).then((r) => {
      if (!r.ok) throw new Error(`${SOURCE}: ${r.status}`);
      return r.json();
    });

const skipCountries = new Set(rules.skipCountries);
const skipBrands = new Set(rules.skipBrands);
const brands = [];
let models = 0;
for (const b of raw) {
  if (skipCountries.has(b.country) || skipBrands.has(b.name)) continue;
  const list = b.models
    // довоенные и снятые до minYear — в детейлинг не приезжают, только шумят в поиске
    .filter((m) => (m.year_to ?? 9999) >= rules.minYear)
    .map((m) => ({
      name: m.name.trim(),
      ...(m.cyrillic_name && m.cyrillic_name !== m.name ? { ru: m.cyrillic_name.trim() } : {}),
      seg: m.class ?? null,
      // годы выпуска — подпись в выдаче (год «по» у выпускаемых — текущий)
      ...(m.year_from ? { y: [m.year_from, m.year_to ?? null] } : {}),
    }));
  if (!list.length) continue;
  models += list.length;
  brands.push({
    name: b.name.trim(),
    ...(b.cyrillic_name && b.cyrillic_name !== b.name ? { ru: b.cyrillic_name.trim() } : {}),
    country: b.country,
    popular: Boolean(b.popular),
    models: list,
  });
}

if (brands.length < 250 || models < 3000) {
  throw new Error(`Подозрительно мало: ${brands.length} марок, ${models} моделей — источник сломался?`);
}

await writeFile(
  OUT,
  JSON.stringify({ _readme: `Сгенерировано scripts/import-cars-base.mjs из ${SOURCE}. Руками не править.`, updated: new Date().toISOString().slice(0, 10), brands }, null, 0) + '\n'
);
console.log(`cars-base.json: ${brands.length} марок, ${models} моделей`);
