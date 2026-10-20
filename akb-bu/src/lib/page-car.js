/* Машина на страницах услуг и направлений — та же память, что у калькулятора (ds-calc-v1):
   выбрал здесь — калькулятор откроется с ней, и наоборот.

   Класс ставится на <html data-car-cls="1…5 | p">: таблица прайса подсвечивает столбец
   стилями, а элементы с data-cells (JSON пяти ячеек [kind, value] | null) переписывают
   цену под класс. Без машины — «от» по минимуму, премиум — «после осмотра». */
export const STORE = 'ds-calc-v1';
const PREMIUM = 'p';
const NBSP = ' ';

const rub = (v) => `${String(v).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP)}${NBSP}₽`;

export function storedCar() {
  try {
    return JSON.parse(localStorage.getItem(STORE) || 'null')?.car ?? null;
  } catch {
    return null;
  }
}

export function storeCar(car) {
  try {
    const prev = JSON.parse(localStorage.getItem(STORE) || 'null') ?? {};
    localStorage.setItem(STORE, JSON.stringify({ ...prev, car, seen: true }));
  } catch {}
}

/** Текст цены одной строки для класса: exact → «4 500 ₽», from → «от 4 500 ₽» */
function cellText(cells, cls) {
  if (cls === PREMIUM) return 'после осмотра';
  if (cls) {
    const c = cells[Number(cls) - 1];
    if (!c) return 'по запросу';
    return c[0] === 'e' ? rub(c[1]) : `от${NBSP}${rub(c[1])}`;
  }
  const known = cells.filter(Boolean).map((c) => c[1]);
  return known.length ? `от${NBSP}${rub(Math.min(...known))}` : 'по запросу';
}

/** Перекрасить страницу под класс машины (null — машины нет) */
export function applyCar(car) {
  const cls = car?.cls ?? '';
  const root = document.documentElement;
  if (cls) root.dataset.carCls = cls;
  else delete root.dataset.carCls;
  for (const el of document.querySelectorAll('[data-cells]')) {
    const cells = JSON.parse(el.dataset.cells);
    el.textContent = cellText(cells, cls);
  }
  // машина выбрана — подпись не нужна: марка, модель и класс уже на плашках (20.10.2026:
  // «зачем дублируешь»); остаётся подсказка без машины и пометка для премиума
  for (const el of document.querySelectorAll('[data-car-note]')) {
    el.textContent = !car
      ? 'Цены «от». Выберите машину — покажем цены её класса.'
      : cls === PREMIUM
        ? 'Для этой машины стоимость считаем индивидуально — назовём после осмотра.'
        : '';
    el.hidden = !el.textContent;
  }
  document.dispatchEvent(new CustomEvent('car:change', { detail: car }));
}
