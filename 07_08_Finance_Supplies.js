/**
 * ============================================================
 * 07_Finance.gs — Финансовый отчёт по реализации
 * ============================================================
 * API: Statistics /api/v5/supplier/reportDetailByPeriod
 * Пагинация: по rrd_id (уникальный ID строки отчёта)
 * Лимит: 1 запрос/мин
 * Токен: категория "Статистика"
 *
 * ВАЖНО: Данные доступны с 29.01.2024.
 * При rrd_id=0 загружается с начала периода.
 * Пагинация: последнее rrd_id из ответа → следующий запрос.
 * Конец данных: ответ 204 или пустой массив.
 *
 * Документация: https://dev.wildberries.ru/docs/openapi/financial-reports-and-accounting
 * ============================================================
 */

/**
 * Загружает финансовый отчёт по реализации.
 * Записывает в лист ФИНАНСЫ.
 */
function loadFinance() {
  const startedAt = new Date();
  const dateFrom = parseDateToIso(getSetting(APP.settings.FINANCE_DATE_FROM, '2026-04-01'), '2026-04-01');
  const dateTo   = parseDateToIso(getSetting(APP.settings.FINANCE_DATE_TO,   '2026-04-30'), '2026-04-30');
  const period   = getSetting(APP.settings.FINANCE_PERIOD, 'weekly');  // 'weekly' | 'daily'
  const maxPages = Math.min(Number(getSetting(APP.settings.MAX_PAGES_PER_RUN, '5')) || 5, 30);

  const apiKeys = getApiKeys();
  const rows    = [];

  apiKeys.forEach(item => {
    let rrdid = 0;  // Начинаем с 0
    let page  = 0;

    while (page < maxPages) {
      let resp;
      try {
        resp = wbRequest(
          'statistics',
          '/api/v5/supplier/reportDetailByPeriod',
          'GET', null, item.apiKey,
          {
            dateFrom, dateTo,
            limit:  100000,
            rrdid,
            period
          }
        );
      } catch (e) {
        Logger.log(`[loadFinance] Кабинет "${item.cabinet}" rrdid=${rrdid}: ${e.message}`);
        break;
      }

      // 204 или пустой массив = данные закончились
      if (!resp || !Array.isArray(resp) || resp.length === 0) break;

      resp.forEach(row => {
        const mapped = Object.assign({ cabinet: item.cabinet }, row);
        // Форматируем все даты в СНГ формат
        ['date_from', 'date_to', 'create_dt', 'order_dt', 'sale_dt', 'rr_dt'].forEach(dateField => {
          if (mapped[dateField]) mapped[dateField] = formatDateRu(mapped[dateField]);
        });
        rows.push(mapped);
      });

      // Следующий rrd_id из последней строки
      const lastRow = resp[resp.length - 1];
      rrdid = lastRow.rrd_id || rrdid;
      page++;

      if (page < maxPages) {
        Utilities.sleep(WB_API.statistics.rateLimit.sleepMs);
      }
    }

    markApiUsed(item.row);
  });

  const count = writeObjectsToSheet(APP.sheets.FINANCE, rows);

  writeLog({
    startedAt,
    finishedAt:   new Date(),
    functionName: 'loadFinance',
    status:       'OK',
    cabinet:      'ВСЕ',
    rowsLoaded:   count
  });

  SpreadsheetApp.getActive().toast(`Загружено ${count} строк финансов`, '🧾 Финансы', 3);
  return count;
}

// ============================================================
// БАЛАНС ПРОДАВЦА
// ============================================================
/**
 * API: Finance /api/v1/account/balance
 * Лимит: 1 запрос/мин
 * Токен: категория "Финансы"
 *
 * ВАЖНО: Используй отдельный токен категории "Финансы" для баланса!
 * Токен статистики не подходит для этого метода.
 *
 * Документация: https://dev.wildberries.ru/docs/openapi/financial-reports-and-accounting
 */

/**
 * Загружает текущий баланс продавца.
 * Записывает в лист БАЛАНС.
 */
