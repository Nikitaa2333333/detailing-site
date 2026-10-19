/* Точки-пагинация под лентой карточек на телефоне — как у porsche.com / iOS: ряд точек и одна
   капсула-указатель, которая плавно едет между ними вслед за пальцем (положение — дробное,
   по прокрутке ленты). Тап по точке листает к карточке. Ленту листают пальцем (scroll-snap).
   Раньше активная точка вытягивалась рывком — «змейка» (снято 19.10.2026).
   dots(track, box, selector): track — прокручиваемая лента, box — пустой контейнер под точки. */
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
  const ind = document.createElement('span');
  ind.className = 'dot-ind';
  ind.setAttribute('aria-hidden', 'true');
  box.append(ind);

  let raf = 0;
  const sync = () => {
    raf = 0;
    const left = track.scrollLeft;
    const starts = items.map(pos);
    // дробный номер карточки: между двумя соседними — по доле пройденного пути
    let f = 0;
    if (left <= starts[0]) f = 0;
    else if (left >= starts.at(-1)) f = items.length - 1;
    else {
      const k = starts.findIndex((s, i) => i < starts.length - 1 && left >= s && left < starts[i + 1]);
      f = k + (left - starts[k]) / (starts[k + 1] - starts[k] || 1);
    }
    // конец ленты: последняя карточка может не доехать до левого края — добираем по остатку прокрутки
    const max = track.scrollWidth - track.clientWidth;
    if (max > 0 && left >= max - 1) f = items.length - 1;
    const x0 = buttons[0].offsetLeft + buttons[0].offsetWidth / 2;
    const step = buttons[1].offsetLeft - buttons[0].offsetLeft;
    ind.style.transform = `translateX(${x0 + f * step - ind.offsetWidth / 2}px)`;
    const active = Math.round(f);
    buttons.forEach((b, i) => b.setAttribute('aria-current', String(i === active)));
  };
  track.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(sync); }, { passive: true });
  addEventListener('resize', () => { if (!raf) raf = requestAnimationFrame(sync); });
  sync();
}
