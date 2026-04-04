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
    API:               'API',
    SETTINGS:          'НАСТРОЙКИ',
    METADATA:          'МЕТАДАННЫЕ',
    LOGS:              'ЛОГИ',
    ARTICLES:          'ЗАГР_АРТИКУЛЫ',
    STOCKS_WB:         'ЗАГР_ОСТАТКИ_WB',
    STOCKS_SELLER:     'ЗАГР_ОСТАТКИ_ПРОДАВЕЦ',
    ORDERS:            'ЗАГР_ЗАКАЗЫ',
    SALES:             'ЗАГР_ПРОДАЖИ',
    FINANCE:           'ЗАГР_ФИНАНСЫ',
    EXPENSES:          'СБОР_РАСХОДЫ',
    DDR:               'ОТЧЁТ_ДДР',
    SUPPLIES:          'ЗАГР_ПОСТАВКИ',
    SUPPLY_DETAILS:    'ЗАГР_ДЕТАЛИ_ПОСТАВОК',
    SUPPLY_GOODS:      'ЗАГР_ТОВАРЫ_ПОСТАВОК',
    SUPPLY_PACKAGES:   'ЗАГР_УПАКОВКА_ПОСТАВОК',
    BALANCE:           'ЗАГР_БАЛАНС',
    CAMPAIGN_BUDGET:   'ЗАГР_БЮДЖЕТЫ',
    COST_HISTORY:      'ЗАГР_ЗАТРАТЫ',
    ARTICLE_BARCODES:  'ЗАГР_БАРКОДЫ',
    STOCKS_BY_BARCODE: 'ЗАГР_ОСТАТКИ_БАРКОДЫ'
  },

  /** Ключи настроек (должны совпадать с ячейками A в листе НАСТРОЙКИ) */
  settings: {
    // Даты загрузки
    SALES_DATE_FROM:        'SALES_DATE_FROM',
    ORDERS_DATE_FROM:       'ORDERS_DATE_FROM',
    FINANCE_DATE_FROM:      'FINANCE_DATE_FROM',
    FINANCE_DATE_TO:        'FINANCE_DATE_TO',
    FINANCE_PERIOD:         'FINANCE_PERIOD',
    SUPPLIES_DATE_FROM:     'SUPPLIES_DATE_FROM',
    SUPPLIES_DATE_TO:       'SUPPLIES_DATE_TO',
    SUPPLIES_DATE_TYPE:     'SUPPLIES_DATE_TYPE',
    SUPPLIES_STATUS_IDS:    'SUPPLIES_STATUS_IDS',
    SUPPLIES_LIMIT:         'SUPPLIES_LIMIT',
    STOCKS_WAREHOUSE_IDS:   'STOCKS_WAREHOUSE_IDS',
    // Продвижение
    PROMO_DATE_FROM:        'PROMO_DATE_FROM',
    PROMO_DATE_TO:          'PROMO_DATE_TO',
    // Пагинация
    MAX_PAGES_PER_RUN:      'MAX_PAGES_PER_RUN'
  },

  /** Версия системы — обновляй при значительных изменениях */
  version: '2.0.0'
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

  // --- Артикулы ---
  // (нет дат — грузим всё)

  // --- Заказы ---
  { key: 'ORDERS_DATE_FROM',      value: '2026-04-01',    group: 'Заказы',   description: 'Заказы: загружать с даты (YYYY-MM-DD)' },

  // --- Продажи ---
  { key: 'SALES_DATE_FROM',       value: '2026-04-01',    group: 'Продажи',  description: 'Продажи: загружать с даты (YYYY-MM-DD)' },

  // --- Финансы ---
  { key: 'FINANCE_DATE_FROM',     value: '2026-04-01',    group: 'Финансы',  description: 'Финансы: период с (YYYY-MM-DD)' },
  { key: 'FINANCE_DATE_TO',       value: '2026-04-30',    group: 'Финансы',  description: 'Финансы: период по (YYYY-MM-DD)' },
  { key: 'FINANCE_PERIOD',        value: 'weekly',        group: 'Финансы',  description: 'Финансы: тип отчёта (weekly / daily)' },

  // --- Поставки FBW ---
  { key: 'SUPPLIES_DATE_FROM',    value: '2026-03-01',    group: 'Поставки', description: 'Поставки: дата начала периода (YYYY-MM-DD)' },
  { key: 'SUPPLIES_DATE_TO',      value: '2026-04-30',    group: 'Поставки', description: 'Поставки: дата конца периода (YYYY-MM-DD)' },
  { key: 'SUPPLIES_DATE_TYPE',    value: 'factDate',      group: 'Поставки', description: 'Поставки: тип даты (factDate / createDate / supplyDate)' },
  { key: 'SUPPLIES_STATUS_IDS',   value: '',              group: 'Поставки', description: 'Поставки: фильтр статусов через запятую (пусто = все)' },
  { key: 'SUPPLIES_LIMIT',        value: '1000',          group: 'Поставки', description: 'Поставки: кол-во за один запрос (макс. 1000)' },

  // --- Остатки ---
  { key: 'STOCKS_WAREHOUSE_IDS',  value: '',              group: 'Остатки',  description: 'Остатки: ID складов через запятую (пусто = первый склад)' },

  // --- Продвижение ---
  { key: 'PROMO_DATE_FROM',       value: '2026-04-01',    group: 'Продвижение', description: 'Продвижение: история затрат с (YYYY-MM-DD)' },
  { key: 'PROMO_DATE_TO',         value: '2026-04-30',    group: 'Продвижение', description: 'Продвижение: история затрат по (YYYY-MM-DD)' }
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
  // АРТИКУЛЫ — карточки товаров из Content API
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
  // ОСТАТКИ_WB — остатки на складах Wildberries (FBW)
  // Источник: analytics /api/v2/stocks-report
  // ----------------------------------------------------------
  [APP.sheets.STOCKS_WB]: {
    keys:   ['cabinet', 'loadedAt', 'nmId', 'vendorCode', 'brand', 'subjectName', 'warehouseName', 'quantity', 'inWayToClient', 'inWayFromClient', 'quantityFull'],
    titles: {
      cabinet:          'Кабинет',
      loadedAt:         'Дата загрузки',
      nmId:             'Артикул WB',
      vendorCode:       'Артикул продавца',
      brand:            'Бренд',
      subjectName:      'Предмет',
      warehouseName:    'Склад WB',
      quantity:         'Остаток (шт.)',
      inWayToClient:    'В пути к клиенту',
      inWayFromClient:  'В пути от клиента',
      quantityFull:     'Полный остаток'
    },
    desc: {
      cabinet:          'Название кабинета из листа API',
      loadedAt:         'Когда были загружены данные',
      nmId:             'Артикул WB',
      vendorCode:       'Артикул продавца',
      brand:            'Бренд',
      subjectName:      'Предмет',
      warehouseName:    'Название склада WB',
      quantity:         'Текущий остаток на складе',
      inWayToClient:    'Единицы в доставке к покупателю',
      inWayFromClient:  'Единицы в доставке от покупателя',
      quantityFull:     'Остаток + в пути к клиенту'
    }
  },

  // ----------------------------------------------------------
  // ЗАКАЗЫ — Statistics API /api/v1/supplier/orders
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
  // ПРОДАЖИ — Statistics API /api/v1/supplier/sales
  // ----------------------------------------------------------
  [APP.sheets.SALES]: {
    keys: [
      'cabinet','date','lastChangeDate','warehouseName','warehouseType',
      'countryName','oblastOkrugName','regionName',
      'supplierArticle','nmId','barcode','category','subject','brand','techSize',
      'incomeID','isSupply','isRealization',
      'totalPrice','discountPercent','spp','paymentSaleAmount',
      'forPay','finishedPrice','priceWithDisc',
      'saleID','sticker','gNumber','srid'
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
      saleID:'ID продажи', sticker:'Стикер', gNumber:'Номер отгрузки', srid:'SRID'
    },
    desc: {
      forPay:'Сумма, которую WB перечислит продавцу',
      paymentSaleAmount:'Сумма, которую заплатил покупатель с учётом СПП',
      saleID:'Уникальный ID продажи. Начинается с S — продажа, R — возврат'
    }
  },

  // ----------------------------------------------------------
  // ФИНАНСЫ — Statistics API /api/v5/supplier/reportDetailByPeriod
  // ----------------------------------------------------------
  [APP.sheets.FINANCE]: {
    keys: [
      'cabinet','realizationreport_id','date_from','date_to','create_dt','currency_name',
      'suppliercontract_code','rrd_id','gi_id',
      'subject_name','nm_id','brand_name','sa_name','ts_name','barcode',
      'doc_type_name','quantity',
      'retail_price','retail_amount','sale_percent','commission_percent',
      'office_name','supplier_oper_name',
      'order_dt','sale_dt','rr_dt',
      'retail_price_withdisc_rub','delivery_amount','return_amount',
      'ppvz_for_pay','ppvz_reward','acquiring_fee','acquiring_percent',
      'penalty','additional_payment'
    ],
    titles: {
      cabinet:'Кабинет',
      realizationreport_id:'ID отчёта реализации', date_from:'Период с', date_to:'Период по',
      create_dt:'Дата создания', currency_name:'Валюта',
      suppliercontract_code:'Код договора', rrd_id:'RRD ID', gi_id:'GI ID',
      subject_name:'Предмет', nm_id:'Артикул WB', brand_name:'Бренд',
      sa_name:'Артикул продавца', ts_name:'Размер', barcode:'Баркод',
      doc_type_name:'Тип документа', quantity:'Количество',
      retail_price:'Розничная цена', retail_amount:'Сумма розничная',
      sale_percent:'Скидка %', commission_percent:'Комиссия %',
      office_name:'Офис', supplier_oper_name:'Операция',
      order_dt:'Дата заказа', sale_dt:'Дата продажи', rr_dt:'Дата отчёта',
      retail_price_withdisc_rub:'Цена со скидкой, руб',
      delivery_amount:'Логистика', return_amount:'Возвраты',
      ppvz_for_pay:'К выплате WB', ppvz_reward:'Вознаграждение WB',
      acquiring_fee:'Эквайринг', acquiring_percent:'Эквайринг %',
      penalty:'Штраф', additional_payment:'Доп. начисление'
    },
    desc: {
      rrd_id:'Уникальный ID строки отчёта. Используется для пагинации',
      doc_type_name:'Продажа / Возврат / Штраф / Логистика',
      ppvz_for_pay:'Итоговая сумма к выплате по строке',
      penalty:'Отрицательное значение = удержание WB',
      additional_payment:'Положительное = доначисление от WB'
    }
  },

  // ----------------------------------------------------------
  // РАСХОДЫ — агрегация из ФИНАНСЫ
  // ----------------------------------------------------------
  [APP.sheets.EXPENSES]: {
    keys: [
      'cabinet','period','doc_type_name','supplier_oper_name','nm_id','supplier_article',
      'quantity','gross_amount','payout_amount','wb_expense_estimate',
      'logistics_amount','penalty_amount','additional_payment','commission_percent'
    ],
    titles: {
      cabinet:'Кабинет', period:'Период (ГГ-ММ)',
      doc_type_name:'Тип документа', supplier_oper_name:'Операция',
      nm_id:'Артикул WB', supplier_article:'Артикул продавца', quantity:'Количество',
      gross_amount:'Валовая сумма', payout_amount:'К выплате',
      wb_expense_estimate:'Расходы WB (оценка)',
      logistics_amount:'Логистика', penalty_amount:'Штрафы',
      additional_payment:'Доп. начисление', commission_percent:'Комиссия %'
    },
    desc: {
      period:'Месяц в формате ГГГГ-ММ',
      wb_expense_estimate:'Оценка: Валовая сумма − К выплате',
      logistics_amount:'Стоимость доставки (delivery_amount из ФИНАНСЫ)'
    }
  },

  // ----------------------------------------------------------
  // ДДР — сводный отчёт "Доходы-Расходы" по месяцам
  // ----------------------------------------------------------
  [APP.sheets.DDR]: {
    keys: [
      'period','cabinet',
      'orders_count','orders_amount',
      'sales_count','sales_amount','returns_amount',
      'gross_finance_amount','wb_payout_amount','wb_expense_estimate',
      'penalties_amount','logistics_amount',
      'ddr_net_cashflow_estimate','drr_percent'
    ],
    titles: {
      period:'Период', cabinet:'Кабинет',
      orders_count:'Заказов (шт.)', orders_amount:'Сумма заказов',
      sales_count:'Продаж (шт.)', sales_amount:'Сумма продаж',
      returns_amount:'Возвраты',
      gross_finance_amount:'Оборот (финансы)',
      wb_payout_amount:'К выплате WB',
      wb_expense_estimate:'Расходы WB (оценка)',
      penalties_amount:'Штрафы',
      logistics_amount:'Логистика',
      ddr_net_cashflow_estimate:'Чистый денежный поток (оценка)',
      drr_percent:'ДРР %'
    },
    desc: {
      period:'Месяц в формате ГГГГ-ММ',
      ddr_net_cashflow_estimate:'К выплате − Штрафы. Приблизительная оценка',
      drr_percent:'Доля расходов на рекламу (если есть данные) / оборот × 100'
    }
  },

  // ----------------------------------------------------------
  // ПОСТАВКИ — Supplies API /api/v1/supplies
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
  // ПОСТАВКИ_ДЕТАЛИ — GET /api/v1/supplies/{ID}
  // ----------------------------------------------------------
  [APP.sheets.SUPPLY_DETAILS]: {
    keys: [
      'cabinet','supplyID','statusID','boxTypeID',
      'createDate','supplyDate','factDate','updatedDate',
      'warehouseName','actualWarehouseName',
      'acceptanceCost','paidAcceptanceCoefficient',
      'quantity','readyForSaleQuantity','acceptedQuantity','unloadingQuantity','depersonalizedQuantity',
      'supplierAssignName','storageCoef','deliveryCoef','isBoxOnPallet'
    ],
    titles: {
      cabinet:'Кабинет', supplyID:'ID поставки', statusID:'Статус ID', boxTypeID:'Тип упаковки ID',
      createDate:'Дата создания', supplyDate:'Плановая дата', factDate:'Фактическая дата', updatedDate:'Обновлена',
      warehouseName:'Склад (плановый)', actualWarehouseName:'Склад (фактический)',
      acceptanceCost:'Стоимость приёмки', paidAcceptanceCoefficient:'Коэффициент платной приёмки',
      quantity:'Кол-во', readyForSaleQuantity:'Готово к продаже', acceptedQuantity:'Принято', unloadingQuantity:'Выгрузка', depersonalizedQuantity:'Обезличено',
      supplierAssignName:'Имя продавца', storageCoef:'Коэффициент хранения', deliveryCoef:'Коэффициент логистики', isBoxOnPallet:'На паллете'
    },
    desc: {
      statusID:'1=Черновик, 2=Подтверждена, 3=Принята, 4=Завершена, 5=Отменена',
      boxTypeID:'1=Короб, 2=Монопаллета, 3=Суперсейф',
      factDate:'Фактическая дата приёмки на складе WB',
      acceptanceCost:'Стоимость платной приёмки (руб.)',
      storageCoef:'Коэффициент хранения на складе',
      deliveryCoef:'Коэффициент доставки'
    }
  },

  // ----------------------------------------------------------
  // ПОСТАВКИ_ТОВАРЫ — GET /api/v1/supplies/{ID}/goods
  // ----------------------------------------------------------
  [APP.sheets.SUPPLY_GOODS]: {
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
  // ПОСТАВКИ_УПАКОВКА — упаковка поставки (коробки, паллеты)
  // ----------------------------------------------------------
  [APP.sheets.SUPPLY_PACKAGES]: {
    keys: [
      'cabinet','supplyID','packageIndex','goodIndex',
      'packageID','packageName','boxType',
      'barcode','techSize','wbSize','quantity','nmId','vendorCode'
    ],
    titles: {
      cabinet:'Кабинет', supplyID:'ID поставки',
      packageIndex:'№ упаковки', goodIndex:'№ товара',
      packageID:'ID упаковки', packageName:'Название упаковки', boxType:'Тип коробки',
      barcode:'Баркод', techSize:'Тех. размер', wbSize:'Размер WB',
      quantity:'Количество', nmId:'Артикул WB', vendorCode:'Артикул продавца'
    },
    desc: {
      barcode:'Баркод единицы товара',
      boxType:'Тип упаковки (короб / паллета)'
    }
  },

  // ----------------------------------------------------------
  // БАЛАНС — текущий баланс продавца
  // ----------------------------------------------------------
  [APP.sheets.BALANCE]: {
    keys: ['cabinet','loadedAt','currency','current','for_withdraw'],
    titles: {
      cabinet:'Кабинет', loadedAt:'Дата загрузки',
      currency:'Валюта', current:'Текущий баланс', for_withdraw:'Доступно к выводу'
    },
    desc: {
      current:'Общий баланс на счёте WB',
      for_withdraw:'Сумма, доступная для вывода прямо сейчас'
    }
  },

  // ----------------------------------------------------------
  // БЮДЖЕТ_КАМПАНИЙ — бюджеты рекламных кампаний (Promotion API)
  // ----------------------------------------------------------
  [APP.sheets.CAMPAIGN_BUDGET]: {
    keys: ['cabinet','loadedAt','advertId','advertName','type','status','dailyBudget','budget','budgetCash','budgetNetting'],
    titles: {
      cabinet:'Кабинет', loadedAt:'Дата загрузки',
      advertId:'ID кампании', advertName:'Название', type:'Тип', status:'Статус',
      dailyBudget:'Дневной бюджет', budget:'Общий бюджет', budgetCash:'Нал.', budgetNetting:'Взаимозачёт'
    },
    desc: {
      advertId:'ID рекламной кампании WB',
      type:'4=Каталог, 5=Карточка, 6=Поиск, 7=Рекомендации, 8=Авто, 9=Поиск+Каталог',
      status:'4=Готова, 7=Идёт, 8=На модерации, 9=Активна, 11=На паузе',
      dailyBudget:'Дневной лимит расходов',
      budget:'Полный бюджет кампании',
      budgetCash:'Остаток бюджета (наличные)',
      budgetNetting:'Остаток бюджета (взаимозачёт)'
    }
  },

  // ----------------------------------------------------------
  // ИСТОРИЯ_ЗАТРАТ — история расходов на рекламу по дням (Promotion API)
  // ----------------------------------------------------------
  [APP.sheets.COST_HISTORY]: {
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
  // АРТИКУЛ_БАРКОДЫ — связка артикулов с баркодами (из Content API sizes)
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
  // ОСТАТКИ_БАРКОДЫ — остатки на складах WB с детализацией по баркоду
  // Источник: statistics /api/v1/supplier/stocks
  // ----------------------------------------------------------
  [APP.sheets.STOCKS_BY_BARCODE]: {
    keys: ['cabinet', 'loadedAt', 'nmId', 'vendorCode', 'barcode', 'techSize', 'brand', 'subjectName',
           'warehouseName', 'quantity', 'inWayToClient', 'inWayFromClient', 'quantityFull',
           'Price', 'Discount', 'isSupply', 'isRealization', 'SCCode', 'daysOnSite'],
    titles: {
      cabinet:         'Кабинет',
      loadedAt:        'Дата загрузки',
      nmId:            'Артикул WB',
      vendorCode:      'Артикул продавца',
      barcode:         'Баркод',
      techSize:        'Тех. размер',
      brand:           'Бренд',
      subjectName:     'Предмет',
      warehouseName:   'Склад WB',
      quantity:        'Остаток (шт.)',
      inWayToClient:   'В пути к клиенту',
      inWayFromClient: 'В пути от клиента',
      quantityFull:    'Полный остаток',
      Price:           'Цена',
      Discount:        'Скидка %',
      isSupply:        'Поставка',
      isRealization:   'Реализация',
      SCCode:          'Код поставки',
      daysOnSite:      'Дней на сайте'
    },
    desc: {
      barcode:         'Баркод (SKU) конкретного размера товара',
      quantity:        'Остаток на конкретном складе WB',
      quantityFull:    'Полный остаток = склад + в пути',
      Price:           'Розничная цена без скидки',
      Discount:        'Процент скидки',
      daysOnSite:      'Количество дней, сколько товар на сайте WB',
      SCCode:          'Код поставки (SupplyCode / IncomeID)'
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
