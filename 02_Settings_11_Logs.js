/**
 * ============================================================
 * 02_Settings.gs — Работа с листом НАСТРОЙКИ
 * ============================================================
 */

/**
 * Инициализирует лист НАСТРОЙКИ значениями по умолчанию.
 * Если лист уже существует — перезаписывает только пустые ячейки значения.
 *
 * Структура листа:
 *   A — Ключ настройки
 *   B — Значение
 *   C — Группа (Общие / Заказы / Продажи / и т.д.)
 *   D — Описание
 */
function initSettingsSheet() {
  const ss    = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(APP.sheets.SETTINGS) || ss.insertSheet(APP.sheets.SETTINGS);

  sheet.clearContents();

  // Заголовок
  const rows = [['КЛЮЧ', 'ЗНАЧЕНИЕ', 'ГРУППА', 'ОПИСАНИЕ']];

  DEFAULT_SETTINGS.forEach(s => {
    rows.push([s.key, s.value, s.group || '', s.description || '']);
  });

  const range = sheet.getRange(1, 1, rows.length, rows[0].length);
  range.setValues(rows);

  // Форматирование заголовка
  sheet.getRange(1, 1, 1, 4)
    .setFontWeight('bold')
    .setBackground('#2d5be3')
    .setFontColor('#ffffff');

  // Чередующиеся строки по группам
  let lastGroup = '';
  let colorToggle = false;
  for (let i = 1; i < rows.length; i++) {
    const group = rows[i][2];
    if (group !== lastGroup) {
      colorToggle = !colorToggle;
      lastGroup = group;
      // Заголовок группы
      sheet.getRange(i + 1, 3).setFontWeight('bold');
    }
    sheet.getRange(i + 1, 1, 1, 4).setBackground(colorToggle ? '#f0f4ff' : '#ffffff');
  }

  // Ширина колонок
  sheet.setColumnWidth(1, 220);
  sheet.setColumnWidth(2, 150);
  sheet.setColumnWidth(3, 100);
  sheet.setColumnWidth(4, 400);

  SpreadsheetApp.getActive().toast('Лист НАСТРОЙКИ создан / обновлён', '✅ Готово', 3);
}

/**
 * Читает все настройки из листа НАСТРОЙКИ в Map.
 *
 * @returns {Object.<string, string>} - Словарь { ключ: значение }
 * @throws {Error} Если лист не найден
 */
function getSettingsMap() {
  const ss    = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(APP.sheets.SETTINGS);

  if (!sheet) {
    throw new Error('Лист "НАСТРОЙКИ" не найден. Запустите: ⚙️ Создать лист НАСТРОЙКИ');
  }

  const data = sheet.getDataRange().getValues();
  const map  = {};

  for (let i = 1; i < data.length; i++) {
    const key = String(data[i][0] || '').trim();
    if (!key) continue;

    let value = data[i][1];

    // Если Google Sheets распарсил как Date
    if (value instanceof Date && !isNaN(value.getTime())) {
      value = Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    } else {
      value = String(value || '').replace(/\u00A0/g, ' ').trim();
    }

    map[key] = value;
  }

  return map;
}

/**
 * Получить одно значение настройки.
 *
 * @param {string} key
 * @param {string} [defaultValue='']
 * @returns {string}
 */
function getSetting(key, defaultValue) {
  try {
    const map = getSettingsMap();
    return (map[key] !== undefined && map[key] !== '') ? map[key] : (defaultValue || '');
  } catch (e) {
    return defaultValue || '';
  }
}

/**
 * Инициализирует лист МЕТАДАННЫЕ — документация всех полей всех листов.
 * Полезно для онбординга и поддержки.
 */
