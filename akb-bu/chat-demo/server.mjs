/* Демо ИИ-консультанта: чат, где человек пишет машину и задачу своими словами,
   а Claude подтверждает класс, подбирает услуги и собирает заявку.

   Только для локального показа. Claude вызывается через Agent SDK под подпиской
   Claude Code на этом компьютере — ключ API не нужен, наружу сервер не отдаётся.

   Цены и классы Claude не придумывает: он видит прайс только через инструменты
   ниже, а они работают на тех же модулях, что калькулятор сайта (поиск машин,
   услуг, словарь ситуаций, prices.json). Расчёт суммы считает сервер, не модель.

   Запуск: npm start (в папке chat-demo) → http://127.0.0.1:4330 — собранный сайт
   из ../dist с кнопкой чата в углу. Сайт поменялся — сначала npm run build в akb-bu. */
import http from 'node:http';
import { readFile, appendFile, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer as createVite } from 'vite';
import { query, tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT) || 4330;
const MODEL = process.env.CHAT_MODEL || 'sonnet';
/* Установленный Claude Code: SDK ставится без своего бинарника под Windows, берём глобальный */
const CLAUDE_BIN =
  process.env.CLAUDE_BIN ||
  path.join(process.env.APPDATA ?? '', 'npm/node_modules/@anthropic-ai/claude-code/bin/claude.exe');
const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, '..');

/* ---------- Данные сайта: грузим модули через Vite, как автотест поиска ---------- */
const vite = await createVite({ root: siteRoot, configFile: false, logLevel: 'error', server: { middlewareMode: true } });
const { carIndex } = await vite.ssrLoadModule('/src/lib/cars.js');
const { searchCars, normalize } = await vite.ssrLoadModule('/src/lib/car-search.js');
const { haystack, matches, stem } = await vite.ssrLoadModule('/src/lib/service-search.js');
const { serviceText } = await vite.ssrLoadModule('/src/lib/service-texts.js');
const { sentence } = await vite.ssrLoadModule('/src/lib/typo.js');
const { matchIntents } = await vite.ssrLoadModule('/src/lib/service-intents.js');
const { priceCell } = await vite.ssrLoadModule('/src/lib/services.js');
const prices = (await vite.ssrLoadModule('/src/data/prices.json')).default;
const content = (await vite.ssrLoadModule('/src/data/content.json')).default;
await vite.close();

const CLASSES = prices.classes.map((c) => c.id);
const INDIVIDUAL = 'рассчитывается индивидуально';

/* Все услуги калькулятора: тот же текст карточки и та же строка поиска, что на сайте */
const rows = [];
for (const cat of content.services.categories) {
  for (const { sheet: name, title } of cat.sheets) {
    const sheet = prices.categories.find((s) => s.sheet === name);
    if (!sheet || sheet.classLabels.length !== prices.classes.length) continue;
    for (const group of sheet.groups) {
      for (const s of group.services) {
        const text = serviceText(sheet.id, s);
        rows.push({
          key: `${sheet.id}:${s.id}`,
          name: text.name,
          lead: text.lead,
          includes: text.includes,
          terms: text.terms,
          duration: s.duration || '',
          section: `${cat.title} · ${title}`,
          cells: sheet.classLabels.map((label) => priceCell(s.prices[label])),
          find: haystack([text.name, text.lead, s.duration, text.terms.join(' '), group.title && sentence(group.title), `${cat.title} · ${title}`]),
        });
      }
    }
  }
}
const byKey = new Map(rows.map((r) => [r.key, r]));

/** Цена услуги для класса или «от» по всем классам, если класс не известен */
function priceOf(row, cls) {
  if (cls) {
    const cell = row.cells[CLASSES.indexOf(String(cls))];
    return cell ? { text: cell.text, value: cell.value } : { text: INDIVIDUAL, value: null };
  }
  const min = row.cells.filter(Boolean).sort((a, b) => a.value - b.value)[0];
  if (!min) return { text: INDIVIDUAL, value: null };
  return { text: min.text.startsWith('от ') ? min.text : `от ${min.text}`, value: min.value, from: true };
}

