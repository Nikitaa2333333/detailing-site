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

/* Счётчики цифр: 0 → значение при входе в вьюпорт, 1.4s, ease-count */
function initCounters() {
  const els = document.querySelectorAll('[data-count]');
  const fmt = new Intl.NumberFormat('ru-RU');
  if (reduced) {
    els.forEach((el) => (el.textContent = fmt.format(Number(el.dataset.count))));
    return;
  }
  const easeCount = (t) => 1 - Math.pow(1 - t, 3.2);
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        io.unobserve(e.target);
        const target = Number(e.target.dataset.count);
        const dur = 1400;
        const start = performance.now();
        const tick = (now) => {
          const t = Math.min((now - start) / dur, 1);
          e.target.textContent = fmt.format(Math.round(target * easeCount(t)));
          if (t < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
    },
    { threshold: 0.6 }
  );
  els.forEach((el) => io.observe(el));
}

/* Parallax hero-видео: прямое связывание со скроллом через rAF, коэффициент .18 */
function initParallax() {
  const media = document.querySelector('[data-parallax]');
  if (!media || reduced) return;
  let ticking = false;
  const update = () => {
    const y = window.scrollY;
    if (y < window.innerHeight * 1.2) {
      media.style.transform = `translate3d(0, ${y * 0.18}px, 0)`;
    }
    ticking = false;
  };
  window.addEventListener(
    'scroll',
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    },
    { passive: true }
  );
}

function init() {
  fixTypography();
  initReveal();
  initCounters();
  initParallax();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
document.addEventListener('astro:page-load', () => fixTypography());
