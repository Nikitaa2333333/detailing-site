/* Поиск по задаче: «поцарапали дверь» → полировка. Общий для браузера и автотеста.

   Человек описывает беду, а не название услуги из прайса. Словарь
   data/service-intents.json сводит такие формулировки к подборке услуг.
   Слово фразы сравниваем по основе (как в service-search.js): «царапины»,
   «поцарапали» и «царапину» находят одно и то же. Последнее слово запроса
   может быть недописанным — подсказка появляется, пока человек печатает.

   Если после обновления прайса словарь ссылается на услугу, которой больше
   нет, сборка падает и называет ключ (checkIntents): иначе подборка тихо похудеет. */
import dict from '../data/service-intents.json';
import { normalize } from './car-search.js';
import { stem } from './service-search.js';
import { typo } from './typo.js';

/** Проверка на сборке: все ли услуги словаря есть в прайсе. Прайс сюда не импортируем —
    модуль уходит в браузер, прайс целиком ему не нужен */
export function checkIntents(prices) {
  const known = new Set(
    prices.categories.flatMap((sheet) => sheet.groups.flatMap((g) => g.services.map((s) => `${sheet.id}:${s.id}`)))
  );
  const unknown = dict.intents.flatMap((i) => i.services.filter((key) => !known.has(key)).map((key) => `${i.id} → ${key}`));
  if (unknown.length) {
    throw new Error(
      `service-intents.json ссылается на услуги, которых нет в prices.json: ${unknown.join(', ')}. ` +
        'Перенесите запись на новый id услуги или уберите её.'
    );
  }
}

/* Предлоги и союзы во фразах не участвуют: «к зиме» ищем по «зиме» */
const SKIP = new Set(['для', 'под', 'без', 'при', 'про', 'над', 'как', 'что', 'нет']);
const words = (s) => normalize(s).split(' ').filter((w) => w.length > 2 && !SKIP.has(w));

export const intents = dict.intents.map((i) => ({
  id: i.id,
  title: typo(i.title),
  lead: typo(i.lead),
  services: i.services,
  phrases: i.phrases.map((p) => words(p).map(stem)).filter((p) => p.length),
}));

/** Подходящие задачи, лучшие первыми (не больше limit) */
export function matchIntents(query, { limit = 2 } = {}) {
  const q = normalize(query).split(' ').filter(Boolean);
  if (!q.length) return [];
  const last = q[q.length - 1];
  // слово запроса закрывает слово фразы целиком или, если это недописанное последнее, его начало
  const covers = (w) => q.some((x) => x.startsWith(w)) || (last.length >= 3 && w.startsWith(last));

  const found = [];
  for (const intent of intents) {
    let best = 0;
    for (const phrase of intent.phrases) {
      if (!phrase.every(covers)) continue;
      // длиннее совпадение — точнее попадание: «пленка на капот» важнее «камни»
      const score = phrase.reduce((sum, w) => sum + w.length, 0) + phrase.length * 10;
      best = Math.max(best, score);
    }
    if (best) found.push({ intent, score: best });
  }
  return found
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((f) => f.intent);
}