const brief = (row, cls) => ({
  key: row.key,
  name: row.name,
  what: row.lead,
  section: row.section,
  duration: row.duration || undefined,
  price: priceOf(row, cls).text,
});

/* ---------- Инструменты для Claude ---------- */
const json = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 1) }] });

function carTools(chat, emit) {
  const findCar = tool(
    'find_car',
    'Найти машину в справочнике центра и её класс (1–5). Класс определяет цены. Передавай то, что написал человек: «камри 70», «крузак», «бмв х5», можно с ошибками и в другой раскладке.',
    { query: z.string().describe('Марка и/или модель так, как написал человек') },
    async ({ query: q }) => {
      const found = searchCars(carIndex, q, { limit: 4 });
      if (!found.length) {
        chat.missedCar = q;
        return json({ found: false, note: 'Машина не нашлась. Попроси уточнить марку и модель. Класс не угадывай.' });
      }
      // лучший результат — модель: её класс дальше идёт в цены по умолчанию
      if (found[0].type === 'model') chat.carClass = Number(found[0].model.cls);
      return json({
        found: true,
        note: 'Первый результат — самый вероятный. Остальные — запасные варианты.',
        results: found.map((item) =>
          item.type === 'brand'
            ? { type: 'марка', brand: item.brand.brand, models: item.brand.models.map((m) => `${m.model} — ${m.cls}-й класс`) }
            : { type: 'модель', car: `${item.brand.brand} ${item.model.model}`, car_class: Number(item.model.cls), class_label: item.model.label, similar_to: item.model.like }
        ),
      });
    }
  );

  const findServices = tool(
    'find_services',
    'Подобрать услуги по названию («полировка», «керамика», «химчистка салона») или по беде человека («поцарапали дверь», «воняет в салоне», «продаю машину»). Возвращает ситуацию с пояснением и услуги с ценами для класса.',
    {
      query: z.string().describe('Короткий запрос: 1–4 слова, суть задачи'),
      car_class: z.number().int().min(1).max(5).optional().describe('Класс машины, если уже известен'),
    },
    async ({ query: q, car_class }) => {
      const cls = car_class ?? chat.carClass;
      const situations = matchIntents(q).map((i) => ({
        situation: i.title,
        explanation: i.lead,
        services: i.services.map((k) => byKey.get(k)).filter(Boolean).map((r) => brief(r, cls)),
      }));
      let hits = rows.filter((r) => matches(r.find, q));
      if (!hits.length) {
        // ни одна карточка не содержит все слова — берём те, где совпало больше слов
        const words = normalize(q).split(' ').filter((w) => w.length > 2).map(stem);
        hits = rows
          .map((r) => ({ r, n: words.filter((w) => r.find.includes(w)).length }))
          .filter((x) => x.n)
          .sort((a, b) => b.n - a.n)
          .map((x) => x.r);
      }
      const shown = new Set(situations.flatMap((s) => s.services.map((x) => x.key)));
      const other = hits.filter((r) => !shown.has(r.key)).slice(0, 10).map((r) => brief(r, cls));
      if (!situations.length && !other.length) chat.missedService = q;
      return json({
        car_class: cls ?? 'не известен — цены «от» по всем классам',
        situations,
        services: other,
        total_found: hits.length,
      });
    }
  );

  const details = tool(
    'service_details',
    'Подробности услуг: что входит, условия, время, цены по всем пяти классам. Вызывай, когда человек спрашивает «а что входит», «сколько по времени», «какая разница».',
    { keys: z.array(z.string()).min(1).max(6).describe('key услуг из find_services') },
    async ({ keys }) =>
      json(
        keys.map((k) => {
          const r = byKey.get(k);
          if (!r) return { key: k, error: 'нет такой услуги' };
          return {
            key: r.key,
            name: r.name,
            what: r.lead,
            includes: r.includes,
            terms: r.terms,
            duration: r.duration,
            prices: Object.fromEntries(CLASSES.map((c, i) => [`${c}-й класс`, r.cells[i]?.text ?? INDIVIDUAL])),
          };
        })
      )
  );

  const estimate = tool(
    'show_estimate',
    'Показать человеку на экране карточку расчёта: машина, класс, выбранные услуги с ценами и итог. Сумму считает сервер. Вызывай, когда человек определился с услугами (или хочет увидеть сумму). Повторный вызов заменяет расчёт.',
    {
      car: z.string().describe('Машина, как подтвердил человек, например «Toyota Camry»; «не указана», если без машины'),
      car_class: z.number().int().min(1).max(5).optional(),
      keys: z.array(z.string()).min(1).max(12).describe('key выбранных услуг'),
    },
    async ({ car, car_class, keys }) => {
      const items = keys.map((k) => byKey.get(k)).filter(Boolean);
      if (!items.length) return json({ error: 'ни одной услуги с такими key' });
      if (car_class) chat.carClass = car_class;
      const cls = car_class ?? chat.carClass;
      const lines = items.map((r) => ({ key: r.key, name: r.name, ...priceOf(r, cls) }));
      const sum = lines.reduce((s, l) => s + (l.value ?? 0), 0);
      const hasFrom = lines.some((l) => l.from || /^от /.test(l.text));
      const hasIndividual = lines.some((l) => l.value == null);
      const total = `${hasFrom || hasIndividual ? 'от ' : ''}${String(sum).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ₽`;
      chat.estimate = { car, car_class: cls ?? null, lines, total, sum };
      emit('estimate', { estimate: chat.estimate });
      return json({ shown: true, total, note: hasIndividual ? 'Часть услуг считается индивидуально — они не вошли в сумму.' : undefined });
    }
  );

  const lead = tool(
    'submit_lead',
    'Отправить заявку менеджеру. Вызывай только когда человек сам дал имя и телефон и согласен, чтобы ему перезвонили. В заявку уйдёт последний показанный расчёт.',
    {
      name: z.string().min(1),
      phone: z.string().describe('Телефон как написал человек'),
      comment: z.string().optional().describe('Что важно менеджеру: пожелания, удобное время, что не нашлось'),
    },
    async ({ name, phone, comment }) => {
      const digits = phone.replace(/\D/g, '');
      if (digits.length < 10 || digits.length > 11) return json({ error: 'Телефон похож на неполный — попроси проверить номер.' });
      const normalized = `+7${digits.slice(-10)}`;
      const record = {
        at: new Date().toISOString(),
        source: 'chat-demo',
        name,
        phone: normalized,
        comment: comment ?? '',
        estimate: chat.estimate ?? null,
        searched: { car: chat.missedCar ?? null, service: chat.missedService ?? null },
      };
      await appendFile(path.join(here, 'leads.jsonl'), JSON.stringify(record) + '\n');
      console.log('\n[заявка]', JSON.stringify(record, null, 2));
      chat.lead = record;
      emit('lead', { lead: record });
      return json({ sent: true });
    }
  );


  /* Интерфейс сценария: бот не только пишет текст, но и выкладывает в чат кнопки,
     карточки услуг с галочками и форму контактов — человек идёт по шагам кликами */
  const replies = tool(
    'suggest_replies',
    'Показать под твоим сообщением кнопки быстрых ответов (2–7 коротких вариантов, до 40 знаков). Человек нажимает — вариант уходит тебе как его ответ. Вызывай в конце почти каждого шага.',
    { options: z.array(z.string().max(40)).min(1).max(7) },
    async ({ options }) => {
      // под карточками и формой свои кнопки — лишние ответы рядом только путают
      if (chat.turn?.panelShown) return json({ skipped: true, next: 'Ничего не пиши, жди человека.' });
      emit('replies', { options });
      return json({ shown: true, next: 'Это конец твоего сообщения: больше ничего не пиши, жди ответа человека.' });
    }
  );

  const offer = tool(
    'offer_services',
    'Выложить в чат карточки услуг с ценой для класса и галочками. Человек отмечает нужные и жмёт «Посчитать» — тебе придут выбранные key. Это основной способ предложить услуги: 2–6 штук.',
    { keys: z.array(z.string()).min(1).max(6).describe('key услуг из find_services') },
    async ({ keys }) => {
      const items = keys.map((k) => byKey.get(k)).filter(Boolean).map((r) => brief(r, chat.carClass));
      if (!items.length) return json({ error: 'ни одной услуги с такими key' });
      if (chat.turn) chat.turn.panelShown = true;
      emit('offer', { items });
      return json({ shown: items.map((i) => i.name), next: 'Это конец твоего сообщения: больше ничего не пиши, жди выбора человека.' });
    }
  );

  const contacts = tool(
    'ask_contacts',
    'Показать в чате форму: имя, телефон, согласие на обработку данных. Вызывай после расчёта. Заполненная форма придёт тебе сообщением — тогда вызывай submit_lead.',
    {},
    async () => {
      if (chat.turn) chat.turn.panelShown = true;
      emit('contacts');
      return json({ shown: true, next: 'Это конец твоего сообщения: больше ничего не пиши, жди ответа человека.' });
    }
  );

  return createSdkMcpServer({
    name: 'ds',
    version: '1.0.0',
    tools: [findCar, findServices, details, offer, estimate, contacts, lead, replies],
  });
}

