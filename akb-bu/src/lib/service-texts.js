/* Клиентские тексты услуг: наша редактура поверх прайса.

   prices.json — файл заказчика, его пишет только импортёр из xlsx. Как услугу
   показывать на сайте (название, одна фраза «что это», «что входит», условия),
   решает service-texts.json. Чего там нет — берётся из прайса как есть.

   Если после обновления прайса текст ссылается на услугу, которой больше нет,
   сборка падает: иначе переписанный текст тихо отваливается и на сайт
   возвращается прайсовая формулировка. */
import prices from '../data/prices.json';
import texts from '../data/service-texts.json';
import { sentence } from './typo.js';

const known = new Map(
  prices.categories.map((sheet) => [sheet.id, new Set(sheet.groups.flatMap((g) => g.services.map((s) => s.id)))])
);

const unknown = [];
for (const [sheetId, services] of Object.entries(texts)) {
  if (sheetId.startsWith('_')) continue;
  const ids = known.get(sheetId);
  if (!ids) {
    unknown.push(`раздел «${sheetId}»`);
    continue;
  }
  for (const id of Object.keys(services)) if (!ids.has(id)) unknown.push(`${sheetId} → «${id}»`);
}
if (unknown.length) {
  throw new Error(
    `service-texts.json ссылается на услуги, которых нет в prices.json: ${unknown.join(', ')}. ` +
      'Заказчик мог переименовать услугу в прайсе — перенесите текст на новый id.'
  );
}

/** Как показать услугу: { name, lead, includes, terms }. Пустые поля — пустые строки и списки */
export function serviceText(sheetId, service) {
  const own = texts[sheetId]?.[service.id] ?? {};
  return {
    name: own.name ?? sentence(service.name),
    lead: own.lead ?? (service.desc ?? []).join(' '),
    includes: own.includes ?? service.steps ?? [],
    terms: own.terms ?? service.notes ?? [],
  };
}
