/**
 * ============================================================
 * 12_Menu.gs — Меню Google Sheets и точка входа
 * ============================================================
 * Создаёт меню "🛍️ WB Учёт" при открытии таблицы.
 * Содержит loadAll() — полный цикл обновления данных.
 * doGet() — точка входа для веб-приложения (мобильный/ПК).
 * ============================================================
 */

// ============================================================
// WEB APP — для доступа с мобильных и ПК
// ============================================================

/**
 * Точка входа для веб-приложения (deploy as web app).
 * Позволяет открывать UI как отдельную страницу по URL.
 *
 * Деплой: Extensions → Apps Script → Deploy → New deployment → Web app
 *
 * @param {Object} e - Параметры запроса (GET)
 * @returns {HtmlOutput}
 */
function doGet(e) {
  return HtmlService.createTemplateFromFile('WB_manager')
    .evaluate()
    .setTitle('🛍️ WB Менеджер')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Автоматически вызывается при открытии таблицы.
 * Создаёт меню "🛍️ WB Учёт" в панели Google Sheets.
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();

  ui.createMenu('🛍️ WB Учёт')

    // --- Настройка ---
    .addItem('⚙️ Создать / обновить НАСТРОЙКИ', 'initSettingsSheet')
    .addItem('📘 Обновить МЕТАДАННЫЕ',           'initMetadataSheet')
    .addItem('📊 Открыть управление (UI)',        'showSidebar')
    .addItem('🌐 WB Менеджер (полный интерфейс)', 'showWbManager')
    .addSeparator()

    // --- Артикулы ---
    .addSubMenu(
      ui.createMenu('📦 Артикулы')
        .addItem('🔄 Все артикулы',        'loadAllGoods')
        .addSeparator()
        .addItem('📋 Артикулы (каталог)',   'loadArticles')
        .addItem('🔗 Артикул-Баркоды',     'loadArticleBarcodes')
    )

    // --- Поставки FBW ---
    .addSubMenu(
      ui.createMenu('🚚 Поставки FBW')
        .addItem('📦 Все поставки',         'loadAllSupplies')
        .addSeparator()
        .addItem('📦 Список поставок',      'loadSupplies')
        .addItem('📋 Детализация поставок', 'loadSupplyDetails')
    )

    // --- Заказы и продажи ---
    .addSubMenu(
      ui.createMenu('🛒 Заказы и Продажи')
        .addItem('📊 Все заказы+продажи', 'loadAllOrdersSales')
        .addSeparator()
        .addItem('📊 Заказы',   'loadOrders')
        .addItem('💰 Продажи',  'loadSales')
    )

    // --- Реклама ---
    .addItem('📣 Рекламные расходы', 'loadAdExpenses')

    // --- Расчёты ---
    .addItem('📊 Рассчитать остатки', 'buildStocksCalc')

    // --- Ручные листы ---
    .addSubMenu(
      ui.createMenu('📝 Ручные листы')
        .addItem('📝 Создать ВСЕ ручные листы', 'initAllManualSheets')
        .addSeparator()
        .addItem('🏷️ Товары',                'initManualSheet_Products')
        .addItem('📅 Планирование',           'initManualSheet_Planning')
        .addItem('✂️ Запуск ШВ',              'initManualSheet_SewingLaunch')
        .addItem('📦 Выпуск ШВ',              'initManualSheet_SewingOutput')
        .addItem('📋 Фуллфилмент и упаковка', 'initManualSheet_Fulfillment')
    )

    // --- Общие действия ---
    .addSeparator()
    .addItem('🚀 Обновить ВСЁ',  'loadAll')
    .addItem('🗑️ Очистить логи', 'clearLogs')

    .addToUi();
}

// ============================================================
// SIDEBAR (HTML-панель управления)
// ============================================================

/**
 * Открывает HTML-боковую панель управления.
 * Код интерфейса — в файле 10_UI.gs
 */
function showSidebar() {
  const html = HtmlService.createTemplateFromFile('Sidebar')
    .evaluate()
    .setTitle('🛍️ WB Учёт — Управление')
    .setWidth(380);

  SpreadsheetApp.getUi().showSidebar(html);
}

