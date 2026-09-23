/* Поиск услуг в калькуляторе. Общий для браузера и автотеста (scripts/test-search.mjs).

   Ищем по всему, что человек видит в карточке, плюс раздел и направление.
   Слово сравниваем по основе без окончания: «пленкой» находит «плёнка»,
   «керамику» — «керамика». Все слова запроса должны найтись. */
import { normalize } from './car-search.js';

/** Основа слова: отрезаем до трёх букв окончания, но оставляем не меньше четырёх */
export const stem = (w) => (w.length > 4 ? w.slice(0, Math.max(4, w.length - 3)) : w);

/** Текст для поиска по карточке: название, суть, время, условия, группа, раздел, направление */
export const haystack = (parts) => normalize(parts.filter(Boolean).join(' '));

/** Подходит ли карточка под запрос. Пустой запрос подходит всему */
export function matches(find, query) {
  const words = normalize(query).split(' ').filter(Boolean).map(stem);
  return words.every((w) => find.includes(w));
}
