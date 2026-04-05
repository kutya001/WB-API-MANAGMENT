/**
 * ============================================================
 * 03_06_Articles_Orders_Sales.gs — Артикулы, Заказы, Продажи
 * ============================================================
 * Содержит:
 *  - loadArticles()            — Content API карточки товаров
 *  - loadArticleBarcodes()     — Content API баркоды
 *  - loadOrders()              — Statistics API заказы
 *  - loadSales()               — Statistics API продажи+возвраты
 *  - _loadStatisticsByLastChangeDate() — универсальный загрузчик
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

        var nmId = card.nmID || '';
        rows.push({
          cabinet:     item.cabinet,
          nmID:        nmId,
          vendorCode:  card.vendorCode  || '',
          brand:       card.brand       || '',
          title:       card.title       || '',
          category:    card.subjectParentName || '',
          subjectName: card.subjectName || '',
          cardUrl:     nmId ? 'https://www.wildberries.ru/catalog/' + nmId + '/detail.aspx' : '',
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
 * Загружает продажи и возвраты с указанной даты.
 * Добавляет поле isReturn (Да/Нет) на основе saleID (R = возврат).
 * Записывает в лист ПРОДАЖИ_ВБ.
 */
function loadSales() {
  const count = _loadStatisticsByLastChangeDate(
    '/api/v1/supplier/sales',
    APP.sheets.SALES,
    APP.settings.SALES_DATE_FROM,
    'loadSales',
    {
      mapRow: function(cabinet, row) {
        const mapped = Object.assign({ cabinet: cabinet }, row);
        ['date', 'lastChangeDate', 'cancelDate', 'order_dt', 'sale_dt'].forEach(function(dateField) {
          if (mapped[dateField]) mapped[dateField] = formatDateRu(mapped[dateField]);
        });
        // Определяем возврат по saleID: R = возврат, S = продажа
        const saleID = String(mapped.saleID || '');
        mapped.isReturn = saleID.charAt(0) === 'R' ? 'Да' : 'Нет';
        return mapped;
      }
    }
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
 * @param {Object} [opts]            - Дополнительные опции маппинга
 * @param {Function} [opts.mapRow]   - Кастомный маппинг строки (cabinet, row) => object
 * @returns {number} - Кол-во загруженных строк
 */
function _loadStatisticsByLastChangeDate(endpoint, sheetName, dateFromSettingKey, logFuncName, opts) {
  const startedAt   = new Date();
  const apiKeys     = getApiKeys();
  const settingDate = parseDateToIso(getSetting(dateFromSettingKey, '2026-01-01'), '2026-01-01');
  const maxPages    = Math.min(Number(getSetting(APP.settings.MAX_PAGES_PER_RUN, '5')) || 5, 20);
  const mapRow      = (opts && opts.mapRow) || null;

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
        if (mapRow) {
          rows.push(mapRow(item.cabinet, row));
        } else {
          // Форматируем даты в СНГ формат перед записью
          const mapped = Object.assign({ cabinet: item.cabinet }, row);
          ['date', 'lastChangeDate', 'cancelDate', 'order_dt', 'sale_dt'].forEach(dateField => {
            if (mapped[dateField]) mapped[dateField] = formatDateRu(mapped[dateField]);
          });
          rows.push(mapped);
        }
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

/** Обновить артикулы и баркоды */
function loadAllGoods() {
  loadArticles();
  loadArticleBarcodes();
  SpreadsheetApp.getActive().toast('Артикулы и баркоды обновлены', '📦 Товары', 3);
}

/** Обновить Заказы + Продажи */
function loadAllOrdersSales() {
  loadOrders();
  loadSales();
  SpreadsheetApp.getActive().toast('Заказы и Продажи обновлены', '🛒 Заказы+Продажи', 3);
}
