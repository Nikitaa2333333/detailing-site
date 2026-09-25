/* Загрузка справочника машин в браузере: один запрос на страницу, дальше — из кэша */
import { asset } from './paths.js';
import { unpack } from './car-index-pack.js';

let loading = null;

/** Promise<carIndex> — тот же формат, что lib/cars.js отдаёт на сборке */
export const loadCars = () =>
  (loading ??= fetch(asset('/cars-index.json'))
    .then((r) => {
      if (!r.ok) throw new Error(`cars-index.json: ${r.status}`);
      return r.json();
    })
    .then(unpack)
    .catch((e) => {
      loading = null; // следующая попытка — заново
      throw e;
    }));
