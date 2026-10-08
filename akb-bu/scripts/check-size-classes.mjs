/* Насколько правило «габариты + кузов → класс» (sizeClass в car-base-rules.json) совпадает
   с классами заказчика (его таблица и прайс). Берёт модели прайса, у которых в мировой базе есть габариты
   (платный ключ cars-base), и печатает совпадения по сегменту и по габаритам и все промахи.
   Крутим пороги в sizeClass.steps — запускаем снова. npm run cars-classes
   npm run cars-classes -- --best — ещё и лучшие пороги по каждому виду кузова (подсказка, не автозамена) */
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

const root = fileURLToPath(new URL('..', import.meta.url));
const rules = JSON.parse(await readFile(new URL('../src/data/car-base-rules.json', import.meta.url), 'utf8'));
const server = await createServer({ root, configFile: false, logLevel: 'error', server: { middlewareMode: true } });
try {
  const { carIndex } = await server.ssrLoadModule('/src/lib/cars.js');
  const base = JSON.parse(await readFile(new URL('../src/data/cars-base.json', import.meta.url), 'utf8'));
  const segOf = new Map(base.brands.flatMap((b) => b.models.map((m) => [`${b.name}|${m.name}`, m.seg])));
  const rows = [];
  for (const b of carIndex)
    for (const m of b.models) {
      if (m.like || !m.size || m.cls === "p") continue; // только модели прайса с габаритами, без «отдельно»
      const { kind, vol, gen } = m.size;
      let size = rules.sizeClass.steps[kind].find(([max]) => max === null || vol < max)[1];
      size = Math.max(size, rules.brandMinClass[b.brand] ?? 0);
      const seg = rules.segmentClass[segOf.get(`${b.brand}|${m.model}`)] ?? null;
      rows.push({ brand: b.brand, model: m.model, cls: Number(m.cls), size, seg, kind, vol, gen: gen.name });
    }
  // новые модели (обновилась база): класса из таблицы заказчика нет — их в следующую таблицу
  const fresh = carIndex.flatMap((b) => b.models.filter((m) => !m.client).map((m) => `${b.brand} ${m.model}`));
  console.log(`Без класса из таблицы заказчика: ${fresh.length}${fresh.length ? ` — ${fresh.slice(0, 20).join(', ')}${fresh.length > 20 ? '…' : ''}` : ''}`);
  const hit = (k) => rows.filter((r) => r[k] === r.cls).length;
  const pct = (n) => `${n} из ${rows.length} (${Math.round((100 * n) / rows.length)}%)`;
  console.log(`Моделей прайса с габаритами: ${rows.length}`);
  console.log(`По габаритам совпало: ${pct(hit('size'))}`);
  const withSeg = rows.filter((r) => r.seg !== null);
  console.log(`По сегменту совпало:  ${withSeg.filter((r) => r.seg === r.cls).length} из ${withSeg.length}`);
  console.log('\nПромахи габаритов (прайс → правило):');
  for (const r of rows.filter((r) => r.size !== r.cls).sort((a, b) => a.kind.localeCompare(b.kind) || a.vol - b.vol))
    console.log(`  ${r.cls} → ${r.size}  ${r.brand} ${r.model} [${r.gen}] — ${rules.sizeClass.kindNames[r.kind]}, ${r.vol} м³`);

  if (process.argv.includes('--best')) {
    /* Перебор: для вида кузова — классы те же, что в steps, границы по сетке 0,1 м³ */
    console.log('\nЛучшие пороги (классы как в steps, границы перебором):');
    for (const [kind, steps] of Object.entries(rules.sizeClass.steps)) {
      const list = rows.filter((r) => r.kind === kind && !rules.brandMinClass[r.brand]);
      const classes = steps.map(([, c]) => c);
      const grid = [];
      for (let v = 8; v <= 25; v += 0.1) grid.push(Math.round(v * 10) / 10);
      let best = { hits: -1 };
      const walk = (i, from, cuts) => {
        if (i === classes.length - 1) {
          const cls = (vol) => classes[cuts.findIndex((c) => vol < c) === -1 ? classes.length - 1 : cuts.findIndex((c) => vol < c)];
          const hits = list.filter((r) => cls(r.vol) === r.cls).length;
          if (hits > best.hits) best = { hits, cuts: [...cuts] };
          return;
        }
        for (const v of grid) if (v > from) walk(i + 1, v, [...cuts, v]);
      };
      if (classes.length <= 3) walk(0, 0, []);
      const now = list.filter((r) => r.size === r.cls).length;
      console.log(`  ${kind}: сейчас ${now} из ${list.length}, лучше всего ${best.hits} при границах ${best.cuts?.join(' / ')}`);
    }
  }
} finally {
  await server.close();
}
