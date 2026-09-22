// @ts-check
import { defineConfig } from 'astro/config';
import { fileURLToPath } from 'node:url';

// Домен и префикс пути берём из окружения: локально — корень сайта, на GitHub Pages —
// подпапка /detailing-site/. Переезд на свой хостинг = смена SITE_URL и BASE_PATH в CI,
// вёрстку и ссылки не трогаем (пути идут через src/lib/paths.js).
const SITE_URL = process.env.SITE_URL || 'http://localhost:4321';
const BASE_PATH = process.env.BASE_PATH || '/';

// https://astro.build/config
export default defineConfig({
  site: SITE_URL,
  base: BASE_PATH,
  trailingSlash: 'ignore',
  vite: {
    server: {
      // На Windows нативный вотчер пропускает перезаписи файлов — дев-сервер отдаёт старый CSS.
      // Polling надёжнее; 300 мс не грузит CPU на проекте такого размера.
      watch: { usePolling: true, interval: 300 },
      // Путь к проекту с пробелом ломает дефолтный allow-list Vite: шрифты из node_modules
      // (@fontsource) отдавались с ошибкой «outside of Vite serving allow list» и падали на системный шрифт.
      fs: { allow: [fileURLToPath(new URL('.', import.meta.url))] },
    },
  },
});
