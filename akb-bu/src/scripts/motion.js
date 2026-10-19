import { fixTypography } from '../lib/typo.js';

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Reveal секций: каскад с шагом 80ms внутри групп [data-reveal-group] */
function initReveal() {
  const items = document.querySelectorAll('[data-reveal]');
  if (reduced) {
    items.forEach((el) => el.classList.add('is-revealed'));
    return;
  }
  document.querySelectorAll('[data-reveal-group]').forEach((group) => {
    group.querySelectorAll(':scope [data-reveal]').forEach((el, i) => {
      el.style.setProperty('--reveal-delay', `${i * 80}ms`);
    });
  });
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('is-revealed');
          io.unobserve(e.target);
        }
      }
    },
    { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
  );
  items.forEach((el) => io.observe(el));
}

/* Фон страницы по прокрутке — как porsche.com (19.10.2026). У секций data-bg; секция,
   чей верх поднялся выше линии BG_LINE, задаёт цвет body и тему html[data-bg-theme].
   Смена — плавной анимацией по времени (transition в global.css), не тянется за прокруткой.
   Всё остальное (текст, кнопки, точки) перекрашивает CSS по теме — здесь только это */
function initBgScroll() {
  const secs = [...document.querySelectorAll('[data-bg]')];
  if (secs.length < 2) return;
  const root = document.documentElement;
  root.classList.add('bg-scroll');
  let raf = 0;
  let current = '';
  // линия срабатывания — доля высоты экрана: верх новой секции поднялся выше неё — фон меняется.
  // 0.5 — как у porsche.com: меняется цвет всего экрана, у секций своего фона нет, границы нет.
  // (0.25 ставили, пока плашки услуг были со своим белым фоном и торчала граница — снято 19.10.2026)
  const BG_LINE = 0.5;
  // У секции может быть своя линия — data-bg-line (доля экрана). 1 — срабатывает, как только
  // верх секции вошёл в экран: так первая светлая секция под тёмным первым экраном запускает
  // перекраску заранее, пока её ещё закрывает первый экран, и к следующей секции фон уже белый
  // (19.10.2026: при быстрой прокрутке между тизером и плашками показывалась серая полоса)
  const lineOf = (s) => innerHeight * (s.dataset.bgLine ? Number(s.dataset.bgLine) : BG_LINE);
  // data-bg-snap — смена фона на эту секцию без анимации: первая светлая секция под тёмным
  // первым экраном должна стоять белой сразу, как раньше со своим фоном; иначе при быстрой
  // прокрутке её застают на середине перетекания — серый фон, серый текст (19.10.2026)
  const snap = () => {
    root.classList.add('bg-instant');
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('bg-instant')));
  };
  const paint = () => {
    raf = 0;
    let i = 0;
    for (let k = 0; k < secs.length; k++) if (secs[k].getBoundingClientRect().top <= lineOf(secs[k])) i = k;
    const color = secs[i].dataset.bg;
    if (color === current) return;
    current = color;
    if (secs[i].dataset.bgSnap !== undefined) snap();
    document.body.style.backgroundColor = color;
    root.style.backgroundColor = color;
    root.dataset.bgTheme = color.toLowerCase() === '#ffffff' ? 'light' : 'dark';
  };
  const queue = () => { if (!raf) raf = requestAnimationFrame(paint); };
  addEventListener('scroll', queue, { passive: true });
  addEventListener('resize', queue);
  // первый цвет — сразу, без анимации: иначе страница с белым верхом (калькулятор) при
  // каждой загрузке 1,8 с перетекала из тёмного фона сайта в белый (19.10.2026)
  snap();
  paint();
}

function init() {
  fixTypography();
  initReveal();
  initBgScroll();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
document.addEventListener('astro:page-load', () => fixTypography());
