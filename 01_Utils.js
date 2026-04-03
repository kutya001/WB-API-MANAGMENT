/**
 * ============================================================
 * 01_Utils.gs — Вспомогательные функции
 * ============================================================
 * Содержит:
 *  - API-роутер wbRequest()
 *  - Форматирование дат (СНГ формат дд.мм.гггг чч:мм:сс)
 *  - Запись/чтение листов
 *  - Математические хелперы
 * ============================================================
 */

// ============================================================
// СЕКЦИЯ: API-РОУТЕР
// ============================================================

/**
 * Универсальный роутер запросов к Wildberries API.
 *
 * @param {string} apiType    - Ключ из WB_API: 'content'|'statistics'|'marketplace'|'supplies'|'analytics'|'finance'
 * @param {string} endpoint   - Путь, например '/api/v1/supplier/sales'
 * @param {string} method     - HTTP метод: 'GET' | 'POST' | 'PUT' | 'DELETE'
 * @param {Object|null} payload - Тело запроса (для POST/PUT), null для GET
 * @param {string} apiKey     - Токен авторизации WB
 * @param {Object} [queryParams] - Дополнительные query-параметры (для GET)
 * @returns {Object|Array|null} - Распарсенный JSON-ответ или null при 204
 * @throws {Error} При HTTP-ошибке (4xx, 5xx)
 *
 * ПРИМЕР ИСПОЛЬЗОВАНИЯ:
 *   const data = wbRequest('statistics', '/api/v1/supplier/sales', 'GET', null, apiKey, {
 *     dateFrom: '2026-04-01'
 *   });
 */
function wbRequest(apiType, endpoint, method, payload, apiKey, queryParams) {
  // Валидация типа API
  if (!WB_API[apiType]) {
    throw new Error(`[wbRequest] Неизвестный тип API: "${apiType}". Доступны: ${Object.keys(WB_API).join(', ')}`);
  }

  // Сборка URL с query-параметрами
  const apiConfig = WB_API[apiType];
  let url = apiConfig.baseUrl + endpoint;

  if (queryParams && typeof queryParams === 'object') {
    const qs = Object.entries(queryParams)
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    if (qs) url += (url.includes('?') ? '&' : '?') + qs;
  }

  // Опции запроса
  const options = {
    method: method || 'GET',
    muteHttpExceptions: true,
    headers: {
      'Authorization': apiKey,
      'Accept': 'application/json'
    }
  };

  if (payload) {
    options.headers['Content-Type'] = 'application/json';
    options.payload = JSON.stringify(payload);
  }

  // Выполнение запроса
  let response;
  try {
    response = UrlFetchApp.fetch(url, options);
  } catch (networkErr) {
    throw new Error(`[wbRequest] Сетевая ошибка при запросе к ${url}: ${networkErr.message}`);
  }

  const status = response.getResponseCode();
  const text   = response.getContentText();

  // 204 — нет данных (нормально для пагинации)
  if (status === 204) return null;

  // Успешный ответ
  if (status >= 200 && status < 300) {
    if (!text || text.trim() === '') return null;
    try {
      return JSON.parse(text);
    } catch (parseErr) {
      throw new Error(`[wbRequest] Невалидный JSON от ${url}: ${text.substring(0, 200)}`);
    }
  }

  // 429 — превышен лимит запросов
  if (status === 429) {
    throw new Error(`[wbRequest] Лимит запросов WB (429). Подождите 1-2 минуты. URL: ${url}`);
  }

  // 401 / 403 — проблема с токеном
  if (status === 401 || status === 403) {
    throw new Error(`[wbRequest] Ошибка авторизации (${status}). Проверьте токен в листе API. URL: ${url}`);
  }

  // Остальные ошибки
  throw new Error(`[wbRequest] HTTP ${status} от ${url}: ${text.substring(0, 500)}`);
}

