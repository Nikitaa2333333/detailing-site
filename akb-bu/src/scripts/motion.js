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

function init() {
  fixTypography();
  initReveal();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
document.addEventListener('astro:page-load', () => fixTypography());
