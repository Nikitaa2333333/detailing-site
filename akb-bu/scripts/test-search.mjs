/* Автотест поиска: машины (lib/car-search.js + справочник lib/cars.js) и услуги
   калькулятора (lib/service-search.js + тексты lib/service-texts.js).

   Запускается перед каждой сборкой (npm run build) и отдельно: npm run test:search.
   Упал — сборка не идёт: значит, правка вариаций, текстов или обновление прайса
   сломали то, что раньше находилось.

   Добавить случай — строка в CARS или SERVICES ниже. Модули грузим через Vite:
   они импортируют JSON так же, как на сайте, и тест проверяет ровно тот же код. */
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

/* Машины: запрос → что должно стоять первым. «[Марка]» — первой идёт марка.
   Массив — подходит любой из вариантов. null — ничего не должно найтись. */
const CARS = [
  // как пишут по-русски и сленгом
  ['камри', 'Toyota Camry'],
  ['камри 70 кузов', 'Toyota Camry'],
  ['крузак', 'Toyota Land Cruiser 200'],
  ['прадо 150', 'Toyota Land Cruiser Prado'],
  ['гелик', 'Mercedes-Benz G-класс'],
  ['солярис', 'Hyundai Solaris'],
  ['кашкай', 'Nissan Qashqai'],
  ['тигуан', 'Volkswagen Tiguan'],
  ['туарег', 'Volkswagen Touareg'],
  ['спортейдж', 'Kia Sportage'],
  ['соренто', 'Kia Sorento'],
  ['кайен', 'Porsche Cayenne'],
  ['каен', 'Porsche Cayenne'],
  ['х трейл', 'Nissan X-Trail'],
  ['патрол', 'Nissan Patrol'],
  ['паджеро', 'Mitsubishi Pajero'],
  ['аутлендер', 'Mitsubishi Outlander'],
  ['фокус', 'Ford Focus'],
  ['мондео', 'Ford Mondeo'],
  ['суперб', 'Skoda Superb'],
  ['гольф', 'Volkswagen Golf'],
  ['пассат', 'Volkswagen Passat'],
  ['поло седан', 'Volkswagen Polo'],
  ['логан', 'Renault Logan'],
  ['дастер', 'Renault Duster'],
  ['эскалейд', 'Cadillac Escalade'],
  ['тахо', 'Chevrolet Tahoe'],
  ['мустанг', 'Ford Mustang'],
  ['вранглер', 'Jeep Wrangler'],
  ['гранд чероки', 'Jeep Grand Cherokee'],
  ['эвок', 'Land Rover Evoque'],
  ['рендж ровер спорт', 'Land Rover Range Rover Sport'],
  ['гибли', 'Maserati Ghibli'],
  ['хайлендер', 'Toyota Highlander'],
  ['королла', 'Toyota Corolla'],
  ['альфард', 'Toyota Alphard'],
  ['мультивен', 'Volkswagen Multivan'],
  ['амарок', 'Volkswagen Amarok'],
  // российские марки в поиске не показываем (car-base-rules.json → hidePriceBrands, skipCountries)
  ['веста', null],
  ['ваз 2107', null],
  ['лада', null],
  ['уаз хантер', null],
  ['тенет т7', null],
  ['газель', null],
  ['нива', ['Chevrolet Niva', 'Lada (ВАЗ) Нива']],
  // марка + модель, в любом порядке и раскладке
  ['toyota camry', 'Toyota Camry'],
  ['киа рио', 'Kia Rio'],
  ['rio kia', 'Kia Rio'],
  ['хундай солярис', 'Hyundai Solaris'],
  ['фольц поло', 'Volkswagen Polo'],
  ['porsche cayenne', 'Porsche Cayenne'],
  ['мини купер', 'Mini Cooper'],
  ['лексус рх', 'Lexus RX'],
  ['вольво хс90', 'Volvo XC90'],
  ['ауди а6', 'Audi A6'],
  ['пежо 308', 'Peugeot 308'],
  ['mazda 3', 'Mazda 3'],
  ['мазда6', 'Mazda 6'],
  ['ягуар xf', 'Jaguar XF'],
  ['инфинити фх', 'Infiniti QX70 / FX'],
  // коды моделей, кириллица вместо латиницы, лишнее после модели
  ['x5', 'BMW X5'],
  ['бмв х5', 'BMW X5'],
  ['bmw 320d', 'BMW 3 серии'],
  ['мерс е200', 'Mercedes-Benz E-класс'],
  ['с200', 'Mercedes-Benz C-класс'],
  ['ml350', 'Mercedes-Benz M-класс (ML)'],
  ['глк', 'Mercedes-Benz GLK'],
  ['рх350', 'Lexus RX'],
  ['xc60', 'Volvo XC60'],
  ['в40', 'Volvo V40'],
  ['cx5', 'Mazda CX-5'],
  ['ix35', 'Hyundai ix35'],
  ['q7', 'Audi Q7'],
  ['fx35', 'Infiniti QX70 / FX'],
  ['lc200', 'Toyota Land Cruiser 200'],
  ['рав 4', 'Toyota RAV4'],
  ['rav-4', 'Toyota RAV4'],
  // кузовные коды — латиницей и кириллицей; латинский код не уходит в русскую раскладку
  ['F20', 'BMW 1 серии'],
  ['g30', 'BMW 5 серии'],
  ['Г30', 'BMW 5 серии'],
  ['Г11', 'BMW 7 серии'],
  ['e39', 'BMW 5 серии'],
  ['W164', 'Mercedes-Benz M-класс (ML)'],
  ['w205', 'Mercedes-Benz C-класс'],
  ['в212', 'Mercedes-Benz E-класс'],
  ['lc300', 'Toyota Land Cruiser 300'],
  ['х3', 'BMW X3'],
  ['х5', 'BMW X5'],
  // при равенстве модель из прайса выше модели по аналогии
  ['рх', 'Lexus RX'],
  ['lx', 'Lexus LX (с 2008 г.)'],
  ['H7', 'Haval H7'],
  // спорные: одно название у разных марок, короткие коды, номер кузова без буквы
  ['мерс 212', 'Mercedes-Benz E-класс'],
  ['мерседес 164', 'Mercedes-Benz M-класс (ML)'],
  ['сх 30', 'Mazda CX-30'],
  ['v класс', 'Mercedes-Benz V-класс'],
  ['бмв г30', 'BMW 5 серии'],
  ['хавал н9', 'Haval H9'],
  ['хончи н9', 'Hongqi H9'],
  ['чанган хантер', 'Changan Hunter'],
  ['jetour x70', 'Jetour X70'],
  ['белджи х70', 'Belgee X70'],
  ['x7', 'BMW X7'],
  ['лк 300', 'Toyota Land Cruiser 300'],
  ['крузак 200', 'Toyota Land Cruiser 200'],
  ['дискавери спорт', 'Land Rover Discovery Sport'],
  ['нексия', ['Daewoo Nexia', 'Ravon Nexia R3']],
  // машины вне прайса — класс по аналогии (car-extra.json)
  ['Хавал', '[Haval]'],
  ['джолион', 'Haval Jolion'],
  ['хавал ф7', 'Haval F7'],
  ['тигго 7 про', 'Chery Tiggo 7'],
  ['чери тигго 8', 'Chery Tiggo 8'],
  ['монжаро', 'Geely Monjaro'],
  ['кулрей', 'Geely Coolray'],
  ['танк 300', 'Tank 300'],
  ['крузак 300', 'Toyota Land Cruiser 300'],
  ['ленд крузер 300', 'Toyota Land Cruiser 300'],
  ['лисян л9', 'Li Auto L9'],
  ['зикр 001', 'Zeekr 001'],
  ['крета', 'Hyundai Creta'],
  ['туссан', 'Hyundai Tucson'],
  ['селтос', 'Kia Seltos'],
  ['к5', 'Kia K5'],
  ['кодиак', 'Skoda Kodiaq'],
  ['рапид', 'Skoda Rapid'],
  ['глс', ['Mercedes-Benz GLS', 'Mercedes-Benz GLC']],
  ['gle 350', 'Mercedes-Benz GLE'],
  ['патриот', 'Jeep Liberty (Patriot)'],
  ['аркана', 'Renault Arkana'],
  ['тесла модел 3', 'Tesla Model 3'],
  // мировая база (cars-base.json): запросы из переписки с заказчиком 25.09
  ['F25', 'BMW X3'],
  ['G01', 'BMW X3'],
  ['хавал н7', 'Haval H7'],
  ['Мурси', 'Lamborghini Murcielago'],
  ['Диабло', 'Lamborghini Diablo'],
  ['Кулинан', 'Rolls-Royce Cullinan'],
  ['Фер', '[Ferrari]'],
  ['феррари', '[Ferrari]'],
  ['маззерати', '[Maserati]'],
  ['ламба', '[Lamborghini]'],
  ['урус', 'Lamborghini Urus'],
  ['феррари пуросанге', 'Ferrari Purosangue'],
  ['макларен 720', 'McLaren 720S'],
  ['порше 911 gt3', 'Porsche 911 GT3'],
  ['бентли бентайга', 'Bentley Bentayga'],
  ['танк 500', 'Tank 500'],
  // написания ходовых моделей мировой базы (car-base-aliases.json)
  ['тигго 7 плюс', 'Chery Tiggo 7 Plus'],
  ['ноах', 'Toyota Noah'],
  ['степвагон', 'Honda Stepwgn'],
  ['делика д5', 'Mitsubishi Delica D:5'],
  ['рс6', 'Audi RS 6'],
  ['эмгранд 7', 'Geely Emgrand 7'],
  ['цс75 про', 'Changan CS75 Pro'],
  ['тревеллер', 'Jetour Traveller'],
  ['сонг про', 'BYD Song Pro'],
  ['леопард 5', 'BYD FangChengBao Leopard 5'],
  ['ионик 5', 'Hyundai IONIQ 5'],
  ['ли уан', 'Li Auto One'],
  // прайс и база не двоятся: «Q50 (G)» = Q50, «GL» = GL-Класс
  ['q50', 'Infiniti Q50 / G'],
  ['gl', 'Mercedes-Benz GL'],
  ['мега', 'Renault Megane'],
  // неправильная раскладка и опечатки
  ['rfvhb', 'Toyota Camry'],
  ['ыщдфкшы', 'Hyundai Solaris'],
  ['kashkai', 'Nissan Qashqai'],
  ['toureg', 'Volkswagen Touareg'],
  ['hyndai', '[Hyundai]'],
  ['ghost', 'Rolls-Royce Ghost'],
  // марки целиком
  ['тойота', '[Toyota]'],
  ['хендай', '[Hyundai]'],
  ['мерседес', '[Mercedes-Benz]'],
  ['шкода', '[Skoda]'],
  ['порше', '[Porsche]'],
  ['land rover', '[Land Rover]'],
  // год выпуска решает класс — должны найтись оба варианта, первым любой
  ['октавия', ['Skoda Octavia (до 2006 г.)', 'Skoda Octavia (с 2006 г.)']],
  // …а код поколения выбирает нужный
  ['октавия а7', 'Skoda Octavia (с 2006 г.)'],
  ['octavia a5', 'Skoda Octavia (с 2006 г.)'],
  ['октавия тур', 'Skoda Octavia (до 2006 г.)'],
  ['шкода октавиа', ['Skoda Octavia (до 2006 г.)', 'Skoda Octavia (с 2006 г.)']],
  // коды поколений и кузовов
  ['a6 c7', 'Audi A6'],
  ['а6 с8', 'Audi A6'],
  ['a4 b9', 'Audi A4'],
  ['q7 4m', 'Audi Q7'],
  ['xa50', 'Toyota RAV4'],
  ['xu70', 'Toyota Highlander'],
  ['j150', 'Toyota Land Cruiser Prado'],
  ['j200', 'Toyota Land Cruiser 200'],
  ['кайен 958', 'Porsche Cayenne'],
  ['971', 'Porsche Panamera'],
  ['95b', 'Porsche Macan'],
  ['l405', 'Land Rover Range Rover'],
  ['l494', 'Land Rover Range Rover Sport'],
  ['7p', 'Volkswagen Touareg'],
  ['c6', 'Citroen C6'], // голый код — модель Citroen, не кузов Audi A6
  // модель + код словами (car-search.js, wordHit)
  ['x5 g05', 'BMW X5'],
  ['x3 g01', 'BMW X3'],
  ['бмв х5 f15', 'BMW X5'],
  ['gl x166', 'Mercedes-Benz GL'],
  ['s class w223', 'Mercedes-Benz S-класс'],
  ['камри xv70', 'Toyota Camry'],
  ['land cruiser 200 j200', 'Toyota Land Cruiser 200'],
  ['mark 2 jzx100', 'Toyota Mark II'],
  // кузовные коды японцев, корейцев, европейцев (car-codes.json)
  ['jzx100', 'Toyota Mark II'],
  ['j100', 'Toyota Land Cruiser 100'],
  ['urj201', 'Lexus LX (с 2008 г.)'],
  ['y62', 'Nissan Patrol'],
  ['х трейл т32', 'Nissan X-Trail'],
  ['j11', 'Nissan Qashqai'],
  ['r35', 'Nissan GT-R'],
  ['z62', 'Infiniti QX80 / QX56'],
  ['санта фе тм', 'Hyundai Santa Fe'],
  ['соренто um', 'Kia Sorento'],
  ['mq4', 'Kia Sorento'],
  ['nq5', 'Kia Sportage'],
  ['сх5 кф', 'Mazda CX-5'],
  ['срв rw', 'Honda CR-V'],
  ['v97', 'Mitsubishi Pajero'],
  ['mk7', 'Volkswagen Golf'],
  ['q7 4m', 'Audi Q7'],
  ['991', 'Porsche 911'],
  ['дискавери l462', 'Land Rover Discovery'],
  // точное название выше недописанного соседа (нашёл полный прогон всех запросов)
  ['hyundai sonata', 'Hyundai Sonata'],
  ['мерседес gl', 'Mercedes-Benz GL'],
  ['mercedes sl', 'Mercedes-Benz SL'],
  ['volkswagen passat', 'Volkswagen Passat'],
  ['ferrari f8', 'Ferrari F8'],
  ['golf gti', 'Volkswagen Golf GTI'],
  ['volkswagen golf gti', 'Volkswagen Golf GTI'],
  ['subaru impreza wrx', 'Subaru Impreza WRX'],
  ['V-класс', 'Mercedes-Benz V-класс'],
  ['мерседес V-класс', 'Mercedes-Benz V-класс'],
  // код не перебивает название другой модели
  ['в60', 'Volvo V60'],
  ['mx5', 'Mazda MX-5'],
  // двухбуквенный код сам по себе ничего не перехватывает
  ['re', '[Renault]'],
  ['tm', null],
  // сленг
  ['эска', 'Cadillac Escalade'],
  ['рио х', 'Kia Rio'],
  ['стоник', 'Kia Stonic'],
  // чего нет — пусто, а не случайная машина
  ['zzzz', null],
];

