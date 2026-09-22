Правила проекта — в [../CLAUDE.md](../CLAUDE.md). Здесь только специфика Astro.

## Development

Дев-сервер — только в фоне и с явным хостом и портом (без этого порт наружу не отдаётся):

```
npx astro dev --background --host 127.0.0.1 --port 4321
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

HMR scoped-стилей `.astro`-компонентов на этом пути (в имени папки пробел) не работает —
после правки компонента сервер перезапускать: `astro dev stop` → старт.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)
