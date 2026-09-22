/* Каталог услуг для сайта: группировка прайса (27 листов) в 6 категорий.
   Разбивку по категориям и человеческие названия задаёт content.json,
   количество услуг и цены «от» считаются отсюда — руками их не проставлять. */
import prices from '../data/prices.json';
import content from '../data/content.json';

const NBSP = String.fromCharCode(160);
const bySheet = new Map(prices.categories.map((c) => [c.sheet, c]));

/* Нижняя граница цены услуги. Идём по классам слева направо: 1-й есть почти
   везде, а где пуст (мойка ДВС, подвеска) — берём первый заполненный. */
function servicePrice(service, classLabels) {
  for (const label of classLabels) {
    const cell = service.prices[label];
    if (cell) return cell.value ?? cell.min ?? null;
  }
  return null;
}

function sheetStats(sheetName) {
  const sheet = bySheet.get(sheetName);
  if (!sheet) throw new Error(`Нет такого листа в прайсе: ${sheetName}`);
  const services = sheet.groups.flatMap((g) => g.services);
  const values = services.map((s) => servicePrice(s, sheet.classLabels)).filter((v) => v != null);
  return { count: services.length, from: values.length ? Math.min(...values) : null };
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

export const categories = content.services.categories.map((category) => {
  const items = category.sheets.map(({ sheet, title }) => ({
    title,
    ...sheetStats(sheet),
  }));
  const values = items.map((i) => i.from).filter((v) => v != null);
  return {
    ...category,
    items,
    count: items.reduce((sum, i) => sum + i.count, 0),
    from: values.length ? Math.min(...values) : null,
  };
});

export const totalServices = categories.reduce((sum, c) => sum + c.count, 0);
