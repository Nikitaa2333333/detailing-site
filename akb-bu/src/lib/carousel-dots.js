/* Точки-пагинация под лентой карточек на телефоне — как у porsche.com: активная точка вытянута
   в капсулу. Ширина и яркость каждой точки считаются от дробного положения ленты, поэтому при
   свайпе текущая капсула плавно сжимается, а следующая так же плавно растёт — синхронно
   с пальцем, сумма ширин постоянна, ничего не прыгает и не наезжает.
   (19.10.2026: рывок между точками — «змейка», капсула поверх точек — «рельса»; оба сняты.)
   Тап по точке листает к карточке. dots(track, box, selector): track — прокручиваемая лента,
   box — пустой контейнер под точки. Размеры — --dot / --dot-active в global.css */
export function dots(track, box, selector) {
  if (!track || !box) return;
  const items = selector ? [...track.querySelectorAll(selector)] : [...track.children];
  if (items.length < 2) return;
  box.innerHTML = '';
  const pad = () => parseFloat(getComputedStyle(track).paddingLeft) || 0;
  const pos = (item) => item.offsetLeft - track.offsetLeft - pad();
  const buttons = items.map((item, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'dot';
    b.setAttribute('aria-label', `Карточка ${i + 1}`);
    b.addEventListener('click', () => track.scrollTo({ left: pos(item), behavior: 'smooth' }));
    box.append(b);
    return b;
  });

  let raf = 0;
  const sync = () => {
    raf = 0;
    const left = track.scrollLeft;
    const starts = items.map(pos);
    // дробный номер карточки: между двумя соседними — по доле пройденного пути
    let f = 0;
    const max = track.scrollWidth - track.clientWidth;
    if (max > 0 && left >= max - 1) f = items.length - 1; // конец ленты
    else if (left > starts[0]) {
      const k = starts.findIndex((s, i) => i < starts.length - 1 && left >= s && left < starts[i + 1]);
      f = k < 0 ? items.length - 1 : k + (left - starts[k]) / (starts[k + 1] - starts[k] || 1);
    }
    buttons.forEach((b, i) => {
      const w = Math.max(0, 1 - Math.abs(i - f)); // 1 — своя карточка на месте, 0 — далеко
      b.style.setProperty('--w', w.toFixed(3));
      b.setAttribute('aria-current', String(w > 0.5));
    });
  };
  track.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(sync); }, { passive: true });
  addEventListener('resize', () => { if (!raf) raf = requestAnimationFrame(sync); });
  sync();
}
