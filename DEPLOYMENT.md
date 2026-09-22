# Деплой ds-sever.ru

Сайт собирается и выкладывается автоматически при каждом push в ветку `main`.
Схема повторяет noblefarm.ru и park-sever.ru — тот же хостинг, тот же ключ,
различается только каталог домена.

```
Локальный ПК --git push--> GitHub --Actions--> npm ci + npm run build --SCP--> Reg.ru
```

## Хостинг

| Параметр | Значение |
|---|---|
| Сервер | `server66.hosting.reg.ru` (37.140.192.202) |
| Пользователь | `u0124240` |
| Каталог сайта | `/var/www/u0124240/data/www/ds-sever.ru` |
| Протокол | SSH/SCP, порт 22 |
| Ключ | `C:\Users\User\.ssh\noblefarm_key` (один на все сайты аккаунта) |

Соседи по аккаунту: fgsever.ru, shin-sever.ru, parts-sever.ru, m72-sever.ru,
noblefarm.ru, park-sever.ru. Каталог домена чистится при каждом деплое (`rm: true`),
поэтому всё, что должно лежать на сайте — включая файлы подтверждения Вебмастера —
кладём в `akb-bu/public/`, а не руками на сервер.

## Секреты репозитория

В [detailing-site](https://github.com/Nikitaa2333333/detailing-site) прописаны:

- `HOSTING_USER` — `u0124240`
- `SSH_PRIVATE_KEY` — приватный ключ `noblefarm_key`

## Ручки в [.github/workflows/deploy.yml](.github/workflows/deploy.yml)

| Переменная | Сейчас | Зачем |
|---|---|---|
| `SITE_URL` | `https://ds-sever.ru` | canonical, Open Graph, sitemap |
| `BASE_PATH` | `/` | префикс пути; подпапка — только для витрин |
| `SITE_NOINDEX` | `'1'` | закрывает сайт от поисковиков: мета-тег на всех страницах и `Disallow: /` в `robots.txt` |

Переезд на другой домен или хостинг — правка этих переменных и адреса каталога в шаге SCP.
Вёрстку при этом не трогаем: пути идут через [akb-bu/src/lib/paths.js](akb-bu/src/lib/paths.js).

## Что сделать руками в панели Reg.ru (один раз)

1. **Привязать домен к хостингу.** Сейчас `ds-sever.ru` резолвится на заглушку
   `194.58.112.174`, а хостинг — `37.140.192.202`. В панели: домен → «Разместить на хостинге»
   (аккаунт `u0124240`), каталог `ds-sever.ru` уже создан.
2. **Выпустить бесплатный SSL** (Let's Encrypt) для домена и `www`.
3. **Включить принудительный https** — раскомментировать два правила в конце
   [akb-bu/public/.htaccess](akb-bu/public/.htaccess). До выпуска сертификата этого делать
   нельзя: редирект уведёт на неоткрывающийся адрес и сайт ляжет целиком.

## Перед сдачей

- Снять `SITE_NOINDEX` (пустое значение) и запушить — сайт откроется поисковикам,
  `robots.txt` начнёт отдавать `Allow` и ссылку на sitemap.
- Подключить Вебмастер и Метрику (скиллы `yandex-webmaster`, этап 7 в CLAUDE.md).

## Как вносить правки

```bash
git add .
git commit -m "Описание"
git push origin main
```

Ход сборки: https://github.com/Nikitaa2333333/detailing-site/actions

## Ручной деплой в обход GitHub

```bash
cd akb-bu
SITE_URL=https://ds-sever.ru BASE_PATH=/ SITE_NOINDEX=1 npm run build
scp -i ~/.ssh/noblefarm_key -r dist/. u0124240@server66.hosting.reg.ru:/var/www/u0124240/data/www/ds-sever.ru/
```
