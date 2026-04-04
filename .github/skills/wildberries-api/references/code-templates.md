# Шаблоны кода для Wildberries API (Google Apps Script)

> Все шаблоны — исключительно для Google Apps Script (`UrlFetchApp`).
> GAS имеет лимит выполнения **6 минут** на один вызов — учитывайте это при пагинации с `Utilities.sleep()`.

## Google Apps Script — паттерн с retry

```javascript
/**
 * Делает GET-запрос к WB API.
 * @param {string} token — API токен
 * @param {string} domain — домен API (например 'statistics-api.wildberries.ru')
 * @param {string} path — путь эндпоинта
 * @param {Object} [params] — query-параметры
 * @param {number} [retries=3] — кол-во попыток при 429
 * @returns {Object|null} — parsed JSON или null при 204
 */
function wbGet(token, domain, path, params, retries) {
  retries = retries || 3;
  var qs = '';
  if (params) {
    qs = '?' + Object.keys(params).map(function(k) {
      return k + '=' + encodeURIComponent(params[k]);
    }).join('&');
  }
  var url = 'https://' + domain + path + qs;

  for (var i = 0; i < retries; i++) {
    var resp = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: { 'Authorization': token },
      muteHttpExceptions: true
    });
    var code = resp.getResponseCode();

    if (code === 429) {
      var wait = Number(resp.getHeaders()['x-ratelimit-retry'] || 60);
      Utilities.sleep(wait * 1000);
      continue;
    }
    if (code === 204) return null;
    if (code !== 200) {
      throw new Error('WB API ' + code + ': ' + resp.getContentText().substring(0, 300));
    }
    return JSON.parse(resp.getContentText());
  }
  throw new Error('Rate limit exceeded after ' + retries + ' retries: ' + url);
}

/**
 * Делает POST-запрос к WB API.
 */
function wbPost(token, domain, path, body, retries) {
  retries = retries || 3;
  var url = 'https://' + domain + path;

  for (var i = 0; i < retries; i++) {
    var resp = UrlFetchApp.fetch(url, {
      method: 'post',
      headers: { 'Authorization': token },
      contentType: 'application/json',
      payload: JSON.stringify(body || {}),
      muteHttpExceptions: true
    });
    var code = resp.getResponseCode();

    if (code === 429) {
      var wait = Number(resp.getHeaders()['x-ratelimit-retry'] || 60);
      Utilities.sleep(wait * 1000);
      continue;
    }
    if (code === 204) return null;
    if (code !== 200) {
      throw new Error('WB API ' + code + ': ' + resp.getContentText().substring(0, 300));
    }
    return JSON.parse(resp.getContentText());
  }
  throw new Error('Rate limit exceeded after ' + retries + ' retries: ' + url);
}

/* ── Пример: загрузка всех заказов (lastChangeDate пагинация) ──────── */

function loadAllOrders(token) {
  var domain = 'statistics-api.wildberries.ru';
  var path = '/api/v1/supplier/orders';
  var allOrders = [];
  var dateFrom = '2024-01-01';

  while (true) {
    var orders = wbGet(token, domain, path, { dateFrom: dateFrom, flag: 0 });
    if (!orders || orders.length === 0) break;
    allOrders = allOrders.concat(orders);
    dateFrom = orders[orders.length - 1].lastChangeDate;
    Utilities.sleep(61000); // Statistics API: 1 req/min
  }
  return allOrders;
}

/* ── Пример: загрузка карточек (cursor-based) ──────────────────────── */

function loadAllCards(token) {
  var domain = 'content-api.wildberries.ru';
  var path = '/content/v2/get/cards/list';
  var allCards = [];
  var cursor = { limit: 100 };

  while (true) {
    var body = { settings: { cursor: cursor, filter: { withPhoto: -1 } } };
    var resp = wbPost(token, domain, path, body);
    var cards = (resp && resp.cards) || [];
    if (cards.length === 0) break;
    allCards = allCards.concat(cards);
    cursor = resp.cursor;
    cursor.limit = 100;
  }
  return allCards;
}
```

---

## Чтение заголовков Rate Limit (GAS)

