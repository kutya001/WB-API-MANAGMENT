/**
 * ============================================================
 * DEV_GUIDE.md — Инструкция разработчика WB Учёт v2.0
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
 * | Файл                        | Назначение                              |
 * |-----------------------------|-----------------------------------------|
 * | 00_Config.gs                | Конфигурация: API, схемы, константы     |
 * | 01_Utils.gs                 | Утилиты: wbRequest, даты, запись листов |
 * | 02_Settings_11_Logs.gs      | Настройки и логирование                 |
 * | 03_06_Articles_...          | Артикулы, остатки, заказы, продажи      |
 * | 07_08_Finance_Supplies.gs   | Финансы, баланс, поставки FBW           |
 * | 09_Reports.gs               | ДДР, расходы                            |
 * | 12_Menu.gs                  | Меню, Sidebar, loadAll                  |
 * | Sidebar.html                | HTML-интерфейс боковой панели           |
 *
 * ---
 *
 * ## Как добавить новый модуль (пример: Реклама)
 *
 * ### Шаг 1 — Добавь новый домен (если нужен новый хост)
 *
 * В 00_Config.gs, секция WB_API:
 * ```js
 * adv: {
 *   baseUrl: 'https://advert-api.wildberries.ru',
 *   tokenCategory: 'Реклама',
 *   rateLimit: { requests: 60, windowMs: 60000, sleepMs: 1100 }
 * }
 * ```
 *
 * ### Шаг 2 — Добавь имя листа в APP.sheets
 * ```js
 * ADVERTISING: 'РЕКЛАМА'
 * ```
 *
 * ### Шаг 3 — Добавь схему листа в SHEET_SCHEMAS
 * ```js
 * [APP.sheets.ADVERTISING]: {
 *   keys:   ['cabinet', 'advertId', 'name', 'status', 'type', 'budget', 'createTime'],
 *   titles: {
 *     cabinet:    'Кабинет',
 *     advertId:   'ID кампании',
 *     name:       'Название',
 *     status:     'Статус',
 *     type:       'Тип',
 *     budget:     'Бюджет',
 *     createTime: 'Дата создания'
 *   },
 *   desc: {
 *     advertId: 'Уникальный ID рекламной кампании WB',
 *     status:   '7=Кампания завершена, 9=Идут показы, 11=Приостановлена'
 *   }
 * }
 * ```
 *
 * ### Шаг 4 — Добавь настройки в DEFAULT_SETTINGS (если нужны)
 * ```js
 * { key: 'ADV_DATE_FROM', value: '2026-04-01', group: 'Реклама', description: 'Реклама: дата с' }
 * ```
 *
 * ### Шаг 5 — Создай файл загрузчика 13_Advertising.gs
 * ```js
 * function loadAdvertising() {
 *   const apiKeys = getApiKeys();
 *   const rows    = [];
 *
 *   apiKeys.forEach(item => {
 *     let resp;
 *     try {
 *       resp = wbRequest('adv', '/adv/v1/promotion/adverts', 'GET', null, item.apiKey);
 *     } catch (e) {
 *       Logger.log(`[loadAdvertising] Кабинет "${item.cabinet}": ${e.message}`);
 *       return;
 *     }
 *
 *     if (!resp || !Array.isArray(resp)) return;
 *
 *     resp.forEach(adv => {
 *       rows.push({
 *         cabinet:    item.cabinet,
 *         advertId:   adv.advertId   || '',
 *         name:       adv.name       || '',
 *         status:     adv.status     || '',
 *         type:       adv.type       || '',
 *         budget:     adv.budget     || 0,
 *         createTime: formatDateRu(adv.createTime)
 *       });
 *     });
 *
 *     markApiUsed(item.row);
 *     Utilities.sleep(WB_API.adv.rateLimit.sleepMs);
 *   });
 *
 *   const count = writeObjectsToSheet(APP.sheets.ADVERTISING, rows);
 *   SpreadsheetApp.getActive().toast(`Реклама: ${count} кампаний`, '📣 Реклама', 3);
 *   return count;
 * }
 * ```
 *
 * ### Шаг 6 — Добавь в меню (12_Menu.gs)
 * ```js
 * .addItem('📣 Загрузить рекламу', 'loadAdvertising')
 * ```
 *
 * ### Шаг 7 — Добавь в whitelist runFromSidebar (12_Menu.gs)
 * ```js
 * const allowed = [..., 'loadAdvertising'];
 * ```
 *
 * ### Шаг 8 — Добавь кнопку в Sidebar.html
 * ```html
 * <button class="btn btn-secondary" onclick="run('loadAdvertising')">
 *   <span class="icon">📣</span> Реклама
 * </button>
 * ```
 *
 * ---
 *
 * ## Работа с датами
 *
 * | Задача                          | Функция                     |
 * |---------------------------------|-----------------------------|
 * | Отформатировать в СНГ дд.мм.гггг чч:мм:сс | `formatDateRu(value)` |
 * | Только дата дд.мм.гггг          | `formatDateOnlyRu(value)`   |
 * | Дата для API WB (YYYY-MM-DD)    | `parseDateToIso(value)`     |
 * | Текущее время в СНГ формате     | `nowRu()`                   |
 * | Период ГГГГ-ММ для ДДР          | `toYearMonth(value)`        |
 *
 * **ПРАВИЛО**: Все даты записываются в листы через `formatDateRu()`.
 * Все даты отправляемые в API WB — через `parseDateToIso()`.
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
 * Паузы между запросами берём из `WB_API[apiType].rateLimit.sleepMs`.
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
 * Простое логирование:
 * ```js
 * writeLog({ startedAt: new Date(), finishedAt: new Date(), functionName: 'myFunc',
 *            status: 'OK', rowsLoaded: 100 });
 * ```
 *
 * Через декоратор (рекомендуется):
 * ```js
 * const result = withLog('myFunc', 'Кабинет 1', () => {
 *   // ... логика ...
 *   return rowsCount;  // число строк
 * });
 * ```
 *
 * ---
 *
 * ## Адаптация к изменениям WB API
 *
 * WB периодически меняет API без предупреждения. Чек-лист при ошибке:
 *
 * 1. Проверь https://dev.wildberries.ru/release-notes — были ли изменения
 * 2. Проверь https://dev.wildberries.ru/wb-status — доступен ли API сейчас
 * 3. Проверь токен в листе API — актуальна ли категория
 * 4. Обнови базовый URL в WB_API если домен изменился
 * 5. Обнови endpoint в вызове функции
 * 6. Обнови маппинг полей в функции загрузки (ключи ответа могут измениться)
 * 7. При необходимости — обнови схему в SHEET_SCHEMAS
 *
 * Подпишись на Telegram: https://t.me/wb_api_notifications
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
 * | CacheService               | 100 КБ на ключ |
 *
 * При данных > 50 000 строк — используй MAX_PAGES_PER_RUN = 2-3
 * и запускай загрузку по частям (отдельные кнопки, не loadAll).
 *
 * Для автозапуска — настрой Time-based trigger в меню GAS:
 * Triggers → Add trigger → loadAll (или отдельные функции) → Time-driven
 */

// Этот файл является документацией. Он не содержит исполняемого кода.
// eslint-disable-next-line no-unused-vars
const _DEV_GUIDE_VERSION = '2.0.0';
