/**
 * ============================================================
 * 09_Reports.gs — Управленческие отчёты
 * ============================================================
 * Содержит:
 *  - buildExpensesFromFinance() — агрегация расходов
 *  - buildDDR()                — ДДР по месяцам и кабинетам
 *
 * НЕ делает запросы к API — работает только с данными листов.
 * Запускать ПОСЛЕ загрузки ФИНАНСЫ / ЗАКАЗЫ / ПРОДАЖИ.
 * ============================================================
 */

/**
 * Строит лист РАСХОДЫ из данных листа ФИНАНСЫ.
 *
 * Каждая строка ФИНАНСЫ → строка РАСХОДЫ с агрегацией по:
 *   - кабинет
 *   - период (ГГГГ-ММ)
 *   - тип документа
 *   - артикул
 *
 * Формулы расчёта:
 *   wb_expense_estimate = MAX(0, gross_amount - payout_amount)
 *   gross_amount        = retail_amount || retail_price_withdisc_rub || retail_price
 *   payout_amount       = ppvz_for_pay || forPay
 *   logistics_amount    = delivery_amount || return_amount
 */
function buildExpensesFromFinance() {
  const startedAt   = new Date();
  const financeRows = readSheetAsObjects(APP.sheets.FINANCE);

  if (!financeRows.length) {
    SpreadsheetApp.getActive().toast('Лист ФИНАНСЫ пуст. Сначала загрузите финансы.', '⚠️ Внимание', 4);
    return;
  }

  const out = financeRows.map(r => {
    // Кабинет и период
    const cabinet = String(r['Кабинет'] || r.cabinet || '').trim();

    // Ищем дату в порядке приоритета (rr_dt = дата отчёта — самая надёжная)
    const period =
      toYearMonth(r['Дата отчёта']    || r.rr_dt)   ||
      toYearMonth(r['Дата продажи']   || r.sale_dt)  ||
      toYearMonth(r['Дата создания']  || r.create_dt)||
      toYearMonth(r['Период с']       || r.date_from);

    // Суммы (ищем по русскому и техническому имени — лист мог быть создан любым способом)
    const gross   = pickNumber(r, ['Сумма розничная', 'retail_amount', 'Цена со скидкой, руб', 'retail_price_withdisc_rub', 'retail_price']);
    const payout  = pickNumber(r, ['К выплате WB', 'ppvz_for_pay', 'forPay']);
    const penalty = pickNumber(r, ['Штраф', 'penalty']);
    const add     = pickNumber(r, ['Доп. начисление', 'additional_payment']);
    const logist  = pickNumber(r, ['Логистика', 'delivery_amount', 'return_amount', 'dlv_prc']);
    const comm    = pickNumber(r, ['Комиссия %', 'commission_percent']);
    const qty     = pickNumber(r, ['Количество', 'quantity']);

    const wbExpense = Math.max(0, gross - payout);

    return {
      cabinet:             cabinet,
      period:              period,
      doc_type_name:       String(r['Тип документа'] || r.doc_type_name || ''),
      supplier_oper_name:  String(r['Операция']      || r.supplier_oper_name || ''),
      nm_id:               String(r['Артикул WB']    || r.nm_id || ''),
      supplier_article:    String(r['Артикул продавца'] || r.sa_name || ''),
      quantity:            qty,
      gross_amount:        round2(gross),
      payout_amount:       round2(payout),
      wb_expense_estimate: round2(wbExpense),
      logistics_amount:    round2(logist),
      penalty_amount:      round2(penalty),
      additional_payment:  round2(add),
      commission_percent:  round2(comm)
    };
  });

  const count = writeObjectsToSheet(APP.sheets.EXPENSES, out);
  writeLog({
    startedAt,
    finishedAt:   new Date(),
    functionName: 'buildExpensesFromFinance',
    status:       'OK',
    cabinet:      'ВСЕ',
    rowsLoaded:   count
  });
  SpreadsheetApp.getActive().toast(`Расходы: ${count} строк`, '📉 Расходы', 3);
}

/**
 * Строит сводный отчёт ДДР (Доходы-Расходы) по месяцам и кабинетам.
 *
 * Источники данных:
 *   ЗАКАЗЫ    → orders_count, orders_amount
 *   ПРОДАЖИ   → sales_count, sales_amount
 *   ФИНАНСЫ   → gross_finance_amount, wb_payout_amount, returns_amount
 *   РАСХОДЫ   → wb_expense_estimate, penalties_amount, logistics_amount
 *
 * Результат: ГГГГ-ММ × Кабинет = агрегированные показатели
 * Чистый поток (оценка) = wb_payout_amount - penalties_amount
 * ДРР % = (logistics_amount + penalties_amount) / gross_finance_amount × 100
 */
