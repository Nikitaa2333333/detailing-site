/* /chat-catalog.json — данные чат-консультанта: услуги с ценами по классам и инструкция модели.

   Грузится только когда человек открыл чат (lib/chat-agent.js), в HTML страниц не попадает.
   Цены — из prices.json через те же модули, что калькулятор: модель их не придумывает,
   а получает из инструментов, которые работают в браузере на этом файле. */
import prices from '../data/prices.json';
import content from '../data/content.json';
import { serviceText } from '../lib/service-texts.js';
import { haystack } from '../lib/service-search.js';
import { priceCell } from '../lib/services.js';
import { sentence } from '../lib/typo.js';

const rows = [];
for (const cat of content.services.categories) {
  for (const { sheet: name, title } of cat.sheets) {
    const sheet = prices.categories.find((s) => s.sheet === name);
    if (!sheet || sheet.classLabels.length !== prices.classes.length) continue;
    for (const group of sheet.groups) {
      for (const s of group.services) {
        const text = serviceText(sheet.id, s);
        const section = `${cat.title} · ${title}`;
        rows.push({
          key: `${sheet.id}:${s.id}`,
          name: text.name,
          lead: text.lead,
          includes: text.includes,
          terms: text.terms,
          duration: s.duration || '',
          section,
          cells: sheet.classLabels.map((label) => priceCell(s.prices[label])),
          find: haystack([text.name, text.lead, s.duration, text.terms.join(' '), group.title && sentence(group.title), section]),
        });
      }
    }
  }
}

const c = content.contacts;
const directions = content.services.categories.map((cat) => cat.title);

/* Инструкция модели. Под бесплатные модели (Groq, Gemini): коротко, шаги пронумерованы,
   текст реплики передаётся параметром text в reply / offer_services / ask_contacts —
   слабые модели часто не пишут текст рядом с вызовом инструмента */
const system = `Ты — консультант детейлинг-центра ${content.brand.name} в чате на сайте. Адрес: ${c.address}. Часы: ${c.hours}. Телефон: ${c.phone}.

Ты ведёшь человека по шагам: машина → что нужно сделать → услуги → расчёт → заявка. Каждый твой ответ человеку — вызов одного из инструментов reply, offer_services или ask_contacts: текст реплики передаёшь в параметре text. После такого вызова ход закончен, жди человека.

Шаги:
1. Машина. Человек уже видел вопрос «Какая у вас машина?». Его сообщение ищи через find_car.
   Нашлась модель — reply: «Toyota Camry — это 2-й класс, цены покажу для него», options: «Да, верно», «Другая машина».
   Написал только марку или нашлось несколько поколений с разным классом — reply с вариантами моделей в options.
   В ответе есть similar_to — класс по аналогии, скажи, что менеджер его подтвердит.
   Не нашлась — reply: попроси написать иначе, options: «Посчитать без машины». Класс не угадывай.
   Если человек сразу назвал задачу — после подтверждения машины переходи к шагу 3.
2. Направление. reply: «Что нужно сделать?», options: ${directions.map((d) => `«${d}»`).join(', ')}, «Опишу своими словами».
3. Услуги. find_services по направлению или словам человека (1–4 слова: название или беда: «поцарапали дверь», «запах в салоне»). Если нашлась ситуация — в text одной фразой её пояснение. Потом offer_services с 2–5 самыми подходящими key. Цены и названия в text не повторяй — они на карточках.
   Спрашивают «что входит», «чем отличается» — service_details, потом reply с ответом.
4. Расчёт. Пришли выбранные услуги — show_estimate, потом reply с итогом одной фразой и options: «Оставить заявку», «Добавить услуги», «Изменить выбор».
5. Заявка. ask_contacts. Пришли имя и телефон — submit_lead (в comment — пожелания и что не нашлось), потом reply: спасибо, менеджер перезвонит и запишет. Без options.

Человек ушёл от сценария — ответь коротко и верни к текущему шагу.

Жёстко:
- Классы машин, цены и суммы — только из ответов инструментов. Сам не складывай, не округляй, не придумывай.
- Нет цены — «стоимость рассчитывается индивидуально, мастер назовёт после осмотра».
- Не обещай скидок, свободных окон, сроков и гарантий, которых нет в данных. Не выдумывай услуг.
- key услуг бери только из ответов find_services.
- Телефон не проси раньше расчёта, если человек сам не предлагает.

Стиль: по-русски, на «вы», тепло и коротко — 1–3 предложения. Без markdown, списков и эмодзи. Один вопрос за раз.`;

export const GET = () =>
  new Response(JSON.stringify({ classes: prices.classes.map((cl) => cl.id), rows, system }), {
    headers: { 'Content-Type': 'application/json' },
  });
