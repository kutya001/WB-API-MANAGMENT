---
applyTo: "**/*.js"
description: "Use when writing, modifying, or reviewing Google Apps Script code. Enforces project architecture, naming conventions, module structure, API integration patterns, SHEET_SCHEMAS usage, error handling with withLog, and scalability rules for WB Учёт (Wildberries analytics)."
---

# Архитектура и разработка — WB Учёт (Google Apps Script)

> Этот проект — аналитическая система для Wildberries в Google Sheets.
> Документация WB API: https://dev.wildberries.ru/

---

## 1. Структура проекта

Файлы нумеруются `NN_` для контроля порядка загрузки GAS:

```
00_Config.js        — ВСЕ константы, API-маршруты, схемы (загружается первым)
01_Utils.js         — Утилиты: API-роутер, даты, I/O листов
02_Settings_11_Logs — Настройки + логирование
03_06_..., 07_08_.. — Модули-загрузчики (группируются по смыслу)
09_Reports.js       — Отчёты (без API, только агрегация)
12_Menu.js          — Точка входа: меню, loadAll, runFromSidebar
Sidebar.html        — UI-панель
```

**Зависимости:** Config → Utils → всё остальное → Menu (последний).

### Правила размещения кода

| Что                     | Куда                              |
|-------------------------|-----------------------------------|
| Новая константа / enum  | `00_Config.js`                    |
| Новый API-домен         | `WB_API` в `00_Config.js`         |
| Новое имя листа         | `APP.sheets` в `00_Config.js`     |
| Новая схема листа       | `SHEET_SCHEMAS` в `00_Config.js`  |
| Настройка по умолчанию  | `DEFAULT_SETTINGS` в `00_Config.js` |
| Утилита (переиспользуемая) | `01_Utils.js`                  |
| Загрузчик данных из API | Новый файл `NN_Name.js`           |
| Отчёт / агрегация       | `09_Reports.js`                   |
| Пункт меню              | `12_Menu.js`                      |

---

## 2. Именование

### Функции

| Тип                 | Паттерн                          | Примеры                              |
|----------------------|----------------------------------|--------------------------------------|
| Публичный загрузчик  | `loadSomething()`                | `loadOrders()`, `loadArticles()`     |
| Публичный билдер     | `buildSomething()`               | `buildDDR()`                         |
| Геттер               | `getSomething()`                 | `getSettingsMap()`, `getApiKeys()`   |
| Инициализатор        | `initSomething()`                | `initSettingsSheet()`                |
| Приватная функция     | `_prefixedName()`                | `_fetchModuleData()`, `_mapItem()`   |

### Переменные и константы

| Тип               | Стиль                            | Примеры                              |
|--------------------|----------------------------------|--------------------------------------|
| Глобальные конст.  | `UPPER_SNAKE_CASE`               | `WB_API`, `APP`, `MAX_PAGES_PER_RUN` |
| Имена листов       | Русский `UPPER_SNAKE_CASE`       | `'АРТИКУЛЫ'`, `'ЗАКАЗЫ'`            |
| Массивы данных     | `camelCase`, множественное число | `rows`, `items`, `cabinets`          |
| Одиночный объект   | `camelCase`, единственное число  | `row`, `item`, `cab`                 |
| Ответ API          | `resp` или `data`                | `const resp = wbRequest(...)`        |

---

## 3. Обязательные утилиты — НЕ дублируй

Перед написанием новой функции проверь `01_Utils.js`. Используй:

| Задача                         | Функция                             |
|--------------------------------|--------------------------------------|
| Вызов WB API                   | `wbRequest(type, endpoint, method, payload, key, params)` |
| Дата для вывода в лист         | `formatDateRu(value)` → `дд.мм.гггг чч:мм:сс` |
| Дата без времени               | `formatDateOnlyRu(value)` → `дд.мм.гггг` |
| Дата для API-параметра         | `parseDateToIso(value, fallback)` → `YYYY-MM-DD` |
| Группировка по месяцу          | `toYearMonth(value)` → `YYYY-MM`    |
| Текущее время                  | `nowRu()` → `дд.мм.гггг чч:мм:сс`  |
| Получить/создать лист          | `getOrCreateSheet(name)`             |
| Записать массив объектов       | `writeObjectsToSheet(name, objects)` |
| Прочитать лист как объекты     | `readSheetAsObjects(name)`           |
| Безопасно извлечь число        | `pickNumber(obj, ['key1', 'key2'])`  |
| Безопасно извлечь строку       | `pickString(obj, ['key1', 'key2'])`  |
| Округлить до 2 знаков          | `round2(n)`                          |
| Обёртка с логированием         | `withLog(funcName, cabinet, fn)`     |
| Запись лога                    | `writeLog(params)`                   |

