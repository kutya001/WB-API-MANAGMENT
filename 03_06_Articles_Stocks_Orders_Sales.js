/**
 * ============================================================
 * 03_Articles.gs — Загрузка карточек товаров (Content API)
 * ============================================================
 * API: https://content-api.wildberries.ru/content/v2/get/cards/list
 * Лимит: ~100 запросов/мин, пауза 700 мс
 * Токен: категория "Контент"
 * ============================================================
 */

/**
 * Загружает все карточки товаров для каждого кабинета.
 * Записывает в лист АРТИКУЛЫ.
 *
 * Пагинация: cursor-based (updatedAt + nmID из ответа WB).
 * Выход из цикла: cards.length === 0 OR cursor.total < cursor.limit
 */
function loadArticles() {
  const startedAt = new Date();
  const apiKeys = getApiKeys();
  const rows    = [];

  apiKeys.forEach(item => {
    let cursor  = { limit: 100 };
    let hasNext = true;
    let page    = 0;

    while (hasNext) {
      const payload = {
        settings: {
          cursor: cursor,
          filter: { withPhoto: -1 }  // -1 = все товары (с фото и без)
        }
      };

      let resp;
      try {
        resp = wbRequest('content', '/content/v2/get/cards/list', 'POST', payload, item.apiKey);
      } catch (e) {
        Logger.log(`[loadArticles] Кабинет "${item.cabinet}": ${e.message}`);
        hasNext = false;
        break;
      }

      if (!resp) { hasNext = false; break; }

      const cards      = resp.cards    || [];
      const respCursor = resp.cursor   || {};

      // Маппинг карточки → строка
      cards.forEach(card => {
        // Первое фото из массива photos (размер big)
        const photos  = card.photos || card.mediaFiles || [];
        const mainPic = photos.length ? (photos[0].big || photos[0].tm || '') : '';

        rows.push({
          cabinet:     item.cabinet,
          nmID:        card.nmID        || '',
          vendorCode:  card.vendorCode  || '',
          brand:       card.brand       || '',
          title:       card.title       || '',
          category:    card.subjectParentName || '',
          subjectName: card.subjectName || '',
          photoUrl:    mainPic,
          updatedAt:   formatDateRu(card.updatedAt)
        });
      });

      page++;

      // Условие выхода из пагинации
      if (!cards.length || (respCursor.total || 0) < (cursor.limit || 100)) {
        hasNext = false;
        break;
      }

      // Следующий курсор ТОЛЬКО из ответа WB (не инкрементируем вручную)
      cursor = {
        limit:     100,
        updatedAt: respCursor.updatedAt,
        nmID:      respCursor.nmID
      };

      Utilities.sleep(WB_API.content.rateLimit.sleepMs);
    }

    markApiUsed(item.row);
  });

  const count = writeObjectsToSheet(APP.sheets.ARTICLES, rows);
  writeLog({
    startedAt,
    finishedAt:   new Date(),
    functionName: 'loadArticles',
    status:       'OK',
    cabinet:      'ВСЕ',
    rowsLoaded:   count
  });

  SpreadsheetApp.getActive().toast(`Загружено ${count} артикулов`, '✅ Артикулы', 3);
}

/**
 * Загружает связки артикул-баркод из карточек Content API.
 * Каждая строка = 1 баркод (размер) товара.
 * Записывает в лист АРТИКУЛ_БАРКОДЫ.
 */
