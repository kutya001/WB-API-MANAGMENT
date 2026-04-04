---
name: wildberries-api
description: "Use when working with Wildberries API (WB API, dev.wildberries.ru). Covers: API integration, token auth, rate limits, status codes, endpoint parameters, pagination, error debugging, code generation (Google Apps Script). Use when: writing WB integration code, debugging WB API errors 401/403/429, setting up token categories, implementing pagination, building seller automation, understanding WB API domains."
argument-hint: "Describe what you need: endpoint integration, error debugging, code template, or API architecture question"
---

# Wildberries API Skill

Полный справочник для работы с Wildberries API (dev.wildberries.ru).
Охватывает все категории: товары, заказы, аналитику, финансы, поставки, рекламу, отзывы.

## When to Use

- Интеграция с WB API (разработка на GAS)
- Отладка запросов (401, 403, 429, 409 и другие ошибки)
- Проектирование автоматизации для продавца WB
- Понимание лимитов, токенов, пагинации
- Генерация клиентского кода для конкретных эндпоинтов
- Миграция на новые версии API

## Decision Flow

```
Что нужно?
├─ Написать интеграцию       → §1 Определи домен + §3 Шаблон GAS + web_fetch для параметров
├─ Отладить ошибку API       → §4 Таблица ошибок + проверь токен/домен/лимиты
├─ Пагинация / cursor        → §5 Паттерны пагинации
├─ Узнать параметры эндпоинта→ web_fetch по URL из §6 Документация
├─ Работа в GAS проекте      → §3 Шаблон GAS + skill google-apps-script
└─ Архитектура / планирование→ §1 Домены + §2 Токены + §7 Лимиты
```

---

## §1. Домены API

Каждая категория — отдельный домен. **Токен должен быть создан с нужной категорией.**

| Категория токена | Базовый домен |
|---|---|
| Контент | `content-api.wildberries.ru` |
| Аналитика | `seller-analytics-api.wildberries.ru` |
| Цены и скидки | `discounts-prices-api.wildberries.ru` |
| Маркетплейс (FBS/DBS) | `marketplace-api.wildberries.ru` |
| Статистика | `statistics-api.wildberries.ru` |
| Продвижение | `advert-api.wildberries.ru` |
| Вопросы и отзывы | `feedbacks-api.wildberries.ru` |
| Чат с покупателями | `buyer-chat-api.wildberries.ru` |
| Поставки FBW | `supplies-api.wildberries.ru` |
| Возвраты | `returns-api.wildberries.ru` |
| Документы | `documents-api.wildberries.ru` |
| Финансы | `finance-api.wildberries.ru` |
| Тарифы / Новости | `common-api.wildberries.ru` |

**Авторизация:** `Authorization: <token>` (без `Bearer`).
**Проверка токена:** `GET https://common-api.wildberries.ru/ping`.

---

## §2. Токены

JWT (RFC 7519), срок жизни **180 дней**. Поле `s` — битовая маска категорий.

> ⚠️ **Токен доступен для копирования строго один раз** — в момент генерации. Сохраняйте его сразу в безопасное хранилище.

> ⛔ **Юридическое ограничение:** Интеграция с порталом продавца Wildberries без использования официального WB API запрещена (п. 9.9.6 оферты WB). Используйте только задокументированные эндпоинты `dev.wildberries.ru`.

| Тип | `acc` | Назначение |
|---|---|---|
| Базовый | `1` | Ограниченный набор данных |
| Тестовый | `2` | Только для sandbox (`*-sandbox.wildberries.ru`) |
| Персональный | `3` | Полный доступ, собственные системы |
| Сервисный | `4` | Привязан к облачному сервису |

| Бит | Категория | Бит | Категория |
|---|---|---|---|
| 1 | Контент | 9 | Чат |
| 2 | Аналитика | 10 | Поставки |
| 3 | Цены | 11 | Возвраты |
| 4 | Маркетплейс | 12 | Документы |
| 5 | Статистика | 13 | Финансы |
| 6 | Продвижение | 16 | Пользователи |
| 7 | Отзывы | 30 | Только чтение |

---

## §3. Шаблоны кода

Подробные шаблоны клиентов для Google Apps Script: [code-templates.md](./references/code-templates.md)

### Быстрый пример (GAS)

```javascript
function wbGet(token, domain, path, params) {
  const qs = params ? '?' + Object.entries(params).map(([k,v]) => k + '=' + encodeURIComponent(v)).join('&') : '';
  const resp = UrlFetchApp.fetch('https://' + domain + path + qs, {
    method: 'get',
    headers: { 'Authorization': token },
    muteHttpExceptions: true
  });
  const code = resp.getResponseCode();
  if (code === 429) {
    Utilities.sleep((Number(resp.getHeaders()['x-ratelimit-retry']) || 60) * 1000);
    return wbGet(token, domain, path, params);
  }
  if (code !== 200) throw new Error('WB API ' + code + ': ' + resp.getContentText().substring(0, 200));
  return JSON.parse(resp.getContentText());
}
```

---

## §4. Ошибки и отладка

| Код | Значение | Решение |
|---|---|---|
| 200 | Успешно | — |
| 204 | Удалено/Обновлено (нет тела) | Нормальное поведение |
| 400 | Неправильный запрос | Проверь синтаксис тела и параметры |
| 401 | Не авторизован | Категория токена ≠ категория API, токен просрочен, лишние символы |
| 402 | Баланс исчерпан | Недостаток средств на балансе сервиса из Каталога WB. Фатальная ошибка |
| 403 | Доступ запрещён | Токен от удалённого пользователя, заблокирован, нет подписки «Джем» |
| 404 | Не найдено | Проверь URL и поле `details` в ответе |
| 409 | Ошибка сохранения | Считается как **5–10 обычных запросов** в лимитах! |
| 413 | Превышен объём | Уменьши кол-во объектов |
| 422 | Невалидные данные | Данные противоречат друг другу |
| 429 | Rate limit | Жди `X-Ratelimit-Retry` секунд |
| 5xx | Внутренняя ошибка WB | Повтори позже |