/**
 * Открывает полноценный менеджер WB в модальном диалоге.
 * Вызывается из Sidebar.html или из меню.
 */
function showWbManager() {
  const html = HtmlService.createTemplateFromFile('WB_manager')
    .evaluate()
    .setTitle('🛍️ WB Менеджер')
    .setWidth(1100)
    .setHeight(700);

  SpreadsheetApp.getUi().showModalDialog(html, '🛍️ WB Менеджер');
}

/**
 * Возвращает данные для Sidebar: настройки + статус листов + последнее обновление.
 * Вызывается из клиентского JS через google.script.run.
 *
 * @returns {Object} - { settings, sheets }
 */
function getSidebarData() {
  let settings = {};
  try { settings = getSettingsMap(); } catch (e) { settings = {}; }

  // Получаем время последнего обновления из ЛОГИ
  const lastUpdates = _getSheetLastUpdates();

  // Статус листов (есть/нет, кол-во строк, последнее обновление)
  const ss = SpreadsheetApp.getActive();
  const sheetsStatus = {};

  Object.values(APP.sheets).forEach(name => {
    const sheet = ss.getSheetByName(name);
    sheetsStatus[name] = sheet
      ? { exists: true, rows: Math.max(0, sheet.getLastRow() - 1), lastUpdate: lastUpdates[name] || '' }
      : { exists: false, rows: 0, lastUpdate: '' };
  });

  return { settings, sheets: sheetsStatus };
}

/**
 * Возвращает словарь { листName: lastUpdate } из листа ЛОГИ.
 * Ищет последний успешный лог для каждого целевого листа.
 * @returns {Object.<string, string>}
 */
function _getSheetLastUpdates() {
  const result = {};
  try {
    const ss = SpreadsheetApp.getActive();
    const logSheet = ss.getSheetByName(APP.sheets.LOGS);
    if (!logSheet || logSheet.getLastRow() < 2) return result;

    const data = logSheet.getDataRange().getValues();
    // Колонки: startedAt(0), finishedAt(1), dur(2), funcName(3), displayName(4), targetSheet(5), status(6)
    for (let i = data.length - 1; i >= 1; i--) {
      const targetSheet = String(data[i][5] || '').trim();
      const status = String(data[i][6] || '').trim();
      if (targetSheet && status === 'OK' && !result[targetSheet]) {
        result[targetSheet] = String(data[i][1] || '');
      }
    }
  } catch (e) {
    Logger.log('[_getSheetLastUpdates] ' + e.message);
  }
  return result;
}

/**
 * Возвращает список кабинетов и их выбранное состояние.
 * @returns {{ name: string, selected: boolean }[]}
 */
function getSidebarCabinets() {
  try { return getCabinetList(); }
  catch (e) { return []; }
}

/**
 * Сохраняет выбранные кабинеты из Sidebar.
 * @param {string[]} cabinets
 * @returns {{ ok: boolean }}
 */
