/* robots.txt печатается на сборке, а не лежит в public: пока сайт в работе, он должен
   запрещать обход целиком, после сдачи — открывать и показывать sitemap. Ручка одна —
   переменная SITE_NOINDEX в .github/workflows/deploy.yml (та же, что даёт мета-тег). */
const noindex = Boolean(process.env.SITE_NOINDEX);

export const GET = () => {
  const site = import.meta.env.SITE ?? 'https://dssever.ru';

  const body = noindex
    ? ['# Сайт в разработке — обход закрыт целиком.', 'User-agent: *', 'Disallow: /', ''].join('\n')
    : [
        'User-agent: *',
        'Allow: /',
        '',
        `Sitemap: ${new URL('sitemap-index.xml', site).href}`,
        `Host: ${new URL(site).host}`,
        '',
      ].join('\n');

  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
