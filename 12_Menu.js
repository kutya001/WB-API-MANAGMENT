/**
 * ============================================================
 * 12_Menu.gs — Меню Google Sheets и точка входа
 * ============================================================
 * Создаёт меню "🛍️ WB Учёт" при открытии таблицы.
 * Содержит loadAll() — полный цикл обновления данных.
 * ============================================================
 */

/**
 * Автоматически вызывается при открытии таблицы.
 * Создаёт меню "🛍️ WB Учёт" в панели Google Sheets.
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();

  ui.createMenu('🛍️ WB Учёт')

    // --- Настройка ---
    .addItem('⚙️ Создать / обновить НАСТРОЙКИ', 'initSettingsSheet')
    .addItem('📘 Обновить МЕТАДАННЫЕ',           'initMetadataSheet')
    .addItem('📊 Открыть управление (UI)',        'showSidebar')
    .addSeparator()

    // --- Товары ---
    .addSubMenu(
      ui.createMenu('📦 Товары')
        .addItem('🔄 Артикулы',          'loadArticles')
        .addItem('📊 Остатки WB',         'loadStocksWb')
    )

    // --- Заказы и продажи ---
    .addSubMenu(
      ui.createMenu('🛒 Заказы и Продажи')
        .addItem('📊 Заказы',   'loadOrders')
        .addItem('💰 Продажи',  'loadSales')
    )

    // --- Финансы ---
    .addSubMenu(
      ui.createMenu('💳 Финансы')
        .addItem('🧾 Финансовый отчёт',   'loadFinance')
        .addItem('💳 Баланс продавца',    'loadBalance')
    )

    // --- Поставки FBW ---
    .addSubMenu(
      ui.createMenu('🚚 Поставки FBW')
        .addItem('📦 Список поставок',   'loadSupplies')
        .addItem('📋 Детали поставок',   'loadSupplyDetails')
        .addItem('🧴 Товары поставок',   'loadSupplyGoods')
        .addItem('📦 Упаковка поставок', 'loadSupplyPackages')
    )

    // --- Управленческие отчёты ---
    .addSeparator()
    .addSubMenu(
      ui.createMenu('📈 Отчёты')
        .addItem('📉 Расходы (из Финансов)', 'buildExpensesFromFinance')
        .addItem('📘 ДДР (Доходы-Расходы)',  'buildDDR')
    )

    // --- Общие действия ---
    .addSeparator()
    .addItem('🚀 Обновить ВСЁ',  'loadAll')
    .addItem('🗑️ Очистить логи', 'clearLogs')

    .addToUi();
}

// ============================================================
// SIDEBAR (HTML-панель управления)
// ============================================================

/**
 * Открывает HTML-боковую панель управления.
 * Код интерфейса — в файле 10_UI.gs
 */
function showSidebar() {
  const html = HtmlService.createTemplateFromFile('Sidebar')
    .evaluate()
    .setTitle('🛍️ WB Учёт — Управление')
    .setWidth(380);

  SpreadsheetApp.getUi().showSidebar(html);
}

/**
 * Возвращает данные для Sidebar: настройки + статус листов.
 * Вызывается из клиентского JS через google.script.run.
 *
 * @returns {Object} - { settings, sheets }
 */
function getSidebarData() {
  let settings = {};
  try { settings = getSettingsMap(); } catch (e) { settings = {}; }

  // Статус листов (есть/нет, кол-во строк)
  const ss = SpreadsheetApp.getActive();
  const sheetsStatus = {};

  Object.values(APP.sheets).forEach(name => {
    const sheet = ss.getSheetByName(name);
    sheetsStatus[name] = sheet
      ? { exists: true, rows: Math.max(0, sheet.getLastRow() - 1) }
      : { exists: false, rows: 0 };
  });

  return { settings, sheets: sheetsStatus };
}

/**
 * Запускает произвольную функцию-загрузчик из Sidebar.
 * Вызывается из JS sidebar через google.script.run.
 *
 * @param {string} funcName - Имя функции ('loadSales', 'buildDDR' и т.д.)
 * @returns {{ ok: boolean, message: string }}
 */