**Запрещено:**
- `UrlFetchApp.fetch()` напрямую — только через `wbRequest()`
- `new Date().toString()` — только `formatDateRu()` / `nowRu()`
- `sheet.getRange(r,c).setValue(v)` в цикле — только `setValues()` пакетом
- Хардкод имён листов — только через `APP.sheets.SHEET_NAME`

---

## 4. Добавление нового модуля — 8 шагов

При создании нового функционала (новый API, новый лист данных):

### Шаг 1. API-домен (`00_Config.js` → `WB_API`)

```javascript
WB_API.newDomain = {
  baseUrl: 'https://new-api.wildberries.ru',
  tokenCategory: 'Категория',
  rateLimit: { requests: 60, windowMs: 60000, sleepMs: 1100 }
};
```

### Шаг 2. Имя листа (`00_Config.js` → `APP.sheets`)

```javascript
APP.sheets.MODULE_NAME = 'НАЗВАНИЕ_ЛИСТА';
```

### Шаг 3. Схема (`00_Config.js` → `SHEET_SCHEMAS`)

```javascript
SHEET_SCHEMAS[APP.sheets.MODULE_NAME] = {
  keys:   ['cabinet', 'field1', 'field2', 'date'],
  titles: { cabinet: 'Кабинет', field1: 'Поле 1', field2: 'Поле 2', date: 'Дата' },
  desc:   { cabinet: 'Название кабинета', field1: 'Описание поля 1', ... }
};
```

> Каждый ключ ОБЯЗАН иметь `title` и `desc`.

### Шаг 4. Настройки (`00_Config.js` → `DEFAULT_SETTINGS`)

```javascript
{ key: 'MODULE_DATE_FROM', value: '2026-04-01', group: 'Модуль', description: 'Описание' }
```

### Шаг 5. Файл загрузчика

Имя: `NN_ModuleName.js` (следующий свободный номер).
Структура — см. раздел «Шаблон модуля» ниже.

### Шаг 6. Меню (`12_Menu.js` → `onOpen()`)

```javascript
.addSubMenu(ui.createMenu('📦 Модуль').addItem('Загрузить', 'loadModuleName'))
```

### Шаг 7. Whitelist сайдбара (`12_Menu.js` → `runFromSidebar()`)

Добавь `'loadModuleName'` в массив `allowed`.

### Шаг 8. UI (`Sidebar.html`)

Добавь кнопку в соответствующую вкладку.

---

## 5. Шаблон модуля-загрузчика