function loadBalance() {
  const startedAt = new Date();
  const apiKeys  = getApiKeys();
  const loadedAt = formatDateRu(new Date());
  const rows     = [];

  apiKeys.forEach(item => {
    let resp;
    try {
      resp = wbRequest(
        'finance',
        '/api/v1/account/balance',
        'GET', null, item.apiKey
      );
    } catch (e) {
      Logger.log(`[loadBalance] Кабинет "${item.cabinet}": ${e.message}`);
      return;
    }

    if (!resp) return;

    rows.push({
      cabinet:      item.cabinet,
      loadedAt:     loadedAt,
      currency:     resp.currency    || 'RUB',
      current:      resp.current     || 0,
      for_withdraw: resp.for_withdraw || 0
    });

    markApiUsed(item.row);
    Utilities.sleep(65000);  // 1 запрос/мин
  });

  const count = writeObjectsToSheet(APP.sheets.BALANCE, rows);
  writeLog({
    startedAt,
    finishedAt:   new Date(),
    functionName: 'loadBalance',
    status:       'OK',
    cabinet:      'ВСЕ',
    rowsLoaded:   count
  });
  SpreadsheetApp.getActive().toast(`Баланс загружен: ${count} кабинета(ов)`, '💳 Баланс', 3);
  return count;
}

// ============================================================
// 08_Supplies.gs — Поставки FBW
// ============================================================
/**
 * API: Supplies /api/v1/supplies
 * Лимит: ~60 запросов/мин
 * Токен: категория "Поставки FBW"
 *
 * Документация: https://dev.wildberries.ru/docs/openapi/orders-fbw
 * Статусы поставки:
 *   1 — Черновик
 *   2 — Подтверждена
 *   3 — Принята на складе WB
 *   4 — Завершена
 *   5 — Отменена
 */

/**
 * Загружает список поставок FBW.
 * Записывает в лист ПОСТАВКИ.
 */
function loadSupplies() {
  const startedAt  = new Date();
  const dateFrom   = parseDateToIso(getSetting('SUPPLIES_DATE_FROM', '2026-01-01'), '2026-01-01');
  const dateTo     = parseDateToIso(getSetting('SUPPLIES_DATE_TO',   '2026-04-30'), '2026-04-30');
  const dateType   = getSetting('SUPPLIES_DATE_TYPE', 'factDate');
  const limit      = Number(getSetting('SUPPLIES_LIMIT', '1000')) || 1000;

  const statusIdsRaw = getSetting('SUPPLIES_STATUS_IDS', '');
  const statusIDs    = statusIdsRaw
    ? statusIdsRaw.split(',').map(x => Number(x.trim())).filter(x => !isNaN(x) && x > 0)
    : [];

  const apiKeys = getApiKeys();
  const rows    = [];

  apiKeys.forEach(item => {
    let offset  = 0;
    let hasNext = true;

    while (hasNext) {
      const payload = {
        dates: [{ from: dateFrom, till: dateTo, type: dateType }]
      };
      if (statusIDs.length) payload.statusIDs = statusIDs;

      let resp;
      try {
        resp = wbRequest(
          'supplies',
          '/api/v1/supplies',
          'POST', payload, item.apiKey,
          { limit, offset }
        );
      } catch (e) {
        Logger.log(`[loadSupplies] Кабинет "${item.cabinet}" offset=${offset}: ${e.message}`);
        break;
      }

      if (!resp || !Array.isArray(resp) || resp.length === 0) { hasNext = false; break; }

      resp.forEach(s => {
        rows.push({
          cabinet:       item.cabinet,
          supplyID:      s.supplyID    || '',
          preorderID:    s.preorderID  || '',
          createDate:    formatDateRu(s.createDate),
          supplyDate:    formatDateRu(s.supplyDate),
          factDate:      formatDateRu(s.factDate),
          updatedDate:   formatDateRu(s.updatedDate),
          statusID:      s.statusID    || '',
          boxTypeID:     s.boxTypeID   || '',
          isBoxOnPallet: s.isBoxOnPallet ? 'Да' : 'Нет'
        });
      });

      if (resp.length < limit) { hasNext = false; break; }

      offset += limit;
      Utilities.sleep(WB_API.supplies.rateLimit.sleepMs);
    }

    markApiUsed(item.row);
  });

  const count = writeObjectsToSheet(APP.sheets.SUPPLIES, rows);
  writeLog({
    startedAt,
    finishedAt:   new Date(),
    functionName: 'loadSupplies',
    status:       'OK',
    cabinet:      'ВСЕ',
    rowsLoaded:   count
  });
  SpreadsheetApp.getActive().toast(`Загружено ${count} поставок`, '📦 Поставки', 3);
  return count;
}

