# Ошибки и отладка WB API

## Частые проблемы и решения

### 401 Unauthorized

**Причины:**
1. **Категория токена не совпадает с доменом** — самая частая ошибка
   - Пример: токен создан только для «Контент», а запрос идёт на `statistics-api`
   - Проверка: декодировать JWT, посмотреть поле `s` (битовая маска)
2. **Токен просрочен** — TTL 180 дней
3. **Лишние символы** — пробелы, переводы строк в хедере
4. **Неверный формат** — используется `Bearer token` вместо просто `token`

**Решение:**
```javascript
// Проверка токена:
// GET https://common-api.wildberries.ru/ping
// Headers: Authorization: <token>
// 200 = OK, 401 = невалидный
```

### 403 Forbidden

**Причины:**
1. Токен от удалённого/заблокированного пользователя
2. Аккаунт заблокирован WB
3. IP-ограничения (если включены в настройках)

### 409 Conflict

**Критично:** каждый ответ 409 считается за **5–10 обычных запросов** в системе rate limiting!

**Причины:**
1. Попытка обновить уже изменённые данные
2. Конкурентные запросы из разных систем
3. Невалидные данные при обновлении карточек

### 429 Too Many Requests

**Алгоритм обработки:**
1. Прочитать заголовок `X-Ratelimit-Retry` (секунды до повтора)
2. Выждать указанное время
3. Повторить запрос
4. Если заголовка нет — подождать 60 секунд

```javascript
if (code === 429) {
  var retryAfter = Number(resp.getHeaders()['x-ratelimit-retry'] || 60);
  Utilities.sleep(retryAfter * 1000);
  // повторить запрос
}
```

**Профилактика:**
- Statistics API: обязательно `sleep(61000)` между запросами
- Supplies API: `sleep(2000)` между запросами
- Promotion API: `sleep(6000)` — `sleep(30000)` в зависимости от эндпоинта
- Analytics API: `sleep(10000)` между запросами

### 400 Bad Request

**Частые причины:**
1. Неправильный формат даты (нужен `YYYY-MM-DD` или RFC3339)
2. Отсутствует обязательный параметр
3. Значение за пределами допустимого диапазона
4. Неправильный Content-Type для POST (нужен `application/json`)

### 413 Payload Too Large

- Уменьшить кол-во объектов в POST-теле
- Для карточек: макс 1000 за раз
- Для обновления цен: макс 1000 SKU

### 422 Unprocessable Entity

- Данные прошли валидацию формата, но противоречат бизнес-логике
- Пример: попытка обновить карточку с несуществующей категорией

---

## Заголовки Rate Limit

Каждый ответ WB API содержит заголовки:

| Заголовок | Описание |
|---|---|
| `X-Ratelimit-Remaining` | Оставшийся burst (кол-во запросов до ожидания) |
| `X-Ratelimit-Retry` | Секунд до следующей попытки (при 429) |
| `X-Ratelimit-Reset` | Секунд до полного восстановления burst |

---

## Отладка в GAS

```javascript
// Логирование запроса
function debugWbRequest(token, domain, path, params) {
  var url = 'https://' + domain + path;
  Logger.log('URL: ' + url);
  Logger.log('Params: ' + JSON.stringify(params));

  var resp = UrlFetchApp.fetch(url + '?' + buildQS(params), {
    headers: { 'Authorization': token },
    muteHttpExceptions: true
  });

  Logger.log('Status: ' + resp.getResponseCode());
  Logger.log('Headers: ' + JSON.stringify(resp.getHeaders()));
  Logger.log('Body (first 500): ' + resp.getContentText().substring(0, 500));
  return resp;
}
```

---

## Чеклист при ошибке

1. [ ] Токен валиден? → `GET /ping` на `common-api`
2. [ ] Категория токена совпадает с доменом?
3. [ ] Правильный домен для эндпоинта?
4. [ ] Формат даты (YYYY-MM-DD vs RFC3339)?
5. [ ] Не превышен rate limit?
6. [ ] Content-Type = `application/json` для POST?
7. [ ] `muteHttpExceptions: true` включён (GAS)?
8. [ ] Нет лишних символов/пробелов в токене?