function loadArticleBarcodes() {
  const startedAt = new Date();
  const apiKeys = getApiKeys();
  const rows    = [];

  apiKeys.forEach(item => {
    let cursor  = { limit: 100 };
    let hasNext = true;

    while (hasNext) {
      const payload = {
        settings: {
          cursor: cursor,
          filter: { withPhoto: -1 }
        }
      };

      let resp;
      try {
        resp = wbRequest('content', '/content/v2/get/cards/list', 'POST', payload, item.apiKey);
      } catch (e) {
        Logger.log(`[loadArticleBarcodes] Кабинет "${item.cabinet}": ${e.message}`);
        hasNext = false;
        break;
      }

      if (!resp) { hasNext = false; break; }

      const cards      = resp.cards  || [];
      const respCursor = resp.cursor || {};

      cards.forEach(card => {
        const sizes = card.sizes || [];
        sizes.forEach(sz => {
          const skus = sz.skus || [];
          skus.forEach(barcode => {
            rows.push({
              cabinet:         item.cabinet,
              nmID:            card.nmID        || '',
              vendorCode:      card.vendorCode  || '',
              techSize:        sz.techSize      || '',
              wbSize:          sz.wbSize        || sz.origName || '',
              barcode:         barcode,
              chrtID:          sz.chrtID        || '',
              price:           sz.price         || 0,
              discountedPrice: sz.discountedPrice || 0
            });
          });
        });
      });

      if (!cards.length || (respCursor.total || 0) < (cursor.limit || 100)) {
        hasNext = false;
        break;
      }

      cursor = {
        limit:     100,
        updatedAt: respCursor.updatedAt,
        nmID:      respCursor.nmID
      };
      Utilities.sleep(WB_API.content.rateLimit.sleepMs);
    }

    markApiUsed(item.row);
  });

  const count = writeObjectsToSheet(APP.sheets.ARTICLE_BARCODES, rows);
  writeLog({
    startedAt,
    finishedAt:   new Date(),
    functionName: 'loadArticleBarcodes',
    status:       'OK',
    cabinet:      'ВСЕ',
    rowsLoaded:   count
  });
  SpreadsheetApp.getActive().toast(`Загружено ${count} баркодов`, '✅ Баркоды', 3);
  return count;
}

// ============================================================
// 04_Stocks.gs — Остатки на складах WB
// ============================================================
/**
 * API: Statistics /api/v1/supplier/stocks
 * Лимит: 1 запрос/мин (statistics API)
 * Токен: категория "Статистика"
 *
 * Возвращает остатки по каждому nmId и складу WB.
 * Обновляется ежедневно (данные на начало дня).
 */

/**
 * Загружает остатки на складах WB (FBW).
 * Записывает в лист ОСТАТКИ_WB.
 */
function loadStocksWb() {
  const startedAt = new Date();
  const apiKeys  = getApiKeys();
  const loadedAt = formatDateRu(new Date());
  const rows     = [];

  // dateFrom = вчера (нужен для получения актуальных остатков)
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateFrom  = parseDateToIso(yesterday);

  apiKeys.forEach(item => {
    let resp;
    try {
      resp = wbRequest(
        'statistics',
        '/api/v1/supplier/stocks',
        'GET', null, item.apiKey,
        { dateFrom }
      );
    } catch (e) {
      Logger.log(`[loadStocksWb] Кабинет "${item.cabinet}": ${e.message}`);
      return;
    }

    if (!resp || !Array.isArray(resp)) return;

    resp.forEach(s => {
      rows.push({
        cabinet:         item.cabinet,
        loadedAt:        loadedAt,
        nmId:            s.nmId            || '',
        vendorCode:      s.supplierArticle || '',
        brand:           s.brand           || '',
        subjectName:     s.subject         || '',
        warehouseName:   s.warehouseName   || '',
        quantity:        s.quantity        || 0,
        inWayToClient:   s.inWayToClient   || 0,
        inWayFromClient: s.inWayFromClient || 0,
        quantityFull:    s.quantityFull    || 0
      });
    });

    markApiUsed(item.row);
    Utilities.sleep(WB_API.statistics.rateLimit.sleepMs);
  });

  const count = writeObjectsToSheet(APP.sheets.STOCKS_WB, rows);
  writeLog({
    startedAt,
    finishedAt:   new Date(),
    functionName: 'loadStocksWb',
    status:       'OK',
    cabinet:      'ВСЕ',
    rowsLoaded:   count
  });
  SpreadsheetApp.getActive().toast(`Остатки WB: ${count} строк`, '📦 Остатки WB', 3);
  return count;
}

/**
 * Загружает остатки с детализацией по баркоду.
 * Включает все поля: баркод, тех. размер, цена, скидка, дни на сайте.
 * Записывает в лист ОСТАТКИ_БАРКОДЫ.
 */
