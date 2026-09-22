// @ts-check
import { defineConfig } from 'astro/config';
import { fileURLToPath } from 'node:url';

// https://astro.build/config
export default defineConfig({
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