const UI_TOOLS = new Set(['suggest_replies', 'offer_services', 'ask_contacts']);

const TOOL_STATUS = {
  find_car: 'Ищу машину в справочнике…',
  find_services: 'Подбираю услуги…',
  service_details: 'Смотрю, что входит…',
  offer_services: 'Подбираю услуги…',
  show_estimate: 'Считаю стоимость…',
  ask_contacts: 'Готовлю заявку…',
  submit_lead: 'Отправляю заявку…',
  suggest_replies: 'Пишу…',
};

const c = content.contacts;
const DIRECTIONS = content.services.categories.map((cat) => cat.title);
const SYSTEM = `Ты — консультант детейлинг-центра ${content.brand.name} в чат-виджете на сайте. Центр: ${c.address}, ${c.hours}, телефон ${c.phone}.

Ты ведёшь человека по сценарию калькулятора — по одному шагу за сообщение, и почти каждое сообщение заканчиваешь кнопками (suggest_replies), карточками (offer_services) или формой (ask_contacts). Сначала короткий текст, потом этот вызов — и после него ничего не пиши. Человеку не нужно думать, что писать: он может просто нажимать.

Сценарий:
1. Машина. Приветствие и вопрос «Какая у вас машина?» человек уже видел — его первое сообщение обычно марка и модель (иногда сразу с задачей). Ищи через find_car.
   - Первый результат — самый вероятный. Подтверди одной фразой: «Toyota Land Cruiser 200 — это 5-й класс, цены покажу для него» и кнопки: «Да, верно», «Другая машина».
   - Переспрашивай, только если написана одна марка или первые варианты — одна модель разных лет с разным классом: тогда кнопки с вариантами (до 6).
   - similar_to — класс по аналогии: скажи, что менеджер его подтвердит.
   - Не нашлась — попроси написать иначе, с кнопкой «Посчитать без машины». Второй раз не нашлась — не угадывай класс, иди дальше с ценами «от».
   - Если задача уже названа — после подтверждения машины сразу шаг 3.
2. Направление. Вопрос «Что нужно сделать?» и кнопки: ${DIRECTIONS.map((d) => `«${d}»`).join(', ')}, «Опишу своими словами».
3. Услуги. find_services по направлению или по словам человека (1–4 слова: название или беда). Сработала ситуация — одной-двумя фразами её пояснение. Потом offer_services с 2–5 самыми подходящими услугами. В тексте не повторяй названия и цены из карточек — только короткий совет, что выбрать.
   Если человек задаёт вопрос («что входит», «чем отличается») — ответь через service_details и снова дай выбрать.
4. Расчёт. Пришли выбранные key — show_estimate. В тексте только итог одной фразой и кнопки: «Оставить заявку», «Добавить ещё услуги», «Изменить выбор».
5. Заявка. ask_contacts. Пришли контакты — сразу submit_lead (в comment — что важно менеджеру: пожелания, время звонка, что не нашлось). Потом одна фраза благодарности: менеджер перезвонит и запишет. Кнопки больше не нужны.

Человек может уйти со сценария — ответь коротко и верни на текущий шаг теми же кнопками.

Жёсткие правила:
- Классы машин и цены — только из инструментов. Ни одной цифры не из ответа инструмента. Сумму считает show_estimate, сам не складывай.
- Нет цены — «стоимость рассчитывается индивидуально, мастер назовёт после осмотра».
- Не обещай скидок, свободных окон, сроков и гарантий, которых нет в данных. Не выдумывай услуг.
- Телефон не проси раньше расчёта, если человек сам не хочет.

Стиль: по-русски, на «вы», тепло и коротко: одно сообщение — 1–3 коротких предложения. Обычный текст без markdown: без жирного, без заголовков, без списков, без эмодзи. Один вопрос за раз.`;

