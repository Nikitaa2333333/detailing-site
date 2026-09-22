const NBSP = String.fromCharCode(160); // U+00A0 — литерал nbsp в исходнике нормализуется бандлером
const RE_SHORT = /(?<=^|[ \t(«„"—–-])([A-Za-zА-Яа-яЁё]{1,2}) +/g;
const RE_LONG = /(?<=^|[ \t(«„"—–-])(для|что|как|или|при|под|над|без|про|это|так|где|чем|тем|уже|его|её|они|оно|она) +/gi;

export function typo(input) {
  if (!input) return input;
  return input.replace(RE_SHORT, `$1${NBSP}`).replace(RE_LONG, `$1${NBSP}`);
}

export function fixTypography(root = document.body) {
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const tag = node.parentElement?.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA' || tag === 'CODE' || tag === 'PRE')
        return NodeFilter.FILTER_REJECT;
      return node.nodeValue && node.nodeValue.trim()
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });
  const nodes = [];
  let n;
  while ((n = walker.nextNode())) nodes.push(n);
  for (const t of nodes) {
    const fixed = typo(t.nodeValue ?? '');
    if (fixed !== t.nodeValue) t.nodeValue = fixed;
  }
}

/* ——— Регистр текстов из прайса ————————————————————————————————————————————

   В xlsx заголовки групп и часть названий набраны прописными («ЗАЩИТА ПЛЕНКОЙ
   SUNTEK»), а капс на сайте запрещён. Правим на сборке, а не руками в данных:
   прайс обновляется импортёром, ручные правки затрутся следующим прогоном.  */

/** Бренды и аббревиатуры, которые пишутся так и никак иначе */
const KEEP = {
  KRYTEX: 'Krytex',
  SUNTEK: 'SunTek',
  WEMATEC: 'Wematec',
  SPECTROLL: 'Spectroll',
  SIO2: 'SiO2',
  NANO: 'Nano',
  TOPCOAT: 'TopCoat',
};

/** «ЗАЩИТА ПЛЕНКОЙ SUNTEK» → «Защита пленкой SunTek» */
export function sentence(text) {
  if (!text) return text;
  const words = String(text).trim().split(/(\s+)/);
  const fixed = words.map((word) => {
    const core = word.replace(/[^\wА-Яа-яЁё]/g, '');
    if (!core) return word;
    const upper = core.toUpperCase();
    if (KEEP[upper] && core === upper) return word.replace(core, KEEP[upper]);
    // Короткое слово прописными — аббревиатура (ЛКП, ДВС, PPF, SRS), не трогаем
    if (core.length <= 3) return word;
    if (core === upper) return word.toLowerCase();
    return word;
  });
  const out = fixed.join('');
  return out.charAt(0).toUpperCase() + out.slice(1);
}

/** Капс снят, висячие предлоги убраны — то, что нужно почти всегда */
export function clean(text) {
  return typo(sentence(text));
}