/**
 * Читает supplyID + cabinet из листа ПОСТАВКИ и связывает с apiKey.
 * @returns {{ cabinet: string, supplyID: number, apiKey: string, row: number }[]}
 */
function _getSupplyTasks() {
  const apiKeys    = getApiKeys();
  const cabinetMap = {};
  apiKeys.forEach(item => { cabinetMap[item.cabinet] = item; });

  const supplyRows = readSheetAsObjects(APP.sheets.SUPPLIES);

  return supplyRows
    .map(row => {
      const supplyID = Number(
        row['ID поставки'] || row['supplyID'] || 0
      );
      const cabinet = String(
        row['Кабинет'] || row['cabinet'] || ''
      ).trim();

      if (!supplyID || !cabinet) return null;
      const cabinetInfo = cabinetMap[cabinet];
      if (!cabinetInfo) return null;

      return { cabinet, supplyID, apiKey: cabinetInfo.apiKey, row: cabinetInfo.row };
    })
    .filter(Boolean);
}

/**
 * Загружает детали каждой поставки (GET /api/v1/supplies/{ID}).
 * Записывает в лист ПОСТАВКИ_ДЕТАЛИ.
 *
 * API: https://supplies-api.wildberries.ru/api/v1/supplies/{ID}
 * Лимит: 30 запросов/мин, интервал 2 сек
 */
function loadSupplyDetails() {
  const startedAt = new Date();
  const tasks = _getSupplyTasks();
  const rows  = [];

  tasks.forEach(task => {
    let resp;
    try {
      resp = wbRequest(
        'supplies',
        `/api/v1/supplies/${encodeURIComponent(task.supplyID)}`,
        'GET', null, task.apiKey,
        { isPreorderID: false }
      );
    } catch (e) {
      Logger.log(`[loadSupplyDetails] supplyID=${task.supplyID}: ${e.message}`);
      return;
    }

    if (!resp || typeof resp !== 'object') return;

    rows.push({
      cabinet:                   task.cabinet,
      supplyID:                  task.supplyID,
      statusID:                  pickNumber(resp, ['statusID', 'statusId']),
      boxTypeID:                 pickNumber(resp, ['boxTypeID', 'boxTypeName']),
      createDate:                formatDateRu(resp.createDate),
      supplyDate:                formatDateRu(resp.supplyDate),
      factDate:                  formatDateRu(resp.factDate),
      updatedDate:               formatDateRu(resp.updatedDate),
      warehouseName:             pickString(resp, ['warehouseName']),
      actualWarehouseName:       pickString(resp, ['actualWarehouseName']),
      acceptanceCost:            pickNumber(resp, ['acceptanceCost']),
      paidAcceptanceCoefficient: pickNumber(resp, ['paidAcceptanceCoefficient']),
      quantity:                  pickNumber(resp, ['quantity']),
      readyForSaleQuantity:      pickNumber(resp, ['readyForSaleQuantity']),
      acceptedQuantity:          pickNumber(resp, ['acceptedQuantity']),
      unloadingQuantity:         pickNumber(resp, ['unloadingQuantity']),
      depersonalizedQuantity:    pickNumber(resp, ['depersonalizedQuantity']),
      supplierAssignName:        pickString(resp, ['supplierAssignName']),
      storageCoef:               pickString(resp, ['storageCoef']),
      deliveryCoef:              pickString(resp, ['deliveryCoef']),
      isBoxOnPallet:             resp.isBoxOnPallet ? 'Да' : 'Нет'
    });

    // 30 запросов/мин → интервал 2 сек
    Utilities.sleep(2100);
  });

  const count = writeObjectsToSheet(APP.sheets.SUPPLY_DETAILS, rows);
  writeLog({
    startedAt,
    finishedAt:   new Date(),
    functionName: 'loadSupplyDetails',
    status:       'OK',
    cabinet:      'ВСЕ',
    rowsLoaded:   count
  });
  SpreadsheetApp.getActive().toast(`Детали поставок: ${count} строк`, '📦 Детали', 3);
  return count;
}

