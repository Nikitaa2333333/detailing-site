/* Пути к файлам из public/ и внутренние ссылки — только через эти функции.

   Зачем: на GitHub Pages сайт живёт в подпапке (/detailing-site/), на будущем
   своём домене — в корне. Astro отдаёт актуальный префикс в import.meta.env.BASE_URL;
   переезд на другой хостинг = смена BASE_PATH в окружении, вёрстку не трогаем.

   Абсолютных путей вида "/img/…" и href="/…" в компонентах быть не должно. */

const BASE = import.meta.env.BASE_URL; // всегда заканчивается на "/"

/** Файл из public: asset('/img/hero-1.webp') -> '/detailing-site/img/hero-1.webp' */
export function asset(path) {
  if (!path) return path;
  if (/^(https?:|data:|#)/.test(path)) return path; // внешние ссылки не трогаем
  return BASE + String(path).replace(/^\/+/, '');
}

/** Внутренняя ссылка: url('/okleika') -> '/detailing-site/okleika', url('/') -> '/detailing-site/' */
export const url = asset;