/* Услуги: запрос → id услуг («раздел:услуга»), которые обязаны найтись. [] — ничего не должно найтись */
const SERVICES = [
  ['оклейка пленкой', ['zaschita-lkp-plenka-ppf:ustanovka-poliuretanovoj-antigravijnoj-plenki-krytex-ppf-pro']],
  ['антигравийная пленка', ['zaschita-lkp-plenka-ppf:ustanovka-poliuretanovoj-antigravijnoj-plenki-krytex-ppf-pro-2']],
  ['сколы', ['zaschita-lkp-plenka-ppf:ustanovka-poliuretanovoj-antigravijnoj-plenki-krytex-ppf-pro-2']],
  ['керамику', ['zaschita-lkp-keramika:stoimost-zaschitnogo-keramicheskogo-pokrytiya-power-shield-2']],
  ['жидкое стекло', ['zaschita-lkp-keramika:stoimost-zaschitnogo-pokrytiya-power-shield-supershine-zhidk']],
  ['тонировка', ['tonirovanie-bronirovanie-stekol:ustanovka-tonirovochnoj-plenki-llumar-atr-na-zadnyuyu-polusf']],
  ['химчистку салона', ['himchistka-salona:polnaya-himchistka-temnogo-salona']],
  ['полировка фар', ['polirovka-lkp:polirovka-far-zadnih-fonarej-za-1sht']],
  ['полировка кузова', ['polirovka-lkp:vosstanovitelnaya-polirovka-lkp']],
  ['антидождь', ['zaschita-stekla-antidozhd:obrabotka-stekol-antidozhd-sneg-led', 'zaschita-stekla-antidozhd:obrabotka-stekol-antidozhd-sneg-led-2']],
  ['вмятины', ['udalenie-vmyatin-pdr:udalenie-vmyatin-bez-pokraski']],
  ['перетяжка руля', ['poshiv-rulej:poshiv-rulevogo-kolesa-kozha-bez-obogreva']],
  ['потолок', ['peretyazhka-potolka:peretyazhka-potolka-tkan-bez-okrasa-potolochnogo-plastika', 'himchistka-salona:himchistka-potolka']],
  ['чернение шин', ['obrabotka-kuzova-vosk-polim:zaschita-obrabotka-shin-chernenie']],
  ['воск', ['obrabotka-kuzova-vosk-polim:zaschita-obrabotka-kuzova-s-dobavleniem-voska-karnauby']],
  ['мойка двигателя', ['dvigatel-radiatory-dvs:mojka-dvigatelya-i-konservaciya-podkapotnogo-prostranstva']],
  ['подвеска', ['hodovaya-chast-podveska:mojka-himchistka-i-konservaciya-podveski-pnevmaticheskoj-pod']],
  ['nano magic', ['eksterer-kuzov:nano-magic-50-60-min']],
  ['битум', ['dop-uslugi-chistka-lkp-diskov:ochistka-lkp-ot-bitumnyh-reagentnyh-pyaten-za-detal']],
  ['zzzz', []],
];

