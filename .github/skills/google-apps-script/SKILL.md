---
name: google-apps-script
description: "Write, refactor, and debug Google Apps Script code. Use when: creating GAS functions, working with SpreadsheetApp, UrlFetchApp API integrations, building menus/sidebars, setting up triggers, logging/debugging GAS code, adding new modules to GAS project."
argument-hint: "Describe what you need: new module, API integration, UI element, or bug fix"
---

# Google Apps Script — Skill

Полный рабочий процесс для написания, отладки и расширения Google Apps Script проектов.  
Конвенции основаны на проекте **WB Учёт** (WB-API-MANAGMENT).

## When to Use

- Создание нового GAS-кода (функции, модули, API-интеграции)
- Работа с Google Sheets (чтение/запись, форматирование, схемы)
- Интеграция с REST API через `UrlFetchApp`
- UI: меню, сайдбар, диалоги (`HtmlService`, `SpreadsheetApp.getUi()`)
- Триггеры и автоматизация (time-driven, event-driven)
- Отладка и логирование

## Decision Flow

```
Что нужно сделать?
├─ Новый модуль/лист        → [Процедура: Новый модуль](#новый-модуль)
├─ Новый API-эндпоинт       → [Процедура: API-интеграция](#api-интеграция)
├─ Новая функция в модуле   → [Процедура: Написание кода](#написание-gas-кода)
├─ UI (меню/сайдбар)        → [Процедура: UI-компоненты](#ui-компоненты)
├─ Баг или ошибка           → [Процедура: Отладка](#отладка)
└─ Оптимизация              → [Процедура: Оптимизация](#оптимизация)
```

---

## Процедура: Написание GAS-кода

### 1. Проверь контекст

- Прочитай `00_Config.js` — все константы, API-маршруты, схемы листов
- Прочитай `01_Utils.js` — утилиты, НЕ дублируй существующие функции
- Найди файл модуля по номеру (`03_06_...`, `07_08_...`)

### 2. Следуй конвенциям

| Правило | Паттерн |
|---------|---------|
| Приватные функции | `_prefixedName()` |
| Публичные обработчики | `loadSomething()`, `buildSomething()` |
| Константы | `UPPERCASE_SNAKE_CASE` |
| Имена листов | `UPPERCASE_SNAKE_CASE` на русском |
| Даты для вывода | `formatDateRu(value)` → `дд.мм.гггг чч:мм:сс` |
| Даты для API | `parseDateToIso(value)` → `YYYY-MM-DD` |
| Безопасный доступ к полям | `pickNumber(obj, keys[])`, `pickString(obj, keys[])` |
| Округление чисел | `round2(n)` |

### 3. Структура функции

```javascript
/**
 * Загружает данные X из API Y для всех кабинетов.
 */
function loadSomething() {
  const ss = SpreadsheetApp.getActive();
  const cabinets = getApiKeys();
  const settings = getSettingsMap();
  let allRows = [];

  cabinets.forEach(cab => {
    withLog('loadSomething', cab.name, () => {
      const raw = _fetchSomethingData(cab, settings);
      const mapped = raw.map(item => _mapSomethingItem(item, cab.name));
      allRows = allRows.concat(mapped);
    });
  });

  if (allRows.length) {
    writeObjectsToSheet('SHEET_NAME', allRows);
  }
}
```

### 4. Обработка ошибок

- Оборачивай в `withLog(funcName, cabinet, fn)` — логирует время, статус, ошибки
- НЕ используй голый `try/catch` без логирования
- При ошибке одного кабинета — продолжай со следующим
- Крупные данные: проверяй `if (!data || !data.length)` перед обработкой

---

## Процедура: API-интеграция

### 1. Используй только `wbRequest()`

```javascript
const data = wbRequest('statistics', '/api/v1/supplier/orders', 'GET', null, apiKey, {
  dateFrom: parseDateToIso(startDate)
});
```

**Параметры:** `(apiType, endpoint, method, payload, apiKey, queryParams)`

- `apiType` — ключ из `WB_API` в `00_Config.js`
- НЕ используй `UrlFetchApp.fetch()` напрямую

### 2. Паттерны пагинации

| Тип | Когда использовать | Пример |
|-----|-------------------|--------|
| Курсор | API возвращает `cursor`/`updatedAt` | Content API |
| По дате | Следующая страница = `lastChangeDate` | Statistics API |
| По ID | Следующая страница = `rrd_id` | Finance API |
| По offset | `offset += limit` | Supplies API |

### 3. Rate Limits

- Проверь `sleepMs` в `WB_API` конфигурации для нужного API
- `Utilities.sleep(sleepMs)` между запросами
- При 429 — `wbRequest` выбросит ошибку, `withLog` запишет в лог

### 4. Маппинг данных

```javascript
function _mapItem(raw, cabinetName) {
  return {
    cabinet:    cabinetName,
    article:    pickString(raw, ['supplierArticle', 'sa_name']),
    quantity:   pickNumber(raw, ['quantity', 'qty']),
    price:      round2(pickNumber(raw, ['totalPrice', 'price'])),
    date:       formatDateRu(raw.date || raw.lastChangeDate),
  };
}
```

Подробнее: [./references/gas-patterns.md](./references/gas-patterns.md)

---

