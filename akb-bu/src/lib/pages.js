/* Страницы направлений и услуг поверх разделов сайта (lib/sections.js) — данные в
   data/pages.json, шаблон — pages/[slug].astro, карта — docs/site-structure.md.

   Строка прайса живёт ровно на одной странице: на странице услуги (раздел целиком или
   строки из only) или, если у раздела своей страницы нет, на странице направления.
   Осиротевший ключ, строка на двух страницах или видимая строка без страницы — сборка
   падает и называет их. */
import data from '../data/pages.json';
import { siteCategories } from './sections.js';
import { serviceText } from './service-texts.js';
import { sentence } from './typo.js';

const problems = [];
const catById = new Map(siteCategories.map((c) => [c.id, c]));
const sectionById = new Map(siteCategories.flatMap((c) => c.sections.map((s) => [s.id, { section: s, cat: c }])));

/* Ячейка цены: { kind: 'exact' | 'from', value } или null — «по запросу» */
const cell = (c) => {
  const v = c ? (c.value ?? c.min ?? null) : null;
  return v == null ? null : { kind: c.kind === 'exact' ? 'exact' : 'from', value: v };
};

function row({ key, sheet, service }) {
  const text = serviceText(sheet.id, service);
  const cells = sheet.classLabels.map((label) => cell(service.prices[label]));
  const known = cells.filter(Boolean).map((c) => c.value);
  return {
    key,
    name: text.name,
    lead: text.lead,
    includes: text.includes,
    terms: text.terms,
    cells,
    min: known.length ? Math.min(...known) : null,
  };
}

/* Строки раздела группами прайса; keep — какие ключи взять */
function rowsOf(section, keep) {
  return section.groups
    .map((g) => ({ title: g.title ? sentence(g.title) : '', rows: g.services.filter((s) => keep(s.key)).map(row) }))
    .filter((g) => g.rows.length);
}

const minOf = (groups) => {
  const v = groups.flatMap((g) => g.rows.map((r) => r.min)).filter((x) => x != null);
  return v.length ? Math.min(...v) : null;
};

/* Кто занял строку: ключ → slug страницы */
const owner = new Map();
const claim = (key, slug) => {
  if (owner.has(key)) problems.push(`строка «${key}» на двух страницах: ${owner.get(key)} и ${slug}`);
  else owner.set(key, slug);
};

/* 1. Услуги: сначала явные only, потом «остаток раздела» */
const services = data.services.map((p) => {
  const found = sectionById.get(p.section);
  if (!found) {
    problems.push(`${p.slug}: раздела «${p.section}» нет на сайте`);
    return null;
  }
  if (found.cat.id !== p.cat) problems.push(`${p.slug}: раздел «${p.section}» не из направления «${p.cat}»`);
  const keys = new Set(found.section.services.map((s) => s.key));
  for (const k of p.only ?? []) if (!keys.has(k)) problems.push(`${p.slug}: строки «${k}» нет в разделе (скрыта или переименована)`);
  return { ...p, section: found.section };
}).filter(Boolean);

for (const p of services) for (const k of p.only ?? []) claim(k, p.slug);
for (const p of services) {
  if (p.only) continue;
  for (const s of p.section.services) if (!owner.has(s.key)) claim(s.key, p.slug);
}
for (const p of services) {
  p.groups = rowsOf(p.section, (k) => owner.get(k) === p.slug);
  p.from = minOf(p.groups);
  if (!p.groups.length) problems.push(`${p.slug}: на странице не осталось строк`);
}

/* 2. Направления: разделы, у которых нет своей страницы, — прайсом здесь */
const directions = data.directions.map((d) => {
  const cat = catById.get(d.cat);
  if (!cat) {
    problems.push(`направление «${d.cat}» не найдено на сайте`);
    return null;
  }
  return { ...d, cat };
}).filter(Boolean);

for (const d of directions) {
  const slug = d.slug ?? d.page;
  d.sections = d.cat.sections
    .filter((s) => s.services.some((x) => !owner.has(x.key)))
    .map((s) => {
      for (const x of s.services) if (!owner.has(x.key)) claim(x.key, slug);
      return { id: s.id, title: s.title, groups: rowsOf(s, (k) => owner.get(k) === slug) };
    });
  if (d.page && d.sections.length) problems.push(`направление «${d.cat.id}» без своей страницы, но у него есть строки без страницы`);
}

