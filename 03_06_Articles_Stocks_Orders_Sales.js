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
        rows.push({
          cabinet:     item.cabinet,
          nmID:        card.nmID        || '',
          vendorCode:  card.vendorCode  || '',
          brand:       card.brand       || '',
          title:       card.title       || '',
          category:    card.subjectParentName || '',
          subjectName: card.subjectName || '',
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
    startedAt:    new Date(),
    finishedAt:   new Date(),
    functionName: 'loadArticles',
    status:       'OK',
    cabinet:      'ВСЕ',
    rowsLoaded:   count
  });

  SpreadsheetApp.getActive().toast(`Загружено ${count} артикулов`, '✅ Артикулы', 3);
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
  SpreadsheetApp.getActive().toast(`Остатки WB: ${count} строк`, '📦 Остатки WB', 3);
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
 * Алгоритм пагинации WB Statistics:
 *   1. Запрашиваем с dateFrom=<начало>
 *   2. Получаем массив записей
 *   3. Следующий запрос: dateFrom = lastChangeDate последней записи
 *   4. Повторяем до пустого ответа ИЛИ достижения MAX_PAGES_PER_RUN
 *
 * @param {string} endpoint          - Путь API
 * @param {string} sheetName         - Имя листа для записи
 * @param {string} dateFromSettingKey - Ключ в НАСТРОЙКАХ
 * @param {string} logFuncName       - Имя для логов
 * @returns {number} - Кол-во загруженных строк
 */
function _loadStatisticsByLastChangeDate(endpoint, sheetName, dateFromSettingKey, logFuncName) {
  const apiKeys  = getApiKeys();
  const dateFrom = parseDateToIso(getSetting(dateFromSettingKey, '2026-01-01'), '2026-01-01');
  const maxPages = Math.min(Number(getSetting(APP.settings.MAX_PAGES_PER_RUN, '5')) || 5, 20);

  const rows = [];

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
          { dateFrom: currentDateFrom }
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
      currentDateFrom = lastRow.lastChangeDate || currentDateFrom;
      page++;

      if (page < maxPages) {
        Utilities.sleep(WB_API.statistics.rateLimit.sleepMs);
      }
    }

    markApiUsed(item.row);
  });

  const count = writeObjectsToSheet(sheetName, rows);

  writeLog({
    startedAt:    new Date(),
    finishedAt:   new Date(),
    functionName: logFuncName,
    status:       'OK',
    cabinet:      'ВСЕ',
    rowsLoaded:   count
  });

  return count;
}