## Процедура: Новый модуль

**8 шагов для добавления нового модуля:**

1. **`00_Config.js`** — добавь домен API в `WB_API` (если новый)
2. **`00_Config.js`** — добавь имя листа в `APP.sheets`
3. **`00_Config.js`** — добавь схему в `SHEET_SCHEMAS` (ключи, заголовки, описания)
4. **`00_Config.js`** — добавь настройки в `DEFAULT_SETTINGS` (если есть параметры дат/фильтров)
5. **Новый файл** — `NN_ModuleName.js` с функцией-загрузчиком
6. **`12_Menu.js`** — добавь пункт в меню
7. **`12_Menu.js`** — добавь в whitelist `runFromSidebar()`
8. **`Sidebar.html`** — задокументируй кнопку/описание

Шаблон нового модуля: [./assets/new-module-template.js](./assets/new-module-template.js)

---

## Процедура: UI-компоненты

### Меню

```javascript
// В onOpen() в 12_Menu.js
menu.addItem('Загрузить X', 'loadX');
// Или в подменю:
submenu.addItem('Загрузить X', 'loadX');
menu.addSubMenu(submenu);
```

### Сайдбар

- HTML в `Sidebar.html` — HtmlService
- Вызов GAS из JS: `google.script.run.withSuccessHandler(fn).functionName()`
- Добавь кнопку в соответствующую вкладку
- Добавь функцию в whitelist `runFromSidebar()` в `12_Menu.js`

### Диалоги / Toast

```javascript
SpreadsheetApp.getActive().toast('Сообщение', 'Заголовок', 5);
// или:
SpreadsheetApp.getUi().alert('Сообщение');
```

---

## Процедура: Отладка

### 1. Читай логи

- Лист ЛОГИ — все вызовы через `withLog()` записываются автоматически
- `Logger.log()` — видно в Execution Log (Apps Script Editor)

### 2. Типичные ошибки GAS

| Ошибка | Причина | Решение |
|--------|---------|---------|
| `TypeError: Cannot read property` | Пустой ответ API | Проверяй `if (!data)` |
| `Exception: Request failed` | 429 rate limit | Увеличь `sleepMs`, проверь лимит |
| `Exceeded maximum execution time` | > 6 мин (или 30 мин для Workspace) | Разбей на части, используй `MAX_PAGES_PER_RUN` |
| `Service invoked too many times` | Превышены квоты GAS | Пакетная запись вместо построчной |
| `You do not have permission` | Нет доступа к листу/сервису | Проверь авторизацию, `onOpen()` scope |

### 3. Стратегия отладки

1. Проверь ЛОГИ лист — ищи строку с ошибкой
2. Проверь `Logger.log()` в Execution Log
3. Воспроизведи вызов через `wbRequest()` с хардкод-параметрами
4. Проверь формат дат и API-ключи
5. Проверь квоты: `Services → Apps Script API → Quotas`

---

## Процедура: Оптимизация

### Лимиты GAS

| Лимит | Бесплатный | Google Workspace |
|-------|-----------|-----------------|
| Время выполнения | 6 мин | 30 мин |
| URL Fetch вызовов/день | 20,000 | 100,000 |
| Чтение/запись ячеек | ~5M/день | ~5M/день |

### Правила оптимизации

1. **Batch-операции** — `setValues()` вместо построчного `appendRow()`
2. **Минимум обращений к SpreadsheetApp** — кешируй `getActive()` в переменную
3. **Один `getValues()` + фильтрация в JS** вместо множества `getValue()`
4. **`Utilities.sleep()` только где необходимо** (rate limits)
5. **`MAX_PAGES_PER_RUN`** — ограничивай пагинацию чтобы не выйти за 6 мин

Подробнее: [./references/gas-patterns.md](./references/gas-patterns.md)

---

## Работа с Google Sheets

### Чтение данных

```javascript
// Прочитать все строки как объекты
const rows = readSheetAsObjects('SHEET_NAME');
// rows = [{ key1: value1, key2: value2, ... }, ...]

// Или вручную:
const sheet = getOrCreateSheet('SHEET_NAME');
const data = sheet.getDataRange().getValues();
const headers = data[0];
const rows = data.slice(1);
```

### Запись данных

```javascript
// Стандартный способ — через схему
writeObjectsToSheet('SHEET_NAME', arrayOfObjects);
// Автоматически: очищает, ставит заголовки из SHEET_SCHEMAS, форматирует даты

// Низкоуровневый:
const sheet = getOrCreateSheet('SHEET_NAME');
sheet.clearContents();
sheet.getRange(1, 1, data.length, data[0].length).setValues(data);
sheet.setFrozenRows(1);
sheet.getRange(1, 1, 1, data[0].length).setFontWeight('bold');
```

### Схемы листов (SHEET_SCHEMAS)

Каждый лист описывается в `SHEET_SCHEMAS`:

```javascript
SHEET_SCHEMAS['SHEET_NAME'] = [
  { key: 'fieldKey', title: 'Заголовок RU', description: 'Описание поля' },
  // ...
];
```

- `key` — ключ в объекте данных
- `title` — русский заголовок для первой строки
- `description` — для метаданных и документации

Подробнее: [./references/project-conventions.md](./references/project-conventions.md)
