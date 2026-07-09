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