function saveCabinetsFromSidebar(cabinets) {
  try {
    saveCabinetSelection(cabinets || []);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

/**
 * Возвращает SHEET_SCHEMAS для автогенерации справки в Sidebar.
 * @returns {Object} - { sheetName: { keys, titles, desc } }
 */
function getSidebarSchemas() {
  const out = {};
  Object.keys(SHEET_SCHEMAS).forEach(name => {
    const s = SHEET_SCHEMAS[name];
    out[name] = { keys: s.keys, titles: s.titles, desc: s.desc || {} };
  });
  return out;
}

/**
 * Навигация к листу по имени. Вызывается из Sidebar при клике на лист.
 * @param {string} sheetName
 */
function goToSheetByName(sheetName) {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(sheetName);
  if (sheet) ss.setActiveSheet(sheet);
}

/**
 * Запускает произвольную функцию-загрузчик из Sidebar.
 * Вызывается из JS sidebar через google.script.run.
 *
 * @param {string} funcName - Имя функции ('loadSales', 'loadAdExpenses' и т.д.)
 * @returns {{ ok: boolean, message: string }}
 */
function runFromSidebar(funcName) {
  // Белый список допустимых функций (защита от инъекций)
  const allowed = [
    'loadArticles', 'loadArticleBarcodes',
    'loadOrders', 'loadSales',
    'loadSupplies', 'loadSupplyDetails',
    'loadAdExpenses', 'buildStocksCalc',
    'initSettingsSheet', 'initMetadataSheet',
    'initManualSheet_Products', 'initManualSheet_Planning',
    'initManualSheet_SewingLaunch', 'initManualSheet_SewingOutput',
    'initManualSheet_Fulfillment', 'initAllManualSheets',
    'clearLogs', 'loadAll',
    'loadAllGoods', 'loadAllOrdersSales', 'loadAllSupplies'
  ];

  if (!allowed.includes(funcName)) {
    return { ok: false, message: `Функция "${funcName}" не разрешена.` };
  }

  try {
    const fn = this[funcName];
    if (typeof fn !== 'function') {
      return { ok: false, message: `Функция "${funcName}" не найдена.` };
    }
    fn();
    return { ok: true, message: `"${funcName}" выполнена успешно.` };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

/**
 * Сохраняет настройки из Sidebar в лист НАСТРОЙКИ.
 *
 * @param {Object} newSettings - { ключ: значение }
 * @returns {{ ok: boolean }}
 */
function saveSettingsFromSidebar(newSettings) {
  try {
    const ss    = SpreadsheetApp.getActive();
    const sheet = ss.getSheetByName(APP.sheets.SETTINGS);
    if (!sheet) throw new Error('Лист НАСТРОЙКИ не найден');

    const data = sheet.getDataRange().getValues();

    Object.entries(newSettings).forEach(([key, value]) => {
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]).trim() === key) {
          sheet.getRange(i + 1, 2).setValue(value);
          break;
        }
      }
    });

    return { ok: true };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

// ============================================================
// УПРАВЛЕНИЕ API ТОКЕНАМИ (из Sidebar)
// ============================================================

/**
 * Возвращает список кабинетов для отображения в UI.
 * Токены маскируются (первые 8 символов + ...).
 * @returns {{ name: string, tokenPreview: string, lastUsed: string, row: number }[]}
 */
function getApiKeysForSidebar() {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(APP.sheets.API);
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  const result = [];

  for (let i = 1; i < data.length; i++) {
    const name  = String(data[i][0] || '').trim();
    const token = String(data[i][1] || '').trim();
    const used  = data[i][2] || '';

    if (name || token) {
      result.push({
        name:         name,
        tokenPreview: token ? token.substring(0, 8) + '...' : '',
        lastUsed:     used ? formatDateRu(used) : '',
        row:          i + 1
      });
    }
  }
  return result;
}

/**
 * Добавляет новый кабинет (API-ключ) в лист API.
 * @param {string} name - Название кабинета
 * @param {string} token - API токен WB
 * @returns {{ ok: boolean, message: string }}
 */
function addApiKeyFromSidebar(name, token) {
  if (!name || !name.trim())   return { ok: false, message: 'Укажите название кабинета' };
  if (!token || !token.trim()) return { ok: false, message: 'Укажите API токен' };

  const ss = SpreadsheetApp.getActive();
  let sheet = ss.getSheetByName(APP.sheets.API);

  if (!sheet) {
    sheet = ss.insertSheet(APP.sheets.API);
    sheet.getRange(1, 1, 1, 3).setValues([['Кабинет', 'API Ключ', 'Последнее использование']]);
    sheet.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#2d5be3').setFontColor('#ffffff');
  }

  // Проверка дубликатов
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim().toLowerCase() === name.trim().toLowerCase()) {
      return { ok: false, message: 'Кабинет "' + name.trim() + '" уже существует' };
    }
  }

  sheet.appendRow([name.trim(), token.trim(), '']);
  return { ok: true, message: 'Кабинет "' + name.trim() + '" добавлен' };
}

/**
 * Удаляет кабинет (строку) из листа API.
 * @param {number} row - Номер строки (1-based)
 * @returns {{ ok: boolean, message: string }}
 */
