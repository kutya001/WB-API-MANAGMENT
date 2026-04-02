# Конвенции проекта WB-API-MANAGMENT

## Структура файлов

Файлы нумеруются для контроля порядка загрузки в GAS:

```
00_Config.js                         — Конфигурация, константы, схемы
01_Utils.js                          — Утилиты (API, даты, I/O)
02_Settings_11_Logs.js               — Настройки + логирование
03_06_Articles_Stocks_Orders_Sales.js — Модули 03-06 (объединены)
07_08_Finance_Supplies.js            — Модули 07-08 (объединены)
09_Reports.js                        — Отчёты (DDR, расходы)
12_Menu.js                           — Точка входа: меню, loadAll
Sidebar.html                        — UI панель
DEV_GUIDE.js                        — Документация для разработчиков
```

### Правила именования файлов

- Номер `NN_` определяет порядок загрузки
- Родственные модули объединяются в один файл (`03_06_...`)
- Config (00) и Utils (01) загружаются первыми → все остальные могут их использовать
- Menu (12) — последний, оркестрирует остальные

---

## Конфигурация (00_Config.js)

### APP — главный объект

```javascript
const APP = {
  sheets: {
    ARTICLES:   'АРТИКУЛЫ',
    STOCKS_WB:  'ОСТАТКИ_WB',
    // ...
  },
  // ...
};
```

### WB_API — маршруты API

```javascript
const WB_API = {
  content:    { base: 'https://content-api.wildberries.ru',    sleepMs: 0 },
  statistics: { base: 'https://statistics-api.wildberries.ru', sleepMs: 60000 },
  marketplace:{ base: 'https://marketplace-api.wildberries.ru',sleepMs: 200 },
  supplies:   { base: 'https://supplies-api.wildberries.ru',   sleepMs: 1000 },
  analytics:  { base: 'https://seller-analytics-api.wildberries.ru', sleepMs: 1000 },
  finance:    { base: 'https://finance-api.wildberries.ru',    sleepMs: 60000 },
};
```

### SHEET_SCHEMAS — схемы листов

```javascript
SHEET_SCHEMAS['АРТИКУЛЫ'] = [
  { key: 'cabinet',   title: 'Кабинет',   description: 'Имя кабинета продавца' },
  { key: 'nmID',      title: 'nmID',       description: 'ID номенклатуры WB' },
  { key: 'article',   title: 'Артикул',    description: 'Артикул продавца' },
  // ...
];
```

Каждая схема определяет:
- `key` — ключ в объекте данных (используется в `writeObjectsToSheet`)
- `title` — русский заголовок для первой строки листа
- `description` — описание для метаданных

### DEFAULT_SETTINGS — настройки по умолчанию

```javascript
const DEFAULT_SETTINGS = {
  dateFrom_orders: '2024-01-01',
  dateFrom_sales:  '2024-01-01',
  maxPages:        10,
  // ...
};
```

---

## Утилиты (01_Utils.js)

### API

| Функция | Описание |
|---------|----------|
| `wbRequest(type, endpoint, method, payload, key, params)` | Единственный способ вызова WB API |
| `getApiKeys()` | Читает кабинеты и токены из листа API |
| `markApiUsed(rowNumber)` | Записывает timestamp использования |

### Даты

| Функция | Вход → Выход | Когда использовать |
|---------|-------------|-------------------|
| `formatDateRu(v)` | `* → дд.мм.гггг чч:мм:сс` | Вывод в лист |
| `formatDateOnlyRu(v)` | `* → дд.мм.гггг` | Дата без времени |
| `parseDateToIso(v, fb)` | `* → YYYY-MM-DD` | Параметр API |
| `toYearMonth(v)` | `* → YYYY-MM` | Группировка по месяцу |
| `nowRu()` | `→ дд.мм.гггг чч:мм:сс` | Текущее время |

### Листы

| Функция | Описание |
|---------|----------|
| `getOrCreateSheet(name)` | Получить или создать лист |
| `writeObjectsToSheet(name, objects, headers?)` | Записать массив объектов (с авто-схемой) |
| `readSheetAsObjects(name)` | Прочитать лист как массив объектов |
| `getSheetSchema(name)` | Получить схему листа |
| `getReadableHeaders(name)` | Русские заголовки из схемы |

### Безопасность данных

| Функция | Описание |
|---------|----------|
| `pickNumber(obj, keys[])` | Первое числовое значение из списка ключей |
| `pickString(obj, keys[])` | Первая непустая строка из списка ключей |
| `round2(n)` | Округление до 2 знаков |

### Логирование

| Функция | Описание |
|---------|----------|
| `withLog(funcName, cabinet, fn)` | Обёртка: выполнить + замерить + залогировать |
| `writeLog(params)` | Записать строку в ЛОГИ |

---

## Добавление нового API домена

1. Добавь в `WB_API`:
```javascript
WB_API.newDomain = {
  base: 'https://new-api.wildberries.ru',
  sleepMs: 1000  // ms между запросами
};
```

2. Используй через `wbRequest('newDomain', '/endpoint', 'GET', ...)`.

---

## Workflow разработки

1. Изменения в `.js` файлах → push в GAS через clasp или копипаст
2. Тест через меню в Google Sheets или напрямую в Apps Script Editor
3. Логи проверяй в листе ЛОГИ и в Execution Log
4. Ошибки отдельного кабинета не ломают весь `loadAll()`