function loadStocksByBarcode() {
  const startedAt = new Date();
  const apiKeys  = getApiKeys();
  const loadedAt = formatDateRu(new Date());
  const rows     = [];

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateFrom  = parseDateToIso(yesterday);

  apiKeys.forEach(item => {
    let resp;
    try {
      resp = wbRequest(
        'statistics',
        '/api/v1/supplier/stocks',
        'GET', null, item.apiKey,
        { dateFrom }
      );
    } catch (e) {
      Logger.log(`[loadStocksByBarcode] Кабинет "${item.cabinet}": ${e.message}`);
      return;
    }

    if (!resp || !Array.isArray(resp)) return;

    resp.forEach(s => {
      rows.push({
        cabinet:         item.cabinet,
        loadedAt:        loadedAt,
        nmId:            s.nmId            || '',
        vendorCode:      s.supplierArticle || '',
        barcode:         s.barcode         || '',
        techSize:        s.techSize        || '',
        brand:           s.brand           || '',
        subjectName:     s.subject         || '',
        warehouseName:   s.warehouseName   || '',
        quantity:        s.quantity        || 0,
        inWayToClient:   s.inWayToClient   || 0,
        inWayFromClient: s.inWayFromClient || 0,
        quantityFull:    s.quantityFull    || 0,
        Price:           s.Price           || 0,
        Discount:        s.Discount        || 0,
        isSupply:        s.isSupply ? 'Да' : 'Нет',
        isRealization:   s.isRealization ? 'Да' : 'Нет',
        SCCode:          s.SCCode          || '',
        daysOnSite:      s.daysOnSite      || 0
      });
    });

    markApiUsed(item.row);
    Utilities.sleep(WB_API.statistics.rateLimit.sleepMs);
  });

  const count = writeObjectsToSheet(APP.sheets.STOCKS_BY_BARCODE, rows);
  writeLog({
    startedAt,
    finishedAt:   new Date(),
    functionName: 'loadStocksByBarcode',
    status:       'OK',
    cabinet:      'ВСЕ',
    rowsLoaded:   count
  });
  SpreadsheetApp.getActive().toast(`Остатки по баркодам: ${count} строк`, '📊 Остатки по баркодам', 3);
  return count;
}

// ============================================================
// 05_Orders.gs — Заказы
// ============================================================
/**
 * API: Statistics /api/v1/supplier/orders
 * Пагинация: по lastChangeDate (дата последнего изменения)
 * Лимит: 1 запрос/мин
 * Токен: категория "Статистика"
 */

/**
 * Загружает заказы с указанной даты.
 * Записывает в лист ЗАКАЗЫ.
 */
function loadOrders() {
  const count = _loadStatisticsByLastChangeDate(
    '/api/v1/supplier/orders',
    APP.sheets.ORDERS,
    APP.settings.ORDERS_DATE_FROM,
    'loadOrders'
  );
  SpreadsheetApp.getActive().toast(`Загружено ${count} заказов`, '📊 Заказы', 3);
}

// ============================================================
// 06_Sales.gs — Продажи
// ============================================================
/**
 * API: Statistics /api/v1/supplier/sales
 * Пагинация: по lastChangeDate
 * Лимит: 1 запрос/мин
 * Токен: категория "Статистика"
 */

/**
 * Загружает продажи с указанной даты.
 * Записывает в лист ПРОДАЖИ.
 */
function loadSales() {
  const count = _loadStatisticsByLastChangeDate(
    '/api/v1/supplier/sales',
    APP.sheets.SALES,
    APP.settings.SALES_DATE_FROM,
    'loadSales'
  );
  SpreadsheetApp.getActive().toast(`Загружено ${count} продаж`, '💰 Продажи', 3);
}

// ============================================================
// ВНУТРЕННЯЯ: универсальный загрузчик statistics с пагинацией
// ============================================================

/**
 * Универсальный загрузчик Statistics API с пагинацией по lastChangeDate.
 *
 * Поддерживает инкрементальное обновление:
 *   - Сохраняет lastChangeDate последней строки в UserProperties (ключ: INC_<sheetName>)
 *   - При повторном запуске, если сохранённая дата > настройки, загружает только новое
 *     и дописывает в конец листа через appendObjectsToSheet
 *   - Если сохранённой даты нет или она <= настройки — полная перезагрузка через writeObjectsToSheet
 *
 * @param {string} endpoint          - Путь API
 * @param {string} sheetName         - Имя листа для записи
 * @param {string} dateFromSettingKey - Ключ в НАСТРОЙКАХ
 * @param {string} logFuncName       - Имя для логов
 * @returns {number} - Кол-во загруженных строк
 */
