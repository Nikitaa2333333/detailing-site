/* Прокси чат-консультанта dssever.ru на Google Apps Script.

   Зачем: ключ модели нельзя класть в код страницы. Браузер шлёт сюда переписку,
   скрипт добавляет ключ и пересылает её провайдеру с API в формате OpenAI.
   Запросы идут с серверов Google — из России сайт до скрипта достаёт, а скрипт
   до провайдера. Заявки из чата пишутся строкой в таблицу, к которой привязан скрипт.

   Настройки — «Параметры проекта → Свойства скрипта», код не правится:
     API_KEY      ключ провайдера (обязательно)
     API_URL      адрес chat/completions, по умолчанию Groq
     MODEL        модель, по умолчанию openai/gpt-oss-120b
     EXTRA        JSON, добавляется в запрос, например {"reasoning_effort":"low"}
     MAX_TOKENS   потолок ответа, по умолчанию 2000
     DAILY_LIMIT  запросов к модели в сутки на весь сайт, по умолчанию 800
   Провайдеры и модели — chat-proxy/README.md. */

const DEFAULTS = {
  API_URL: 'https://api.groq.com/openai/v1/chat/completions',
  MODEL: 'openai/gpt-oss-120b',
  EXTRA: '{"reasoning_effort":"low"}',
  MAX_TOKENS: '2000',
  DAILY_LIMIT: '800',
};

function conf(name) {
  return PropertiesService.getScriptProperties().getProperty(name) || DEFAULTS[name] || '';
}

function out(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return out({ ok: true, model: conf('MODEL'), key: Boolean(conf('API_KEY')) });
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return out({ error: 'не JSON' });
  }
  try {
    if (body.action === 'chat') return out(chat(body));
    if (body.action === 'lead') return out(saveLead(body.lead || {}));
    return out({ error: 'неизвестное действие' });
  } catch (err) {
    console.error(err);
    return out({ error: String(err.message || err) });
  }
}

/* ---------- Чат ---------- */
function chat(body) {
  const key = conf('API_KEY');
  if (!key) return { error: 'в свойствах скрипта нет API_KEY' };
  const messages = body.messages;
  if (!Array.isArray(messages) || !messages.length || messages.length > 80) return { error: 'разговор слишком длинный — нажмите «Заново»' };
  if (JSON.stringify(messages).length > 120000) return { error: 'разговор слишком длинный — нажмите «Заново»' };
  if (!countToday()) return { error: 'дневной лимит чата исчерпан' };

  let extra = {};
  try {
    extra = JSON.parse(conf('EXTRA') || '{}');
  } catch (err) {}
  const payload = Object.assign(
    { model: conf('MODEL'), messages: messages, tools: body.tools, tool_choice: 'auto', temperature: 0.3, max_tokens: Number(conf('MAX_TOKENS')) },
    extra
  );

  let res;
  for (let attempt = 0; attempt < 3; attempt++) {
    res = UrlFetchApp.fetch(conf('API_URL'), {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + key },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
    const code = res.getResponseCode();
    // 429 — лимит бесплатного тарифа в минуту; 400 tool_use_failed — модель криво вызвала
    // инструмент (бывает у Groq): обе беды обычно проходят со второго раза
    const retry = code === 429 || code >= 500 || (code === 400 && /tool_use_failed|failed_generation/.test(res.getContentText()));
    if (!retry) break;
    Utilities.sleep(1500 * (attempt + 1));
  }

  const code = res.getResponseCode();
  const text = res.getContentText();
  if (code !== 200) {
    console.error(code, text.slice(0, 1000));
    return { error: code === 429 ? 'модель перегружена (лимит бесплатного тарифа)' : 'модель ответила ошибкой ' + code, detail: text.slice(0, 300) };
  }
  const data = JSON.parse(text);
  const msg = data.choices && data.choices[0] && data.choices[0].message;
  if (!msg) return { error: 'пустой ответ модели' };
  return { message: { content: msg.content || '', tool_calls: msg.tool_calls && msg.tool_calls.length ? msg.tool_calls : undefined } };
}

/** Счётчик запросов за сутки: false — лимит исчерпан */
function countToday() {
  const props = PropertiesService.getScriptProperties();
  const day = Utilities.formatDate(new Date(), 'Europe/Moscow', 'yyyy-MM-dd');
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const n = props.getProperty('COUNT_DAY') === day ? Number(props.getProperty('COUNT_N') || 0) : 0;
    if (n >= Number(conf('DAILY_LIMIT'))) return false;
    props.setProperties({ COUNT_DAY: day, COUNT_N: String(n + 1) });
    return true;
  } finally {
    lock.releaseLock();
  }
}

/* ---------- Заявки ---------- */
const HEAD = ['Когда', 'Имя', 'Телефон', 'Машина', 'Класс', 'Услуги', 'Итого', 'Комментарий', 'Не нашлось', 'Страница', 'UTM'];

function saveLead(lead) {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  if (!book) return { saved: false, note: 'скрипт не привязан к таблице' };
  const sheet = book.getSheetByName('Заявки чата') || book.insertSheet('Заявки чата');
  if (!sheet.getLastRow()) sheet.appendRow(HEAD);
  const est = lead.estimate || {};
  const searched = lead.searched || {};
  sheet.appendRow([
    new Date(),
    clean(lead.name),
    clean(lead.phone),
    clean(est.car || lead.car),
    clean(est.car_class || lead.carClass),
    (est.lines || []).map(function (l) { return clean(l.name) + ' — ' + clean(l.text); }).join('\n'),
    clean(est.total),
    clean(lead.comment),
    [searched.car, searched.service].filter(Boolean).map(clean).join('; '),
    clean(lead.page),
    JSON.stringify(lead.utm || {}),
  ]);
  return { saved: true };
}

/** Строка в ячейку: без формул (=, +, - в начале) и не длиннее 1000 знаков */
function clean(v) {
  const s = v == null ? '' : String(v).slice(0, 1000);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