/* ---------- Чаты: один постоянный процесс Claude на чат ----------
   Запуск Claude Code — 3–9 секунд. Поэтому процесс поднимается, как только открыта
   страница (/api/new), и живёт весь разговор: сообщения человека уходят в него
   очередью, а не новым запуском на каждое. Простой больше 30 минут — процесс гасим. */
const chats = new Map();
const IDLE_MS = 30 * 60 * 1000;

/** Очередь сообщений человека: процесс Claude читает её, пока чат жив */
function inbox() {
  const items = [];
  let wake = null;
  let closed = false;
  return {
    push(text) { items.push(text); wake?.(); },
    close() { closed = true; wake?.(); },
    async *[Symbol.asyncIterator]() {
      for (;;) {
        while (items.length) yield { type: 'user', message: { role: 'user', content: items.shift() }, parent_tool_use_id: null };
        if (closed) return;
        await new Promise((r) => (wake = r));
        wake = null;
      }
    },
  };
}

function openChat(id = randomUUID()) {
  const chat = { id, turn: null, touched: Date.now(), inbox: inbox() };
  chat.q = query({
    prompt: chat.inbox,
    options: {
      pathToClaudeCodeExecutable: CLAUDE_BIN,
      model: MODEL,
      effort: 'low',
      thinking: { type: 'disabled' },
      systemPrompt: SYSTEM,
      cwd: here,
      // чистый процесс: без чужих настроек, плагинов, скиллов и коннекторов claude.ai — быстрее старт
      settingSources: [],
      strictMcpConfig: true,
      skills: [],
      persistSession: false,
      env: { ...process.env, ENABLE_CLAUDEAI_MCP_SERVERS: 'false', CLAUDE_AGENT_SDK_CLIENT_APP: 'detailing-chat-demo/0.1' },
      tools: [],
      mcpServers: { ds: carTools(chat, (type, data) => chat.turn?.emit(type, data)) },
      allowedTools: Object.keys(TOOL_STATUS).map((n) => `mcp__ds__${n}`),
      includePartialMessages: true,
      maxTurns: 12,
    },
  });
  chats.set(id, chat);
  pump(chat);
  return chat;
}