function buildDDR() {
  const startedAt = new Date();
  const orders   = readSheetAsObjects(APP.sheets.ORDERS);
  const sales    = readSheetAsObjects(APP.sheets.SALES);
  const finance  = readSheetAsObjects(APP.sheets.FINANCE);
  const expenses = readSheetAsObjects(APP.sheets.EXPENSES);

  // Аккумулятор: key = "YYYY-MM__Кабинет"
  const map = {};

  function getKey(period, cabinet) { return `${period}__${cabinet}`; }

  function ensure(period, cabinet) {
    const key = getKey(period, cabinet);
    if (!map[key]) {
      map[key] = {
        period, cabinet,
        orders_count: 0, orders_amount: 0,
        sales_count: 0, sales_amount: 0,
        returns_amount: 0,
        gross_finance_amount: 0,
        wb_payout_amount: 0,
        wb_expense_estimate: 0,
        penalties_amount: 0,
        logistics_amount: 0
      };
    }
    return map[key];
  }

  // --- Заказы ---
  orders.forEach(r => {
    const cabinet = String(r['Кабинет'] || r.cabinet || '').trim();
    // Дата заказа уже в СНГ формате — parseDateToIso обработает
    const period  = toYearMonth(r['Дата заказа'] || r.date || r.lastChangeDate);
    if (!period || !cabinet) return;

    const item = ensure(period, cabinet);
    item.orders_count  += 1;
    item.orders_amount += pickNumber(r, [
      'Цена со скидкой', 'priceWithDisc', 'Финальная цена', 'finishedPrice', 'Цена без скидки', 'totalPrice'
    ]);
  });

  // --- Продажи ---
  sales.forEach(r => {
    const cabinet = String(r['Кабинет'] || r.cabinet || '').trim();
    const period  = toYearMonth(r['Дата продажи'] || r.date || r.lastChangeDate);
    if (!period || !cabinet) return;

    const item = ensure(period, cabinet);
    item.sales_count  += 1;
    item.sales_amount += pickNumber(r, [
      'К выплате WB', 'forPay', 'Цена со скидкой', 'priceWithDisc', 'Финальная цена', 'finishedPrice'
    ]);
  });

  // --- Финансы ---
  finance.forEach(r => {
    const cabinet = String(r['Кабинет'] || r.cabinet || '').trim();
    const period  =
      toYearMonth(r['Дата отчёта'] || r.rr_dt)   ||
      toYearMonth(r['Дата продажи'] || r.sale_dt) ||
      toYearMonth(r['Период с'] || r.date_from);
    if (!period || !cabinet) return;

    const item    = ensure(period, cabinet);
    const gross   = pickNumber(r, ['Сумма розничная', 'retail_amount', 'Цена со скидкой, руб', 'retail_price_withdisc_rub']);
    const payout  = pickNumber(r, ['К выплате WB', 'ppvz_for_pay', 'forPay']);
    const docType = String(r['Тип документа'] || r.doc_type_name || '').toLowerCase();

    item.gross_finance_amount += gross;
    item.wb_payout_amount     += payout;

    // Возвраты — отдельная категория
    if (docType.indexOf('возврат') !== -1) {
      item.returns_amount += Math.abs(gross);
    }
  });

  // --- Расходы ---
  expenses.forEach(r => {
    const cabinet = String(r['Кабинет'] || r.cabinet || '').trim();
    const period  = String(r['Период (ГГ-ММ)'] || r.period || '').trim();
    if (!period || !cabinet) return;

    const item = ensure(period, cabinet);
    item.wb_expense_estimate += pickNumber(r, ['Расходы WB (оценка)', 'wb_expense_estimate']);
    item.penalties_amount    += pickNumber(r, ['Штрафы', 'penalty_amount']);
    item.logistics_amount    += pickNumber(r, ['Логистика', 'logistics_amount']);
  });

  // Итоговая таблица
  const out = Object.keys(map)
    .map(k => {
      const x = map[k];
      const netCashflow = round2(x.wb_payout_amount - x.penalties_amount);
      const drrPercent  = x.gross_finance_amount > 0
        ? round2((x.logistics_amount + x.penalties_amount) / x.gross_finance_amount * 100)
        : 0;

      return {
        period:                  x.period,
        cabinet:                 x.cabinet,
        orders_count:            x.orders_count,
        orders_amount:           round2(x.orders_amount),
        sales_count:             x.sales_count,
        sales_amount:            round2(x.sales_amount),
        returns_amount:          round2(x.returns_amount),
        gross_finance_amount:    round2(x.gross_finance_amount),
        wb_payout_amount:        round2(x.wb_payout_amount),
        wb_expense_estimate:     round2(x.wb_expense_estimate),
        penalties_amount:        round2(x.penalties_amount),
        logistics_amount:        round2(x.logistics_amount),
        ddr_net_cashflow_estimate: netCashflow,
        drr_percent:             drrPercent
      };
    })
    .sort((a, b) => {
      if (a.period   !== b.period)   return a.period   > b.period   ? 1 : -1;
      if (a.cabinet  !== b.cabinet)  return a.cabinet  > b.cabinet  ? 1 : -1;
      return 0;
    });

  const count = writeObjectsToSheet(APP.sheets.DDR, out);
  writeLog({
    startedAt,
    finishedAt:   new Date(),
    functionName: 'buildDDR',
    status:       'OK',
    cabinet:      'ВСЕ',
    rowsLoaded:   count
  });
  SpreadsheetApp.getActive().toast(`ДДР построен: ${count} строк`, '📘 ДДР', 3);
}