function _loadStatisticsByLastChangeDate(endpoint, sheetName, dateFromSettingKey, logFuncName) {
  const startedAt   = new Date();
  const apiKeys     = getApiKeys();
  const settingDate = parseDateToIso(getSetting(dateFromSettingKey, '2026-01-01'), '2026-01-01');
  const maxPages    = Math.min(Number(getSetting(APP.settings.MAX_PAGES_PER_RUN, '5')) || 5, 20);

  // Проверяем сохранённый курсор инкрементального обновления
  const propKey     = 'INC_' + sheetName;
  const props       = PropertiesService.getUserProperties();
  const savedDate   = props.getProperty(propKey) || '';
  const incremental = savedDate && savedDate > settingDate;
  const dateFrom    = incremental ? savedDate : settingDate;

  const rows = [];
  let lastSeenDate = dateFrom;

  apiKeys.forEach(item => {
    let currentDateFrom = dateFrom;
    let page = 0;

    while (page < maxPages) {
      let resp;
      try {
        resp = wbRequest(
          'statistics',
          endpoint,
          'GET', null, item.apiKey,
          { dateFrom: currentDateFrom, flag: 0 }
        );
      } catch (e) {
        Logger.log(`[${logFuncName}] Кабинет "${item.cabinet}" стр.${page}: ${e.message}`);
        break;
      }

      // Нет данных = конец
      if (!resp || !Array.isArray(resp) || resp.length === 0) break;

      resp.forEach(row => {
        // Форматируем даты в СНГ формат перед записью
        const mapped = Object.assign({ cabinet: item.cabinet }, row);
        ['date', 'lastChangeDate', 'cancelDate', 'order_dt', 'sale_dt'].forEach(dateField => {
          if (mapped[dateField]) mapped[dateField] = formatDateRu(mapped[dateField]);
        });
        rows.push(mapped);
      });

      // Следующий cursor = lastChangeDate последней строки
      const lastRow = resp[resp.length - 1];
      const nextDate = lastRow.lastChangeDate || currentDateFrom;
      if (nextDate > lastSeenDate) lastSeenDate = nextDate;
      currentDateFrom = nextDate;
      page++;

      if (page < maxPages) {
        Utilities.sleep(WB_API.statistics.rateLimit.sleepMs);
      }
    }

    markApiUsed(item.row);
  });

  // Запись: append при инкрементальном, полная перезапись при обычном
  let count;
  if (incremental && rows.length > 0) {
    count = appendObjectsToSheet(sheetName, rows);
  } else {
    count = writeObjectsToSheet(sheetName, rows);
  }

  // Сохраняем курсор для следующего инкрементального запуска
  if (lastSeenDate && lastSeenDate > (savedDate || '')) {
    props.setProperty(propKey, lastSeenDate);
  }

  writeLog({
    startedAt,
    finishedAt:   new Date(),
    functionName: logFuncName,
    status:       'OK',
    cabinet:      'ВСЕ',
    rowsLoaded:   count,
    errorMessage: incremental ? 'Инкрементальное обновление' : 'Полная загрузка'
  });

  return count;
}

// ============================================================
// ГРУППОВЫЕ ОБНОВЛЕНИЯ
// ============================================================

/** Обновить все данные Товаров: артикулы + баркоды + остатки */
function loadAllGoods() {
  loadArticles();
  loadArticleBarcodes();
  loadStocksWb();
  loadStocksByBarcode();
  SpreadsheetApp.getActive().toast('Товары обновлены полностью', '📦 Товары', 3);
}

/** Обновить Заказы + Продажи */
function loadAllOrdersSales() {
  loadOrders();
  loadSales();
  SpreadsheetApp.getActive().toast('Заказы и Продажи обновлены', '🛒 Заказы+Продажи', 3);
}