/* Задачи: как человек описывает беду → id задачи из service-intents.json, которая должна встать первой.
   null — никакая задача не должна сработать (обычный поиск по названию) */
const INTENTS = [
  ['поцарапали дверь', 'scratches'],
  ['царапины на бампере', 'scratches'],
  ['цара', 'scratches'],
  ['вмятина на крыле', 'dents'],
  ['побило градом', 'dents'],
  ['сколы на капоте', 'chips'],
  ['езжу по трассе камни летят', 'chips'],
  ['воняет в салоне', 'smell'],
  ['прокуренный салон', 'smell'],
  ['собака в машине', 'smell'],
  ['пятно на сиденье', 'stains'],
  ['пролил кофе', 'stains'],
  ['продаю машину', 'selling'],
  ['предпродажка', 'selling'],
  ['только купил машину', 'new-car'],
  ['забрал из салона', 'new-car'],
  ['мутные фары', 'headlights'],
  ['фары пожелтели', 'headlights'],
  ['жарко в машине', 'tint'],
  ['затонировать задние', 'tint'],
  ['после зимы', 'after-winter'],
  ['реагенты', 'after-winter'],
  ['к зиме', 'before-winter'],
  ['потолок провис', 'ceiling'],
  ['руль облез', ['leather-damage', 'steering-wheel']],
  ['перешить руль', 'steering-wheel'],
  ['прожег сиденье сигаретой', 'leather-damage'],
  ['лак потускнел', 'dull-paint'],
  ['битум', 'contamination'],
  ['грязные диски', 'wheels'],
  ['помыть двигатель', 'engine'],
  ['хочу матовую', 'matte'],
  ['антидождь', 'glass'],
  ['светлый салон пачкается', 'interior-protection'],
  // название услуги, а не беда: задача не нужна, работает обычный поиск
  ['kia rio', null],
  ['салон', null],
];