// ============================================================
// СЕКЦИЯ: ФОРМАТИРОВАНИЕ ДАТ (СНГ формат)
// ============================================================

/**
 * Форматирует значение в строку даты-времени СНГ формата: дд.мм.гггг чч:мм:сс
 *
 * @param {Date|string|number|null} value - Входное значение
 * @returns {string} - Отформатированная строка или пустая строка
 *
 * ПРИМЕРЫ:
 *   formatDateRu(new Date())         → '02.04.2026 15:30:00'
 *   formatDateRu('2026-04-02')       → '02.04.2026 00:00:00'
 *   formatDateRu('2026-04-02T10:05') → '02.04.2026 10:05:00'
 */
function formatDateRu(value) {
  if (!value) return '';

  let d;

  if (value instanceof Date) {
    d = value;
  } else {
    const str = String(value).trim();
    if (!str) return '';

    // Если уже в формате дд.мм.гггг — конвертируем обратно для парсинга
    const ruMatch = str.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (ruMatch) {
      d = new Date(
        parseInt(ruMatch[3]), parseInt(ruMatch[2]) - 1, parseInt(ruMatch[1]),
        parseInt(ruMatch[4] || 0), parseInt(ruMatch[5] || 0), parseInt(ruMatch[6] || 0)
      );
    } else {
      // ISO 8601 и другие форматы
      d = new Date(str.replace(' ', 'T'));
    }
  }

  if (isNaN(d.getTime())) return '';

  const tz = Session.getScriptTimeZone();
  return Utilities.formatDate(d, tz, 'dd.MM.yyyy HH:mm:ss');
}

/**
 * Форматирует дату только (без времени) в СНГ формат: дд.мм.гггг
 *
 * @param {Date|string|null} value
 * @returns {string}
 */
function formatDateOnlyRu(value) {
  if (!value) return '';

  let d;
  if (value instanceof Date) {
    d = value;
  } else {
    const str = String(value).trim();
    if (!str) return '';
    d = new Date(str.replace(' ', 'T'));
  }

  if (isNaN(d.getTime())) return '';

  const tz = Session.getScriptTimeZone();
  return Utilities.formatDate(d, tz, 'dd.MM.yyyy');
}

/**
 * Безопасно парсит дату из любого формата в строку YYYY-MM-DD.
 * Используется для передачи в API WB (требует ISO).
 *
 * @param {Date|string|null} value
 * @param {string} fallback - Значение по умолчанию при ошибке
 * @returns {string} - Дата в формате YYYY-MM-DD
 */
function parseDateToIso(value, fallback) {
  fallback = fallback || '2026-01-01';

  if (!value) return fallback;

  // Уже Date-объект
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }

  const str = String(value)
    .replace(/\u00A0/g, ' ')  // неразрывные пробелы
    .trim();

  if (!str) return fallback;

  // дд.мм.гггг → преобразуем
  const ruMatch = str.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (ruMatch) {
    return `${ruMatch[3]}-${ruMatch[2]}-${ruMatch[1]}`;
  }

  // YYYY-MM-DD — уже правильно
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.substring(0, 10);
  }

  // Попытка через Date
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }

  return fallback;
}

/**
 * Получить текущую дату-время в СНГ формате.
 * @returns {string}
 */
function nowRu() {
  return formatDateRu(new Date());
}

/**
 * Извлекает период ГГГГ-ММ из даты для группировки в ДДР.
 * @param {Date|string|null} value
 * @returns {string} - 'YYYY-MM' или ''
 */
function toYearMonth(value) {
  if (!value) return '';
  const iso = parseDateToIso(value, '');
  if (!iso) return '';
  return iso.substring(0, 7);
}

// ============================================================
// СЕКЦИЯ: РАБОТА С ЛИСТАМИ
// ============================================================