/** Читает поток процесса и раздаёт его текущему ответу */
async function pump(chat) {
  try {
    for await (const m of chat.q) {
      const t = chat.turn;
      if (!t) continue;
      const mark = (what) => t.marks.push(`${what} ${((Date.now() - t.started) / 1000).toFixed(1)}`);
      if (m.type === 'stream_event' && !m.parent_tool_use_id) {
        const e = m.event;
        if (e.type === 'message_start') mark('запрос');
        if (e.type === 'content_block_start' && e.content_block.type === 'text' && t.textSoFar && !t.closed) t.emit('break');
        if (e.type === 'content_block_start' && e.content_block.type === 'tool_use') {
          const name = e.content_block.name.replace('mcp__ds__', '');
          mark(name);
          // кнопки, карточки и форма завершают шаг: всё, что модель допишет после, в чат не идёт
          if (UI_TOOLS.has(name)) t.closed = true;
          t.emit('status', { text: TOOL_STATUS[name] ?? 'Думаю…' });
        }
        if (e.type === 'content_block_delta' && e.delta.type === 'text_delta' && !t.closed) {
          if (!t.textSoFar) mark('первое слово');
          t.textSoFar = true;
          t.emit('text', { text: e.delta.text });
        }
      }
      if (m.type === 'result') {
        if (m.subtype !== 'success') t.emit('error', { text: 'Консультант не смог ответить. Попробуйте ещё раз.' });
        console.log(`[ответ] ${((Date.now() - t.started) / 1000).toFixed(1)} с: ${t.marks.join(' → ')}`);
        chat.turn = null;
        t.done();
      }
    }
  } catch (err) {
    console.error(err);
    chat.turn?.emit('error', { text: `Ошибка: ${err.message}` });
    chat.turn?.done();
  }
  chats.delete(chat.id);
}

