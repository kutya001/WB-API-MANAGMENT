# Шаблоны кода для Wildberries API

## Python — WBClient

```python
import time
import requests

class WBClient:
    """Клиент для Wildberries API с retry и rate-limit."""

    def __init__(self, token: str):
        self.token = token
        self.session = requests.Session()
        self.session.headers.update({"Authorization": token})

    def get(self, domain: str, path: str, params: dict = None, retries: int = 3) -> dict:
        url = f"https://{domain}{path}"
        for attempt in range(retries):
            resp = self.session.get(url, params=params)
            if resp.status_code == 429:
                wait = int(resp.headers.get("X-Ratelimit-Retry", 60))
                time.sleep(wait)
                continue
            if resp.status_code == 204:
                return None
            resp.raise_for_status()
            return resp.json()
        raise Exception(f"Rate limit exceeded after {retries} retries: {url}")

    def post(self, domain: str, path: str, json_body: dict = None, retries: int = 3) -> dict:
        url = f"https://{domain}{path}"
        for attempt in range(retries):
            resp = self.session.post(url, json=json_body)
            if resp.status_code == 429:
                wait = int(resp.headers.get("X-Ratelimit-Retry", 60))
                time.sleep(wait)
                continue
            if resp.status_code == 204:
                return None
            resp.raise_for_status()
            return resp.json()
        raise Exception(f"Rate limit exceeded after {retries} retries: {url}")

# Примеры использования:

# Получить остатки
client = WBClient("your_token")
stocks = client.get("statistics-api.wildberries.ru", "/api/v1/supplier/stocks", {"dateFrom": "2024-01-01"})

# Получить карточки (cursor-based)
def get_all_cards(client):
    all_cards = []
    cursor = {"limit": 100}
    while True:
        body = {"settings": {"cursor": cursor, "filter": {"withPhoto": -1}}}
        resp = client.post("content-api.wildberries.ru", "/content/v2/get/cards/list", body)
        cards = resp.get("cards", [])
        if not cards:
            break
        all_cards.extend(cards)
        cursor = resp["cursor"]
        cursor["limit"] = 100
    return all_cards

# Финансовый отчёт (rrd_id pagination)
def get_finance_report(client, date_from, date_to):
    all_rows = []
    rrdid = 0
    while True:
        rows = client.get("statistics-api.wildberries.ru",
            "/api/v5/supplier/reportDetailByPeriod",
            {"dateFrom": date_from, "dateTo": date_to, "rrdid": rrdid, "limit": 100000})
        if not rows:
            break
        all_rows.extend(rows)
        rrdid = rows[-1]["rrd_id"]
    return all_rows
```

---

## JavaScript (fetch) — WBClient

```javascript
class WBClient {
  constructor(token) {
    this.token = token;
  }

  async get(domain, path, params = {}, retries = 3) {
    const qs = new URLSearchParams(params).toString();
    const url = `https://${domain}${path}${qs ? '?' + qs : ''}`;
    for (let i = 0; i < retries; i++) {
      const resp = await fetch(url, { headers: { Authorization: this.token } });
      if (resp.status === 429) {
        const wait = parseInt(resp.headers.get('X-Ratelimit-Retry') || '60', 10);
        await new Promise(r => setTimeout(r, wait * 1000));
        continue;
      }
      if (resp.status === 204) return null;
      if (!resp.ok) throw new Error(`WB API ${resp.status}: ${(await resp.text()).substring(0, 200)}`);
      return resp.json();
    }
    throw new Error(`Rate limit exceeded: ${url}`);
  }

  async post(domain, path, body = {}, retries = 3) {
    const url = `https://${domain}${path}`;
    for (let i = 0; i < retries; i++) {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { Authorization: this.token, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (resp.status === 429) {
        const wait = parseInt(resp.headers.get('X-Ratelimit-Retry') || '60', 10);
        await new Promise(r => setTimeout(r, wait * 1000));
        continue;
      }
      if (resp.status === 204) return null;
      if (!resp.ok) throw new Error(`WB API ${resp.status}: ${(await resp.text()).substring(0, 200)}`);
      return resp.json();
    }
    throw new Error(`Rate limit exceeded: ${url}`);
  }
}
```

---

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