/**
 * Загружает товары каждой поставки (GET /api/v1/supplies/{ID}/goods).
 * Записывает в лист ПОСТАВКИ_ТОВАРЫ.
 *
 * API: https://supplies-api.wildberries.ru/api/v1/supplies/{ID}/goods
 * Лимит: 30 запросов/мин, интервал 2 сек
 * Пагинация: offset-based (limit + offset)
 */
function loadSupplyGoods() {
  const startedAt = new Date();
  const tasks = _getSupplyTasks();
  const rows  = [];

  tasks.forEach(task => {
    let offset  = 0;
    const limit = 1000;
    let hasNext = true;

    while (hasNext) {
      let resp;
      try {
        resp = wbRequest(
          'supplies',
          `/api/v1/supplies/${encodeURIComponent(task.supplyID)}/goods`,
          'GET', null, task.apiKey,
          { limit, offset, isPreorderID: false }
        );
      } catch (e) {
        Logger.log(`[loadSupplyGoods] supplyID=${task.supplyID} offset=${offset}: ${e.message}`);
        hasNext = false;
        break;
      }

      if (!resp || !Array.isArray(resp) || !resp.length) { hasNext = false; break; }

      resp.forEach(good => {
        rows.push({
          cabinet:              task.cabinet,
          supplyID:             task.supplyID,
          nmID:                 pickNumber(good, ['nmID', 'nmId']),
          vendorCode:           pickString(good, ['vendorCode', 'sa_name']),
          barcode:              pickString(good, ['barcode', 'sku']),
          techSize:             pickString(good, ['techSize', 'size']),
          color:                pickString(good, ['color']),
          quantity:             pickNumber(good, ['quantity']),
          supplierBoxAmount:    pickNumber(good, ['supplierBoxAmount']),
          readyForSaleQuantity: pickNumber(good, ['readyForSaleQuantity']),
          acceptedQuantity:     pickNumber(good, ['acceptedQuantity']),
          unloadingQuantity:    pickNumber(good, ['unloadingQuantity']),
          tnved:                pickString(good, ['tnved']),
          needKiz:              good.needKiz ? 'Да' : 'Нет'
        });
      });

      // Если вернулось меньше limit — данные закончились
      if (resp.length < limit) { hasNext = false; break; }

      offset += limit;
      // 30 запросов/мин → интервал 2 сек
      Utilities.sleep(2100);
    }

    // Пауза между поставками
    Utilities.sleep(2100);
  });

  const count = writeObjectsToSheet(APP.sheets.SUPPLY_GOODS, rows);
  writeLog({
    startedAt,
    finishedAt:   new Date(),
    functionName: 'loadSupplyGoods',
    status:       'OK',
    cabinet:      'ВСЕ',
    rowsLoaded:   count
  });
  SpreadsheetApp.getActive().toast(`Товары поставок: ${count} строк`, '📦 Товары', 3);
  return count;
}

/**
 * Загружает упаковку каждой поставки (GET /api/v1/supplies/{ID}/package).
 * Разворачивает в плоские строки: 1 строка = 1 товар в упаковке.
 * Записывает в лист ПОСТАВКИ_УПАКОВКА.
 */
