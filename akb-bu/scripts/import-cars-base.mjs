/* Мировой справочник марок и моделей → src/data/cars-base.json.

   Источник — cars-base.ru (каталог auto.ru): ~425 марок, ~4950 моделей, русские написания,
   страна марки, сегмент модели (A–F по размеру, J — внедорожник, M — минивэн, S — спорткар).

   Марки и модели — бесплатный /full. С ключом платного тарифа (CARS_BASE_TOKEN в .env)
   у моделей появляются поколения: годы, тип кузова, габариты. По ним lib/cars.js считает
   класс (правила — sizeClass в car-base-rules.json); без ключа — только сегмент.

   npm run cars-base                 — скачать свежую (с ключом из .env, если он есть)
   npm run cars-base -- --demo       — демо-ключ: поколения только у первых 50 марок (до BMW)
   npm run cars-base -- file.json    — марки и модели из локального файла, без поколений */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const API = 'https://api.cars-base.ru';
const OUT = fileURLToPath(new URL('../src/data/cars-base.json', import.meta.url));
const RULES = fileURLToPath(new URL('../src/data/car-base-rules.json', import.meta.url));

const rules = JSON.parse(await readFile(RULES, 'utf8'));
const args = process.argv.slice(2);
const local = args.find((a) => !a.startsWith('--'));
const token = args.includes('--demo') ? 'test' : process.env.CARS_BASE_TOKEN;

async function get(path) {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(API + path);
    if (r.status === 429 && attempt < 5) {
      await new Promise((ok) => setTimeout(ok, (Number(r.headers.get('retry-after')) || 10) * 1000));
      continue;
    }
    if (!r.ok) throw new Error(`${API}${path.replace(/token=[^&]+/, 'token=…')}: ${r.status} ${await r.text()}`);
    return r.json();
  }
}

/* Вся таблица постранично (after_id), только нужные поля. Ключ — 120 запросов в минуту */
async function table(name, fields) {
  const rows = [];
  let after = '';
  for (;;) {
    const page = await get(`/${name}?token=${token}&fields=${fields}&pageSize=1000${after && `&after_id=${encodeURIComponent(after)}`}`);
    if (page.meta.demoMode && token !== 'test') throw new Error('Ключ cars-base не принят — API отдаёт демо');
    rows.push(...page.data);
    if (page.data.length < 1000) return rows;
    after = page.meta.next_after_id;
    await new Promise((ok) => setTimeout(ok, 600));
  }
}

const raw = local ? JSON.parse(await readFile(local, 'utf8')) : (await get('/full')).data;

/* ---------- Поколения: кузов и габариты (только с ключом) ----------
   Модификация → конфигурация (кузов) → поколение. Габариты поколения — медиана по
   модификациям основного кузова (того, у которого больше всего модификаций) */
const gensByModel = new Map();
if (token && !local) {
  const median = (xs) => {
    const s = xs.filter((x) => x > 0).sort((a, b) => a - b);
    return s.length ? s[Math.floor(s.length / 2)] : null;
  };
  const [gens, confs, specs] = [
    await table('generations', 'id,model_id,name,year_from,year_to'),
    await table('configurations', 'id,generation_id,body_type'),
    await table('specifications', 'id,body_size,width,height,seats'),
  ];
  const conf = new Map(confs.map((c) => [String(c.id), { ...c, mods: [] }]));
  for (const s of specs) conf.get(String(s.id).split('_')[0])?.mods.push(s);
  const byGen = new Map();
  for (const c of conf.values()) {
    if (!byGen.has(String(c.generation_id))) byGen.set(String(c.generation_id), []);
    byGen.get(String(c.generation_id)).push(c);
  }
  for (const g of gens) {
    const list = (byGen.get(String(g.id)) ?? []).sort((a, b) => b.mods.length - a.mods.length);
    const main = list[0];
    if (!main) continue;
    const size = ['body_size', 'width', 'height'].map((f) => median(main.mods.map((m) => Number(m[f]))));
    const seats = median(main.mods.map((m) => Number(m.seats)));
    if (!gensByModel.has(g.model_id)) gensByModel.set(g.model_id, []);
    gensByModel.get(g.model_id).push({
      name: (g.name ?? '').trim(),
      y: [g.year_from ?? null, g.year_to ?? null],
      body: main.body_type,
      ...(size.every(Boolean) ? { size } : {}),
      ...(seats ? { seats } : {}),
    });
  }
  for (const list of gensByModel.values()) list.sort((a, b) => (a.y[0] ?? 0) - (b.y[0] ?? 0));
}

const skipCountries = new Set(rules.skipCountries);
const skipBrands = new Set(rules.skipBrands);
const brands = [];
let models = 0;
let withGens = 0;
for (const b of raw) {
  if (skipCountries.has(b.country) || skipBrands.has(b.name)) continue;
  const list = b.models
    // довоенные и снятые до minYear — в детейлинг не приезжают, только шумят в поиске
    .filter((m) => (m.year_to ?? 9999) >= rules.minYear)
    .map((m) => {
      const gens = gensByModel.get(m.id);
      if (gens) withGens++;
      return {
        // /full склеивает модель с поколением: «X5, III (F15)» — в самих названиях запятой нет
        name: m.name.split(', ')[0].trim(),
        ...(m.cyrillic_name && m.cyrillic_name !== m.name ? { ru: m.cyrillic_name.trim() } : {}),
        seg: m.class ?? null,
        // годы выпуска — подпись в выдаче (год «по» у выпускаемых — текущий)
        ...(m.year_from ? { y: [m.year_from, m.year_to ?? null] } : {}),
        ...(gens ? { gens } : {}),
      };
    });
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
// с платным ключом поколения должны быть почти у всех; мало — ключ истёк или API сменилось
if (token && token !== 'test' && withGens < models * 0.8) {
  throw new Error(`Поколения нашлись только у ${withGens} из ${models} моделей — проверь ключ и API`);
}

const source = token === 'test' ? `${API} (демо: поколения только у первых 50 марок)` : token ? `${API} (платный ключ)` : `${API}/full`;
await writeFile(
  OUT,
  JSON.stringify({ _readme: `Сгенерировано scripts/import-cars-base.mjs из ${source}. Руками не править.`, updated: new Date().toISOString().slice(0, 10), brands }, null, 0) + '\n'
);
console.log(`cars-base.json: ${brands.length} марок, ${models} моделей, с поколениями и габаритами — ${withGens}`);
