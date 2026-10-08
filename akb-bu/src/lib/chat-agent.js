/* Чат-консультант: разговор с моделью и её инструменты. Работает в браузере.

   Модель вызывается через прокси на Google Apps Script (chat-proxy/Code.gs): он хранит
   ключ и пересылает переписку любому провайдеру с API в формате OpenAI (Groq, Gemini,
   OpenRouter…). Ключа в коде страницы нет.

   Инструменты выполняются здесь, на тех же модулях, что калькулятор: поиск машин,
   поиск услуг, словарь ситуаций. Цены — из /chat-catalog.json (prices.json на сборке).
   Модель видит цены только в ответах инструментов, сумму считает код, не она.

   reply / offer_services / ask_contacts — ответ человеку: после них ход закончен,
   модель больше не зовём. Так на шаг уходит 2–3 запроса, а не 4–5. */
import { asset } from './paths.js';
import { loadCars } from './car-index-client.js';
import { searchCars, normalize } from './car-search.js';
import { matches, stem } from './service-search.js';
import { matchIntents } from './service-intents.js';

const INDIVIDUAL = 'рассчитывается индивидуально';
const MAX_CALLS = 6; // запросов к модели на одно сообщение человека
const KEEP = 30; // сообщений истории в запросе — бесплатные тарифы считают токены

let catalog = null;
export const loadCatalog = () =>
  (catalog ??= fetch(asset('/chat-catalog.json'))
    .then((r) => {
      if (!r.ok) throw new Error(`chat-catalog.json: ${r.status}`);
      return r.json();
    })
    .then((data) => ({ ...data, byKey: new Map(data.rows.map((row) => [row.key, row])) }))
    .catch((e) => {
      catalog = null;
      throw e;
    }));