```javascript
/**
 * ============================================================
 * NN_ModuleName.js — Описание модуля
 * ============================================================
 * API:    https://api-domain.wildberries.ru/path
 * Лимит:  X запросов/мин → sleepMs = Y
 * Пагинация: cursor / date / offset / id
 * ============================================================
 */

/**
 * Загружает [данные] из WB API для всех кабинетов.
 * Результат → лист [НАЗВАНИЕ_ЛИСТА].
 */
function loadModuleName() {
  const cabinets = getApiKeys();
  const settings = getSettingsMap();
  let allRows = [];

  cabinets.forEach(cab => {
    withLog('loadModuleName', cab.cabinet, () => {
      const raw = _fetchModuleData(cab.apiKey, settings);
      const mapped = raw.map(item => _mapModuleItem(item, cab.cabinet));
      allRows = allRows.concat(mapped);
      markApiUsed(cab.row);
    });
  });

  if (allRows.length) {
    const count = writeObjectsToSheet(APP.sheets.MODULE_NAME, allRows);
    SpreadsheetApp.getActive().toast(`Загружено ${count} записей`, '📦 Модуль', 3);
  }
}

/**
 * Получает сырые данные с пагинацией.
 * @param {string} apiKey — токен кабинета
 * @param {Object} settings — настройки из листа НАСТРОЙКИ
 * @returns {Array<Object>} — сырые данные API
 */
function _fetchModuleData(apiKey, settings) {
  const allItems = [];
  const maxPages = Math.min(Number(settings.MAX_PAGES_PER_RUN) || 5, 20);
  let page = 0;

  while (page < maxPages) {
    const resp = wbRequest('apiType', '/api/v1/endpoint', 'GET', null, apiKey, {
      dateFrom: parseDateToIso(settings.MODULE_DATE_FROM, '2026-01-01')
    });
    if (!resp || !Array.isArray(resp) || !resp.length) break;

    allItems.push(...resp);
    page++;
    Utilities.sleep(WB_API.apiType.rateLimit.sleepMs);
  }
  return allItems;
}

/**
 * Маппит сырой объект API → объект для записи в лист.
 * Ключи ДОЛЖНЫ совпадать с SHEET_SCHEMAS[APP.sheets.MODULE_NAME].keys.
 *
 * @param {Object} raw — сырой объект из ответа API
 * @param {string} cabinetName — имя кабинета
 * @returns {Object} — объект для writeObjectsToSheet
 */
function _mapModuleItem(raw, cabinetName) {
  return {
    cabinet: cabinetName,
    field1:  pickString(raw, ['keyVariant1', 'keyVariant2']),
    field2:  round2(pickNumber(raw, ['numKey1', 'numKey2'])),
    date:    formatDateRu(raw.date || raw.lastChangeDate),
  };
}
```

---

## 6. API-интеграция

### Единый роутер — `wbRequest()`

```javascript
wbRequest(apiType, endpoint, method, payload, apiKey, queryParams)
```

- `apiType` — ключ из `WB_API` (`'content'`, `'statistics'`, `'supplies'`...)
- **Никогда** не вызывай `UrlFetchApp.fetch()` напрямую

### Пагинация — 4 паттерна

| Паттерн    | Как перейти на след. страницу              | API-примеры        |
|------------|--------------------------------------------|--------------------|
| Курсор     | `cursor = resp.cursor` (из ответа WB)      | Content API        |
| По дате    | `dateFrom = lastRow.lastChangeDate`         | Statistics API     |
| По ID      | `rrdid = lastRow.rrd_id`                    | Finance API        |
| По offset  | `offset += limit; if (resp.length < limit) stop` | Supplies API |

### Обработка ответов

```javascript
// Всегда проверяй ответ перед обработкой:
if (!resp || !Array.isArray(resp) || resp.length === 0) break;
```

### Rate Limits

- `sleepMs` задан в `WB_API[apiType].rateLimit.sleepMs`
- Вызывай `Utilities.sleep(WB_API.apiType.rateLimit.sleepMs)` после каждого запроса
- При 429 — `wbRequest` выбросит ошибку, `withLog` запишет в лог

---

## 7. Адаптация к изменениям WB API

WB API часто меняется. Правила устойчивости:

### Безопасный доступ к полям

```javascript
// ПРАВИЛЬНО — устойчиво к переименованию полей:
pickString(raw, ['supplierArticle', 'sa_name', 'vendorCode'])
pickNumber(raw, ['totalPrice', 'price', 'finishedPrice'])

// НЕПРАВИЛЬНО — сломается при переименовании:
raw.supplierArticle
raw.totalPrice
```

### Мягкая деградация

```javascript
// Если API изменил структуру — не ломай остальные кабинеты:
cabinets.forEach(cab => {
  withLog('loadX', cab.cabinet, () => {
    // withLog поймает ошибку, запишет в ЛОГИ и продолжит
    ...
  });
});
```

### Изоляция API-зависимостей