```javascript
/**
 * Читает и логирует заголовки rate-limit из ответа WB API.
 * Используется для отладки и адаптивного throttling.
 *
 * @param {GoogleAppsScript.URL_Fetch.HTTPResponse} resp — ответ UrlFetchApp
 */
function logRateLimitHeaders(resp) {
  var headers = resp.getHeaders();
  var remaining = headers['x-ratelimit-remaining'];
  var retry     = headers['x-ratelimit-retry'];
  var reset     = headers['x-ratelimit-reset'];

  Logger.log('Rate limit — remaining: ' + remaining + ', retry: ' + retry + 's, reset: ' + reset + 's');
}

/**
 * Адаптивная задержка: если burst исчерпан — ждём X-Ratelimit-Retry секунд.
 * Учитывает лимит GAS в 6 минут — если оставшееся время меньше, чем ожидание,
 * выбрасывает исключение вместо бесконечного sleep.
 *
 * @param {GoogleAppsScript.URL_Fetch.HTTPResponse} resp — ответ UrlFetchApp
 * @param {number} startTime — Date.now() в начале выполнения скрипта
 */
function adaptiveSleep(resp, startTime) {
  var headers   = resp.getHeaders();
  var remaining = Number(headers['x-ratelimit-remaining']);
  var retryMs   = Number(headers['x-ratelimit-retry'] || 60) * 1000;
  var elapsed   = Date.now() - startTime;
  var GAS_LIMIT = 330000; // 5.5 мин — оставляем запас

  if (remaining <= 0) {
    if (elapsed + retryMs > GAS_LIMIT) {
      throw new Error('[adaptiveSleep] Недостаточно времени GAS для ожидания retry (' + retryMs + ' мс). Прервите и перезапустите.');
    }
    Utilities.sleep(retryMs);
  }
}
```

---

## Паттерн: безопасная пагинация с контролем времени GAS

```javascript
/**
 * Шаблон пагинации с защитой от превышения 6-минутного лимита GAS.
 * Пригоден для любого типа пагинации (cursor, offset, rrd_id).
 *
 * @param {Function} fetchPage — функция (pageState) → { data: [], nextState: any, done: boolean }
 * @param {*} initialState — начальное состояние пагинации
 * @param {number} sleepMs — задержка между страницами (мс)
 * @returns {Object[]} — все собранные строки
 */
function paginateWithTimeGuard(fetchPage, initialState, sleepMs) {
  var startTime = Date.now();
  var GAS_LIMIT = 330000; // 5.5 мин
  var all = [];
  var state = initialState;

  while (true) {
    if (Date.now() - startTime > GAS_LIMIT) {
      Logger.log('[paginateWithTimeGuard] Лимит времени GAS, собрано ' + all.length + ' записей');
      break;
    }

    var page = fetchPage(state);
    if (!page.data || page.data.length === 0 || page.done) break;

    all = all.concat(page.data);
    state = page.nextState;

    if (sleepMs > 0) Utilities.sleep(sleepMs);
  }

  return all;
}
```

---

## Паттерн пагинации: rrd_id (финансовый отчёт, GAS)

```javascript
function loadFinanceReport(token, dateFrom, dateTo) {
  var domain = 'statistics-api.wildberries.ru';
  var path = '/api/v5/supplier/reportDetailByPeriod';
  var allRows = [];
  var rrdid = 0;

  while (true) {
    var rows = wbGet(token, domain, path, {
      dateFrom: dateFrom,
      dateTo: dateTo,
      rrdid: rrdid,
      limit: 100000
    });
    if (!rows || rows.length === 0) break;
    allRows = allRows.concat(rows);
    rrdid = rows[rows.length - 1].rrd_id;
    Utilities.sleep(61000);
  }
  return allRows;
}
```

---

## Паттерн: offset/limit (Supplies API, GAS)

```javascript
function loadAllSupplies(token) {
  var domain = 'supplies-api.wildberries.ru';
  var path = '/api/v1/supplies';
  var allSupplies = [];
  var limit = 1000;
  var offset = 0;

  while (true) {
    var resp = wbGet(token, domain, path, { limit: limit, offset: offset });
    var supplies = (resp && resp.supplies) || [];
    allSupplies = allSupplies.concat(supplies);
    if (supplies.length < limit) break;
    offset += limit;
    Utilities.sleep(2000); // 30 req/min = 2s interval
  }
  return allSupplies;
}
```