function initMetadataSheet() {
  const sheet = getOrCreateSheet(APP.sheets.METADATA);
  sheet.clearContents();

  const rows = [['Лист', 'Техническое поле', 'Русское название', 'Описание']];

  Object.keys(SHEET_SCHEMAS).forEach(sheetName => {
    const schema = SHEET_SCHEMAS[sheetName];
    schema.keys.forEach(key => {
      rows.push([
        sheetName,
        key,
        schema.titles[key] || key,
        (schema.desc && schema.desc[key]) ? schema.desc[key] : ''
      ]);
    });
  });

  sheet.getRange(1, 1, rows.length, 4).setValues(rows);
  sheet.getRange(1, 1, 1, 4).setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
  sheet.setFrozenRows(1);

  [200, 180, 200, 400].forEach((w, i) => sheet.setColumnWidth(i + 1, w));
  SpreadsheetApp.getActive().toast('Метаданные обновлены', '📘 Готово', 3);
}

// ============================================================
// РУЧНЫЕ ЛИСТЫ — создание листов для ручного ввода
// ============================================================

/** Список имён ручных листов */
const MANUAL_SHEET_NAMES = [
  APP.sheets.PRODUCTS,
  APP.sheets.PLANNING,
  APP.sheets.SEWING_LAUNCH,
  APP.sheets.SEWING_OUTPUT,
  APP.sheets.FULFILLMENT
];

/**
 * Создаёт (или пересоздаёт заголовки) одного ручного листа по имени.
 * Если лист уже существует и содержит данные — пишет только заголовки в строку 1.
 * Если листа нет — создаёт, пишет заголовки и форматирует.
 *
 * @param {string} sheetName — техническое имя листа из APP.sheets
 * @returns {{ ok: boolean, message: string }}
 */
function initManualSheet(sheetName) {
  if (!MANUAL_SHEET_NAMES.includes(sheetName)) {
    return { ok: false, message: 'Лист "' + sheetName + '" не входит в список ручных листов.' };
  }
  const schema = SHEET_SCHEMAS[sheetName];
  if (!schema) {
    return { ok: false, message: 'Схема для "' + sheetName + '" не найдена в SHEET_SCHEMAS.' };
  }

  const sheet = getOrCreateSheet(sheetName);
  const headers = schema.keys.map(k => schema.titles[k] || k);

  // Записать заголовки
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold')
    .setBackground('#1a1a2e')
    .setFontColor('#ffffff');
  sheet.setFrozenRows(1);

  SpreadsheetApp.getActive().toast('Лист "' + sheetName + '" готов к заполнению', '📝 Готово', 3);
  return { ok: true, message: 'Лист "' + sheetName + '" создан / заголовки обновлены.' };
}

/**
 * Создаёт все ручные листы за один вызов.
 * @returns {{ ok: boolean, message: string }}
 */
function initAllManualSheets() {
  const results = [];
  MANUAL_SHEET_NAMES.forEach(name => {
    const r = initManualSheet(name);
    results.push(name + ': ' + (r.ok ? '✅' : '❌ ' + r.message));
  });
  SpreadsheetApp.getActive().toast('Созданы ручные листы: ' + MANUAL_SHEET_NAMES.length, '📝 Готово', 3);
  return { ok: true, message: results.join('\n') };
}

// ============================================================
// 11_Logs.gs — Система логирования
// ============================================================

/**
 * Записывает запись лога в лист ЛОГИ.
 *
 * Структура записи:
 *  - startedAt:    Время начала (дд.мм.гггг чч:мм:сс)
 *  - finishedAt:   Время завершения
 *  - durationSec:  Длительность в секундах
 *  - functionName: Имя функции
 *  - status:       'OK' | 'ERROR' | 'PARTIAL'
 *  - cabinet:      Название кабинета (или 'ВСЕ')
 *  - rowsLoaded:   Кол-во загруженных строк
 *  - errorMessage: Текст ошибки (если есть)
 *
 * @param {Object} params
 * @param {Date} params.startedAt
 * @param {Date} params.finishedAt
 * @param {string} params.functionName
 * @param {string} params.status
 * @param {string} [params.cabinet]
 * @param {number} [params.rowsLoaded]
 * @param {string} [params.errorMessage]
 */
