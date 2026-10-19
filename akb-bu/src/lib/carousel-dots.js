/* Точки-пагинация под лентой карточек на телефоне — как у porsche.com: активная точка
   вытянута в капсулу, тап по точке листает к карточке. Ленту листают пальцем (scroll-snap),
   точки только показывают место и помогают прыгнуть.
   dots(track, box): track — прокручиваемая лента, box — пустой контейнер под точки. */
export function dots(track, box, selector) {
  if (!track || !box) return;
  const items = selector ? [...track.querySelectorAll(selector)] : [...track.children];
  if (items.length < 2) return;
  box.innerHTML = '';
  const buttons = items.map((item, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'dot';
    b.setAttribute('aria-label', `Карточка ${i + 1}`);
    b.addEventListener('click', () => track.scrollTo({ left: item.offsetLeft - track.offsetLeft - parseFloat(getComputedStyle(track).paddingLeft), behavior: 'smooth' }));
    box.append(b);
    return b;
  });
  const sync = () => {
    const left = track.scrollLeft;
    let active = 0;
    items.forEach((item, i) => {
      if (item.offsetLeft - track.offsetLeft - parseFloat(getComputedStyle(track).paddingLeft) <= left + item.offsetWidth / 2) active = i;
    });
    buttons.forEach((b, i) => b.classList.toggle('is-active', i === active));
  };
  track.addEventListener('scroll', sync, { passive: true });
  sync();
}
