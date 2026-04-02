# Google Apps Script — Паттерны и Best Practices

## Сервисы GAS

### SpreadsheetApp

```javascript
// Кешируй ссылку на таблицу
const ss = SpreadsheetApp.getActive();

// Получение/создание листа
const sheet = ss.getSheetByName('NAME') || ss.insertSheet('NAME');

// Чтение — один вызов, потом фильтруй в JS
const allData = sheet.getDataRange().getValues();    // 2D array
const headers = allData[0];
const rows = allData.slice(1);

// Запись — batch через setValues
sheet.getRange(1, 1, data.length, data[0].length).setValues(data);

// Форматирование
sheet.setFrozenRows(1);
sheet.getRange(1, 1, 1, cols).setFontWeight('bold');
sheet.autoResizeColumns(1, cols);

// Очистка
sheet.clearContents();  // только данные
sheet.clear();          // данные + форматирование
```

### UrlFetchApp

```javascript
// В этом проекте — ТОЛЬКО через wbRequest()!
// Для других API используй шаблон:

function fetchExternalApi(url, method, payload, headers) {
  const options = {
    method: method || 'GET',
    contentType: 'application/json',
    headers: headers || {},
    muteHttpExceptions: true,  // не бросать исключение при 4xx/5xx
  };
  if (payload) {
    options.payload = JSON.stringify(payload);
  }

  const response = UrlFetchApp.fetch(url, options);
  const code = response.getResponseCode();

  if (code === 429) {
    throw new Error('Rate limit exceeded');
  }
  if (code >= 400) {
    throw new Error(`HTTP ${code}: ${response.getContentText().substring(0, 200)}`);
  }

  return JSON.parse(response.getContentText());
}
```

### PropertiesService

```javascript
// Для хранения настроек/кеша между вызовами
const props = PropertiesService.getScriptProperties();

// Записать
props.setProperty('lastRunDate', new Date().toISOString());

// Прочитать
const lastRun = props.getProperty('lastRunDate');

// Удалить
props.deleteProperty('lastRunDate');

// Массовая запись (эффективнее)
props.setProperties({
  key1: 'value1',
  key2: 'value2'
});
```

### CacheService

```javascript
// Для временного кеширования (до 6 часов)
const cache = CacheService.getScriptCache();

// Записать (макс. 100KB, TTL в секундах)
cache.put('cacheKey', JSON.stringify(data), 3600); // 1 час

// Прочитать
const cached = cache.get('cacheKey');
if (cached) {
  return JSON.parse(cached);
}
```

### HtmlService

```javascript
// Шаблонный HTML (с серверными вставками)
function showSidebar() {
  const html = HtmlService.createTemplateFromFile('Sidebar');
  const output = html.evaluate()
    .setTitle('Заголовок')
    .setWidth(350);
  SpreadsheetApp.getUi().showSidebar(output);
}

// Статический HTML
function showDialog() {
  const html = HtmlService.createHtmlOutputFromFile('Dialog')
    .setWidth(400)
    .setHeight(300);
  SpreadsheetApp.getUi().showModalDialog(html, 'Заголовок');
}
```

### Паттерн: HTML ↔ GAS взаимодействие

**В HTML:**
```html
<script>
  // Вызов серверной функции
  google.script.run
    .withSuccessHandler(onSuccess)
    .withFailureHandler(onError)
    .serverFunction(param1, param2);

  function onSuccess(result) {
    // result — то, что вернула серверная функция
  }

  function onError(error) {
    console.error(error.message);
  }

  // Закрыть сайдбар/диалог
  google.script.host.close();
</script>
```

---

## Паттерны пагинации

### Курсорная пагинация

```javascript
function _fetchWithCursor(apiKey, settings) {
  const allItems = [];
  let cursor = { updatedAt: '', nmID: 0 };
  let page = 0;

  while (page < MAX_PAGES_PER_RUN) {
    const body = {
      settings: { cursor, filter: { withPhoto: -1 } },
      sort: { ascending: false }
    };
    const resp = wbRequest('content', '/content/v2/get/cards/list', 'POST', body, apiKey);
    const cards = resp.cards || resp.data || [];

    if (!cards.length) break;

    allItems.push(...cards);
    cursor = resp.cursor || {};
    page++;

    Utilities.sleep(WB_API.content.sleepMs || 0);
  }

  return allItems;
}
```

### Пагинация по дате

```javascript
function _fetchByDate(apiKey, startDate) {
  const allItems = [];
  let dateFrom = parseDateToIso(startDate);
  let page = 0;

  while (page < MAX_PAGES_PER_RUN) {
    const data = wbRequest('statistics', '/api/v1/supplier/orders', 'GET', null, apiKey, {
      dateFrom: dateFrom
    });

    if (!data || !data.length) break;

    allItems.push(...data);
    dateFrom = data[data.length - 1].lastChangeDate;
    page++;

    Utilities.sleep(WB_API.statistics.sleepMs || 0);
  }

  return allItems;
}
```

### Пагинация по offset

```javascript
function _fetchWithOffset(apiKey, limit) {
  const allItems = [];
  let offset = 0;
  let page = 0;

  while (page < MAX_PAGES_PER_RUN) {
    const data = wbRequest('supplies', '/api/v1/supplies', 'GET', null, apiKey, {
      limit: limit,
      offset: offset
    });

    if (!data || !data.length) break;

    allItems.push(...data);
    offset += limit;
    page++;

    Utilities.sleep(WB_API.supplies.sleepMs || 0);
  }

  return allItems;
}
```

---

## Триггеры

### Программные триггеры

```javascript
// Создать time-driven триггер
function createDailyTrigger() {
  ScriptApp.newTrigger('loadAll')
    .timeBased()
    .everyHours(6)
    .create();
}

// Создать триггер на конкретное время
function createScheduledTrigger() {
  ScriptApp.newTrigger('loadAll')
    .timeBased()
    .atHour(8)
    .nearMinute(0)
    .everyDays(1)
    .create();
}

// Удалить все триггеры для функции
function removeTriggers(funcName) {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === funcName)
    .forEach(t => ScriptApp.deleteTrigger(t));
}
```

### Event-driven триггеры

```javascript
// onOpen — автоматически при открытии таблицы
function onOpen(e) {
  SpreadsheetApp.getUi()
    .createMenu('🛍️ WB Учёт')
    .addItem('Загрузить всё', 'loadAll')
    .addToUi();
}

// onEdit — при редактировании ячейки
function onEdit(e) {
  const range = e.range;
  const sheet = range.getSheet();
  const value = e.value;
  // Реагируй на изменения
}

// onChange — при структурных изменениях
function onChange(e) {
  // e.changeType: EDIT, INSERT_ROW, INSERT_COLUMN, REMOVE_ROW, etc.
}
```

---

## Антипаттерны

| Не делай | Делай |
|----------|-------|
| `sheet.getRange(r,c).setValue(v)` в цикле | Собери массив → `setValues()` одним вызовом |
| `UrlFetchApp.fetch()` напрямую | `wbRequest()` через единый роутер |
| `try { } catch(e) { }` без логирования | `withLog(name, cab, fn)` |
| Хардкод имён листов в функциях | `APP.sheets.SHEET_NAME` из конфига |
| `new Date().toString()` | `formatDateRu()` / `nowRu()` |
| Доступ к вложенному полю без проверки | `pickNumber()` / `pickString()` |
| `Logger.log()` как единственный лог | `writeLog()` в лист ЛОГИ + `Logger.log()` |