function writeLog(params) {
  try {
    const sheet = getOrCreateSheet(APP.sheets.LOGS);

    // Создаём заголовок если лист пуст
    if (sheet.getLastRow() === 0) {
      const headers = getReadableHeaders(APP.sheets.LOGS);
      if (headers.length) {
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
        sheet.getRange(1, 1, 1, headers.length)
          .setFontWeight('bold')
          .setBackground('#1a1a2e')
          .setFontColor('#ffffff');
        sheet.setFrozenRows(1);
      }
    }

    const start  = params.startedAt || new Date();
    const finish = params.finishedAt || new Date();
    const durSec = Math.round((finish.getTime() - start.getTime()) / 1000);

    // Словарь читаемых названий функций
    const FUNC_NAMES = {
      loadArticles:           'Арт. каталог',
      loadArticleBarcodes:    'Арт. баркоды',
      loadOrders:             'Заказы',
      loadSales:              'Продажи',
      loadSupplies:           'Поставки',
      loadSupplyDetails:      'Детализация поставок',
      loadAdExpenses:         'Реклам. расходы',
      buildStocksCalc:        'Расчёт остатков',
      loadAll:                'Полное обновление',
      loadAllGoods:           'Все товары',
      loadAllOrdersSales:     'Заказы+Продажи',
      loadAllSupplies:        'Все поставки'
    };

    // Словарь целевых листов
    const FUNC_SHEETS = {
      loadArticles:           APP.sheets.ARTICLES,
      loadArticleBarcodes:    APP.sheets.ARTICLE_BARCODES,
      loadOrders:             APP.sheets.ORDERS,
      loadSales:              APP.sheets.SALES,
      loadSupplies:           APP.sheets.SUPPLIES,
      loadSupplyDetails:      APP.sheets.SUPPLY_DETAILS,
      loadAdExpenses:         APP.sheets.AD_EXPENSES,
      buildStocksCalc:        APP.sheets.STOCKS_CALC
    };

    const funcName = params.functionName || '';

    const row = [
      formatDateRu(start),
      formatDateRu(finish),
      durSec,
      funcName,
      params.funcDisplayName || FUNC_NAMES[funcName] || '',
      params.targetSheet     || FUNC_SHEETS[funcName] || '',
      params.status || 'OK',
      params.cabinet || 'ВСЕ',
      params.rowsLoaded || 0,
      params.errorMessage || ''
    ];

    sheet.appendRow(row);

    // Подсветка ошибок красным
    if (params.status === 'ERROR') {
      const lastRow = sheet.getLastRow();
      sheet.getRange(lastRow, 1, 1, row.length).setBackground('#ffe0e0');
    }

  } catch (logErr) {
    // Логирование не должно ломать основной процесс
    Logger.log('[writeLog] Ошибка записи лога: ' + logErr.message);
  }
}

/**
 * Декоратор для логирования функции-загрузчика.
 * Оборачивает вызов, измеряет время, пишет лог.
 *
 * @param {string} funcName - Имя функции для лога
 * @param {string} cabinet  - Кабинет (или 'ВСЕ')
 * @param {Function} fn     - Функция для выполнения
 * @returns {{ rowsLoaded: number, error: string|null }}
 *
 * ПРИМЕР:
 *   const result = withLog('loadSales', 'Кабинет 1', () => {
 *     // ... логика ...
 *     return rowsCount;
 *   });
 */
function withLog(funcName, cabinet, fn) {
  const startedAt = new Date();
  let rowsLoaded  = 0;
  let errorMsg    = null;
  let status      = 'OK';

  try {
    const result = fn();
    rowsLoaded = (typeof result === 'number') ? result : 0;
  } catch (e) {
    errorMsg = e.message;
    status   = 'ERROR';
    Logger.log(`[${funcName}] ОШИБКА: ${e.message}`);
  }

  writeLog({
    startedAt,
    finishedAt:   new Date(),
    functionName: funcName,
    status,
    cabinet,
    rowsLoaded,
    errorMessage: errorMsg
  });

  return { rowsLoaded, error: errorMsg };
}

/**
 * Очищает лог (оставляет только заголовок).
 */
function clearLogs() {
  const ss    = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(APP.sheets.LOGS);
  if (!sheet) return;

  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.deleteRows(2, lastRow - 1);
  }

  SpreadsheetApp.getActive().toast('Логи очищены', '🗑️ Готово', 2);
}
