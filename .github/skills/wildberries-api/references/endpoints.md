# Ключевые эндпоинты Wildberries API

## Content API (`content-api.wildberries.ru`)

| Метод | Эндпоинт | Описание | Пагинация |
|---|---|---|---|
| POST | `/content/v2/get/cards/list` | Список карточек | cursor (updatedAt + nmID) |
| POST | `/content/v2/cards/update` | Обновить карточки | — |
| POST | `/content/v2/tag/nomenclature/link` | Привязать теги | — |
| GET | `/content/v2/object/all` | Все категории | — |
| GET | `/content/v2/directory/brands` | Справочник брендов | — |
| GET | `/content/v2/cards/upload/file` | Статус загрузки | — |

**Параметры cursor (POST body):**
```json
{
  "settings": {
    "cursor": { "limit": 100, "updatedAt": "", "nmID": 0 },
    "filter": { "withPhoto": -1, "textSearch": "", "tagIDs": [] }
  }
}
```

---

## Statistics API (`statistics-api.wildberries.ru`)

> ⚠️ Строгий лимит: **1 запрос в минуту** для всех эндпоинтов!

| Метод | Эндпоинт | Описание | Пагинация |
|---|---|---|---|
| GET | `/api/v1/supplier/stocks` | Остатки | нет (все за раз) |
| GET | `/api/v1/supplier/orders` | Заказы | lastChangeDate |
| GET | `/api/v1/supplier/sales` | Продажи | lastChangeDate |
| GET | `/api/v5/supplier/reportDetailByPeriod` | Финансовый отчёт (детализация) | rrd_id |

**Параметры stocks:**
- `dateFrom` (YYYY-MM-DD) — обязательный

**Параметры orders / sales:**
- `dateFrom` (YYYY-MM-DD) — обязательный
- `flag` — `0` = изменения с dateFrom (макс ~80 000), `1` = полный за дату

**Ключевые поля orders:**
`date`, `lastChangeDate`, `supplierArticle`, `techSize`, `barcode`, `totalPrice`, `discountPercent`, `warehouseName`, `oblast`, `incomeID`, `odid`, `nmId`, `subject`, `category`, `brand`, `isCancel`, `cancel_dt`, `sticker`, `srid`

**Ключевые поля sales:**
`date`, `lastChangeDate`, `supplierArticle`, `techSize`, `barcode`, `totalPrice`, `discountPercent`, `isSupply`, `isRealization`, `warehouseName`, `countryName`, `oblastOkrugName`, `regionName`, `incomeID`, `saleID`, `odid`, `spp`, `forPay`, `finishedPrice`, `priceWithDisc`, `nmId`, `subject`, `category`, `brand`, `srid`

**Параметры finance (reportDetailByPeriod):**
- `dateFrom`, `dateTo` (YYYY-MM-DD) — обязательные
- `rrdid` — ID последней строки для пагинации
- `limit` — макс 100000

---

## Supplies API (`supplies-api.wildberries.ru`)

| Метод | Эндпоинт | Описание | Лимит | Интервал |
|---|---|---|---|---|
| GET | `/api/v1/warehouses` | Склады WB | 6/мин | 10 сек |
| POST | `/api/v1/supplies` | Список поставок | 30/мин | 2 сек |
| GET | `/api/v1/supplies/{ID}` | Детали поставки | 30/мин | 2 сек |
| GET | `/api/v1/supplies/{ID}/goods` | Товары в поставке | 30/мин | 2 сек |
| PATCH | `/api/v1/supplies/{ID}/deliver` | Отправить поставку | 3/мин | 20 сек |
| POST | `/api/v1/supplies/{ID}/trbx` | Создать короб | 30/мин | 2 сек |
| DELETE | `/api/v1/supplies/{ID}/trbx/{trbxID}` | Удалить короб | 30/мин | 2 сек |
| POST | `/api/v1/supplies/{ID}/trbx/{trbxID}/stickers` | QR стикеры | 30/мин | 2 сек |

**Ответ warehouses:**
```json
[{ "ID": 1, "name": "Казань", "city": "Казань", "address": "...", "acceptsQR": true }]
```

**Пагинация supplies (POST body):**
```json
{ "limit": 1000, "offset": 0, "filter": { "status": "ON_DELIVERY" } }
```

**Статусы поставки:** `UNKNOWN`, `NEW`, `CONFIRMED`, `ON_DELIVERY`, `ARRIVED`, `SORTED`, `DONE`, `CANCELLED`, `CANCELLED_BY_CLIENT`

---

## Finance API (`finance-api.wildberries.ru`)