for (const c of catById.values()) {
  if (!directions.some((d) => d.cat.id === c.id)) problems.push(`у направления «${c.title}» нет записи в pages.json`);
  for (const s of c.sections) for (const x of s.services) if (!owner.has(x.key)) problems.push(`строка «${x.key}» не попала ни на одну страницу`);
}

const bySlug = new Map(services.map((p) => [p.slug, p]));
for (const p of services) {
  for (const r of p.related ?? []) {
    if (!bySlug.has(r) && !directions.some((d) => d.slug === r)) problems.push(`${p.slug}: смежная «${r}» не найдена`);
  }
}
for (const d of directions) if (d.page && !bySlug.has(d.page)) problems.push(`направление «${d.cat.id}»: страница «${d.page}» не найдена`);

if (problems.length) {
  throw new Error(`pages.json: ${problems.join('; ')}. Карта страниц — docs/site-structure.md.`);
}

/* Направления с карточками услуг и ценой «от» */
for (const d of directions) {
  d.children = services.filter((p) => p.cat === d.cat.id && p.slug !== d.page);
  const self = d.page ? bySlug.get(d.page)?.from : null;
  const mins = [self, ...d.children.map((p) => p.from), minOf(d.sections.flatMap((s) => s.groups))].filter((v) => v != null);
  d.from = mins.length ? Math.min(...mins) : null;
}

/** Адрес страницы направления по id категории (у химчистки и PDR — страница услуги) */
export const directionSlug = (catId) => {
  const d = directions.find((x) => x.cat.id === catId);
  return d ? d.slug ?? d.page : null;
};

/** Адрес страницы по id раздела сайта: страница услуги, иначе направление */
export const sectionSlug = (sectionId) => {
  const p = services.find((x) => x.section.id === sectionId && !x.only) ?? services.find((x) => x.section.id === sectionId);
  if (p) return p.slug;
  const d = directions.find((x) => x.sections.some((s) => s.id === sectionId));
  return d ? d.slug ?? d.page : null;
};

export const pageServices = services;
export const pageDirections = directions;

/** Цена по каждому классу для карточки — [['f', 790] | ['e', 790] | null, …] (формат data-cells,
    lib/page-car.js). Минимум по строкам — «от»; если строка одна и цена в прайсе точная — без «от»
    (19.10.2026: «а почему от, если цена известна») */
export function classFrom(groups, classes = 5) {
  const rows = groups.flatMap((g) => g.rows);
  return Array.from({ length: classes }, (_, i) => {
    const cells = rows.map((r) => r.cells[i]).filter((c) => c && c.value != null);
    if (!cells.length) return null;
    const exact = cells.length === 1 && cells[0].kind === 'exact';
    return [exact ? 'e' : 'f', Math.min(...cells.map((c) => c.value))];
  });
}

const allGroups = (d) => [...d.children.flatMap((p) => p.groups), ...d.sections.flatMap((s) => s.groups)];

/** Карточка для «смежных» и сетки направления: { slug, title, card, from, cells } */
export function pageCard(slug) {
  const p = bySlug.get(slug);
  if (p) return { slug, title: p.h1, card: p.card ?? '', from: p.from, cells: classFrom(p.groups) };
  const d = directions.find((x) => x.slug === slug);
  return d ? { slug, title: d.h1, card: d.lead, from: d.from, cells: classFrom(allGroups(d)) } : null;
}
export const directionCells = (d) => classFrom(allGroups(d));

/* Шаги «Как мы это делаем»: свои из pages.json, иначе «Что входит» самой подробной строки
   (от трёх пунктов, не больше шести) */
for (const p of services) {
  if (p.steps) continue;
  const best = p.groups.flatMap((g) => g.rows).sort((a, b) => b.includes.length - a.includes.length)[0];
  p.steps = best && best.includes.length >= 3 ? best.includes.slice(0, 6) : [];
}

/** Фото направления (плашка главной) — для блока цифр */
export const directionMedia = (catId) => catById.get(catId)?.media ?? null;

/** Вкладки первого экрана: направление «Все» + его услуги; у PDR вкладок нет */
export function siblings(catId) {
  const d = directions.find((x) => x.cat.id === catId);
  if (!d) return [];
  const own = d.page ? [bySlug.get(d.page)] : [];
  const list = [
    ...(d.slug ? [{ slug: d.slug, tab: 'Все' }] : []),
    ...[...own, ...d.children].map((p) => ({ slug: p.slug, tab: p.tab ?? p.h1 })),
  ];
  return list.length > 1 ? list : [];
}
