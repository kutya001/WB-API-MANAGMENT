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
    ARTICLES:          'АРТИКУЛЫ',
    STOCKS_WB:         'ОСТАТКИ_WB',
    STOCKS_SELLER:     'ОСТАТКИ_ПРОДАВЕЦ',
    ORDERS:            'ЗАКАЗЫ',
    SALES:             'ПРОДАЖИ',
    FINANCE:           'ФИНАНСЫ',
    EXPENSES:          'РАСХОДЫ',
    DDR:               'ДДР',
    SUPPLIES:          'ПОСТАВКИ',
    SUPPLY_DETAILS:    'ПОСТАВКИ_ДЕТАЛИ',
    SUPPLY_GOODS:      'ПОСТАВКИ_ТОВАРЫ',
    SUPPLY_PACKAGES:   'ПОСТАВКИ_УПАКОВКА',
    BALANCE:           'БАЛАНС'
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
  { key: 'STOCKS_WAREHOUSE_IDS',  value: '',              group: 'Остатки',  description: 'Остатки: ID складов через запятую (пусто = первый склад)' }
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
  // ПОСТАВКИ_ДЕТАЛИ — детали одной поставки
  // ----------------------------------------------------------
  [APP.sheets.SUPPLY_DETAILS]: {
    keys: [
      'cabinet','supplyID','name','createdAt','closedAt',
      'scanDt','statusId','cargoType','isLargeCargo'
    ],
    titles: {
      cabinet:'Кабинет', supplyID:'ID поставки', name:'Название',
      createdAt:'Создана', closedAt:'Закрыта',
      scanDt:'Дата скана', statusId:'Статус', cargoType:'Тип груза', isLargeCargo:'Крупногабаритный'
    },
    desc: {
      scanDt:'Дата и время приёмки',
      cargoType:'1=Короб, 2=Монопаллета, 3=Суперсейф'
    }
  },

  // ----------------------------------------------------------
  // ПОСТАВКИ_ТОВАРЫ — список товаров в поставке
  // ----------------------------------------------------------
  [APP.sheets.SUPPLY_GOODS]: {
    keys: ['cabinet','supplyID','nmId','vendorCode','brand','name','quantity','inWayToClient'],
    titles: {
      cabinet:'Кабинет', supplyID:'ID поставки',
      nmId:'Артикул WB', vendorCode:'Артикул продавца',
      brand:'Бренд', name:'Название',
      quantity:'Количество', inWayToClient:'В пути к клиенту'
    },
    desc: {
      quantity:'Количество единиц в поставке'
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
  // ЛОГИ — системный журнал запусков
  // ----------------------------------------------------------
  [APP.sheets.LOGS]: {
    keys: ['startedAt','finishedAt','durationSec','functionName','status','cabinet','rowsLoaded','errorMessage'],
    titles: {
      startedAt:'Начало', finishedAt:'Конец', durationSec:'Длительность (сек)',
      functionName:'Функция', status:'Статус', cabinet:'Кабинет',
      rowsLoaded:'Строк загружено', errorMessage:'Ошибка'
    },
    desc: {
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
