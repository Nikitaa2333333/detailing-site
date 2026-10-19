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

/* Фон страницы по прокрутке — как porsche.com (19.10.2026): у секций data-bg; цвет body
   переключается, когда верх следующей секции доходит до середины экрана, и меняется
   плавной анимацией по времени (transition в global.css), а не тянется за прокруткой */
function initBgScroll() {
  const secs = [...document.querySelectorAll('[data-bg]')];
  if (secs.length < 2) return;
  const root = document.documentElement;
  root.classList.add('bg-scroll');
  let raf = 0;
  let current = '';
  const paint = () => {
    raf = 0;
    const line = innerHeight * 0.5;
    let i = 0;
    for (let k = 0; k < secs.length; k++) if (secs[k].getBoundingClientRect().top <= line) i = k;
    const color = secs[i].dataset.bg;
    if (color === current) return;
    current = color;
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
