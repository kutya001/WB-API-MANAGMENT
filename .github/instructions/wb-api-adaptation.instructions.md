---
description: "Use when WB API endpoint changed, Wildberries API updated, fixing broken API call, migrating to new API version, API returns unexpected format. Covers safe adaptation to WB API changes."
---

# Адаптация к изменениям WB API

WB API (https://dev.wildberries.ru/) часто меняет эндпоинты, названия полей и формат ответов.

## Диагностика: что именно изменилось?

1. Проверь лист **ЛОГИ** — найди строку с ошибкой
2. Определи тип ошибки:
   - `404` → эндпоинт изменился/удалён
   - `400` → изменились параметры запроса
   - Данные пустые → изменился формат ответа или названия полей
   - `TypeError` → изменилась структура вложенности
3. Сверь с документацией: https://dev.wildberries.ru/openapi/

## Что менять — по слоям

### Изменился URL / домен API

Правь **только** `00_Config.js` → `WB_API`:

```javascript
// Было:
WB_API.content = { baseUrl: 'https://content-api.wildberries.ru', ... };
// Стало:
WB_API.content = { baseUrl: 'https://content-api.wildberries.ru', ... }; // обнови URL
```

### Изменился эндпоинт / параметры запроса

Правь **только** `_fetch...()` в файле модуля:

```javascript
// Обнови endpoint, method, queryParams:
const resp = wbRequest('statistics', '/api/v2/supplier/orders', 'GET', null, apiKey, {
  dateFrom: dateFrom,
  newParam: 'value'  // новый параметр
});
```

### Изменились названия полей в ответе

Правь **только** `_map...()` в файле модуля:

```javascript
// Добавь новое название поля в массив вариантов:
field1: pickString(raw, ['newFieldName', 'oldFieldName', 'legacyFieldName'])
```

### Изменилась структура ответа (вложенность)

```javascript
// Было: resp = [{ field: 'value' }]
// Стало: resp = { data: [{ field: 'value' }] }

// Добавь извлечение:
const items = resp.data || resp.items || resp;
if (!Array.isArray(items)) return [];
```

### Добавились новые поля

1. Добавь ключ в `SHEET_SCHEMAS[...].keys`
2. Добавь заголовок в `titles` и описание в `desc`
3. Добавь маппинг в `_map...()`

## Принципы устойчивости

- Всегда используй `pickString()` / `pickNumber()` с массивом fallback-ключей
- Не обращайся к `raw.field` напрямую — поле может исчезнуть
- Проверяй `if (!resp || !Array.isArray(resp))` перед обработкой
- Комментируй версию API и дату проверки в заголовке файла
- Один модуль = один файл = изолированные изменения