function removeApiKeyFromSidebar(row) {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(APP.sheets.API);
  if (!sheet) return { ok: false, message: 'Лист API не найден' };

  if (row < 2 || row > sheet.getLastRow()) {
    return { ok: false, message: 'Неверный номер строки' };
  }

  const name = sheet.getRange(row, 1).getValue();
  sheet.deleteRow(row);
  return { ok: true, message: 'Кабинет "' + name + '" удалён' };
}

/**
 * Проверяет валидность API-токена через ping.
 * @param {string} token
 * @returns {{ ok: boolean, message: string }}
 */
function validateApiToken(token) {
  if (!token || !token.trim()) return { ok: false, message: 'Токен пуст' };

  try {
    const resp = UrlFetchApp.fetch('https://common-api.wildberries.ru/ping', {
      method: 'get',
      headers: { 'Authorization': token.trim() },
      muteHttpExceptions: true
    });
    const code = resp.getResponseCode();
    if (code === 200) return { ok: true, message: 'Токен валиден' };
    return { ok: false, message: 'Токен невалиден (HTTP ' + code + ')' };
  } catch (e) {
    return { ok: false, message: 'Ошибка проверки: ' + e.message };
  }
}

// ============================================================
// ПОЛНЫЙ ЦИКЛ ЗАГРУЗКИ
// ============================================================

/**
 * Запускает полный цикл загрузки данных.
 *
 * ПОРЯДОК ВАЖЕН:
 *   1. Артикулы (база для всего)
 *   2. Поставки FBW (нужны supplyID для деталей)
 *   3. Детализация поставок (товары по поставкам)
 *   4. Заказы
 *   5. Продажи
 *   6. Рекламные расходы
 *   7. Расчёт остатков (из поставок и продаж)
 *
 * ВНИМАНИЕ: Statistics API — 1 запрос/мин.
 * Полный цикл на 3 кабинета ≈ 15-30 минут.
 * GAS-скрипт имеет ограничение 6 минут на выполнение.
 * Для больших данных используй отдельные кнопки или trigger.
 */
function loadAll() {
  const startedAt = new Date();
  SpreadsheetApp.getActive().toast('Запуск полного обновления...', '🚀 WB Учёт', 5);

  try {
    loadArticles();
    loadArticleBarcodes();
    loadSupplies();
    loadSupplyDetails();
    loadOrders();
    loadSales();
    loadAdExpenses();
    buildStocksCalc();

    const durSec = Math.round((new Date() - startedAt) / 1000);
    writeLog({
      startedAt,
      finishedAt:   new Date(),
      functionName: 'loadAll',
      status:       'OK',
      cabinet:      'ВСЕ',
      rowsLoaded:   0,
      errorMessage: `Выполнено за ${durSec} сек.`
    });

    SpreadsheetApp.getActive().toast(
      `Полное обновление завершено за ${durSec} сек.`,
      '✅ Готово', 5
    );

  } catch (e) {
    writeLog({
      startedAt,
      finishedAt:   new Date(),
      functionName: 'loadAll',
      status:       'ERROR',
      cabinet:      'ВСЕ',
      errorMessage: e.message
    });

    SpreadsheetApp.getUi().alert(`Ошибка при loadAll:\n${e.message}`);
  }
}

// ============================================================
// ОБЁРТКИ ДЛЯ МЕНЮ — создание отдельных ручных листов
// ============================================================
// GAS-меню не позволяет передавать аргументы, поэтому нужны обёртки.

function initManualSheet_Products()      { return initManualSheet(APP.sheets.PRODUCTS); }
function initManualSheet_Planning()      { return initManualSheet(APP.sheets.PLANNING); }
function initManualSheet_SewingLaunch()  { return initManualSheet(APP.sheets.SEWING_LAUNCH); }
function initManualSheet_SewingOutput()  { return initManualSheet(APP.sheets.SEWING_OUTPUT); }
function initManualSheet_Fulfillment()   { return initManualSheet(APP.sheets.FULFILLMENT); }
