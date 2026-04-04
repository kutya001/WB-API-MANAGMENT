/**
 * ============================================================
 * 07_08_Supplies_Ads.gs — Поставки FBW и Рекламные расходы
 * ============================================================
 * Содержит:
 *  - loadSupplies()       — Supplies API список поставок
 *  - _getSupplyTasks()    — хелпер: чтение поставок для доп. запросов
 *  - loadSupplyDetails()  — Supplies API товары поставки (по артикулам и баркодам)
 *  - loadAdExpenses()     — Promotion API история затрат на рекламу
 * ============================================================
 */

// ============================================================
// ПОСТАВКИ FBW — Supplies API
// ============================================================

/**
 * Загружает список поставок FBW.
 * Записывает в лист Поставки_ВБ.
 *
 * API: POST /api/v1/supplies
 * Пагинация: offset-based (limit/offset — query-параметры)
 * Лимит: 30 запросов/мин, интервал 2 сек
 */
function loadSupplies() {
  const startedAt = new Date();
  const apiKeys = getApiKeys();
  const rows = [];

  const dateFrom  = parseDateToIso(getSetting(APP.settings.SUPPLIES_DATE_FROM, '2026-03-01'), '2026-03-01');
  const dateTo    = parseDateToIso(getSetting(APP.settings.SUPPLIES_DATE_TO,   '2026-04-30'), '2026-04-30');
  const dateType  = getSetting(APP.settings.SUPPLIES_DATE_TYPE, 'factDate');
  const statusRaw = getSetting(APP.settings.SUPPLIES_STATUS_IDS, '');
  const statusIDs = statusRaw ? statusRaw.split(',').map(s => Number(s.trim())).filter(Boolean) : [];
  const limit     = Math.min(Number(getSetting(APP.settings.SUPPLIES_LIMIT, '1000')) || 1000, 1000);

  apiKeys.forEach(item => {
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      // Body: dates + statusIDs (top-level); limit/offset — query-параметры
      const payload = {
        dates: [{
          dateFrom: dateFrom + 'T00:00:00Z',
          dateTo:   dateTo   + 'T23:59:59Z',
          dateType: dateType
        }]
      };
      if (statusIDs.length) payload.statusIDs = statusIDs;

      let resp;
      try {
        resp = wbRequest('supplies', '/api/v1/supplies', 'POST', payload, item.apiKey, { limit, offset });
      } catch (e) {
        Logger.log(`[loadSupplies] Кабинет "${item.cabinet}": ${e.message}`);
        hasMore = false;
        break;
      }

      const supplies = Array.isArray(resp) ? resp : [];
      if (!supplies.length) { hasMore = false; break; }

      supplies.forEach(s => {
        rows.push({
          cabinet:       item.cabinet,
          supplyID:      pickString(s, ['supplyID', 'supplyId', 'ID', 'id']),
          preorderID:    pickString(s, ['preorderID', 'preorderId']),
          createDate:    formatDateRu(s.createDate),
          supplyDate:    formatDateRu(s.supplyDate),
          factDate:      formatDateRu(s.factDate),
          updatedDate:   formatDateRu(s.updatedDate),
          statusID:      pickNumber(s, ['statusID', 'statusId']),
          boxTypeID:     pickNumber(s, ['boxTypeID', 'boxTypeId']),
          isBoxOnPallet: s.isBoxOnPallet ? 'Да' : 'Нет'
        });
      });

      // Пагинация: offset-based — выходим когда записей меньше лимита
      if (supplies.length < limit) { hasMore = false; break; }
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
  SpreadsheetApp.getActive().toast(`Поставки: ${count} строк`, '📦 Поставки', 3);
  return count;
}

/**
 * Читает лист ПОСТАВКИ_ВБ и возвращает задачи для дозагрузки деталей.
 * Каждая задача = { cabinet, supplyID, apiKey }.
 * @returns {{ cabinet: string, supplyID: string, apiKey: string }[]}
 */
function _getSupplyTasks() {
  const suppliesData = readSheetAsObjects(APP.sheets.SUPPLIES);
  const apiKeys = getApiKeys();

  // Маппинг: кабинет → apiKey
  const keyMap = {};
  apiKeys.forEach(k => { keyMap[k.cabinet] = k.apiKey; });

  const tasks = [];
  suppliesData.forEach(row => {
    const cabinet  = String(row['Кабинет'] || row.cabinet || '').trim();
    const supplyID = String(row['ID поставки'] || row.supplyID || '').trim();
    const apiKey   = keyMap[cabinet];
    if (cabinet && supplyID && apiKey) {
      tasks.push({ cabinet, supplyID, apiKey });
    }
  });

  return tasks;
}

/**
 * Загружает товары каждой поставки (GET /api/v1/supplies/{ID}/goods).
 * Детализация по артикулам и баркодам.
 * Записывает в лист Поставки_Детализация_ВБ.
 *
 * API: https://supplies-api.wildberries.ru/api/v1/supplies/{ID}/goods
 * Лимит: 30 запросов/мин, интервал 2 сек
 * Пагинация: offset-based (limit + offset)
 */
function loadSupplyDetails() {
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
        Logger.log(`[loadSupplyDetails] supplyID=${task.supplyID} offset=${offset}: ${e.message}`);
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

      if (resp.length < limit) { hasNext = false; break; }
      offset += limit;
      Utilities.sleep(2100);
    }

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
  SpreadsheetApp.getActive().toast(`Детализация поставок: ${count} строк`, '📦 Детали', 3);
  return count;
}

// ============================================================
// РЕКЛАМНЫЕ РАСХОДЫ — Promotion API
// ============================================================

/**
 * Загружает историю затрат на рекламу по дням.
 * Записывает в лист Рекламные_расходы.
 *
 * API: POST /adv/v1/fullstats
 * Лимит: 10 запросов/мин
 * Токен: категория "Продвижение"
 *
 * Алгоритм:
 *  1. Получаем список кампаний (GET /adv/v1/promotion/adverts)
 *  2. Для каждых 100 кампаний запрашиваем статистику (POST /adv/v1/fullstats)
 *  3. Разворачиваем по дням
 */
function loadAdExpenses() {
  const startedAt = new Date();
  const apiKeys  = getApiKeys();
  const dateFrom = parseDateToIso(getSetting(APP.settings.PROMO_DATE_FROM, '2026-04-01'), '2026-04-01');
  const dateTo   = parseDateToIso(getSetting(APP.settings.PROMO_DATE_TO,   '2026-04-30'), '2026-04-30');
  const rows     = [];

  apiKeys.forEach(item => {
    // Шаг 1: Получить список кампаний
    let campaigns;
    try {
      campaigns = wbRequest('promotion', '/adv/v1/promotion/adverts', 'GET', null, item.apiKey);
    } catch (e) {
      Logger.log(`[loadAdExpenses] Список кампаний, кабинет "${item.cabinet}": ${e.message}`);
      return;
    }

    if (!campaigns || !Array.isArray(campaigns) || !campaigns.length) return;

    // Маппинг advertId → { name, type, status }
    const campMap = {};
    campaigns.forEach(c => {
      const id = c.advertId || c.id || 0;
      campMap[id] = {
        name:   c.name   || c.advertName || '',
        type:   c.type   || 0,
        status: c.status || 0
      };
    });

    const advertIds = Object.keys(campMap).map(Number).filter(Boolean);

    // Шаг 2: Запросить fullstats батчами по 100
    for (let i = 0; i < advertIds.length; i += 100) {
      const batch = advertIds.slice(i, i + 100);

      let stats;
      try {
        stats = wbRequest('promotion', '/adv/v1/fullstats', 'POST', batch, item.apiKey, {
          dateFrom, dateTo
        });
      } catch (e) {
        Logger.log(`[loadAdExpenses] fullstats batch ${i}, кабинет "${item.cabinet}": ${e.message}`);
        Utilities.sleep(WB_API.promotion.rateLimit.sleepMs);
        continue;
      }

      if (!stats || !Array.isArray(stats)) {
        Utilities.sleep(WB_API.promotion.rateLimit.sleepMs);
        continue;
      }

      // Шаг 3: Развернуть по дням
      stats.forEach(campStat => {
        const advId = campStat.advertId || 0;
        const info  = campMap[advId] || {};
        const days  = campStat.days || [];

        days.forEach(day => {
          const apps = day.apps || [day];
          apps.forEach(app => {
            rows.push({
              cabinet:    item.cabinet,
              date:       formatDateOnlyRu(day.date),
              advertId:   advId,
              advertName: info.name,
              type:       info.type,
              status:     info.status,
              views:      pickNumber(app, ['views']),
              clicks:     pickNumber(app, ['clicks']),
              ctr:        pickNumber(app, ['ctr']),
              cpc:        pickNumber(app, ['cpc']),
              sum:        pickNumber(app, ['sum']),
              atbs:       pickNumber(app, ['atbs']),
              orders:     pickNumber(app, ['orders']),
              cr:         pickNumber(app, ['cr']),
              shks:       pickNumber(app, ['shks']),
              sum_price:  pickNumber(app, ['sum_price'])
            });
          });
        });
      });

      Utilities.sleep(WB_API.promotion.rateLimit.sleepMs);
    }

    markApiUsed(item.row);
  });

  const count = writeObjectsToSheet(APP.sheets.AD_EXPENSES, rows);
  writeLog({
    startedAt,
    finishedAt:   new Date(),
    functionName: 'loadAdExpenses',
    status:       'OK',
    cabinet:      'ВСЕ',
    rowsLoaded:   count
  });
  SpreadsheetApp.getActive().toast(`Рекламные расходы: ${count} строк`, '📣 Реклама', 3);
  return count;
}

// ============================================================
// ГРУППОВЫЕ ОБНОВЛЕНИЯ
// ============================================================

/** Обновить все Поставки: список + детализация по товарам */
function loadAllSupplies() {
  loadSupplies();
  loadSupplyDetails();
  SpreadsheetApp.getActive().toast('Поставки обновлены', '🚚 Поставки', 3);
}