| Слой                | Что делает                    | Что менять при обновлении API |
|---------------------|-------------------------------|-------------------------------|
| `WB_API` (Config)   | URL, rate limits              | `baseUrl`, `sleepMs`          |
| `_fetch...()` (Loader) | Параметры запроса, пагинация | Эндпоинт, query params       |
| `_map...()` (Mapper)| Маппинг полей ответа          | Ключи полей, `pickString/pickNumber` |
| `SHEET_SCHEMAS`     | Колонки, заголовки            | `keys`, `titles`, `desc`      |

> При изменении API — меняй **только** нужный слой, не трогай остальные.

### Версионирование эндпоинтов

```javascript
// Комментируй версию API в заголовке файла:
/**
 * API: /api/v5/supplier/reportDetailByPeriod  ← при обновлении обнови здесь
 * Документация: https://dev.wildberries.ru/openapi/...
 */
```

---

## 8. Документирование кода

### Заголовок файла — ОБЯЗАТЕЛЬНО

```javascript
/**
 * ============================================================
 * NN_ModuleName.js — Краткое описание модуля
 * ============================================================
 * API:       apiType — https://domain.wildberries.ru/...
 * Лимит:     X запросов/мин
 * Пагинация: cursor / date / offset / id
 * Документация: https://dev.wildberries.ru/openapi/...
 * ============================================================
 */
```

### JSDoc каждой функции — ОБЯЗАТЕЛЬНО

```javascript
/**
 * Краткое описание — что делает функция.
 *
 * @param {string} apiKey — API-ключ кабинета
 * @param {Object} settings — карта настроек { key: value }
 * @returns {Array<Object>} — массив сырых объектов из API
 *
 * @throws {Error} При ошибке авторизации или rate limit
 *
 * ПРИМЕР:
 *   const data = _fetchOrders(apiKey, { ORDERS_DATE_FROM: '2026-04-01' });
 */
```

### Инлайн-комментарии — для логики

```javascript
// Условие выхода из пагинации: пустой ответ или достигнут лимит
if (!resp.length || page >= maxPages) break;

// Следующий курсор ТОЛЬКО из ответа WB (не инкрементируем вручную)
cursor = resp.cursor;
```

---

## 9. Масштабируемость

### Лимиты GAS

| Лимит                  | Бесплатный | Google Workspace |
|------------------------|-----------|-----------------|
| Время выполнения        | 6 мин     | 30 мин          |
| UrlFetch вызовов/день   | 20,000    | 100,000         |
| Чтение/запись ячеек     | ~5M/день  | ~5M/день        |

### Правила масштабирования

1. **Batch-запись** — `setValues()` вместо `appendRow()` в цикле
2. **Один `getValues()`** — читай весь лист, потом фильтруй в JS
3. **Кешируй `SpreadsheetApp.getActive()`** — в переменную, не вызывай повторно
4. **`MAX_PAGES_PER_RUN`** — ограничивай пагинацию чтобы не выйти за 6 мин
5. **Graceful degradation** — ошибка одного кабинета не ломает весь `loadAll()`
6. **Минимум инлайн-логики в `loadAll()`** — каждый модуль автономен

### Добавление нового API-домена (масштабирование)

Система спроектирована так, что добавление нового API-типа — это:
1. Одна запись в `WB_API`
2. Одна запись в `APP.sheets`
3. Одна схема в `SHEET_SCHEMAS`
4. Один файл `NN_Module.js` с двумя функциями (`_fetch`, `_map`)
5. Три строки в `12_Menu.js` + `Sidebar.html`

Никакие существующие модули не затрагиваются.

---

## 10. Чеклист перед завершением

- [ ] Код использует утилиты из `01_Utils.js`, не дублирует
- [ ] Все API-вызовы через `wbRequest()`
- [ ] Все даты через `formatDateRu()` / `parseDateToIso()`
- [ ] Поля извлекаются через `pickString()` / `pickNumber()`
- [ ] Ошибки обёрнуты в `withLog()`
- [ ] Заголовок файла с API, лимитами, пагинацией
- [ ] JSDoc у каждой функции
- [ ] Инлайн-комментарии у нетривиальной логики
- [ ] `SHEET_SCHEMAS` содержит `keys`, `titles`, `desc`
- [ ] Модуль добавлен в меню + whitelist + Sidebar
