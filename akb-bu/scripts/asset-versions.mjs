// Версии файлов из public/ → src/data/asset-versions.json: { "/img/tiles/uhod.webp": "a1b2c3d4" }.
// lib/paths.js добавляет ?v=<хеш> к адресу картинки или ролика. Зачем: nginx на Reg.ru кэширует
// статику на 45 дней по адресу, и замена файла под тем же именем не доходит до посетителей
// (19.10.2026: телефон показывал старые обложки плашек). Хеш меняется — адрес новый — кэш мимо.
// Запускается перед сборкой и перед дев-сервером (package.json).
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const out = join(root, 'src', 'data', 'asset-versions.json');
const SKIP = new Set(['.htaccess']);

const versions = {};
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (!SKIP.has(name)) {
      const key = '/' + relative(pub, p).split('\\').join('/');
      versions[key] = createHash('md5').update(readFileSync(p)).digest('hex').slice(0, 8);
    }
  }
};
walk(pub);
const sorted = Object.fromEntries(Object.entries(versions).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(out, JSON.stringify(sorted, null, 2) + '\n');
console.log(`asset-versions: ${Object.keys(sorted).length} файлов`);
