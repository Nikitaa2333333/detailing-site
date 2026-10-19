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

/* Фон страницы по прокрутке (как porsche.com): у секций data-bg, цвет body плавно
   смешивается между текущей и следующей секцией, когда следующая подходит к линии
   на 55% высоты экрана. Зона смешивания — 40% высоты экрана: проходит серые оттенки */
function initBgScroll() {
  const secs = [...document.querySelectorAll('[data-bg]')];
  if (secs.length < 2) return;
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const cols = secs.map((s) => rgb(s.dataset.bg));
  const root = document.documentElement;
  root.classList.add('bg-scroll');
  let raf = 0;
  const paint = () => {
    raf = 0;
    const probe = innerHeight * 0.55;
    const zone = innerHeight * 0.4;
    let i = 0;
    for (let k = 0; k < secs.length; k++) if (secs[k].getBoundingClientRect().top <= probe) i = k;
    let c = cols[i];
    const next = secs[i + 1];
    if (next) {
      const t = Math.min(1, Math.max(0, 1 - (next.getBoundingClientRect().top - probe) / zone));
      c = c.map((v, j) => Math.round(v + (cols[i + 1][j] - v) * t));
    }
    const color = `rgb(${c.join(',')})`;
    document.body.style.backgroundColor = color;
    root.style.backgroundColor = color;
  };
  const queue = () => { if (!raf) raf = requestAnimationFrame(paint); };
  addEventListener('scroll', queue, { passive: true });
  addEventListener('resize', queue);
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
