/**
 * ============================================================
 * WB УЧЁТ — Система аналитики Wildberries в Google Sheets
 * ============================================================
 * Версия: 2.0.0
 * Автор: WB Analytics System
 * Дата обновления: 2026-04
 *
 * АРХИТЕКТУРА:
 *   00_Config.gs      — Константы, API-роутер, схемы листов
 *   01_Utils.gs       — Вспомогательные функции (дата, запись, логи)
 *   02_Settings.gs    — Работа с листом НАСТРОЙКИ
 *   03_Articles.gs    — Загрузка артикулов (Content API)
 *   04_Stocks.gs      — Остатки на складах WB и продавца
 *   05_Orders.gs      — Заказы (Statistics API)
 *   06_Sales.gs       — Продажи (Statistics API)
 *   07_Finance.gs     — Финансовый отчёт по реализации
 *   08_Supplies.gs    — Поставки FBW (Supplies API)
 *   09_Reports.gs     — ДДР, Расходы, сводные отчёты
 *   10_UI.gs          — HTML-интерфейс (боковая панель)
 *   11_Logs.gs        — Система логирования
 *   12_Menu.gs        — Меню Google Sheets
 *
 * КАК ДОБАВИТЬ НОВЫЙ МОДУЛЬ:
 *   1. Создайте файл NN_ModuleName.gs
 *   2. Добавьте схему листа в SHEET_SCHEMAS (этот файл)
 *   3. Добавьте константы API в WB_API если нужен новый домен
 *   4. Добавьте настройки в DEFAULT_SETTINGS
 *   5. Добавьте пункт меню в 12_Menu.gs
 *   6. Задокументируйте метод в DEV_GUIDE (см. ниже)
 *
 * СТАНДАРТ РАЗРАБОТКИ:
 *   - Все функции сопровождаются JSDoc-комментарием
 *   - API-запросы только через wbRequest()
 *   - Запись в листы только через writeObjectsToSheet()
 *   - Логи через Logger класс в 11_Logs.gs
 *   - Дата всегда через formatDateRu() / parseDateSafe()
 * ============================================================
 */

// ============================================================
// СЕКЦИЯ 1: API-ДОМЕНЫ WILDBERRIES
// ============================================================
/**
 * Актуальная карта доменов WB API (апрель 2026)
 * Источник: https://dev.wildberries.ru/docs/openapi/api-information
 *
 * ВАЖНО: WB периодически меняет домены и версии.
 * При ошибке 404 — сверяйся с https://dev.wildberries.ru/release-notes
 */
const WB_API = {
  // Контент: карточки, категории, характеристики
  content: {
    baseUrl: 'https://content-api.wildberries.ru',
    tokenCategory: 'Контент',
    rateLimit: { requests: 100, windowMs: 60000, sleepMs: 700 }
  },
  // Статистика: заказы, продажи, финансы
  statistics: {
    baseUrl: 'https://statistics-api.wildberries.ru',
    tokenCategory: 'Статистика',
    rateLimit: { requests: 1, windowMs: 60000, sleepMs: 61000 }
  },
  // Маркетплейс: склады, остатки, сборочные задания FBS
  marketplace: {
    baseUrl: 'https://marketplace-api.wildberries.ru',
    tokenCategory: 'Маркетплейс',
    rateLimit: { requests: 300, windowMs: 60000, sleepMs: 250 }
  },
  // Поставки FBW
  supplies: {
    baseUrl: 'https://supplies-api.wildberries.ru',
    tokenCategory: 'Поставки FBW',
    rateLimit: { requests: 60, windowMs: 60000, sleepMs: 1100 }
  },
  // Аналитика: воронка продаж, история остатков
  analytics: {
    baseUrl: 'https://seller-analytics-api.wildberries.ru',
    tokenCategory: 'Аналитика',
    rateLimit: { requests: 60, windowMs: 60000, sleepMs: 1100 }
  },
  // Финансы: баланс продавца
  finance: {
    baseUrl: 'https://finance-api.wildberries.ru',
    tokenCategory: 'Финансы',
    rateLimit: { requests: 1, windowMs: 60000, sleepMs: 61000 }
  },
  // Продвижение: рекламные кампании, бюджеты, статистика
  promotion: {
    baseUrl: 'https://advert-api.wildberries.ru',
    tokenCategory: 'Продвижение',
    rateLimit: { requests: 10, windowMs: 60000, sleepMs: 6100 }
  }
};