/**
 * Получить или создать лист по имени.
 * @param {string} name
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function getOrCreateSheet(name) {
  const ss = SpreadsheetApp.getActive();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

/**
 * Определяет порядок ключей для записи.
 * @param {string} sheetName
 * @param {Object[]} objects
 * @param {string[]} [headersOverride]
 * @returns {{ keys: string[], headers: string[], schema: Object|null }}
 */
function _resolveSheetKeys(sheetName, objects, headersOverride) {
  const schema = getSheetSchema(sheetName);
  let keys;

  if (schema) {
    keys = schema.keys.slice();
  } else if (headersOverride && headersOverride.length) {
    keys = headersOverride.slice();
  } else {
    const keySet = new Set();
    objects.forEach(obj => Object.keys(obj).forEach(k => keySet.add(k)));
    keys = Array.from(keySet);
  }

  const headers = schema
    ? keys.map(k => schema.titles[k] || k)
    : keys;

  return { keys, headers, schema };
}

/**
 * Конвертирует значение ячейки для записи.
 * @param {*} v
 * @returns {*}
 */
function _cellValue(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return formatDateRu(v);
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

/**
 * Записывает массив объектов в лист Google Sheets.
 * Автоматически использует схему из SHEET_SCHEMAS если она есть.
 *
 * ВАЖНО: Очищает только колонки схемы — формулы правее остаются.
 *
 * @param {string} sheetName - Имя листа (из APP.sheets)
 * @param {Object[]} objects - Массив данных
 * @param {string[]} [headersOverride] - Перекрыть порядок полей (если нет схемы)
 * @returns {number} - Количество записанных строк
 */
function writeObjectsToSheet(sheetName, objects, headersOverride) {
  const sheet = getOrCreateSheet(sheetName);

  if (!objects || !objects.length) {
    sheet.getRange(1, 1).setValue('Нет данных');
    return 0;
  }

  const { keys, headers } = _resolveSheetKeys(sheetName, objects, headersOverride);
  const numCols = keys.length;

  // Очищаем только колонки данных (без формул правее)
  const lastRow = sheet.getLastRow();
  if (lastRow > 0) {
    sheet.getRange(1, 1, lastRow, numCols).clearContent();
  }

  // Данные
  const values = [headers];

  objects.forEach(obj => {
    values.push(keys.map(k => _cellValue(obj[k])));
  });

  sheet.getRange(1, 1, values.length, numCols).setValues(values);
  return objects.length;
}

/**
 * Дописывает объекты в конец листа (инкрементальное обновление).
 * Если лист пуст — создаёт заголовок.
 *
 * @param {string} sheetName - Имя листа
 * @param {Object[]} objects - Новые строки
 * @returns {number} - Количество добавленных строк
 */
function appendObjectsToSheet(sheetName, objects) {
  if (!objects || !objects.length) return 0;

  const sheet = getOrCreateSheet(sheetName);
  const { keys, headers } = _resolveSheetKeys(sheetName, objects);
  const numCols = keys.length;

  // Если лист пустой — пишем заголовок
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, numCols).setValues([headers]);
  }

  const values = objects.map(obj => keys.map(k => _cellValue(obj[k])));
  const startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, values.length, numCols).setValues(values);
  return objects.length;
}

/**
 * Читает лист как массив объектов (по заголовкам первой строки).
 *
 * @param {string} sheetName
 * @returns {Object[]}
 */
function readSheetAsObjects(sheetName) {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  const headers = data[0].map(h => String(h).trim());
  const result = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const obj = {};
    let hasData = false;

    headers.forEach((h, idx) => {
      obj[h] = row[idx];
      if (row[idx] !== '' && row[idx] !== null && row[idx] !== undefined) hasData = true;
    });

    if (hasData) result.push(obj);
  }

  return result;
}

// ============================================================
// СЕКЦИЯ: РАБОТА С API КЛЮЧАМИ
// ============================================================

