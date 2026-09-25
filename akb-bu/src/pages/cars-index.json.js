/* /cars-index.json — справочник машин для поиска в браузере (см. lib/car-index-pack.js) */
import { carIndex } from '../lib/cars.js';
import { pack } from '../lib/car-index-pack.js';

export const GET = () =>
  new Response(JSON.stringify(pack(carIndex)), { headers: { 'Content-Type': 'application/json' } });
