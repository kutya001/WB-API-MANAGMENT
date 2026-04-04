/**
 * ============================================================
 * DEV_GUIDE.md — Инструкция разработчика WB Учёт v3.0
 * ============================================================
 * Этот файл хранится как комментарий в GAS для удобства.
 * Скопируй содержимое в README.md своего проекта.
 * ============================================================
 *
 * # WB Учёт — Инструкция разработчика
 *
 * ## Архитектура проекта
 *
 * Файлы GAS (Google Apps Script):
 *
 * | Файл                              | Назначение                                  |
 * |-----------------------------------|---------------------------------------------|
 * | 00_Config.gs                      | Конфигурация: API, схемы, константы         |
 * | 01_Utils.gs                       | Утилиты: wbRequest, даты, запись листов     |
 * | 02_Settings_11_Logs.gs            | Настройки и логирование                     |
 * | 03_06_Articles_Stocks_Orders_Sales| Артикулы, заказы, продажи                   |
 * | 07_08_Supplies_Ads.gs             | Поставки FBW, рекламные расходы             |
 * | 09_Reports.gs                     | Расчёт остатков (buildStocksCalc)           |
 * | 12_Menu.gs                        | Меню, Sidebar, loadAll                      |
 * | Sidebar.html                      | HTML-интерфейс боковой панели               |
 * | WB_manager.html                   | Полный веб-интерфейс (модальное окно)       |
 *
 * ---
 *
 * ## Листы (17 штук)
 *
 * ### Системные (4):
 * - API — кабинеты и токены
 * - НАСТРОЙКИ — параметры загрузки
 * - МЕТАДАННЫЕ — справочник полей всех листов
 * - ЛОГИ — история выполнения функций
 *
 * ### API-загружаемые (7):
 * - Артикулы_ВБ — карточки товаров (Content API)
 * - Артикулы_Баркоды — связка артикулов с баркодами (Content API)
 * - Поставки_ВБ — список поставок FBW (Supplies API)
 * - Поставки_Детализация_ВБ — товары каждой поставки (Supplies API /goods)
 * - Заказы_ВБ — заказы (Statistics API)
 * - Продажи_ВБ — продажи с полем isReturn (Statistics API)
 * - Рекламные_расходы — затраты по рекламным кампаниям (Promotion API)
 *
 * ### Расчётные (1):
 * - Остатки_ВБ — stockQty = suppliedQty − soldQty + returnedQty
 *
 * ### Ручного ввода (5):
 * - Товары — справочник продукции
 * - Планирование — план производства
 * - Запуск_ШВ — запуск в швейное производство
 * - Выпуск_ШВ — выпуск готовой продукции
 * - Фуллфилмент_и_упаковка — учёт фуллфилмента
 *
 * ---
 *
 * ## Функции загрузки
 *
 * | Функция              | Лист                     | API                          |
 * |----------------------|--------------------------|------------------------------|
 * | loadArticles()       | Артикулы_ВБ              | Content POST /cards/list     |
 * | loadArticleBarcodes()| Артикулы_Баркоды         | Content POST /cards/list     |
 * | loadSupplies()       | Поставки_ВБ              | Supplies POST /supplies      |
 * | loadSupplyDetails()  | Поставки_Детализация_ВБ  | Supplies GET /supplies/{}/goods |
 * | loadOrders()         | Заказы_ВБ                | Statistics GET /orders       |
 * | loadSales()          | Продажи_ВБ               | Statistics GET /sales        |
 * | loadAdExpenses()     | Рекламные_расходы        | Promotion POST /fullstats    |
 * | buildStocksCalc()    | Остатки_ВБ               | — (расчёт из листов)        |
 *
 * ### Групповые:
 * - loadAllGoods() — loadArticles + loadArticleBarcodes
 * - loadAllOrdersSales() — loadOrders + loadSales
 * - loadAllSupplies() — loadSupplies + loadSupplyDetails
 * - loadAll() — полный цикл всех загрузок + buildStocksCalc
 *
 * ---
 *
 * ## Как добавить новый модуль
 *
 * ### Шаг 1 — Добавь домен в WB_API (00_Config.gs) если новый хост
 * ### Шаг 2 — Добавь имя листа в APP.sheets
 * ### Шаг 3 — Добавь схему в SHEET_SCHEMAS
 * ### Шаг 4 — Добавь настройки в DEFAULT_SETTINGS (если нужны)
 * ### Шаг 5 — Создай функцию загрузки (используй wbRequest + writeObjectsToSheet)
 * ### Шаг 6 — Добавь в меню onOpen() (12_Menu.gs)
 * ### Шаг 7 — Добавь в whitelist runFromSidebar (12_Menu.gs)
 * ### Шаг 8 — Добавь кнопку в Sidebar.html
 * ### Шаг 9 — Обнови FUNC_NAMES/FUNC_SHEETS в writeLog (02_Settings_11_Logs.gs)
 *
 * ---
 *
 * ## Работа с датами
 *
 * | Задача                                    | Функция                    |
 * |-------------------------------------------|----------------------------|
 * | Отформатировать в СНГ дд.мм.гггг чч:мм:сс | `formatDateRu(value)`     |
 * | Только дата дд.мм.гггг                     | `formatDateOnlyRu(value)` |
 * | Дата для API WB (YYYY-MM-DD)               | `parseDateToIso(value)`   |
 * | Период ГГГГ-ММ                             | `toYearMonth(value)`      |
 *
 * **ПРАВИЛО**: Все даты в листах через `formatDateRu()`.
 * Все даты для API WB — через `parseDateToIso()`.
 *
 * ---
 *
 * ## Запросы к WB API
 *
 * Всегда используй `wbRequest()` — никаких прямых `UrlFetchApp.fetch()`.
 *
 * ```js
 * // GET с query-параметрами
 * const data = wbRequest('statistics', '/api/v1/supplier/sales', 'GET', null, apiKey, {
 *   dateFrom: '2026-04-01'
 * });
 *
 * // POST с телом
 * const data = wbRequest('content', '/content/v2/get/cards/list', 'POST', {
 *   settings: { cursor: { limit: 100 }, filter: { withPhoto: -1 } }
 * }, apiKey);
 * ```
 *
 * Паузы между запросами: `WB_API[apiType].rateLimit.sleepMs`.
 *
 * ---
 *
 * ## Запись данных в лист
 *
 * Всегда через `writeObjectsToSheet(sheetName, objects)`.
 * Схема листа из SHEET_SCHEMAS применяется автоматически.
 *
 * ---
 *
 * ## Логирование
 *
 * Через декоратор (рекомендуется):
 * ```js
 * const result = withLog('myFunc', 'Кабинет 1', () => {
 *   // ... логика ...
 *   return rowsCount;
 * });
 * ```
 *
 * Или напрямую:
 * ```js
 * writeLog({ startedAt, finishedAt: new Date(), functionName: 'myFunc',
 *            status: 'OK', rowsLoaded: 100 });
 * ```
 *
 * ---
 *
 * ## Адаптация к изменениям WB API
 *
 * 1. Проверь https://dev.wildberries.ru/release-notes
 * 2. Проверь https://dev.wildberries.ru/wb-status
 * 3. Проверь токен — актуальна ли категория
 * 4. Обнови URL/endpoint/маппинг полей при необходимости
 * 5. Обнови SHEET_SCHEMAS если поля изменились
 *
 * ---
 *
 * ## Ограничения GAS
 *
 * | Параметр                   | Лимит          |
 * |----------------------------|----------------|
 * | Время выполнения скрипта   | 6 минут        |
 * | Размер spreadsheet         | 10 млн ячеек   |
 * | UrlFetchApp запросов/день  | 20 000         |
 * | PropertiesService          | 9 КБ на ключ   |
 *
 * При больших данных используй MAX_PAGES_PER_RUN = 2-3
 * и запускай загрузку по частям (отдельные кнопки, не loadAll).
 *
 * Для автозапуска: Triggers → Add trigger → Time-driven
 */

// Этот файл является документацией. Он не содержит исполняемого кода.
// eslint-disable-next-line no-unused-vars
const _DEV_GUIDE_VERSION = '3.0.0';