function runFromSidebar(funcName) {
  // Белый список допустимых функций (защита от инъекций)
  const allowed = [
    'loadArticles', 'loadStocksWb',
    'loadOrders', 'loadSales',
    'loadFinance', 'loadBalance',
    'loadSupplies', 'loadSupplyDetails', 'loadSupplyGoods', 'loadSupplyPackages',
    'buildExpensesFromFinance', 'buildDDR',
    'initSettingsSheet', 'initMetadataSheet',
    'clearLogs', 'loadAll'
  ];

  if (!allowed.includes(funcName)) {
    return { ok: false, message: `Функция "${funcName}" не разрешена.` };
  }

  try {
    const fn = this[funcName];
    if (typeof fn !== 'function') {
      return { ok: false, message: `Функция "${funcName}" не найдена.` };
    }
    fn();
    return { ok: true, message: `"${funcName}" выполнена успешно.` };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

/**
 * Сохраняет настройки из Sidebar в лист НАСТРОЙКИ.
 *
 * @param {Object} newSettings - { ключ: значение }
 * @returns {{ ok: boolean }}
 */
function saveSettingsFromSidebar(newSettings) {
  try {
    const ss    = SpreadsheetApp.getActive();
    const sheet = ss.getSheetByName(APP.sheets.SETTINGS);
    if (!sheet) throw new Error('Лист НАСТРОЙКИ не найден');

    const data = sheet.getDataRange().getValues();

    Object.entries(newSettings).forEach(([key, value]) => {
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]).trim() === key) {
          sheet.getRange(i + 1, 2).setValue(value);
          break;
        }
      }
    });

    return { ok: true };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

// ============================================================
// ПОЛНЫЙ ЦИКЛ ЗАГРУЗКИ
// ============================================================

/**
 * Запускает полный цикл загрузки данных.
 *
 * ПОРЯДОК ВАЖЕН:
 *   1. Артикулы (база для всего)
 *   2. Остатки WB
 *   3. Поставки FBW (нужны supplyID для деталей)
 *   4. Детали / товары / упаковка поставок
 *   5. Заказы
 *   6. Продажи
 *   7. Финансы
 *   8. Баланс
 *   9. Расходы (из финансов)
 *  10. ДДР (из заказов + продаж + финансов + расходов)
 *
 * ВНИМАНИЕ: Statistics API — 1 запрос/мин.
 * Полный цикл на 3 кабинета ≈ 15-30 минут.
 * GAS-скрипт имеет ограничение 6 минут на выполнение.
 * Для больших данных используй отдельные кнопки или trigger.
 */
function loadAll() {
  const startedAt = new Date();
  SpreadsheetApp.getActive().toast('Запуск полного обновления...', '🚀 WB Учёт', 5);

  try {
    loadArticles();
    loadStocksWb();
    loadSupplies();
    loadSupplyDetails();
    loadSupplyGoods();
    loadSupplyPackages();
    loadOrders();
    loadSales();
    loadFinance();
    loadBalance();
    buildExpensesFromFinance();
    buildDDR();

    const durSec = Math.round((new Date() - startedAt) / 1000);
    writeLog({
      startedAt,
      finishedAt:   new Date(),
      functionName: 'loadAll',
      status:       'OK',
      cabinet:      'ВСЕ',
      rowsLoaded:   0,
      errorMessage: `Выполнено за ${durSec} сек.`
    });

    SpreadsheetApp.getActive().toast(
      `Полное обновление завершено за ${durSec} сек.`,
      '✅ Готово', 5
    );

  } catch (e) {
    writeLog({
      startedAt,
      finishedAt:   new Date(),
      functionName: 'loadAll',
      status:       'ERROR',
      cabinet:      'ВСЕ',
      errorMessage: e.message
    });

    SpreadsheetApp.getUi().alert(`Ошибка при loadAll:\n${e.message}`);
  }
}