const root = fileURLToPath(new URL('..', import.meta.url));
const server = await createServer({ root, configFile: false, logLevel: 'error', server: { middlewareMode: true } });
const failures = [];

try {
  // ищем по тому, что получает браузер: справочник, прошедший упаковку в /cars-index.json
  const { pack, unpack } = await server.ssrLoadModule('/src/lib/car-index-pack.js');
  const carIndex = unpack(JSON.parse(JSON.stringify(pack((await server.ssrLoadModule('/src/lib/cars.js')).carIndex))));
  const { searchCars } = await server.ssrLoadModule('/src/lib/car-search.js');
  const { haystack, matches } = await server.ssrLoadModule('/src/lib/service-search.js');
  const { serviceText } = await server.ssrLoadModule('/src/lib/service-texts.js');
  const { sentence } = await server.ssrLoadModule('/src/lib/typo.js');
  const { matchIntents, checkIntents } = await server.ssrLoadModule('/src/lib/service-intents.js');
  const prices = (await server.ssrLoadModule('/src/data/prices.json')).default;
  const content = (await server.ssrLoadModule('/src/data/content.json')).default;

  /* ---------- Машины ---------- */
  const label = (item) => (item.type === 'brand' ? `[${item.brand.brand}]` : `${item.brand.brand} ${item.model.model}`);
  for (const [query, expected] of CARS) {
    const found = searchCars(carIndex, query, { limit: 5 });
    const first = found[0] ? label(found[0]) : null;
    const ok = expected === null ? !found.length : [expected].flat().includes(first);
    if (!ok) failures.push(`машина «${query}»: ждали ${JSON.stringify(expected)}, первым — ${first ?? 'ничего'} (${found.map(label).join(' | ')})`);
  }

  /* ---------- Услуги: тот же текст карточки, что видит человек в калькуляторе ---------- */
  const rows = [];
  for (const cat of content.services.categories) {
    for (const { sheet: name, title } of cat.sheets) {
      const sheet = prices.categories.find((s) => s.sheet === name);
      if (!sheet || sheet.classLabels.length !== prices.classes.length) continue;
      for (const group of sheet.groups) {
        for (const s of group.services) {
          const text = serviceText(sheet.id, s);
          rows.push({
            key: `${sheet.id}:${s.id}`,
            find: haystack([text.name, text.lead, s.duration, text.terms.join(' '), group.title && sentence(group.title), `${cat.title} · ${title}`]),
          });
        }
      }
    }
  }
  const keys = new Set(rows.map((r) => r.key));
  if (keys.size !== rows.length) failures.push(`услуги: повторяющиеся id — ${rows.length - keys.size} шт., отметки в калькуляторе перепутаются`);

  for (const [query, expected] of SERVICES) {
    const hits = rows.filter((r) => matches(r.find, query)).map((r) => r.key);
    for (const key of expected) {
      if (!keys.has(key)) failures.push(`услуга «${query}»: в прайсе больше нет ${key} — поправьте тест`);
      else if (!hits.includes(key)) failures.push(`услуга «${query}»: не нашлась ${key} (нашлось ${hits.length})`);
    }
    if (!expected.length && hits.length) failures.push(`услуга «${query}»: ждали пусто, нашлось ${hits.length}`);
  }

  /* ---------- Задачи: словарь «беда → услуги» ---------- */
  try {
    checkIntents(prices);
  } catch (e) {
    failures.push(e.message);
  }
  for (const [query, expected] of INTENTS) {
    const first = matchIntents(query)[0]?.id ?? null;
    const ok = expected === null ? first === null : [expected].flat().includes(first);
    if (!ok) failures.push(`задача «${query}»: ждали ${JSON.stringify(expected)}, первой — ${first ?? 'ничего'}`);
  }

  const total = CARS.length + SERVICES.length + INTENTS.length;
  if (failures.length) {
    console.error(`\n✗ Поиск: ${failures.length} из ${total} проверок не прошли\n`);
    for (const f of failures) console.error(`  • ${f}`);
    console.error('');
  } else {
    console.log(`✓ Поиск: ${total} проверок (машины ${CARS.length}, услуги ${SERVICES.length}, задачи ${INTENTS.length}) — всё находится`);
  }
} finally {
  await server.close();
}

process.exit(failures.length ? 1 : 0);
