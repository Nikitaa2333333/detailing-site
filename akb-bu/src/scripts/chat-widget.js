/* Чат-консультант: кнопка в углу и окно чата. Разговор и инструменты — lib/chat-agent.js.

   Бот ведёт по сценарию калькулятора: машина → класс → направление → услуги →
   расчёт → заявка. Кроме текста выкладывает кнопки быстрых ответов, карточки
   услуг с галочками, карточку расчёта и форму контактов.

   Всё живёт в shadow DOM — стили сайта и виджета не пересекаются. Разговор
   помнится в sessionStorage: перешёл на другую страницу — чат на месте. */
import { turn, sendLead, loadCatalog } from '../lib/chat-agent.js';
import { loadCars } from '../lib/car-index-client.js';

const STORE = 'ds-chat-v1';
const CAR_EXAMPLES = ['Kia Rio', 'Toyota Camry', 'Kia Sportage', 'BMW X5', 'Land Cruiser 200'];
const GREETING = 'Здравствуйте! Подберу услуги и посчитаю стоимость для вашей машины — это займёт минуту. Какая у вас машина? Напишите как привыкли: «камри», «крузак», «бмв х5».';

const CSS = `
  :host {
    --ink: #0a0a0b;
    --ink-hover: #2a2a2e;
    --page: #f5f5f5;
    --tile: #e4e4e6;
    --white: #ffffff;
    --line: rgba(10, 10, 11, 0.12);
    --accent: #ff8a2a;
    --placeholder: #8a8a8f;          /* только плейсхолдеры полей */
    --radius: 14px;
    --panel-w: 400px;                /* ширина окна на ПК: 360–440px */
    --panel-h: 640px;                /* высота окна на ПК, ограничена экраном */
    --pad: 16px;                     /* внутренние поля окна */
    --gap: 12px;                     /* расстояние между репликами */
    all: initial;
    font-family: 'Onest Variable', system-ui, sans-serif;
  }
  * { box-sizing: border-box; font-family: inherit; }

  .launcher {
    position: fixed; right: 20px; bottom: 20px; z-index: 2147483000;
    display: flex; align-items: center; gap: 10px;
    background: var(--ink); color: var(--white); border: 0; border-radius: 999px;
    padding: 14px 20px; font-size: 16px; font-weight: 600; cursor: pointer;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
  }
  .launcher:hover { background: var(--ink-hover); }
  .launcher::before { content: ''; width: 10px; height: 10px; border-radius: 50%; background: var(--accent); }
  .launcher[hidden] { display: none; }

  .panel {
    position: fixed; right: 20px; bottom: 20px; z-index: 2147483001;
    width: var(--panel-w); height: min(var(--panel-h), calc(100dvh - 40px));
    display: flex; flex-direction: column; overflow: hidden;
    background: var(--page); color: var(--ink); border-radius: 18px;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.3);
    font-size: 15px; line-height: 1.45;
  }
  .panel[hidden] { display: none; }
  @media (max-width: 560px) {
    .panel { inset: 0; width: 100%; height: 100%; border-radius: 0; }
    .launcher { right: 16px; bottom: 16px; }
  }

  header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px var(--pad); background: var(--ink); color: var(--white); }
  .title { font-weight: 700; font-size: 16px; }
  .title small { display: block; font-weight: 400; font-size: 13px; }
  .head-actions { display: flex; gap: 6px; }
  .icon { background: none; border: 1px solid rgba(255, 255, 255, 0.35); color: var(--white); border-radius: 999px; height: 32px; padding: 0 12px; font-size: 13px; cursor: pointer; }
  .icon:hover { border-color: var(--white); }

  .log { flex: 1; overflow-y: auto; padding: var(--pad); display: flex; flex-direction: column; gap: var(--gap); }

  .msg p { margin: 0 0 8px; }
  .msg p:last-child { margin: 0; }
  .bot { align-self: flex-start; max-width: 92%; }
  .user { align-self: flex-end; max-width: 85%; background: var(--ink); color: var(--white); padding: 9px 14px; border-radius: var(--radius) var(--radius) 4px var(--radius); white-space: pre-wrap; }
  .error { color: #b3261e; }

  .status { display: flex; align-items: center; gap: 8px; font-size: 14px; }
  .status::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: var(--accent); animation: pulse 1s ease-in-out infinite; }
  @keyframes pulse { 50% { transform: scale(0.5); } }

  .replies { display: flex; flex-wrap: wrap; gap: 6px; }
  .reply { background: var(--white); border: 1px solid var(--ink); color: var(--ink); border-radius: 999px; padding: 7px 13px; font-size: 14px; cursor: pointer; text-align: left; }
  .reply:hover { background: var(--ink); color: var(--white); }

  .card { background: var(--white); border-radius: var(--radius); padding: 14px; width: 100%; }
  .card h3 { margin: 0 0 4px; font-size: 16px; font-weight: 700; }
  .card .sub { margin: 0 0 10px; }
  .card .note { margin: 10px 0 0; font-size: 13px; }

  .svc { display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 4px 10px; padding: 10px; border-radius: 10px; background: var(--page); cursor: pointer; }
  .svc + .svc { margin-top: 6px; }
  .svc input { width: 18px; height: 18px; margin: 2px 0 0; accent-color: var(--ink); cursor: pointer; }
  .svc .name { font-weight: 600; }
  .svc .price { grid-column: 2; }
  .svc .what { grid-column: 2; font-size: 13px; }
  .svc:has(input:checked) { outline: 2px solid var(--ink); outline-offset: -2px; }

  .btn { display: block; width: 100%; margin-top: 10px; background: var(--ink); color: var(--white); border: 0; border-radius: 10px; padding: 12px; font-size: 15px; font-weight: 600; cursor: pointer; }
  .btn:hover { background: var(--ink-hover); }
  .btn:disabled { background: var(--tile); color: var(--ink); cursor: default; }

  table { width: 100%; border-collapse: collapse; }
  td { padding: 7px 0; border-top: 1px solid var(--line); vertical-align: top; }
  td.price { text-align: right; white-space: nowrap; padding-left: 12px; }
  tr.total td { font-weight: 700; font-size: 16px; border-top: 2px solid var(--ink); }

  .field { display: block; margin-top: 8px; }
  .field span { display: block; font-size: 13px; margin-bottom: 4px; }
  .field input { width: 100%; font-size: 16px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--white); color: var(--ink); }
  .field input::placeholder { color: var(--placeholder); }
  .consent { display: flex; gap: 8px; align-items: flex-start; margin-top: 10px; font-size: 13px; cursor: pointer; }
  .consent input { margin: 2px 0 0; accent-color: var(--ink); }
  .card.done { pointer-events: none; }
  .card.done .btn { display: none; }

  .card--lead { background: var(--ink); color: var(--white); }

  form.send { display: flex; gap: 8px; padding: 10px var(--pad) var(--pad); border-top: 1px solid var(--line); background: var(--page); }
  form.send textarea { flex: 1; min-width: 0; resize: none; font-size: 16px; line-height: 1.4; padding: 10px 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--white); color: var(--ink); max-height: 120px; }
  form.send textarea::placeholder { color: var(--placeholder); }
  form.send textarea:focus, .field input:focus { outline: 2px solid var(--ink); outline-offset: -1px; }
  form.send button { background: var(--ink); color: var(--white); border: 0; border-radius: 12px; padding: 0 16px; font-size: 15px; font-weight: 600; cursor: pointer; }
  form.send button:disabled { background: var(--ink-hover); cursor: wait; }
`;

