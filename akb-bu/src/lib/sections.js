/* Категории и разделы сайта поверх прайса — одна точка для плиток, калькулятора, меню,
   чата и автотеста.

   content.json → services.categories[].sheets[] — раздел сайта:
     { "sheet": "Лист прайса", "title": "Как на сайте" }        — лист целиком
     { "sheets": ["Лист 1", "Лист 2"], "title": "…" }            — два листа одним разделом
     "hide": ["id услуги", …]  — эти услуги в разделе не показывать (скрыты или перенесены)
     "only": ["id услуги", …]  — из листа показать только эти (перенос услуг в другую категорию)
     "id": "…"                 — id раздела, если лист встречается в двух разделах
     "hidden": true            — раздел скрыт целиком (у категории — категория скрыта)
   Пустой после скрытия раздел и категория без разделов на сайт не выходят.
   Ссылка на услугу или лист, которых нет в прайсе, — сборка падает.

   Ключ услуги — «id листа:id услуги» как и раньше: на него завязаны отметки в
   localStorage, словарь задач и тексты. id раздела — id первого листа, если не задан. */
import prices from '../data/prices.json';
import content from '../data/content.json';

const bySheet = new Map(prices.categories.map((c) => [c.sheet, c]));
const problems = [];

function resolveSection(ref, category) {
  const names = ref.sheets ?? [ref.sheet];
  const parts = names.map((name) => {
    const sheet = bySheet.get(name);
    if (!sheet) problems.push(`${category.title} → лист «${name}»`);
    return sheet;
  }).filter(Boolean);
  if (!parts.length) return null;
  const all = new Set(parts.flatMap((p) => p.groups.flatMap((g) => g.services.map((s) => s.id))));
  for (const id of [...(ref.hide ?? []), ...(ref.only ?? [])]) {
    if (!all.has(id)) problems.push(`${category.title} → ${ref.title} → услуга «${id}»`);
  }
  const hide = new Set(ref.hide ?? []);
  const only = ref.only ? new Set(ref.only) : null;
  const shown = (s) => !hide.has(s.id) && (!only || only.has(s.id));
  const groups = parts.flatMap((sheet) =>
    sheet.groups
      .map((g) => ({
        title: g.title,
        services: g.services.filter(shown).map((s) => ({ key: `${sheet.id}:${s.id}`, sheet, service: s })),
      }))
      .filter((g) => g.services.length)
  );
  return {
    id: ref.id ?? parts[0].id,
    title: ref.title,
    parts,
    classLabels: parts[0].classLabels,
    groups,
    services: groups.flatMap((g) => g.services),
    hidden: !!ref.hidden,
  };
}

/** [{ ...категория, sections: [{ id, title, parts, classLabels, groups: [{ title, services: [{ key, sheet, service }] }], services }] }]
    — только то, что видно на сайте, в порядке content.json */
export const siteCategories = content.services.categories
  .filter((cat) => !cat.hidden)
  .map((cat) => {
    const { sheets, ...rest } = cat;
    const sections = sheets
      .map((ref) => resolveSection(ref, cat))
      .filter((s) => s && !s.hidden && s.services.length);
    return { ...rest, sections };
  })
  .filter((cat) => cat.sections.length);

if (problems.length) {
  throw new Error(`content.json (разделы услуг) ссылается на то, чего нет в prices.json: ${problems.join(', ')}. Заказчик мог переименовать лист или услугу — поправьте ссылку.`);
}
const ids = siteCategories.flatMap((c) => c.sections.map((s) => s.id));
const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
if (dup.length) throw new Error(`content.json: два раздела с одним id (${dup.join(', ')}) — задайте "id" у одного из них.`);