const rub = (n) => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ₽`;

/* ---------- Инструменты: описание для модели ---------- */
const fn = (name, description, properties = {}, required = Object.keys(properties)) => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required } },
});
const str = (description) => ({ type: 'string', description });
const keys = (description) => ({ type: 'array', items: { type: 'string' }, description });

export const TOOLS = [
  fn('find_car', 'Найти машину и её класс (1–5). Класс определяет цены. Передай то, что написал человек: «камри 70», «крузак», «бмв х5».', {
    query: str('Марка и/или модель, как написал человек'),
  }),
  fn('find_services', 'Подобрать услуги по названию («полировка», «керамика») или по беде («поцарапали дверь», «воняет в салоне»). Возвращает ситуацию и услуги с key и ценами.', {
    query: str('1–4 слова: суть задачи'),
  }),
  fn('service_details', 'Что входит, условия, время и цены по всем классам для услуг.', { keys: keys('key из find_services, до 6') }),
  fn('show_estimate', 'Показать карточку расчёта: машина, услуги с ценами, итог. Сумму считает код.', {
    car: str('Машина, например «Toyota Camry», или «не указана»'),
    keys: keys('key выбранных услуг'),
  }, ['car', 'keys']),
  fn('submit_lead', 'Отправить заявку менеджеру. Только когда человек сам дал имя и телефон.', {
    name: str('Имя'),
    phone: str('Телефон, как написал человек'),
    comment: str('Пожелания, что не нашлось'),
  }, ['name', 'phone']),
  fn('reply', 'Ответить человеку: текст и кнопки быстрых ответов (до 7 вариантов по 2–5 слов). Заканчивает ход.', {
    text: str('Реплика, 1–3 предложения'),
    options: keys('Кнопки ответов, можно пустой список'),
  }, ['text']),
  fn('offer_services', 'Показать карточки услуг с галочками и ценой для класса машины. Заканчивает ход.', {
    text: str('Короткий совет, что выбрать, без цен'),
    keys: keys('2–5 key из find_services'),
  }),
  fn('ask_contacts', 'Показать форму: имя, телефон, согласие. Заканчивает ход.', { text: str('Реплика перед формой') }),
];

const STATUS = {
  find_car: 'Ищу машину…',
  find_services: 'Подбираю услуги…',
  service_details: 'Смотрю, что входит…',
  show_estimate: 'Считаю стоимость…',
  submit_lead: 'Отправляю заявку…',
};

/* ---------- Инструменты: исполнение ---------- */
function priceOf(cat, row, cls) {
  if (cls) {
    const cell = row.cells[cat.classes.indexOf(String(cls))];
    return cell ? { text: cell.text, value: cell.value } : { text: INDIVIDUAL, value: null };
  }
  const min = row.cells.filter(Boolean).sort((a, b) => a.value - b.value)[0];
  if (!min) return { text: INDIVIDUAL, value: null };
  return { text: min.text.startsWith('от ') ? min.text : `от ${min.text}`, value: min.value, from: true };
}

const brief = (cat, row, cls) => ({ key: row.key, name: row.name, what: row.lead, price: priceOf(cat, row, cls).text });

async function run(name, args, state, ui) {
  const cat = await loadCatalog();
  const cls = state.carClass;

  if (name === 'find_car') {
    const found = searchCars(await loadCars(), String(args.query ?? ''), { limit: 4 });
    if (!found.length) {
      state.missedCar = args.query;
      return { found: false, note: 'Не нашлась. Попроси написать иначе. Класс не угадывай.' };
    }
    if (found[0].type === 'model') {
      state.carClass = Number(found[0].model.cls);
      state.car = `${found[0].brand.brand} ${found[0].model.model}`;
    }
    return {
      found: true,
      note: 'Первый — самый вероятный.',
      results: found.map((f) =>
        f.type === 'brand'
          ? { brand: f.brand.brand, models: f.brand.models.slice(0, 12).map((m) => `${m.model} — ${m.cls}-й класс`) }
          : { car: `${f.brand.brand} ${f.model.model}`, car_class: Number(f.model.cls), similar_to: f.model.like || undefined }
      ),
    };
  }

  if (name === 'find_services') {
    const q = String(args.query ?? '');
    const situations = matchIntents(q).map((i) => ({
      situation: i.title,
      explanation: i.lead,
      services: i.services.map((k) => cat.byKey.get(k)).filter(Boolean).slice(0, 6).map((r) => brief(cat, r, cls)),
    }));
    let hits = cat.rows.filter((r) => matches(r.find, q));
    if (!hits.length) {
      // ни одна карточка не содержит все слова — берём те, где совпало больше слов
      const words = normalize(q).split(' ').filter((w) => w.length > 2).map(stem);
      hits = cat.rows
        .map((r) => ({ r, n: words.filter((w) => r.find.includes(w)).length }))
        .filter((x) => x.n)
        .sort((a, b) => b.n - a.n)
        .map((x) => x.r);
    }
    const shown = new Set(situations.flatMap((s) => s.services.map((x) => x.key)));
    const services = hits.filter((r) => !shown.has(r.key)).slice(0, 8).map((r) => brief(cat, r, cls));
    if (!situations.length && !services.length) state.missedService = q;
    return { car_class: cls ?? 'не известен — цены «от»', situations, services };
  }

  if (name === 'service_details') {
    return (args.keys ?? []).slice(0, 6).map((k) => {
      const r = cat.byKey.get(k);
      if (!r) return { key: k, error: 'нет такой услуги' };
      return {
        key: r.key,
        name: r.name,
        what: r.lead,
        includes: r.includes,
        terms: r.terms,
        duration: r.duration || undefined,
        prices: Object.fromEntries(cat.classes.map((c, i) => [`${c}-й класс`, r.cells[i]?.text ?? INDIVIDUAL])),
      };
    });
  }

  if (name === 'show_estimate') {
    const items = (args.keys ?? []).map((k) => cat.byKey.get(k)).filter(Boolean);
    if (!items.length) return { error: 'ни одной услуги с такими key' };
    const lines = items.map((r) => ({ key: r.key, name: r.name, ...priceOf(cat, r, cls) }));
    const sum = lines.reduce((s, l) => s + (l.value ?? 0), 0);
    const approx = lines.some((l) => l.from || /^от /.test(l.text) || l.value == null);
    const total = `${approx ? 'от ' : ''}${rub(sum)}`;
    state.estimate = { car: args.car || state.car || 'не указана', car_class: cls ?? null, lines, total, sum };
    ui.estimate(state.estimate);
    return { shown: true, total, note: lines.some((l) => l.value == null) ? 'Часть услуг считается индивидуально, в сумму не вошла.' : undefined };
  }

  if (name === 'submit_lead') {
    const digits = String(args.phone ?? '').replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 11) return { error: 'Телефон неполный — попроси проверить номер.' };
    const lead = {
      source: 'chat',
      name: args.name,
      phone: `+7${digits.slice(-10)}`,
      comment: args.comment ?? '',
      car: state.car ?? null,
      carClass: state.carClass ?? null,
      estimate: state.estimate ?? null,
      searched: { car: state.missedCar ?? null, service: state.missedService ?? null },
      page: location.href,
      utm: utm(),
    };
    await ui.lead(lead);
    return { sent: true };
  }

  if (name === 'reply') return ui.reply(String(args.text ?? ''), args.options ?? []);

  if (name === 'offer_services') {
    const items = (args.keys ?? []).map((k) => cat.byKey.get(k)).filter(Boolean).slice(0, 6).map((r) => brief(cat, r, cls));
    if (!items.length) return { error: 'ни одной услуги с такими key — сначала find_services' };
    return ui.offer(String(args.text ?? ''), items);
  }

  if (name === 'ask_contacts') return ui.contacts(String(args.text ?? ''));

  return { error: `нет инструмента ${name}` };
}

const FINAL = new Set(['reply', 'offer_services', 'ask_contacts']);

function utm() {
  try {
    const own = Object.fromEntries([...new URLSearchParams(location.search)].filter(([k]) => k.startsWith('utm_')));
    if (Object.keys(own).length) sessionStorage.setItem('ds-utm', JSON.stringify(own));
    return JSON.parse(sessionStorage.getItem('ds-utm') || '{}');
  } catch {
    return {};
  }
}

/** Последние KEEP сообщений, но с начала реплики человека: tool-ответ без своего вызова модель не примет */
function recent(history) {
  if (history.length <= KEEP) return history;
  let from = history.length - KEEP;
  while (from < history.length && history[from].role !== 'user') from++;
  return history.slice(from);
}

async function callModel(endpoint, system, history) {
  const res = await fetch(endpoint, {
    method: 'POST',
    // text/plain — «простой» запрос без preflight: Apps Script не отвечает на OPTIONS
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'chat', messages: [{ role: 'system', content: system }, ...recent(history)], tools: TOOLS }),
  });
  const data = await res.json().catch(() => null);
  if (!data) throw new Error(`прокси ответил ${res.status}`);
  if (data.error) throw new Error(data.error);
  return data.message;
}

const parse = (s) => {
  try {
    return typeof s === 'string' ? JSON.parse(s || '{}') : s ?? {};
  } catch {
    return {};
  }
};

/** Один ход: сообщение человека → ответ модели с инструментами. state меняется на месте */
export async function turn({ endpoint, state, text, ui }) {
  const { system } = await loadCatalog();
  state.history.push({ role: 'user', content: text });

  for (let call = 0; call < MAX_CALLS; call++) {
    const msg = await callModel(endpoint, system, state.history);
    const calls = msg.tool_calls ?? [];
    state.history.push({ role: 'assistant', content: msg.content ?? '', ...(calls.length ? { tool_calls: calls } : {}) });

    if (!calls.length) {
      if (msg.content?.trim()) ui.reply(msg.content, []);
      return;
    }
    // текст рядом с вызовом — тоже реплика, если модель его написала
    if (msg.content?.trim()) ui.say(msg.content);

    let done = false;
    for (const c of calls) {
      const name = c.function?.name;
      ui.status(STATUS[name] ?? 'Печатает…');
      let result;
      try {
        result = await run(name, parse(c.function?.arguments), state, ui);
      } catch (e) {
        result = { error: String(e.message ?? e) };
      }
      if (FINAL.has(name) && !result?.error) done = true;
      state.history.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify(result ?? { ok: true }) });
    }
    if (done) return;
  }
  ui.reply('Не получилось ответить с первого раза. Напишите, пожалуйста, ещё раз или позвоните нам.', []);
}

/** Заявка в таблицу через тот же прокси; плюс событие для будущей общей доставки */
export async function sendLead(endpoint, lead) {
  document.dispatchEvent(new CustomEvent('lead:submit', { detail: lead }));
  await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'lead', lead }),
  }).catch(() => {});
}