/**
 * Читает список кабинетов и API-ключей из листа API.
 *
 * Структура листа API:
 *   Столбец A — Название кабинета
 *   Столбец B — API-ключ (токен)
 *   Столбец C — Дата последнего использования (заполняется автоматически)
 *
 * @returns {{ cabinet: string, apiKey: string, row: number }[]}
 * @throws {Error} Если лист API не найден
 */
function getApiKeys() {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(APP.sheets.API);

  if (!sheet) {
    throw new Error('Лист "API" не найден. Создайте его и добавьте кабинеты с ключами.');
  }

  const data = sheet.getDataRange().getValues();
  const result = [];

  for (let i = 1; i < data.length; i++) {
    const cabinet = String(data[i][0] || '').trim();
    const apiKey  = String(data[i][1] || '').trim();

    if (cabinet && apiKey) {
      result.push({ cabinet, apiKey, row: i + 1 });
    }
  }

  if (!result.length) {
    throw new Error('Лист "API" не содержит ни одного кабинета. Заполните колонки A (кабинет) и B (токен).');
  }

  // Фильтр по выбранным кабинетам (если установлен)
  const selected = getCabinetSelection();
  if (selected && selected.length) {
    const filtered = result.filter(r => selected.includes(r.cabinet));
    if (filtered.length) return filtered;
  }

  return result;
}

/**
 * Отмечает время последнего использования API-ключа.
 * @param {number} rowNumber - Номер строки в листе API (1-based)
 */
function markApiUsed(rowNumber) {
  const ss = SpreadsheetApp.getActive();
  const apiSheet = ss.getSheetByName(APP.sheets.API);
  if (!apiSheet) return;
  apiSheet.getRange(rowNumber, 3).setValue(formatDateRu(new Date()));
}

// ============================================================
// СЕКЦИЯ: МАТЕМАТИКА
// ============================================================

/**
 * Округляет число до 2 знаков после запятой.
 * @param {number|string|null} n
 * @returns {number}
 */
function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Безопасно извлекает первое числовое значение по списку ключей.
 * Полезно для работы с разными версиями ответа WB API.
 *
 * @param {Object} obj
 * @param {string[]} keys - Список ключей в порядке приоритета
 * @returns {number}
 *
 * ПРИМЕР:
 *   pickNumber(row, ['ppvz_for_pay', 'forPay']) → первое ненулевое число
 */
function pickNumber(obj, keys) {
  for (let i = 0; i < keys.length; i++) {
    const v = obj[keys[i]];
    if (v !== '' && v !== null && v !== undefined && !isNaN(Number(v))) {
      return Number(v);
    }
  }
  return 0;
}

/**
 * Получить значение строки из объекта безопасно.
 * @param {Object} obj
 * @param {string[]} keys
 * @returns {string}
 */
function pickString(obj, keys) {
  for (let i = 0; i < keys.length; i++) {
    const v = obj[keys[i]];
    if (v !== '' && v !== null && v !== undefined) return String(v);
  }
  return '';
}

// ============================================================
// СЕКЦИЯ: ВЫБОР КАБИНЕТОВ (UserProperties)
// ============================================================

/**
 * Сохраняет выбранные кабинеты для фильтрации.
 * Пустой массив = все кабинеты.
 * @param {string[]} cabinetNames
 */
function saveCabinetSelection(cabinetNames) {
  const prop = PropertiesService.getUserProperties();
  prop.setProperty('SELECTED_CABINETS', JSON.stringify(cabinetNames || []));
}

/**
 * Возвращает выбранные кабинеты.
 * @returns {string[]} - Пустой массив = все
 */
function getCabinetSelection() {
  try {
    const raw = PropertiesService.getUserProperties().getProperty('SELECTED_CABINETS');
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

/**
 * Возвращает список всех кабинетов из листа API.
 * @returns {{ name: string, selected: boolean }[]}
 */
function getCabinetList() {
  const all = getApiKeys();
  const selected = getCabinetSelection();
  return all.map(c => ({
    name: c.cabinet,
    selected: !selected.length || selected.includes(c.cabinet)
  }));
}