// ============================================================
// СЕКЦИЯ 2: СИСТЕМНЫЕ КОНСТАНТЫ
// ============================================================
const APP = {
  /** Технические имена листов — НИКОГДА не переименовывай без поиска по проекту */
  sheets: {
    // Системные
    API:              'API',
    SETTINGS:         'НАСТРОЙКИ',
    METADATA:         'МЕТАДАННЫЕ',
    LOGS:             'ЛОГИ',
    // API-загружаемые
    ARTICLES:         'Артикулы_ВБ',
    ARTICLE_BARCODES: 'Артикулы_Баркоды',
    SUPPLIES:         'Поставки_ВБ',
    SUPPLY_DETAILS:   'Поставки_Детализация_ВБ',
    ORDERS:           'Заказы_ВБ',
    SALES:            'Продажи_ВБ',
    AD_EXPENSES:      'Рекламные_расходы',
    // Расчётные
    STOCKS_CALC:      'Остатки_ВБ',
    // Ручные
    PRODUCTS:         'Товары',
    PLANNING:         'Планирование',
    SEWING_LAUNCH:    'Запуск_ШВ',
    SEWING_OUTPUT:    'Выпуск_ШВ',
    FULFILLMENT:      'Фуллфилмент_и_упаковка'
  },

  /** Ключи настроек (должны совпадать с ячейками A в листе НАСТРОЙКИ) */
  settings: {
    // Даты загрузки
    ORDERS_DATE_FROM:       'ORDERS_DATE_FROM',
    SALES_DATE_FROM:        'SALES_DATE_FROM',
    SUPPLIES_DATE_FROM:     'SUPPLIES_DATE_FROM',
    SUPPLIES_DATE_TO:       'SUPPLIES_DATE_TO',
    SUPPLIES_DATE_TYPE:     'SUPPLIES_DATE_TYPE',
    SUPPLIES_STATUS_IDS:    'SUPPLIES_STATUS_IDS',
    SUPPLIES_LIMIT:         'SUPPLIES_LIMIT',
    // Продвижение
    PROMO_DATE_FROM:        'PROMO_DATE_FROM',
    PROMO_DATE_TO:          'PROMO_DATE_TO',
    // Пагинация
    MAX_PAGES_PER_RUN:      'MAX_PAGES_PER_RUN'
  },

  /** Версия системы — обновляй при значительных изменениях */
  version: '3.0.0'
};

// ============================================================
// СЕКЦИЯ 3: НАСТРОЙКИ ПО УМОЛЧАНИЮ
// ============================================================
/**
 * Значения по умолчанию для листа НАСТРОЙКИ.
 * Структура: { key, value, group, description }
 *
 * ВАЖНО: При добавлении нового модуля — добавь его настройки сюда.
 */
const DEFAULT_SETTINGS = [
  // --- Общие ---
  { key: 'MAX_PAGES_PER_RUN',     value: '5',             group: 'Общие',    description: 'Макс. страниц за один запуск (пагинация)' },

  // --- Заказы ---
  { key: 'ORDERS_DATE_FROM',      value: '2026-04-01',    group: 'Заказы',   description: 'Заказы: загружать с даты (YYYY-MM-DD)' },

  // --- Продажи ---
  { key: 'SALES_DATE_FROM',       value: '2026-04-01',    group: 'Продажи',  description: 'Продажи: загружать с даты (YYYY-MM-DD)' },

  // --- Поставки FBW ---
  { key: 'SUPPLIES_DATE_FROM',    value: '2026-03-01',    group: 'Поставки', description: 'Поставки: дата начала периода (YYYY-MM-DD)' },
  { key: 'SUPPLIES_DATE_TO',      value: '2026-04-30',    group: 'Поставки', description: 'Поставки: дата конца периода (YYYY-MM-DD)' },
  { key: 'SUPPLIES_DATE_TYPE',    value: 'factDate',      group: 'Поставки', description: 'Поставки: тип даты (factDate / createDate / supplyDate)' },
  { key: 'SUPPLIES_STATUS_IDS',   value: '',              group: 'Поставки', description: 'Поставки: фильтр статусов через запятую (пусто = все)' },
  { key: 'SUPPLIES_LIMIT',        value: '1000',          group: 'Поставки', description: 'Поставки: кол-во за один запрос (макс. 1000)' },

  // --- Продвижение ---
  { key: 'PROMO_DATE_FROM',       value: '2026-04-01',    group: 'Продвижение', description: 'Реклама: история затрат с (YYYY-MM-DD)' },
  { key: 'PROMO_DATE_TO',         value: '2026-04-30',    group: 'Продвижение', description: 'Реклама: история затрат по (YYYY-MM-DD)' }
];