export function mountChat(endpoint) {
  const host = document.createElement('div');
  host.id = 'ds-chat';
  document.body.append(host);
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>${CSS}</style>
    <button class="launcher" type="button">Рассчитать в чате</button>
    <section class="panel" hidden aria-label="Чат-консультант">
      <header>
        <div class="title">Консультант DS SEVER<small>Подбор услуг и расчёт</small></div>
        <div class="head-actions">
          <button class="icon" type="button" data-act="restart">Заново</button>
          <button class="icon" type="button" data-act="close" aria-label="Закрыть">✕</button>
        </div>
      </header>
      <div class="log" aria-live="polite"></div>
      <form class="send">
        <textarea rows="1" placeholder="Напишите сообщение"></textarea>
        <button type="submit">→</button>
      </form>
    </section>`;

  const $ = (s) => root.querySelector(s);
  const launcher = $('.launcher');
  const panel = $('.panel');
  const log = $('.log');
  const input = $('textarea');
  const sendBtn = $('form.send button');

  const fresh = () => ({ history: [], html: '', open: false });
  let state = load() ?? fresh();
  let busy = false;

  function load() {
    try {
      return JSON.parse(sessionStorage.getItem(STORE));
    } catch {
      return null;
    }
  }
  function save() {
    state.html = log.innerHTML;
    try {
      sessionStorage.setItem(STORE, JSON.stringify(state));
    } catch {}
  }

  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const down = () => {
    log.scrollTop = log.scrollHeight;
  };

  /* Текст бота: абзацы. Markdown, если модель всё-таки его написала, срезаем */
  const render = (text) =>
    String(text)
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/^#+\s*/gm, '')
      .replace(/^\s*[-•*]\s+/gm, '')
      .split(/\n+/)
      .filter((l) => l.trim())
      .map((l) => `<p>${esc(l)}</p>`)
      .join('');

  function add(cls, html) {
    const el = document.createElement('div');
    el.className = cls;
    el.innerHTML = html;
    log.append(el);
    down();
    return el;
  }

  const clearReplies = () => log.querySelectorAll('.replies').forEach((r) => r.remove());
  const replies = (options) =>
    options.length && add('replies', options.map((o) => `<button class="reply" type="button" data-say="${esc(o)}">${esc(o)}</button>`).join(''));

  const offerCard = (items) =>
    `<h3>Что подойдёт</h3><p class="sub">Отметьте нужное — посчитаю итог.</p>` +
    items
      .map(
        (i) => `<label class="svc"><input type="checkbox" value="${esc(i.key)}" data-name="${esc(i.name)}">
      <span class="name">${esc(i.name)}</span><span class="price">${esc(i.price)}</span>${i.what ? `<span class="what">${esc(i.what)}</span>` : ''}</label>`
      )
      .join('') +
    `<button class="btn" type="button" data-act="pick" disabled>Посчитать</button>`;

  const estimateCard = (e) =>
    `<h3>Расчёт</h3><p class="sub">${esc(e.car)}${e.car_class ? `, ${e.car_class}-й класс` : ''}</p><table>` +
    e.lines.map((l) => `<tr><td>${esc(l.name)}</td><td class="price">${esc(l.text)}</td></tr>`).join('') +
    `<tr class="total"><td>Итого</td><td class="price">${esc(e.total)}</td></tr></table>` +
    `<p class="note">Цены «от» мастер уточнит после осмотра.</p>`;

  const contactsCard = () => `<h3>Куда перезвонить</h3><p class="sub">Менеджер уточнит детали и запишет на удобное время.</p>
    <form data-form="contacts">
      <label class="field"><span>Имя</span><input name="name" autocomplete="given-name" placeholder="Как к вам обращаться" required></label>
      <label class="field"><span>Телефон</span><input name="phone" type="tel" autocomplete="tel" placeholder="+7 (___) ___-__-__" required></label>
      <label class="consent"><input type="checkbox" name="agree" required> Согласен на обработку персональных данных</label>
      <button class="btn" type="submit">Отправить заявку</button>
    </form>`;

  /* Маска телефона: +7 (916) 123-45-67 */
  function formatPhone(value) {
    let d = value.replace(/\D/g, '');
    if (d.startsWith('8') || d.startsWith('7')) d = d.slice(1);
    d = d.slice(0, 10);
    let out = '+7';
    if (d.length) out += ` (${d.slice(0, 3)}`;
    if (d.length >= 3) out += ')';
    if (d.length > 3) out += ` ${d.slice(3, 6)}`;
    if (d.length > 6) out += `-${d.slice(6, 8)}`;
    if (d.length > 8) out += `-${d.slice(8, 10)}`;
    return out;
  }

  function greet() {
    add('msg bot', render(GREETING));
    replies([...CAR_EXAMPLES, 'Посчитать без машины']);
    save();
  }

  /** shown — что видит человек в ленте, text — что уходит боту */
  async function send(shown, text = shown) {
    if (busy || !text.trim()) return;
    busy = true;
    sendBtn.disabled = true;
    clearReplies();
    add('msg user', esc(shown));
    input.value = '';
    fit();

    const status = add('status', 'Печатает…');
    const ui = {
      status: (t) => {
        status.textContent = t;
        log.append(status);
        down();
      },
      say: (t) => {
        log.insertBefore(Object.assign(document.createElement('div'), { className: 'msg bot', innerHTML: render(t) }), status);
      },
      reply: (t, options) => {
        if (t.trim()) ui.say(t);
        pending.push(() => replies(options.map(String).slice(0, 7)));
        return { shown: true };
      },
      offer: (t, items) => {
        if (t.trim()) ui.say(t);
        pending.push(() => add('card', offerCard(items)));
        return { shown: items.map((i) => i.name) };
      },
      contacts: (t) => {
        if (t.trim()) ui.say(t);
        pending.push(() => add('card', contactsCard()));
        return { shown: true };
      },
      estimate: (e) => {
        log.insertBefore(Object.assign(document.createElement('div'), { className: 'card', innerHTML: estimateCard(e) }), status);
      },
      lead: async (lead) => {
        await sendLead(endpoint, lead);
        log.insertBefore(
          Object.assign(document.createElement('div'), {
            className: 'card card--lead',
            innerHTML: `<h3>Заявка отправлена</h3><p class="sub">${esc(lead.name)}, ${esc(formatPhone(lead.phone))}</p>`,
          }),
          status
        );
      },
    };
    const pending = [];

    try {
      await turn({ endpoint, state, text, ui });
    } catch (e) {
      console.error(e);
      add('msg bot error', '<p>Консультант сейчас не отвечает. Попробуйте ещё раз через минуту или позвоните нам.</p>');
    }
    status.remove();
    // кнопки, карточки и форма — после реплики бота, как завершение шага
    pending.forEach((fn) => fn());
    busy = false;
    sendBtn.disabled = false;
    save();
    down();
  }

  /* Клики внутри ленты — делегированием: восстановленная из sessionStorage лента тоже работает */
  log.addEventListener('click', (e) => {
    const reply = e.target.closest('[data-say]');
    if (reply) return send(reply.dataset.say);
    const pick = e.target.closest('[data-act="pick"]');
    if (pick) {
      const card = pick.closest('.card');
      const checked = [...card.querySelectorAll('input:checked')];
      if (!checked.length) return;
      card.classList.add('done');
      send(
        `Выбираю: ${checked.map((c) => c.dataset.name).join(', ')}`,
        `Выбираю услуги: ${checked.map((c) => `${c.dataset.name} [key ${c.value}]`).join('; ')}`
      );
    }
  });
  log.addEventListener('change', (e) => {
    const card = e.target.closest('.card');
    const btn = card?.querySelector('[data-act="pick"]');
    if (btn) {
      const n = card.querySelectorAll('input:checked').length;
      btn.disabled = !n;
      btn.textContent = n ? `Посчитать (${n})` : 'Посчитать';
    }
  });
  log.addEventListener('input', (e) => {
    if (e.target.name === 'phone') e.target.value = formatPhone(e.target.value);
  });
  log.addEventListener('submit', (e) => {
    const form = e.target.closest('[data-form="contacts"]');
    if (!form) return;
    e.preventDefault();
    const name = form.elements.name.value.trim();
    const phone = form.elements.phone.value;
    if (phone.replace(/\D/g, '').length !== 11) return form.elements.phone.focus();
    if (!form.elements.agree.checked) return form.elements.agree.focus();
    form.closest('.card').classList.add('done');
    send(`${name}, ${phone}`, `Мои контакты для заявки: имя ${name}, телефон ${phone}. Согласие на обработку персональных данных дано.`);
  });

  function fit() {
    input.style.height = 'auto';
    input.style.height = `${input.scrollHeight + 2}px`;
  }
  input.addEventListener('input', fit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input.value.trim());
    }
  });
  $('form.send').addEventListener('submit', (e) => {
    e.preventDefault();
    send(input.value.trim());
  });

  function open(flag) {
    state.open = flag;
    panel.hidden = !flag;
    launcher.hidden = flag;
    if (flag) {
      down();
      input.focus();
      // справочники — пока человек читает приветствие
      loadCatalog().catch(() => {});
      loadCars().catch(() => {});
    }
    save();
  }
  launcher.addEventListener('click', () => open(true));
  $('[data-act="close"]').addEventListener('click', () => open(false));
  $('[data-act="restart"]').addEventListener('click', () => {
    state = { ...fresh(), open: true };
    log.innerHTML = '';
    greet();
  });

  if (state.html) log.innerHTML = state.html;
  else greet();
  open(state.open);
}
