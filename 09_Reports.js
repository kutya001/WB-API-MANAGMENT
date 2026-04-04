/**
 * ============================================================
 * 09_Reports.gs — Расчётные листы
 * ============================================================
 * Содержит:
 *  - buildStocksCalc() — расчёт остатков по поставкам и продажам
 *
 * НЕ делает запросы к API — работает только с данными листов.
 * Запускать ПОСЛЕ загрузки Поставки_Детализация_ВБ и Продажи_ВБ.
 * ============================================================
 */

/**
 * Рассчитывает остатки на основе данных:
 *   Поставки_Детализация_ВБ — поставленные количества
 *   Продажи_ВБ              — продажи (saleID начинается с S) и возвраты (saleID начинается с R)
 *   Артикулы_ВБ             — справочник brand/subject для обогащения
 *
 * Группировка: (cabinet, nmID, barcode)
 * Формула: stockQty = suppliedQty − soldQty + returnedQty
 * Результат → лист Остатки_ВБ
 */
function buildStocksCalc() {
  const startedAt = new Date();

  // --- Читаем исходные данные ---
  const supplyRows  = readSheetAsObjects(APP.sheets.SUPPLY_DETAILS);
  const salesRows   = readSheetAsObjects(APP.sheets.SALES);
  const articleRows = readSheetAsObjects(APP.sheets.ARTICLES);

  // --- Справочник артикулов: nmID → { vendorCode, brand, subject } ---
  const articleMap = {};
  articleRows.forEach(r => {
    const nmID = String(r['Артикул WB (nmID)'] || r.nmID || '').trim();
    if (!nmID) return;
    articleMap[nmID] = {
      vendorCode: String(r['Артикул продавца'] || r.vendorCode || ''),
      brand:      String(r['Бренд']            || r.brand || ''),
      subject:    String(r['Предмет']          || r.subjectName || '')
    };
  });

  // --- Аккумулятор: key = "cabinet__nmID__barcode" ---
  const map = {};

  function ensure(cabinet, nmID, barcode, techSize) {
    const key = `${cabinet}__${nmID}__${barcode}`;
    if (!map[key]) {
      const info = articleMap[String(nmID)] || {};
      map[key] = {
        cabinet:     cabinet,
        nmID:        nmID,
        vendorCode:  info.vendorCode || '',
        barcode:     barcode,
        techSize:    techSize || '',
        brand:       info.brand   || '',
        subject:     info.subject || '',
        suppliedQty: 0,
        soldQty:     0,
        returnedQty: 0,
        stockQty:    0
      };
    }
    return map[key];
  }

  // --- Поставки: суммируем quantity ---
  supplyRows.forEach(r => {
    const cabinet  = String(r['Кабинет']           || r.cabinet || '').trim();
    const nmID     = String(r['Артикул WB']        || r.nmID || '').trim();
    const barcode  = String(r['Баркод']            || r.barcode || '').trim();
    const techSize = String(r['Тех. размер']       || r.techSize || '').trim();
    const qty      = pickNumber(r, ['Кол-во', 'quantity']);

    if (!cabinet || !nmID) return;

    ensure(cabinet, nmID, barcode, techSize).suppliedQty += qty;
  });

  // --- Продажи: S = продажа, R = возврат ---
  salesRows.forEach(r => {
    const cabinet  = String(r['Кабинет']           || r.cabinet || '').trim();
    const nmID     = String(r['Артикул WB']        || r.nmId || '').trim();
    const barcode  = String(r['Баркод']            || r.barcode || '').trim();
    const techSize = String(r['Тех. размер']       || r.techSize || '').trim();
    const saleID   = String(r['ID продажи']        || r.saleID || '').trim();

    if (!cabinet || !nmID) return;

    const item = ensure(cabinet, nmID, barcode, techSize);
    if (saleID.charAt(0) === 'R') {
      item.returnedQty += 1;
    } else {
      item.soldQty += 1;
    }
  });

  // --- Расчёт stockQty и формирование результата ---
  const out = Object.keys(map).map(key => {
    const x = map[key];
    x.stockQty = x.suppliedQty - x.soldQty + x.returnedQty;
    return x;
  });

  const count = writeObjectsToSheet(APP.sheets.STOCKS_CALC, out);
  writeLog({
    startedAt,
    finishedAt:   new Date(),
    functionName: 'buildStocksCalc',
    status:       'OK',
    cabinet:      'ВСЕ',
    rowsLoaded:   count
  });
  SpreadsheetApp.getActive().toast(`Остатки рассчитаны: ${count} позиций`, '📊 Остатки', 3);
  return count;
}