// ============================================================
// СЕКЦИЯ 4: СХЕМЫ ЛИСТОВ
// ============================================================
/**
 * Схемы определяют:
 *  - keys:   технические поля (порядок колонок в листе)
 *  - titles: русские заголовки для отображения
 *  - desc:   описание поля (показывается в интерфейсе)
 *
 * ПРАВИЛО: keys и titles должны содержать одинаковый набор полей.
 *
 * КАК ДОБАВИТЬ НОВОЕ ПОЛЕ:
 *  1. Добавь ключ в keys[] (порядок = порядок колонок)
 *  2. Добавь русское название в titles{}
 *  3. Добавь описание в desc{}
 */
const SHEET_SCHEMAS = {

  // ----------------------------------------------------------
  // АРТИКУЛЫ_ВБ — карточки товаров из Content API
  // ----------------------------------------------------------
  [APP.sheets.ARTICLES]: {
    keys:   ['cabinet', 'nmID', 'vendorCode', 'brand', 'title', 'category', 'subjectName', 'photoUrl', 'updatedAt'],
    titles: {
      cabinet:     'Кабинет',
      nmID:        'Артикул WB (nmID)',
      vendorCode:  'Артикул продавца',
      brand:       'Бренд',
      title:       'Название',
      category:    'Категория',
      subjectName: 'Предмет',
      photoUrl:    'Фото (ссылка)',
      updatedAt:   'Обновлён'
    },
    desc: {
      cabinet:     'Название кабинета из листа API',
      nmID:        'Уникальный ID карточки на Wildberries',
      vendorCode:  'Артикул, заданный продавцом',
      brand:       'Бренд товара',
      title:       'Название карточки',
      category:    'Родительская категория',
      subjectName: 'Предмет (подкатегория)',
      photoUrl:    'Ссылка на главное фото товара (big)',
      updatedAt:   'Дата последнего обновления карточки'
    }
  },

  // ----------------------------------------------------------
  // АРТИКУЛЫ_БАРКОДЫ — связка артикулов с баркодами (Content API)
  // ----------------------------------------------------------
  [APP.sheets.ARTICLE_BARCODES]: {
    keys: ['cabinet', 'nmID', 'vendorCode', 'techSize', 'wbSize', 'barcode', 'chrtID', 'price', 'discountedPrice'],
    titles: {
      cabinet:         'Кабинет',
      nmID:            'Артикул WB',
      vendorCode:      'Артикул продавца',
      techSize:        'Тех. размер',
      wbSize:          'Размер WB',
      barcode:         'Баркод',
      chrtID:          'ID характеристики',
      price:           'Цена',
      discountedPrice: 'Цена со скидкой'
    },
    desc: {
      nmID:            'Уникальный ID карточки WB',
      vendorCode:      'Артикул продавца из карточки',
      techSize:        'Технический размер (размер продавца)',
      wbSize:          'Размер WB (отображается на сайте)',
      barcode:         'Баркод (sku) конкретного размера',
      chrtID:          'ID характеристики (размера) в системе WB',
      price:           'Розничная цена размера',
      discountedPrice: 'Цена после скидки'
    }
  },

  // ----------------------------------------------------------
  // ПОСТАВКИ_ВБ — Supplies API /api/v1/supplies
  // ----------------------------------------------------------
  [APP.sheets.SUPPLIES]: {
    keys: [
      'cabinet','supplyID','preorderID',
      'createDate','supplyDate','factDate','updatedDate',
      'statusID','boxTypeID','isBoxOnPallet'
    ],
    titles: {
      cabinet:'Кабинет', supplyID:'ID поставки', preorderID:'ID предзаказа',
      createDate:'Дата создания', supplyDate:'Плановая дата',
      factDate:'Фактическая дата', updatedDate:'Обновлена',
      statusID:'Статус ID', boxTypeID:'Тип упаковки ID', isBoxOnPallet:'На паллете'
    },
    desc: {
      supplyID:'Уникальный ID поставки FBW',
      statusID:'1=Черновик, 2=Подтверждена, 3=Принята, 4=Завершена, 5=Отменена',
      factDate:'Фактическая дата приёмки на складе WB'
    }
  },

  // ----------------------------------------------------------
  // ПОСТАВКИ_ДЕТАЛИЗАЦИЯ_ВБ — товары поставки (по артикулам и баркодам)
  // GET /api/v1/supplies/{ID}/goods
  // ----------------------------------------------------------
  [APP.sheets.SUPPLY_DETAILS]: {
    keys: [
      'cabinet','supplyID','nmID','vendorCode','barcode',
      'techSize','color','quantity','supplierBoxAmount',
      'readyForSaleQuantity','acceptedQuantity','unloadingQuantity',
      'tnved','needKiz'
    ],
    titles: {
      cabinet:'Кабинет', supplyID:'ID поставки',
      nmID:'Артикул WB', vendorCode:'Артикул продавца', barcode:'Баркод',
      techSize:'Тех. размер', color:'Цвет',
      quantity:'Кол-во', supplierBoxAmount:'Кол-во в коробе',
      readyForSaleQuantity:'Готово к продаже', acceptedQuantity:'Принято', unloadingQuantity:'Выгрузка',
      tnved:'ТНВЭД', needKiz:'Нужен КИЗ'
    },
    desc: {
      quantity:'Общее количество единиц товара в поставке',
      supplierBoxAmount:'Количество, которое поставщик положил в короб',
      readyForSaleQuantity:'Принято и готово к продаже на складе WB',
      acceptedQuantity:'Принято складом WB',
      unloadingQuantity:'Выгружено из поставки',
      tnved:'Код ТН ВЭД',
      needKiz:'Требуется маркировка КИЗ'
    }
  },

  // ----------------------------------------------------------
  // ЗАКАЗЫ_ВБ — Statistics API /api/v1/supplier/orders
  // ----------------------------------------------------------
  [APP.sheets.ORDERS]: {
    keys: [
      'cabinet','date','lastChangeDate','warehouseName','warehouseType',
      'countryName','oblastOkrugName','regionName',
      'supplierArticle','nmId','barcode','category','subject','brand','techSize',
      'incomeID','isSupply','isRealization',
      'totalPrice','discountPercent','spp','finishedPrice','priceWithDisc',
      'isCancel','cancelDate','sticker','gNumber','srid'
    ],
    titles: {
      cabinet:'Кабинет', date:'Дата заказа', lastChangeDate:'Дата изменения',
      warehouseName:'Склад', warehouseType:'Тип склада',
      countryName:'Страна', oblastOkrugName:'Округ', regionName:'Регион',
      supplierArticle:'Артикул продавца', nmId:'Артикул WB', barcode:'Баркод',
      category:'Категория', subject:'Предмет', brand:'Бренд', techSize:'Тех. размер',
      incomeID:'ID поставки', isSupply:'Поставка', isRealization:'Реализация',
      totalPrice:'Цена без скидки', discountPercent:'Скидка %', spp:'СПП %',
      finishedPrice:'Финальная цена', priceWithDisc:'Цена со скидкой',
      isCancel:'Отменён', cancelDate:'Дата отмены',
      sticker:'Стикер', gNumber:'Номер отгрузки', srid:'SRID'
    },
    desc: {
      date:'Дата заказа в формате ДД.ММ.ГГГГ',
      priceWithDisc:'Цена, которую заплатил покупатель',
      finishedPrice:'Цена после всех скидок и СПП',
      isCancel:'true = заказ отменён',
      srid:'Уникальный ID строки заказа'
    }
  },

  // ----------------------------------------------------------
  // ПРОДАЖИ_ВБ — Statistics API /api/v1/supplier/sales
  // ----------------------------------------------------------
  [APP.sheets.SALES]: {
    keys: [
      'cabinet','date','lastChangeDate','warehouseName','warehouseType',
      'countryName','oblastOkrugName','regionName',
      'supplierArticle','nmId','barcode','category','subject','brand','techSize',
      'incomeID','isSupply','isRealization',
      'totalPrice','discountPercent','spp','paymentSaleAmount',
      'forPay','finishedPrice','priceWithDisc',
      'saleID','isReturn','sticker','gNumber','srid'
    ],
    titles: {
      cabinet:'Кабинет', date:'Дата продажи', lastChangeDate:'Дата изменения',
      warehouseName:'Склад', warehouseType:'Тип склада',
      countryName:'Страна', oblastOkrugName:'Округ', regionName:'Регион',
      supplierArticle:'Артикул продавца', nmId:'Артикул WB', barcode:'Баркод',
      category:'Категория', subject:'Предмет', brand:'Бренд', techSize:'Тех. размер',
      incomeID:'ID поставки', isSupply:'Поставка', isRealization:'Реализация',
      totalPrice:'Цена без скидки', discountPercent:'Скидка %', spp:'СПП %',
      paymentSaleAmount:'Сумма оплаты', forPay:'К выплате WB',
      finishedPrice:'Финальная цена', priceWithDisc:'Цена со скидкой',
      saleID:'ID продажи', isReturn:'Возврат', sticker:'Стикер', gNumber:'Номер отгрузки', srid:'SRID'
    },
    desc: {
      forPay:'Сумма, которую WB перечислит продавцу',
      paymentSaleAmount:'Сумма, которую заплатил покупатель с учётом СПП',
      saleID:'Уникальный ID продажи. Начинается с S — продажа, R — возврат',
      isReturn:'Да = возврат (saleID начинается с R)'
    }
  },

  // ----------------------------------------------------------
  // РЕКЛАМНЫЕ_РАСХОДЫ — Promotion API /adv/v1/fullstats
  // ----------------------------------------------------------
  [APP.sheets.AD_EXPENSES]: {
    keys: ['cabinet','date','advertId','advertName','type','status','views','clicks','ctr','cpc','sum','atbs','orders','cr','shks','sum_price'],
    titles: {
      cabinet:'Кабинет', date:'Дата',
      advertId:'ID кампании', advertName:'Название', type:'Тип', status:'Статус',
      views:'Показы', clicks:'Клики', ctr:'CTR %', cpc:'CPC', sum:'Расход',
      atbs:'В корзину', orders:'Заказов', cr:'CR %', shks:'Штук', sum_price:'Сумма заказов'
    },
    desc: {
      sum:'Сумма расхода за день (руб.)',
      ctr:'Click-Through Rate (клики/показы × 100)',
      cpc:'Cost Per Click (расход/клики)',
      cr:'Conversion Rate (заказы/клики × 100)',
      atbs:'Добавлений в корзину'
    }
  },

  // ----------------------------------------------------------
  // ОСТАТКИ_ВБ — расчётный лист (поставки − продажи)
  // ----------------------------------------------------------
  [APP.sheets.STOCKS_CALC]: {
    keys: ['cabinet','nmID','vendorCode','barcode','techSize','brand','subject',
           'suppliedQty','soldQty','returnedQty','stockQty'],
    titles: {
      cabinet:'Кабинет', nmID:'Артикул WB', vendorCode:'Артикул продавца',
      barcode:'Баркод', techSize:'Тех. размер', brand:'Бренд', subject:'Предмет',
      suppliedQty:'Поставлено', soldQty:'Продано', returnedQty:'Возвращено', stockQty:'Остаток'
    },
    desc: {
      suppliedQty:'Сумма quantity из Поставки_Детализация_ВБ',
      soldQty:'Кол-во продаж из Продажи_ВБ (saleID начинается с S)',
      returnedQty:'Кол-во возвратов из Продажи_ВБ (saleID начинается с R)',
      stockQty:'Расчёт: поставлено − продано + возвращено'
    }
  },

  // ----------------------------------------------------------
  // ТОВАРЫ — ручной ввод, справочник продукции
  // ----------------------------------------------------------
  [APP.sheets.PRODUCTS]: {
    keys: ['nmID','vendorCode','productName','category','color','size','ageGroup','notes'],
    titles: {
      nmID:'Артикул WB (nmID)', vendorCode:'Артикул продавца',
      productName:'Название товара', category:'Категория', color:'Цвет',
      size:'Размер', ageGroup:'Возрастная группа', notes:'Примечания'
    },
    desc: {
      nmID:'Выпадающий список из Артикулы_ВБ',
      vendorCode:'Артикул продавца',
      productName:'Произвольное название товара',
      ageGroup:'Целевая возрастная группа'
    }
  },

  // ----------------------------------------------------------
  // ПЛАНИРОВАНИЕ — ручной ввод
  // ----------------------------------------------------------
  [APP.sheets.PLANNING]: {
    keys: ['date','nmID','vendorCode','productName','plannedQty','deadline','status','notes'],
    titles: {
      date:'Дата', nmID:'Артикул WB', vendorCode:'Артикул продавца',
      productName:'Название', plannedQty:'План (шт.)',
      deadline:'Дедлайн', status:'Статус', notes:'Примечания'
    },
    desc: {
      plannedQty:'Запланированное количество к производству',
      deadline:'Дата, к которой нужно подготовить',
      status:'Статус планирования (Новый / В работе / Готово)'
    }
  },

  // ----------------------------------------------------------
  // ЗАПУСК_ШВ — ручной ввод, запуск в швейное производство
  // ----------------------------------------------------------
  [APP.sheets.SEWING_LAUNCH]: {
    keys: ['date','nmID','vendorCode','productName','fabric','color','size','launchQty','deadline','status','notes'],
    titles: {
      date:'Дата запуска', nmID:'Артикул WB', vendorCode:'Артикул продавца',
      productName:'Название', fabric:'Ткань', color:'Цвет', size:'Размер',
      launchQty:'Кол-во (шт.)', deadline:'Дедлайн', status:'Статус', notes:'Примечания'
    },
    desc: {
      launchQty:'Количество единиц, запущенных в пошив',
      fabric:'Название/артикул ткани',
      status:'Статус запуска (Запущен / В пошиве / Готово)'
    }
  },

  // ----------------------------------------------------------
  // ВЫПУСК_ШВ — ручной ввод, выход с швейного производства
  // ----------------------------------------------------------
  [APP.sheets.SEWING_OUTPUT]: {
    keys: ['date','nmID','vendorCode','productName','color','size','outputQty','defectQty','acceptedQty','notes'],
    titles: {
      date:'Дата выпуска', nmID:'Артикул WB', vendorCode:'Артикул продавца',
      productName:'Название', color:'Цвет', size:'Размер',
      outputQty:'Выпущено (шт.)', defectQty:'Брак (шт.)', acceptedQty:'Принято (шт.)', notes:'Примечания'
    },
    desc: {
      outputQty:'Общее количество выпущенных единиц',
      defectQty:'Количество бракованных единиц',
      acceptedQty:'Принято без брака'
    }
  },

  // ----------------------------------------------------------
  // ФУЛЛФИЛМЕНТ_И_УПАКОВКА — ручной ввод
  // ----------------------------------------------------------
  [APP.sheets.FULFILLMENT]: {
    keys: ['date','nmID','vendorCode','barcode','productName','size','qty','packagingType','destination','status','notes'],
    titles: {
      date:'Дата', nmID:'Артикул WB', vendorCode:'Артикул продавца',
      barcode:'Баркод', productName:'Название', size:'Размер',
      qty:'Кол-во (шт.)', packagingType:'Тип упаковки',
      destination:'Склад назначения', status:'Статус', notes:'Примечания'
    },
    desc: {
      packagingType:'Тип упаковки (пакет / короб / паллет)',
      destination:'Название склада WB для отправки',
      status:'Статус (Упаковано / Отправлено / Принято WB)'
    }
  },

  // ----------------------------------------------------------
  // ЛОГИ — системный журнал запусков
  // ----------------------------------------------------------
  [APP.sheets.LOGS]: {
    keys: ['startedAt','finishedAt','durationSec','functionName','funcDisplayName','targetSheet','status','cabinet','rowsLoaded','errorMessage'],
    titles: {
      startedAt:'Начало', finishedAt:'Конец', durationSec:'Длительность (сек)',
      functionName:'Функция', funcDisplayName:'Функция Название', targetSheet:'Таблица',
      status:'Статус', cabinet:'Кабинет',
      rowsLoaded:'Строк загружено', errorMessage:'Ошибка'
    },
    desc: {
      funcDisplayName:'Человекочитаемое название действия',
      targetSheet:'Лист, в который записываются данные',
      status:'OK / ERROR / PARTIAL',
      rowsLoaded:'Кол-во записей, записанных в лист'
    }
  }
};

// ============================================================
// СЕКЦИЯ 5: ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ СХЕМ
// ============================================================

/** Получить схему листа по имени */
function getSheetSchema(sheetName) {
  return SHEET_SCHEMAS[sheetName] || null;
}

/** Получить массив технических ключей */
function getSheetKeys(sheetName) {
  const s = getSheetSchema(sheetName);
  return s ? s.keys : [];
}

/** Получить массив русских заголовков в порядке ключей */
function getReadableHeaders(sheetName) {
  const s = getSheetSchema(sheetName);
  if (!s) return [];
  return s.keys.map(k => s.titles[k] || k);
}
