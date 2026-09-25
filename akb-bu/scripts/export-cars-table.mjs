/* Справочник машин одной таблицей — для заказчика: марка, модель, класс и откуда он.
   Печатает JSON в stdout; xlsx и html из него собирает scripts/cars-table.py
   (npm run cars-table). Данные — те же модули, что на сайте. */
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const server = await createServer({ root, configFile: false, logLevel: 'error', server: { middlewareMode: true } });
try {
  const { carIndex } = await server.ssrLoadModule('/src/lib/cars.js');
  const { normalize } = await server.ssrLoadModule('/src/lib/car-search.js');
  const rows = carIndex.flatMap((b) =>
    b.models.map((m) => ({
      brand: b.brand,
      model: m.model,
      cls: Number(m.cls),
      like: m.like ?? '',
      // как ещё ищут: без самого названия и без сырого написания из прайса
      alt: m.keys.filter((k) => k !== normalize(m.model) && !/\d.*\s.*\s/.test(k)),
    }))
  );
  process.stdout.write(JSON.stringify(rows));
} finally {
  await server.close();
}
