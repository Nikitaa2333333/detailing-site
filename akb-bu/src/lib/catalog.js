/* Каталог услуг для сайта: категории и разделы поверх прайса (lib/sections.js).
   Разбивку по категориям, человеческие названия и скрытое задаёт content.json,
   количество услуг и цены «от» считаются отсюда — руками их не проставлять. */
import { siteCategories } from './sections.js';

const NBSP = String.fromCharCode(160);

/* Нижняя граница цены услуги. Идём по классам слева направо: 1-й есть почти
   везде, а где пуст (мойка ДВС, подвеска) — берём первый заполненный. */
function servicePrice(service, classLabels) {
  for (const label of classLabels) {
    const cell = service.prices[label];
    if (cell) return cell.value ?? cell.min ?? null;
  }
  return null;
}

/* «11900» -> «11 900 ₽», разряды и знак валюты неразрывными пробелами */
export function rub(value) {
  if (value == null) return '';
  return `${String(value).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP)}${NBSP}₽`;
}

export function plural(n, forms = ['услуга', 'услуги', 'услуг']) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1];
  return forms[2];
}

/* Разделы — из lib/sections.js: там скрытые услуги, объединённые листы и переносы.
   Цена «от» и число услуг — только по тому, что видно на сайте */
export const categories = siteCategories.map(({ sections, ...category }) => {
  const items = sections.map((section) => {
    const values = section.services.map((s) => servicePrice(s.service, s.sheet.classLabels)).filter((v) => v != null);
    return { id: section.id, title: section.title, count: section.services.length, from: values.length ? Math.min(...values) : null };
  });
  const values = items.map((i) => i.from).filter((v) => v != null);
  return {
    ...category,
    items,
    count: items.reduce((sum, i) => sum + i.count, 0),
    from: values.length ? Math.min(...values) : null,
  };
});

export const totalServices = categories.reduce((sum, c) => sum + c.count, 0);
