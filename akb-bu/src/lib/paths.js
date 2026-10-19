/* Пути к файлам из public/ и внутренние ссылки — только через эти функции.

   Зачем: на GitHub Pages сайт живёт в подпапке (/detailing-site/), на будущем
   своём домене — в корне. Astro отдаёт актуальный префикс в import.meta.env.BASE_URL;
   переезд на другой хостинг = смена BASE_PATH в окружении, вёрстку не трогаем.

   Абсолютных путей вида "/img/…" и href="/…" в компонентах быть не должно. */
import versions from '../data/asset-versions.json';

const BASE = import.meta.env.BASE_URL; // всегда заканчивается на "/"

/** Файл из public: asset('/img/hero-1.webp') -> '/detailing-site/img/hero-1.webp?v=a1b2c3d4'.
    ?v — хеш содержимого (scripts/asset-versions.mjs): хостинг кэширует статику на 45 дней по
    адресу, без версии замена файла не доходит до посетителей. Путей вне public/ не касается. */
export function asset(path) {
  if (!path) return path;
  if (/^(https?:|data:|#)/.test(path)) return path; // внешние ссылки не трогаем
  const clean = '/' + String(path).replace(/^\/+/, '');
  const v = versions[clean];
  return BASE + clean.slice(1) + (v ? `?v=${v}` : '');
}

/** Внутренняя ссылка: url('/okleika') -> '/detailing-site/okleika', url('/') -> '/detailing-site/' */
export const url = asset;