setInterval(() => {
  for (const chat of chats.values()) {
    if (!chat.turn && Date.now() - chat.touched > IDLE_MS) {
      chat.inbox.close();
      chats.delete(chat.id);
    }
  }
}, 60 * 1000).unref();

async function handleChat(req, res) {
  let body = '';
  for await (const chunk of req) body += chunk;
  const { chatId, text } = JSON.parse(body || '{}');
  if (!text?.trim()) return res.writeHead(400).end();
  const chat = chats.get(chatId) ?? openChat(chatId || undefined);
  if (chat.turn) return res.writeHead(409).end();
  chat.touched = Date.now();

  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  const emit = (type, data = {}) => res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  emit('chat', { chatId: chat.id });

  await new Promise((done) => {
    chat.turn = { emit, done, started: Date.now(), marks: [], textSoFar: false };
    chat.inbox.push(text.trim().slice(0, 2000));
  });
  emit('done');
  res.end();
}

/* ---------- Сервер: собранный сайт (dist) + виджет чата поверх каждой страницы ----------
   Код сайта не трогаем: виджет подставляется в HTML на лету, только в этом демо. */
const DIST = path.join(siteRoot, 'dist');
const WIDGET = '<script src="/chat/widget.js" defer></script>';
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.mp4': 'video/mp4',
};

async function serveStatic(urlPath, res) {
  if (urlPath === '/chat/widget.js') {
    res.writeHead(200, { 'Content-Type': TYPES['.js'], 'Cache-Control': 'no-store' });
    return res.end(await readFile(path.join(here, 'widget.js')));
  }
  const clean = path.normalize(decodeURIComponent(urlPath)).replace(/^[/\\]+/, '');
  const candidates = [clean, path.join(clean, 'index.html'), `${clean}.html`];
  for (const rel of candidates) {
    const full = path.join(DIST, rel);
    if (!full.startsWith(DIST)) break;
    const info = await stat(full).catch(() => null);
    if (!info?.isFile()) continue;
    const type = TYPES[path.extname(full)] ?? 'application/octet-stream';
    let data = await readFile(full);
    if (type.startsWith('text/html')) data = data.toString('utf8').replace('</body>', `${WIDGET}</body>`);
    res.writeHead(200, { 'Content-Type': type });
    return res.end(data);
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Нет такой страницы');
}

http
  .createServer(async (req, res) => {
    try {
      if (req.method === 'POST' && req.url === '/api/chat') return await handleChat(req, res);
      if (req.method === 'POST' && req.url === '/api/new') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ chatId: openChat().id }));
      }
      if (req.method === 'GET') return await serveStatic(req.url.split('?')[0], res);
      res.writeHead(405).end();
    } catch (err) {
      console.error(err);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  })
  .listen(PORT, HOST, () => {
    console.log(`Сайт с чат-консультантом (демо): http://${HOST}:${PORT}`);
    console.log(`Модель: ${MODEL} через Claude Code. Услуг в каталоге: ${rows.length}, марок: ${carIndex.length}.`);
  });
