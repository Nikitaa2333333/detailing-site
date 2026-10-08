/* Локальный двойник Code.gs — проверить чат на своём компьютере до Apps Script.

   Запуск (в akb-bu):
     $env:CHAT_API_KEY = 'gsk_...'; node chat-proxy/dev.mjs
   Сайт с чатом: в akb-bu/.env строка PUBLIC_CHAT_URL=http://127.0.0.1:4331, потом astro dev.
   Заявки печатаются в консоль. Настройки — те же имена, что свойства скрипта: CHAT_API_URL, CHAT_MODEL. */
import http from 'node:http';

const PORT = 4331;
const KEY = process.env.CHAT_API_KEY;
const URL = process.env.CHAT_API_URL || 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = process.env.CHAT_MODEL || 'openai/gpt-oss-120b';
if (!KEY) throw new Error('Нет CHAT_API_KEY');

async function chat(body) {
  const payload = { model: MODEL, messages: body.messages, tools: body.tools, tool_choice: 'auto', temperature: 0.3, max_tokens: 2000 };
  if (MODEL.includes('gpt-oss')) payload.reasoning_effort = 'low';
  const started = Date.now();
  let res, text;
  for (let attempt = 0; attempt < 3; attempt++) {
    res = await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` }, body: JSON.stringify(payload) });
    text = await res.text();
    const retry = res.status === 429 || res.status >= 500 || (res.status === 400 && /tool_use_failed|failed_generation/.test(text));
    if (!retry) break;
    console.log(`[повтор ${res.status}]`, text.slice(0, 200));
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  if (!res.ok) {
    console.error(res.status, text.slice(0, 1000));
    return { error: `модель ответила ошибкой ${res.status}`, detail: text.slice(0, 300) };
  }
  const data = JSON.parse(text);
  const msg = data.choices?.[0]?.message ?? {};
  const calls = msg.tool_calls?.map((c) => `${c.function.name}(${c.function.arguments})`).join(' ') || '—';
  console.log(`[${((Date.now() - started) / 1000).toFixed(1)} с, ${data.usage?.total_tokens ?? '?'} ток.] ${msg.content || ''} ${calls}`);
  return { message: { content: msg.content || '', tool_calls: msg.tool_calls?.length ? msg.tool_calls : undefined } };
}

http
  .createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method !== 'POST') return res.end(JSON.stringify({ ok: true, model: MODEL }));
    let raw = '';
    for await (const chunk of req) raw += chunk;
    let out;
    try {
      const body = JSON.parse(raw);
      if (body.action === 'chat') out = await chat(body);
      else if (body.action === 'lead') {
        console.log('\n[заявка]', JSON.stringify(body.lead, null, 2));
        out = { saved: true };
      } else out = { error: 'неизвестное действие' };
    } catch (e) {
      out = { error: String(e.message ?? e) };
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(out));
  })
  .listen(PORT, '127.0.0.1', () => console.log(`Прокси чата: http://127.0.0.1:${PORT}, модель ${MODEL}`));