**Частые ситуации:** [error-handling.md](./references/error-handling.md)

---

## §5. Пагинация

WB API использует **разные** схемы пагинации в разных эндпоинтах:

### Cursor-based (Content API — карточки)
```
updatedAt + nmID из resp.cursor → следующий запрос
Выход: cards.length === 0 ИЛИ cursor.total < cursor.limit
```

### lastChangeDate (Statistics — заказы, продажи)
```
dateFrom = lastChangeDate последней строки → следующий запрос
flag=0 — инкрементальный (изменения с dateFrom, макс ~80 000)
flag=1 — полный за дату
Выход: пустой массив
```

### rrd_id (Statistics — финансовый отчёт)
```
rrdid = rrd_id последней строки → следующий запрос
Выход: пустой массив или 204
```

### offset/limit (Supplies, Marketplace)
```
offset += limit после каждого запроса
Выход: resp.length < limit
```

### next token (Marketplace v3)
```
next из ответа → следующий запрос
Выход: next === 0
```

---

## §6. Ключевые эндпоинты

Полный список с параметрами: [endpoints.md](./references/endpoints.md)

### Самые используемые

| Модуль | Метод | Эндпоинт | Домен |
|---|---|---|---|
| Карточки | POST | `/content/v2/get/cards/list` | content |
| Остатки | GET | `/api/v1/supplier/stocks` | statistics |
| Заказы | GET | `/api/v1/supplier/orders` | statistics |
| Продажи | GET | `/api/v1/supplier/sales` | statistics |
| Финансы | GET | `/api/v5/supplier/reportDetailByPeriod` | statistics |
| Баланс | GET | `/api/v1/account/balance` | finance |
| Поставки | POST | `/api/v1/supplies` | supplies |
| Склады | GET | `/api/v1/warehouses` | supplies |
| Цены | GET | `/api/v2/list/goods/filter` | prices |
| Реклама | GET | `/adv/v1/promotion/adverts` | promotion |
| Отзывы | GET | `/api/v1/feedbacks` | feedbacks |
| Возвраты | GET | `/api/v1/analytics/goods-return` | analytics |

---

## §7. Rate Limits

Алгоритм: **token bucket**.

### Marketplace API — лимиты зависят от типа токена

| Тип токена | Период | Лимит | Интервал | Burst |
|---|---|---|---|---|
| Персональный / Сервисный | 1 мин | 300 | 200 мс | 20 |
| Базовый / Тестовый | 1 мин | 150 | 200 мс | 10 |

### Остальные API

| API | Период | Лимит | Интервал | Burst |
|---|---|---|---|---|
| Statistics (остатки, заказы, продажи) | 1 мин | 1 | 60 сек | 1 |
| Statistics (финансы) | 1 мин | 1 | 60 сек | 1 |
| Supplies (список) | 1 мин | 30 | 2 сек | 10 |
| Supplies (склады) | 1 мин | 6 | 10 сек | 6 |
| Finance (баланс) | 1 мин | 1 | 60 сек | 1 |
| Promotion | 1 мин | 10 | 6 сек | — |
| Analytics (расширенные) | 10 сек | 1 | 10 сек | — |

### Пессимизация (штрафы за ошибки)

Запросы с ошибками динамически списывают квоту из `X-Ratelimit-Remaining`:

| Код ответа | Списание из квоты | Примечание |
|---|---|---|
| 409 Conflict (Маркетплейс) | **5–10 единиц** | Один неудачный запрос может «сжечь» до половины burst |
| 429 Too Many Requests | Burst обнулён | Ждать `X-Ratelimit-Retry` секунд |

> ⚠️ При серии 409 ошибок квота расходуется в 5–10 раз быстрее. Обязательно увеличивайте задержку при получении 409.

**Заголовки ответа:**
- `X-Ratelimit-Remaining` — сколько burst осталось
- `X-Ratelimit-Retry` — секунд до повтора при 429
- `X-Ratelimit-Reset` — секунд до восстановления burst

---

## §8. Даты

```
RFC3339:    "2024-08-16T11:19:05Z"     — большинство эндпоинтов
YYYY-MM-DD: "2024-01-01"               — Statistics dateFrom
Unix ts:    1723803545                  — некоторые эндпоинты
```

Время — **московское (UTC+3)** в Statistics API.

---

## §9. Процедура интеграции

1. **Определи категорию API** по таблице §1
2. **Проверь токен** — нужна ли отдельная категория?
3. **Найди эндпоинт** в §6 или через `web_fetch` по URL из [documentation-links.md](./references/documentation-links.md)
4. **Выбери шаблон кода** из §3 / [code-templates.md](./references/code-templates.md)
5. **Реализуй пагинацию** по §5 (выбери правильную схему!)
6. **Учти rate limits** из §7 — добавь `sleep` / retry
7. **Обработай ошибки** по §4 — минимум 429 + 401

**Всегда проверяй актуальные параметры через `web_fetch`** по URL из [documentation-links.md](./references/documentation-links.md) — WB API часто обновляется.

---

## §10. Sandbox

- URL: `https://*-sandbox.wildberries.ru`
- Требует тестовый токен (`acc: 2`)
- Данные синтетические
- Точка входа: `https://dev.wildberries.ru/sandbox`