function loadSupplyPackages() {
  const startedAt = new Date();
  const tasks = _getSupplyTasks();
  const rows  = [];

  tasks.forEach(task => {
    let resp;
    try {
      resp = wbRequest(
        'supplies',
        `/api/v1/supplies/${encodeURIComponent(task.supplyID)}/package`,
        'GET', null, task.apiKey
      );
    } catch (e) {
      Logger.log(`[loadSupplyPackages] supplyID=${task.supplyID}: ${e.message}`);
      return;
    }

    if (!resp) return;

    const packages = Array.isArray(resp) ? resp : [resp];

    packages.forEach((pkg, pkgIdx) => {
      // Попытаться найти массив товаров под разными ключами (WB API нестабилен)
      const goods = pkg.goods || pkg.items || pkg.products ||
                    pkg.goodInBoxes || pkg.goodInBox || pkg.boxes || [];

      if (!Array.isArray(goods) || !goods.length) {
        // Нет товаров — пишем хотя бы строку упаковки
        rows.push({
          cabinet:      task.cabinet,
          supplyID:     task.supplyID,
          packageIndex: pkgIdx + 1,
          goodIndex:    '',
          packageID:    pkg.ID || pkg.id || pkg.packageID || pkg.boxID || '',
          packageName:  pkg.name || pkg.packageName || pkg.boxName || '',
          boxType:      pkg.boxType || pkg.boxTypeName || pkg.type || '',
          barcode: '', techSize: '', wbSize: '', quantity: '', nmId: '', vendorCode: ''
        });
        return;
      }

      goods.forEach((good, goodIdx) => {
        const barcode = good.barcode || good.sku || good.chestBarcode || '';
        rows.push({
          cabinet:      task.cabinet,
          supplyID:     task.supplyID,
          packageIndex: pkgIdx + 1,
          goodIndex:    goodIdx + 1,
          packageID:    pkg.ID || pkg.id || pkg.packageID || pkg.boxID || '',
          packageName:  pkg.name || pkg.packageName || pkg.boxName || '',
          boxType:      pkg.boxType || pkg.boxTypeName || pkg.type || '',
          barcode:      Array.isArray(barcode) ? barcode.join(', ') : barcode,
          techSize:     good.techSize || good.size || '',
          wbSize:       good.wbSize || good.sizeName || '',
          quantity:     good.quantity || good.qty || 1,
          nmId:         good.nmId || good.nmID || '',
          vendorCode:   good.vendorCode || good.supplierArticle || ''
        });
      });
    });

    Utilities.sleep(WB_API.supplies.rateLimit.sleepMs);
  });

  const count = writeObjectsToSheet(APP.sheets.SUPPLY_PACKAGES, rows);
  writeLog({
    startedAt,
    finishedAt:   new Date(),
    functionName: 'loadSupplyPackages',
    status:       'OK',
    cabinet:      'ВСЕ',
    rowsLoaded:   count
  });
  SpreadsheetApp.getActive().toast(`Упаковка: ${count} строк`, '📦 Упаковка', 3);
  return count;
}

// ============================================================
// ГРУППОВЫЕ ОБНОВЛЕНИЯ
// ============================================================

/** Обновить все Финансы: отчёт + баланс */
function loadAllFinance() {
  loadFinance();
  loadBalance();
  SpreadsheetApp.getActive().toast('Финансы обновлены', '💳 Финансы', 3);
}

/** Обновить все Поставки: список + детали + товары + упаковка */
function loadAllSupplies() {
  loadSupplies();
  loadSupplyDetails();
  loadSupplyGoods();
  loadSupplyPackages();
  SpreadsheetApp.getActive().toast('Поставки обновлены полностью', '🚚 Поставки', 3);
}

/** Обновить все Отчёты: расходы + ДДР */
function loadAllReports() {
  buildExpensesFromFinance();
  buildDDR();
  SpreadsheetApp.getActive().toast('Отчёты обновлены', '📈 Отчёты', 3);
}
