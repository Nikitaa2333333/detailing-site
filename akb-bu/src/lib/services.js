/* Карта сайта: services.json + прайс → готовые объекты для страниц.

   Одна точка сборки для маршрутов, мега-меню, хлебных крошек, смежных услуг
   и sitemap. Цены сюда приходят только из prices.json по стабильному id
   раздела — руками в вёрстке их не появляется.

   service.price.blocks — по одной таблице на раздел прайса: у «Мототехники»
   два класса, у остальных пять, поэтому колонки живут в блоке, а не в странице. */
import prices from '../data/prices.json';
import map from '../data/services.json';
import { sentence } from './typo.js';

const NBSP = ' ';
const sheets = new Map(prices.categories.map((c) => [c.id, c]));

export const classes = prices.classes;
export const motoClasses = prices.motoClasses;
export const globalFootnotes = prices.footnotes;

/** «11900» -> «11 900 ₽», разряды и знак валюты неразрывными пробелами */
export function rub(value) {
  if (value == null) return '';
  return `${String(value).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP)}${NBSP}₽`;
}

/** Цена ячейки: точная или «от». Пустая ячейка — прочерк, не ноль */
export function priceCell(cell) {
  if (!cell) return null;
  const value = cell.value ?? cell.min ?? null;
  if (value == null) return null;
  return { text: cell.kind === 'from' ? `от ${rub(value)}` : rub(value), value };
}

function buildBlocks(ids = []) {
  return ids.map((id) => {
    const sheet = sheets.get(id);
    // Раздел мог переехать при обновлении прайса — падаем на сборке, а не молча
    if (!sheet) throw new Error(`services.json ссылается на несуществующий раздел прайса: ${id}`);
    return {
      id: sheet.id,
      title: sentence(sheet.title),
      classLabels: sheet.classLabels,
      notes: sheet.notes ?? [],
      groups: sheet.groups.map((group) => ({
        title: sentence(group.title),
        rows: group.services.map((service) => ({
          name: sentence(service.name),
          note: service.footnote || '',
          notes: service.notes ?? [],
          desc: service.desc ?? [],
          duration: service.duration || '',
          cells: sheet.classLabels.map((label) => priceCell(service.prices[label])),
        })),
      })),
    };
  });
}

function minPrice(blocks) {
  const values = blocks.flatMap((b) =>
    b.groups.flatMap((g) => g.rows.flatMap((r) => r.cells.filter(Boolean).map((c) => c.value)))
  );
  return values.length ? Math.min(...values) : null;
}

function buildService(raw, category, parent = null) {
  const blocks = buildBlocks(raw.sheets);
  const service = {
    ...raw,
    category: { id: category.id, title: category.title, url: category.url },
    parent: parent ? { id: parent.id, title: parent.title, url: parent.url } : null,
    price: {
      blocks,
      from: raw.priceFrom ?? minPrice(blocks),
      hasTable: blocks.length > 0,
      note: raw.priceNote ?? null,
    },
    children: [],
  };
  service.children = (raw.children ?? []).map((child) => buildService(child, category, service));
  return service;
}

export const categories = map.categories.map((category) => {
  const services = category.services.map((s) => buildService(s, category));
  return {
    ...category,
    services,
    // В меню и на страницу категории не выводим рекламные посадочные
    visible: services.filter((s) => !s.hidden),
    count: services.reduce((sum, s) => sum + 1 + s.children.length, 0),
  };
});

/** Плоский список всех страниц услуг, включая брендовые — по нему строятся маршруты */
export const allServices = categories.flatMap((c) => c.services.flatMap((s) => [s, ...s.children]));

export const byUrl = new Map(allServices.map((s) => [s.url, s]));

/** Главная / Категория / Услуга — для брендовых страниц четвёртый уровень */
export function breadcrumbs(service) {
  const trail = [
    { title: 'Главная', url: '/' },
    { title: service.category.title, url: service.category.url },
  ];
  if (service.parent) trail.push({ title: service.parent.title, url: service.parent.url });
  trail.push({ title: service.title, url: service.url });
  return trail;
}

/** Смежные услуги — соседи по категории, брендовые страницы не мешаем в общий список */
export function related(service, limit = 3) {
  const category = categories.find((c) => c.id === service.category.id);
  const pool = category.visible.filter((s) => s.id !== service.id && s.id !== service.parent?.id);
  // У брендовой страницы соседи — другие бренды той же плёнки
  if (service.parent) {
    const siblings = allServices.filter(
      (s) => s.parent?.id === service.parent.id && s.id !== service.id
    );
    if (siblings.length) return siblings.slice(0, limit);
  }
  return pool.slice(0, limit);
}
