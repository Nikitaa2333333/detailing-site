/* Справочник машин для браузера: отдельный файл /cars-index.json (pages/cars-index.json.js),
   один на весь сайт — браузер скачивает его раз и берёт из кэша на всех страницах.
   В HTML он не встраивается: с мировой базой это ~4000 моделей.

   Упаковка: без ключа, равного названию (восстанавливается normalize), подписи класса —
   таблицей, повторяющиеся «по аналогии с …» — номерами.
   { labels: { cls: label }, likes: [str], brands: [[name, keys, base, [[model, cls, keys, like, base, era?, codes?]]]] } */
import { normalize } from './car-search.js';

const rest = (name, keys) => keys.filter((k) => k !== normalize(name));

/* Годы выпуска подписью, как в каталогах auto.ru и drom, — только там, где они что-то
   говорят: снятая модель «1999–2006», новая «с 2025». У долгожителей (Camry 1980–н. в.)
   подписи нет — годы ничего не различают. Выпускается — год «по» не раньше прошлого */
export function era(years, now = new Date().getFullYear()) {
  if (!years) return '';
  const [from, to] = years;
  if (to && to < now - 1) return from === to ? String(from) : `${from}–${to}`;
  return from >= 2012 ? `с ${from}` : '';
}

export function pack(index) {
  const labels = {};
  const likes = [];
  const likeId = new Map();
  const id = (s) => {
    if (!s) return -1;
    if (!likeId.has(s)) likeId.set(s, likes.push(s) - 1);
    return likeId.get(s);
  };
  const brands = index.map((b) => [
    b.brand,
    rest(b.brand, b.keys),
    b.base ? 1 : 0,
    b.models.map((m) => {
      labels[m.cls] = m.label;
      const e = era(m.years);
      // хвост необязательный: годы, затем кузовные коды (car-codes.json)
      const tail = m.codes ? [e, m.codes] : e ? [e] : [];
      return [m.model, m.cls, rest(m.model, m.keys), id(m.like), m.base ? 1 : 0, ...tail];
    }),
  ]);
  return { labels, likes, brands };
}

export function unpack({ labels, likes, brands }) {
  const keys = (name, extra) => [normalize(name), ...extra].filter(Boolean);
  return brands.map(([brand, bKeys, bBase, models]) => ({
    brand,
    keys: keys(brand, bKeys),
    ...(bBase ? { base: 1 } : {}),
    models: models.map(([model, cls, mKeys, like, base, era, codes]) => ({
      model,
      cls,
      label: labels[cls],
      keys: keys(model, mKeys),
      ...(like >= 0 ? { like: likes[like] } : {}),
      ...(base ? { base: 1 } : {}),
      ...(era ? { era } : {}),
      ...(codes ? { codes } : {}),
    })),
  }));
}