| Метод | Эндпоинт | Описание | Лимит |
|---|---|---|---|
| GET | `/api/v1/account/balance` | Баланс кабинета | 1/мин |
| GET | `/api/v1/account/transactions` | Транзакции | — |

**Ответ balance:**
```json
{ "balance": 12345.67, "currency": "RUB" }
```

---

## Marketplace API (`marketplace-api.wildberries.ru`)

| Метод | Эндпоинт | Описание | Лимит |
|---|---|---|---|
| GET | `/api/v3/orders` | Заказы FBS | 300/мин |
| GET | `/api/v3/orders/new` | Новые заказы | 300/мин |
| PATCH | `/api/v3/orders/{ID}/confirm` | Подтвердить заказ | 300/мин |
| POST | `/api/v3/orders/{ID}/cancel` | Отменить заказ | — |
| GET | `/api/v3/warehouses` | Склады продавца | — |
| PUT | `/api/v3/stocks/{warehouseId}` | Обновить остатки FBS | — |
| GET | `/api/v3/supplies` | Список поставок FBS | — |

---

## Prices & Discounts API (`discounts-prices-api.wildberries.ru`)

| Метод | Эндпоинт | Описание |
|---|---|---|
| GET | `/api/v2/list/goods/filter` | Товары с ценами (фильтр) |
| POST | `/api/v2/upload/task` | Загрузить новые цены |
| GET | `/api/v2/list/goods/size/nm` | Размеры товара |

**Параметры goods/filter:**
- `limit` (макс 1000)
- `offset`
- `filterNmID` — фильтр по nmId

---

## Promotion API (`advert-api.wildberries.ru`)

| Метод | Эндпоинт | Описание | Лимит | Интервал |
|---|---|---|---|---|
| GET | `/adv/v1/promotion/adverts` | Список кампаний | 10/мин | 6 сек |
| GET | `/adv/v1/promotion/count` | Кол-во кампаний | 10/мин | 6 сек |
| POST | `/adv/v2/fullstats` | Полная статистика | 2/мин | 30 сек |
| GET | `/adv/v1/upd` | Параметры кампании | 10/мин | 6 сек |
| POST | `/adv/v0/start` | Запустить кампанию | 5/мин | — |
| POST | `/adv/v0/pause` | Остановить кампанию | 5/мин | — |
| POST | `/adv/v1/budget/deposit` | Пополнить бюджет | 3/мин | — |

**Типы кампаний:** `4` = Каталог, `5` = Карточка, `6` = Поиск, `7` = Рекомендации, `8` = Автоматическая, `9` = Поиск + Каталог

**Статусы:** `4` = Готова к запуску, `7` = Идёт, `8` = На модерации, `9` = Активна, `11` = На паузе

---

## Feedbacks API (`feedbacks-api.wildberries.ru`)

| Метод | Эндпоинт | Описание |
|---|---|---|
| GET | `/api/v1/feedbacks` | Отзывы |
| GET | `/api/v1/feedbacks/count` | Кол-во неотвеченных |
| PATCH | `/api/v1/feedbacks` | Ответить на отзыв |
| GET | `/api/v1/questions` | Вопросы |
| PATCH | `/api/v1/questions` | Ответить на вопрос |
| GET | `/api/v1/feedbacks/report` | XLS-отчёт |

**Параметры feedbacks:**
- `isAnswered` (bool)
- `take` (макс 5000)
- `skip`
- `nmId`
- `order` — `dateDesc` | `dateAsc` | `productValuation`

---

## Analytics API (`seller-analytics-api.wildberries.ru`)

| Метод | Эндпоинт | Описание | Интервал |
|---|---|---|---|
| GET | `/api/v1/analytics/goods-return` | Возвраты | 10 сек |
| GET | `/api/v2/nm-report/detail` | Аналитика по артикулам | 10 сек |
| GET | `/api/v2/nm-report/grouped` | Аналитика сгруппированная | 10 сек |
| POST | `/api/v1/analytics/acceptance-report` | Отчёт о приёмке | — |

---

## Returns API (`returns-api.wildberries.ru`)

| Метод | Эндпоинт | Описание |
|---|---|---|
| GET | `/api/v1/returns` | Возвраты |
| GET | `/api/v1/returns/{ID}` | Детали возврата |

---

## Common API (`common-api.wildberries.ru`)

| Метод | Эндпоинт | Описание |
|---|---|---|
| GET | `/ping` | Проверка токена |
| GET | `/api/v1/tariffs/box` | Тарифы на короб (FBS/DBS) |
| GET | `/api/v1/tariffs/pallet` | Тарифы на палету |
| GET | `/api/v1/tariffs/return` | Тарифы на возвраты |
| GET | `/api/v1/tariffs/commission` | Комиссии по категориям |
