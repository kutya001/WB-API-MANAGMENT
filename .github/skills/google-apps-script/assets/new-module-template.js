/**
 * ============================================================
 *  NN_ModuleName.js — Описание модуля
 * ============================================================
 *  Загружает [что загружает] из [какой API] для всех кабинетов.
 *
 *  API:  [apiType] — [base URL]
 *  Лист: [SHEET_NAME]
 *  Rate: [X req/min] → sleepMs = [Y]
 * ============================================================
 */

// ─── Публичная функция-загрузчик ───────────────────────────

/**
 * Загружает данные из [API] для всех активных кабинетов.
 * Результат записывается в лист [SHEET_NAME].
 */
function loadModuleName() {
  const cabinets = getApiKeys();
  const settings = getSettingsMap();
  let allRows = [];

  cabinets.forEach(cab => {
    withLog('loadModuleName', cab.name, () => {
      const raw = _fetchModuleData(cab.key, settings);
      const mapped = raw.map(item => _mapModuleItem(item, cab.name));
      allRows = allRows.concat(mapped);
    });
  });

  if (allRows.length) {
    writeObjectsToSheet(APP.sheets.MODULE_NAME, allRows);
    SpreadsheetApp.getActive().toast(
      `Загружено ${allRows.length} записей`, 'ModuleName', 5
    );
  }
}

// ─── Приватные функции ─────────────────────────────────────

/**
 * Получает сырые данные из API.
 * @param {string} apiKey — API-ключ кабинета
 * @param {Object} settings — настройки из листа НАСТРОЙКИ
 * @returns {Array<Object>}
 */
function _fetchModuleData(apiKey, settings) {
  const allItems = [];
  let page = 0;

  // TODO: выбери паттерн пагинации:
  //   - Курсор:  cursor = { updatedAt, nmID }
  //   - По дате: dateFrom = lastChangeDate
  //   - По ID:   rrdId = last rrd_id
  //   - Offset:  offset += limit

  while (page < (settings.maxPages || MAX_PAGES_PER_RUN)) {
    const data = wbRequest(
      'apiType',              // ключ из WB_API
      '/api/v1/endpoint',     // эндпоинт
      'GET',                  // метод
      null,                   // payload (для POST)
      apiKey,
      {
        dateFrom: parseDateToIso(settings.dateFrom_module, '2024-01-01'),
        // ...другие параметры
      }
    );

    if (!data || !data.length) break;

    allItems.push(...data);
    page++;

    Utilities.sleep(WB_API.apiType.sleepMs || 0);
  }

  return allItems;
}

/**
 * Маппит сырой объект API → объект для записи в лист.
 * Ключи должны совпадать с SHEET_SCHEMAS[SHEET_NAME].
 * @param {Object} raw — сырой объект из API
 * @param {string} cabinetName — имя кабинета
 * @returns {Object}
 */
function _mapModuleItem(raw, cabinetName) {
  return {
    cabinet:  cabinetName,
    // field1: pickString(raw, ['possibleKey1', 'possibleKey2']),
    // field2: pickNumber(raw, ['numKey1', 'numKey2']),
    // price:  round2(pickNumber(raw, ['totalPrice', 'price'])),
    // date:   formatDateRu(raw.date || raw.lastChangeDate),
  };
}

// ─── Чеклист интеграции ────────────────────────────────────
//
// [ ] 1. 00_Config.js → WB_API.apiType (если новый домен)
// [ ] 2. 00_Config.js → APP.sheets.MODULE_NAME = 'НАЗВАНИЕ_ЛИСТА'
// [ ] 3. 00_Config.js → SHEET_SCHEMAS['НАЗВАНИЕ_ЛИСТА'] = [...]
// [ ] 4. 00_Config.js → DEFAULT_SETTINGS.dateFrom_module (если нужно)
// [ ] 5. 12_Menu.js   → addItem('Загрузить X', 'loadModuleName')
// [ ] 6. 12_Menu.js   → whitelist runFromSidebar()
// [ ] 7. Sidebar.html → кнопка + описание
// [ ] 8. Тест через меню в Google Sheets
//
