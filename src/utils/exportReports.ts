import { Sale, Expense } from '../types';

export interface ComprehensiveReportSummary {
  periodLabel: string;
  storeName: string;
  exchangeRate: number;
  unitsSold: number;
  revenueTjs: number;
  revenueUsd: number;
  cogsTjs: number;
  cogsUsd: number;
  grossProfitTjs: number;
  grossProfitUsd: number;
  refundPenaltiesTjs: number;
  refundPenaltiesUsd: number;
  profitTjs: number;
  profitUsd: number;
  cashBonusesTjs: number;
  cashBonusesUsd: number;
  expensesTjs: number;
  expensesUsd: number;
  netProfitTjs: number;
  netProfitUsd: number;
}

export interface ComprehensiveReportInput {
  sales: Sale[];
  expenses: Expense[];
  summary: ComprehensiveReportSummary;
  generatedBy?: string;
}

const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  RENT: 'Аренда помещения',
  SALARY: 'Зарплата сотрудников',
  EMPLOYEE_ADVANCE: 'Аванс / Подотчет сотрудника',
  UTILITIES: 'Коммуналка и интернет',
  MARKETING: 'Реклама и маркетинг',
  REPAIR_PARTS: 'Запчасти для ремонта',
  TAXES: 'Налоги и сборы',
  SUPPLIES: 'Расходные материалы',
  OTHER: 'Прочие расходы',
};

export interface ReportTable {
  headers: string[];
  rows: (string | number)[][];
  /** Trailing "ИТОГО" row, kept separate from `rows` so the on-screen preview can style it distinctly. */
  totalsRow: (string | number)[];
}

/**
 * Clean helper function to trigger CSV file download with UTF-8 BOM
 * ensuring full compatibility with Microsoft Excel, Apple Numbers and Google Sheets.
 */
async function downloadBlob(blob: Blob, fileName: string): Promise<void> {
  // 1. Mobile devices (iOS Safari, iOS PWA, Android):
  // Use Web Share API if supported for files - this allows "Save to Files" or opening in Excel natively
  if (typeof navigator !== 'undefined' && typeof navigator.canShare === 'function') {
    try {
      const file = new File([blob], fileName, { type: blob.type });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: fileName,
        });
        return;
      }
    } catch (shareErr: any) {
      if (shareErr.name === 'AbortError') {
        return; // User cancelled the share dialog
      }
      console.warn('Web Share failed, falling back to download link:', shareErr);
    }
  }

  // 2. Standard browser download link fallback:
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Important: Delay revoke so Safari and mobile browsers have time to process the download
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60000);
}

function downloadCsv(content: string, fileName: string) {
  const blob = new Blob(['\ufeff' + content], { type: 'text/csv;charset=utf-8;' });
  void downloadBlob(blob, fileName);
}

function escapeCsvField(field: any): string {
  if (field === null || field === undefined) return '""';
  const str = String(field);
  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * Builds the sales report table (headers/rows/totals) shown in the on-screen
 * report preview.
 */
export function buildSalesReportTable(sales: Sale[], rate: number = 9.5, cashBonusesUsd: number = 0): ReportTable {
  const headers = [
    '№ Чека',
    'Дата и время',
    'Магазин',
    'Кассир',
    'Товар / Модель',
    'Количество (шт)',
    'Себестоимость ($)',
    'Цена продажи ($)',
    'Сумма продажи (TJS)',
    'Курс на момент продажи',
    'Прибыль ($)',
    'Способ оплаты',
    'Статус'
  ];

  const rows: (string | number)[][] = [];
  let totalUnits = 0;
  let totalCostBasisUsd = 0;
  let totalRevenueUsd = 0;
  let totalRevenueTjs = 0;
  let totalProfitUsd = 0;

  sales.forEach((sale) => {
    const isRefunded = sale.status === 'REFUNDED';
    const dateFormatted = new Date(sale.date).toLocaleString('ru-RU');
    const operationRate = sale.exchangeRate || rate;
    let saleNaiveProfitUsd = 0;

    sale.items.forEach((item) => {
      totalUnits += 1;
      const costUsd = item.costBasisUsd || 0;
      const priceUsd = item.salePriceUsd || +(item.salePriceTjs / operationRate).toFixed(2);
      const priceTjs = item.salePriceTjs || +(item.salePriceUsd * operationRate).toFixed(2);
      // A refunded sale's original margin is void — it never counts toward totals, and
      // showing the stale pre-refund number here would misleadingly suggest it still does.
      const profitUsd = isRefunded ? 0 : +(priceUsd - costUsd).toFixed(2);
      saleNaiveProfitUsd += profitUsd;

      if (!isRefunded) {
        totalCostBasisUsd += costUsd;
        totalRevenueUsd += priceUsd;
        totalRevenueTjs += priceTjs;
      }

      rows.push([
        sale.receiptNumber,
        dateFormatted,
        sale.storeName,
        sale.sellerName,
        `${item.brand} ${item.model} ${item.storage || ''} ${item.color || ''}`.trim(),
        1,
        costUsd.toFixed(2),
        priceUsd.toFixed(2),
        priceTjs.toFixed(2),
        operationRate.toFixed(2),
        profitUsd.toFixed(2),
        sale.paymentMethod === 'CASH' ? 'Наличные' : sale.paymentMethod === 'CARD' ? 'Карта' : 'Раздельная',
        isRefunded ? 'ВОЗВРАТ' : 'ЗАВЕРШЕНА'
      ]);
    });

    // Recognized profit is a sale-level figure (accounts for below-cost sign-off and
    // exchange corrections that don't split cleanly across items), so the total is summed
    // once per sale from it — not from the naive per-item price-minus-cost rows above —
    // to match every other recognized-profit figure in Reports (see reports.service.ts).
    // Falls back to the naive sum only for older sales with no recognizedProfitUsd on record.
    if (!isRefunded) {
      totalProfitUsd += sale.recognizedProfitUsd ?? saleNaiveProfitUsd;
    }

    // The only profit a refunded sale actually leaves behind is the withheld penalty —
    // recorded as its own line so it shows up in the history and counts toward the total,
    // instead of silently vanishing along with the reversed original sale.
    if (isRefunded && (sale.penaltyFeeUsd ?? 0) > 0) {
      const penaltyUsd = sale.penaltyFeeUsd ?? 0;
      const penaltyTjs = sale.penaltyFeeTjs ?? 0;
      totalProfitUsd += penaltyUsd;

      rows.push([
        sale.receiptNumber,
        dateFormatted,
        sale.storeName,
        sale.sellerName,
        'Штраф за возврат (прибыль)',
        '',
        '',
        '',
        penaltyTjs.toFixed(2),
        // The penalty is converted at the refund's own rate, not this sale's original rate —
        // back the implied rate out of the two amounts already shown instead of reusing
        // operationRate, which would silently misstate it whenever the two days' rates differ.
        penaltyUsd > 0 ? (penaltyTjs / penaltyUsd).toFixed(2) : '',
        penaltyUsd.toFixed(2),
        sale.paymentMethod === 'CASH' ? 'Наличные' : sale.paymentMethod === 'CARD' ? 'Карта' : 'Раздельная',
        'ВОЗВРАТ (ШТРАФ)'
      ]);
    }
  });

  // Supplier cash bonuses are tied to the supplier/main warehouse, not any one store, so
  // this isn't this store's own money — it's appended once, clearly labeled, rather than
  // silently folded into totalProfitUsd where it would look like the store earned it.
  if (cashBonusesUsd !== 0) {
    totalProfitUsd += cashBonusesUsd;
    rows.push([
      '', '', '', '',
      'Бонусы поставщиков за период (наличными, по всему бизнесу)',
      '', '', '', '', '',
      cashBonusesUsd.toFixed(2),
      '', 'БОНУС'
    ]);
  }

  const totalsRow = [
    'ИТОГО:', '', '', '',
    `Всего позиций: ${rows.length}`,
    totalUnits,
    totalCostBasisUsd.toFixed(2),
    totalRevenueUsd.toFixed(2),
    totalRevenueTjs.toFixed(2),
    '',
    totalProfitUsd.toFixed(2),
    '', ''
  ];

  return { headers, rows, totalsRow };
}

const XLSX_GREEN = 'FF16A34A';
const XLSX_DARK = 'FF0F172A';
const XLSX_MUTED = 'FF64748B';
const XLSX_LIGHT = 'FFF1F5F9';
const XLSX_BORDER = 'FFE2E8F0';
const XLSX_WHITE = 'FFFFFFFF';
const XLSX_RED = 'FFDC2626';
const XLSX_MONEY_FORMAT = '#,##0.00;[Red](#,##0.00);-';

function paymentMethodLabel(method: Sale['paymentMethod']): string {
  if (method === 'CASH') return 'Наличные';
  if (method === 'CARD') return 'Карта';
  if (method === 'DEBT') return 'В долг';
  return 'Раздельная оплата';
}

function saleStatusLabel(status: Sale['status']): string {
  if (status === 'REFUNDED') return 'Возврат';
  if (status === 'EXCHANGED') return 'Обмен';
  return 'Завершена';
}

function safeWorksheetText(value: string | undefined | null, fallback = '-'): string {
  const text = value?.trim();
  return text || fallback;
}

function transliterate(str: string): string {
  const ru: Record<string, string> = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'zh',
    'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
    'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts',
    'ч': 'ch', 'ш': 'sh', 'щ': 'shch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu',
    'я': 'ya',
  };
  return str.toLowerCase().split('').map((char) => ru[char] || char).join('');
}

function safeFilePart(value: string): string {
  return transliterate(value)
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 60) || 'report';
}

async function downloadXlsx(content: ArrayBuffer, fileName: string): Promise<void> {
  const blob = new Blob([content], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  await downloadBlob(blob, fileName);
}

/**
 * Downloads one management workbook with three auditable sheets. The Summary sheet
 * references totals from Sales and Expenses, while the supplied server summary is used
 * as the reconciliation source for exchanges, refunds and historical rounding.
 */
export async function buildComprehensiveReportWorkbook({
  sales,
  expenses,
  summary,
  generatedBy,
}: ComprehensiveReportInput): Promise<import('exceljs').Workbook> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = generatedBy || 'Mobile Shop';
  const meta = workbook as unknown as { company?: string; subject?: string; title?: string };
  meta.company = 'Mobile Shop';
  meta.subject = `Финансовый отчёт — ${summary.periodLabel}`;
  meta.title = `Отчёт — ${summary.storeName}`;
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;

  const cellFormula = (formula: string, result: number) => ({
    formula,
    result,
    date1904: false,
  });

  // Create every sheet before writing cross-sheet formulas.
  const salesSheet = workbook.addWorksheet('Продажи', {
    views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
    properties: { tabColor: { argb: XLSX_GREEN } },
  });
  const expensesSheet = workbook.addWorksheet('Расходы', {
    views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
    properties: { tabColor: { argb: 'FFF59E0B' } },
  });
  const summarySheet = workbook.addWorksheet('Итого', {
    views: [{ state: 'frozen', ySplit: 5, showGridLines: false }],
    properties: { tabColor: { argb: 'FF2563EB' } },
  });

  const styleTitle = (sheet: import('exceljs').Worksheet, endColumn: string, title: string) => {
    sheet.mergeCells(`A1:${endColumn}1`);
    const titleCell = sheet.getCell('A1');
    titleCell.value = title;
    titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: XLSX_WHITE } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLSX_DARK } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
    sheet.getRow(1).height = 30;

    sheet.mergeCells(`A2:${endColumn}2`);
    const subtitleCell = sheet.getCell('A2');
    subtitleCell.value = `Период: ${summary.periodLabel}  •  Магазин: ${summary.storeName}  •  Курс: 1 USD = ${summary.exchangeRate.toFixed(4)} TJS`;
    subtitleCell.font = { name: 'Calibri', size: 10, color: { argb: XLSX_MUTED } };
    subtitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLSX_LIGHT } };
    subtitleCell.alignment = { vertical: 'middle', horizontal: 'left' };
    sheet.getRow(2).height = 22;
  };

  const styleHeader = (row: import('exceljs').Row) => {
    row.height = 30;
    row.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: XLSX_WHITE } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLSX_GREEN } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = { bottom: { style: 'medium', color: { argb: XLSX_GREEN } } };
    });
  };

  const styleTotalRow = (row: import('exceljs').Row, color = XLSX_DARK) => {
    row.height = 23;
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: XLSX_WHITE } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
      cell.border = { top: { style: 'thin', color: { argb: XLSX_BORDER } } };
    });
  };

  // SALES
  styleTitle(salesSheet, 'V', 'Отчёт по продажам и прибыли');
  salesSheet.columns = [
    { key: 'receipt', width: 12 },
    { key: 'date', width: 19 },
    { key: 'store', width: 18 },
    { key: 'seller', width: 18 },
    { key: 'customer', width: 18 },
    { key: 'products', width: 34 },
    { key: 'imei', width: 21 },
    { key: 'quantity', width: 10 },
    { key: 'status', width: 13 },
    { key: 'payment', width: 17 },
    { key: 'rate', width: 12 },
    { key: 'originalTjs', width: 17 },
    { key: 'originalUsd', width: 17 },
    { key: 'revenueTjs', width: 18 },
    { key: 'revenueUsd', width: 18 },
    { key: 'cogsTjs', width: 20 },
    { key: 'cogsUsd', width: 20 },
    { key: 'profitTjs', width: 17 },
    { key: 'profitUsd', width: 17 },
    { key: 'penaltyTjs', width: 20 },
    { key: 'penaltyUsd', width: 20 },
    { key: 'note', width: 31 },
  ];

  const salesHeader = salesSheet.getRow(4);
  salesHeader.values = [
    '№ чека', 'Дата и время', 'Магазин', 'Кассир', 'Покупатель', 'Товары', 'IMEI', 'Кол-во',
    'Статус', 'Оплата', 'Курс', 'Сумма чека (TJS)', 'Сумма чека ($)', 'Учтённая выручка (TJS)',
    'Учтённая выручка ($)', 'Себестоимость (TJS)', 'Себестоимость ($)', 'Прибыль (TJS)',
    'Прибыль ($)', 'Штраф при возврате (TJS)', 'Штраф при возврате ($)', 'Примечание',
  ];
  styleHeader(salesHeader);

  let salesDataRevenueTjs = 0;
  let salesDataRevenueUsd = 0;
  let salesDataCogsTjs = 0;
  let salesDataCogsUsd = 0;
  let salesDataProfitTjs = 0;
  let salesDataProfitUsd = 0;

  for (const sale of sales) {
    const refunded = sale.status === 'REFUNDED';
    const operationRate = sale.exchangeRate || summary.exchangeRate;
    const revenueTjs = refunded ? 0 : sale.totalTjs || 0;
    const revenueUsd = refunded ? 0 : sale.totalUsd || +(revenueTjs / operationRate).toFixed(2);
    const fallbackCostUsd = sale.items.reduce((total, item) => total + (item.costBasisUsd || item.purchaseCostUsd || 0), 0);
    const recognizedProfitUsd = refunded ? 0 : (sale.recognizedProfitUsd ?? +(revenueUsd - fallbackCostUsd).toFixed(2));
    const cogsUsd = refunded ? 0 : +(revenueUsd - recognizedProfitUsd).toFixed(2);
    const cogsTjs = refunded ? 0 : +(cogsUsd * operationRate).toFixed(2);
    const recognizedProfitTjs = refunded ? 0 : +(revenueTjs - cogsTjs).toFixed(2);

    salesDataRevenueTjs += revenueTjs;
    salesDataRevenueUsd += revenueUsd;
    salesDataCogsTjs += cogsTjs;
    salesDataCogsUsd += cogsUsd;
    salesDataProfitTjs += recognizedProfitTjs;
    salesDataProfitUsd += recognizedProfitUsd;

    const row = salesSheet.addRow([
      sale.receiptNumber,
      new Date(sale.date),
      safeWorksheetText(sale.storeName),
      safeWorksheetText(sale.sellerName),
      safeWorksheetText(sale.customerName),
      sale.items.map((item) => `${item.brand} ${item.model} ${item.storage || ''} ${item.color || ''}`.trim()).join('\n') || '-',
      sale.items.map((item) => [item.imei, item.imei2].filter(Boolean).join(' / ')).join('\n') || '-',
      sale.items.length,
      saleStatusLabel(sale.status),
      paymentMethodLabel(sale.paymentMethod),
      operationRate,
      sale.totalTjs || 0,
      sale.totalUsd || 0,
      revenueTjs,
      revenueUsd,
      cogsTjs,
      cogsUsd,
      recognizedProfitTjs,
      recognizedProfitUsd,
      sale.penaltyFeeTjs || 0,
      sale.penaltyFeeUsd || 0,
      refunded
        ? `Возврат: ${safeWorksheetText(sale.refundReason, 'причина не указана')}`
        : sale.hasBelowCostItem
          ? 'Продажа ниже себестоимости'
          : '',
    ]);
    row.height = Math.max(20, sale.items.length * 15);
    row.eachCell((cell, columnNumber) => {
      cell.font = { name: 'Calibri', size: 10, color: { argb: XLSX_DARK } };
      cell.alignment = {
        vertical: 'middle',
        horizontal: columnNumber >= 11 && columnNumber <= 21 ? 'right' : 'left',
        wrapText: columnNumber === 6 || columnNumber === 7 || columnNumber === 22,
      };
      cell.border = { bottom: { style: 'hair', color: { argb: XLSX_BORDER } } };
    });
    row.getCell(2).numFmt = 'dd.mm.yyyy hh:mm';
    row.getCell(11).numFmt = '0.0000';
    for (let column = 12; column <= 21; column += 1) row.getCell(column).numFmt = XLSX_MONEY_FORMAT;
    if (recognizedProfitUsd < 0) {
      row.getCell(18).font = { name: 'Calibri', size: 10, bold: true, color: { argb: XLSX_RED } };
      row.getCell(19).font = { name: 'Calibri', size: 10, bold: true, color: { argb: XLSX_RED } };
    }
  }

  salesSheet.autoFilter = { from: 'A4', to: 'V4' };
  const firstSalesRow = 5;
  const lastSalesRow = Math.max(firstSalesRow, firstSalesRow + sales.length - 1);
  const salesRawTotalRow = salesSheet.addRow(['ИТОГО ПО СТРОКАМ:']);
  const salesRawTotalNumber = salesRawTotalRow.number;
  const salesSum = (column: string, result: number) =>
    cellFormula(sales.length ? `SUM(${column}${firstSalesRow}:${column}${lastSalesRow})` : '0', +result.toFixed(2));
  salesRawTotalRow.getCell(14).value = salesSum('N', salesDataRevenueTjs);
  salesRawTotalRow.getCell(15).value = salesSum('O', salesDataRevenueUsd);
  salesRawTotalRow.getCell(16).value = salesSum('P', salesDataCogsTjs);
  salesRawTotalRow.getCell(17).value = salesSum('Q', salesDataCogsUsd);
  salesRawTotalRow.getCell(18).value = salesSum('R', salesDataProfitTjs);
  salesRawTotalRow.getCell(19).value = salesSum('S', salesDataProfitUsd);
  styleTotalRow(salesRawTotalRow, XLSX_MUTED);

  const reconciliationRow = salesSheet.addRow(['СВЕРКА С СЕРВЕРОМ (обмены и округления):']);
  reconciliationRow.getCell(14).value = +(summary.revenueTjs - salesDataRevenueTjs).toFixed(2);
  reconciliationRow.getCell(15).value = +(summary.revenueUsd - salesDataRevenueUsd).toFixed(2);
  reconciliationRow.getCell(16).value = +(summary.cogsTjs - salesDataCogsTjs).toFixed(2);
  reconciliationRow.getCell(17).value = +(summary.cogsUsd - salesDataCogsUsd).toFixed(2);
  reconciliationRow.getCell(18).value = +(summary.grossProfitTjs - salesDataProfitTjs).toFixed(2);
  reconciliationRow.getCell(19).value = +(summary.grossProfitUsd - salesDataProfitUsd).toFixed(2);
  reconciliationRow.font = { italic: true, color: { argb: XLSX_MUTED } };

  const recognizedRow = salesSheet.addRow(['ПРИЗНАННАЯ ПРИБЫЛЬ ОТ ПРОДАЖ:']);
  const recognizedRowNumber = recognizedRow.number;
  for (const [column, serverValue] of [
    [14, summary.revenueTjs], [15, summary.revenueUsd], [16, summary.cogsTjs], [17, summary.cogsUsd],
    [18, summary.grossProfitTjs], [19, summary.grossProfitUsd],
  ] as const) {
    const letter = salesSheet.getColumn(column).letter;
    recognizedRow.getCell(column).value = cellFormula(`${letter}${salesRawTotalNumber}+${letter}${reconciliationRow.number}`, serverValue);
  }
  styleTotalRow(recognizedRow);

  const penaltyRow = salesSheet.addRow(['ШТРАФЫ ЗА ВОЗВРАТЫ ЗА ПЕРИОД:']);
  const penaltyRowNumber = penaltyRow.number;
  penaltyRow.getCell(18).value = summary.refundPenaltiesTjs;
  penaltyRow.getCell(19).value = summary.refundPenaltiesUsd;
  penaltyRow.font = { bold: true, color: { argb: XLSX_DARK } };

  const profitAfterReturnsRow = salesSheet.addRow(['ПРИБЫЛЬ С УЧЁТОМ ВОЗВРАТОВ:']);
  const profitAfterReturnsRowNumber = profitAfterReturnsRow.number;
  profitAfterReturnsRow.getCell(18).value = cellFormula(`R${recognizedRowNumber}+R${penaltyRowNumber}`, summary.profitTjs);
  profitAfterReturnsRow.getCell(19).value = cellFormula(`S${recognizedRowNumber}+S${penaltyRowNumber}`, summary.profitUsd);
  styleTotalRow(profitAfterReturnsRow, XLSX_GREEN);

  const bonusRow = salesSheet.addRow(['БОНУСЫ ПОСТАВЩИКОВ:']);
  const bonusRowNumber = bonusRow.number;
  bonusRow.getCell(18).value = summary.cashBonusesTjs;
  bonusRow.getCell(19).value = summary.cashBonusesUsd;
  bonusRow.font = { bold: true, color: { argb: XLSX_GREEN } };

  for (let rowNumber = salesRawTotalNumber; rowNumber <= bonusRowNumber; rowNumber += 1) {
    for (let column = 12; column <= 21; column += 1) salesSheet.getRow(rowNumber).getCell(column).numFmt = XLSX_MONEY_FORMAT;
  }

  // EXPENSES
  styleTitle(expensesSheet, 'K', 'Отчёт по расходам');
  expensesSheet.columns = [
    { width: 19 }, { width: 28 }, { width: 16 }, { width: 19 }, { width: 20 }, { width: 20 },
    { width: 20 }, { width: 36 }, { width: 18 }, { width: 12 }, { width: 18 },
  ];
  const expensesHeader = expensesSheet.getRow(4);
  expensesHeader.values = [
    'Дата и время', 'Категория', 'Тип', 'Магазин', 'Источник списания', 'Сотрудник',
    'Создал', 'Комментарий / назначение', 'Сумма (TJS)', 'Курс', 'Сумма ($)',
  ];
  styleHeader(expensesHeader);

  let expenseRowsTjs = 0;
  let expenseRowsUsd = 0;
  for (const expense of expenses) {
    const operationRate = expense.exchangeRate || summary.exchangeRate;
    const amountUsd = expense.amountUsd ?? +((expense.amountTjs || 0) / operationRate).toFixed(2);
    expenseRowsTjs += expense.amountTjs || 0;
    expenseRowsUsd += amountUsd;
    const row = expensesSheet.addRow([
      new Date(expense.date),
      EXPENSE_CATEGORY_LABELS[expense.category] || expense.category,
      expense.targetType === 'BUSINESS' ? 'Бизнес' : 'Магазин',
      safeWorksheetText(expense.storeName, 'Весь бизнес'),
      safeWorksheetText(expense.sourceAccount, 'Касса'),
      safeWorksheetText(expense.employeeName),
      safeWorksheetText(expense.createdByName),
      safeWorksheetText(expense.comment || expense.description),
      expense.amountTjs || 0,
      operationRate,
      amountUsd,
    ]);
    row.eachCell((cell, columnNumber) => {
      cell.font = { name: 'Calibri', size: 10, color: { argb: XLSX_DARK } };
      cell.alignment = { vertical: 'middle', horizontal: columnNumber >= 9 ? 'right' : 'left', wrapText: columnNumber === 8 };
      cell.border = { bottom: { style: 'hair', color: { argb: XLSX_BORDER } } };
    });
    row.getCell(1).numFmt = 'dd.mm.yyyy hh:mm';
    row.getCell(9).numFmt = XLSX_MONEY_FORMAT;
    row.getCell(10).numFmt = '0.0000';
    row.getCell(11).numFmt = XLSX_MONEY_FORMAT;
  }
  expensesSheet.autoFilter = { from: 'A4', to: 'K4' };

  const firstExpenseRow = 5;
  const lastExpenseRow = Math.max(firstExpenseRow, firstExpenseRow + expenses.length - 1);
  const rawExpenseTotalRow = expensesSheet.addRow(['ИТОГО ПО СТРОКАМ:']);
  rawExpenseTotalRow.getCell(9).value = cellFormula(
    expenses.length ? `SUM(I${firstExpenseRow}:I${lastExpenseRow})` : '0',
    +expenseRowsTjs.toFixed(2)
  );
  rawExpenseTotalRow.getCell(11).value = cellFormula(
    expenses.length ? `SUM(K${firstExpenseRow}:K${lastExpenseRow})` : '0',
    +expenseRowsUsd.toFixed(2)
  );
  styleTotalRow(rawExpenseTotalRow, XLSX_MUTED);

  const expenseReconciliationRow = expensesSheet.addRow(['СВЕРКА С СЕРВЕРОМ:']);
  expenseReconciliationRow.getCell(9).value = +(summary.expensesTjs - expenseRowsTjs).toFixed(2);
  expenseReconciliationRow.getCell(11).value = +(summary.expensesUsd - expenseRowsUsd).toFixed(2);
  expenseReconciliationRow.font = { italic: true, color: { argb: XLSX_MUTED } };

  const expenseTotalRow = expensesSheet.addRow(['ИТОГО РАСХОДОВ:']);
  const expenseTotalRowNumber = expenseTotalRow.number;
  expenseTotalRow.getCell(9).value = cellFormula(`I${rawExpenseTotalRow.number}+I${expenseReconciliationRow.number}`, summary.expensesTjs);
  expenseTotalRow.getCell(11).value = cellFormula(`K${rawExpenseTotalRow.number}+K${expenseReconciliationRow.number}`, summary.expensesUsd);
  styleTotalRow(expenseTotalRow, 'FFF59E0B');
  for (let rowNumber = rawExpenseTotalRow.number; rowNumber <= expenseTotalRowNumber; rowNumber += 1) {
    expensesSheet.getRow(rowNumber).getCell(9).numFmt = XLSX_MONEY_FORMAT;
    expensesSheet.getRow(rowNumber).getCell(11).numFmt = XLSX_MONEY_FORMAT;
  }

  // SUMMARY
  styleTitle(summarySheet, 'C', 'Итоговый финансовый отчёт');
  summarySheet.columns = [{ width: 43 }, { width: 22 }, { width: 22 }];
  summarySheet.getCell('A3').value = `Сформирован: ${new Date().toLocaleString('ru-RU')}${generatedBy ? `  •  Пользователь: ${generatedBy}` : ''}`;
  summarySheet.mergeCells('A3:C3');
  summarySheet.getCell('A3').font = { italic: true, size: 9, color: { argb: XLSX_MUTED } };

  const summaryHeader = summarySheet.getRow(5);
  summaryHeader.values = ['Показатель', 'TJS', 'USD'];
  styleHeader(summaryHeader);

  const summaryRows = [
    ['Количество проданных устройств', summary.unitsSold, ''],
    ['Выручка', cellFormula(`'Продажи'!N${recognizedRowNumber}`, summary.revenueTjs), cellFormula(`'Продажи'!O${recognizedRowNumber}`, summary.revenueUsd)],
    ['Себестоимость', cellFormula(`'Продажи'!P${recognizedRowNumber}`, summary.cogsTjs), cellFormula(`'Продажи'!Q${recognizedRowNumber}`, summary.cogsUsd)],
    ['Прибыль от продаж', cellFormula(`'Продажи'!R${recognizedRowNumber}`, summary.grossProfitTjs), cellFormula(`'Продажи'!S${recognizedRowNumber}`, summary.grossProfitUsd)],
    ['Штрафы, удержанные при возвратах', cellFormula(`'Продажи'!R${penaltyRowNumber}`, summary.refundPenaltiesTjs), cellFormula(`'Продажи'!S${penaltyRowNumber}`, summary.refundPenaltiesUsd)],
    ['Прибыль с учётом возвратов', cellFormula(`'Продажи'!R${profitAfterReturnsRowNumber}`, summary.profitTjs), cellFormula(`'Продажи'!S${profitAfterReturnsRowNumber}`, summary.profitUsd)],
    ['Бонусы поставщиков', cellFormula(`'Продажи'!R${bonusRowNumber}`, summary.cashBonusesTjs), cellFormula(`'Продажи'!S${bonusRowNumber}`, summary.cashBonusesUsd)],
    ['Расходы', cellFormula(`'Расходы'!I${expenseTotalRowNumber}`, summary.expensesTjs), cellFormula(`'Расходы'!K${expenseTotalRowNumber}`, summary.expensesUsd)],
  ];
  for (const values of summaryRows) summarySheet.addRow(values);

  const netProfitRow = summarySheet.addRow(['ЧИСТАЯ ПРИБЫЛЬ ПОСЛЕ РАСХОДОВ']);
  const netProfitRowNumber = netProfitRow.number;
  netProfitRow.getCell(2).value = cellFormula(`B11+B12-B13`, summary.netProfitTjs);
  netProfitRow.getCell(3).value = cellFormula(`C11+C12-C13`, summary.netProfitUsd);
  styleTotalRow(netProfitRow, summary.netProfitUsd >= 0 ? XLSX_GREEN : XLSX_RED);

  const checkRow = summarySheet.addRow(['Контроль расхождения с серверным итогом']);
  checkRow.getCell(2).value = cellFormula(`B${netProfitRowNumber}-${summary.netProfitTjs}`, 0);
  checkRow.getCell(3).value = cellFormula(`C${netProfitRowNumber}-${summary.netProfitUsd}`, 0);
  checkRow.font = { italic: true, color: { argb: XLSX_MUTED } };

  for (let rowNumber = 6; rowNumber <= checkRow.number; rowNumber += 1) {
    const row = summarySheet.getRow(rowNumber);
    row.height = 23;
    row.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
    row.getCell(2).alignment = { vertical: 'middle', horizontal: 'right' };
    row.getCell(3).alignment = { vertical: 'middle', horizontal: 'right' };
    row.getCell(2).numFmt = rowNumber === 6 ? '#,##0' : XLSX_MONEY_FORMAT;
    row.getCell(3).numFmt = rowNumber === 6 ? '#,##0' : XLSX_MONEY_FORMAT;
    if (rowNumber !== netProfitRowNumber) {
      row.eachCell((cell) => {
        cell.border = { bottom: { style: 'hair', color: { argb: XLSX_BORDER } } };
      });
    }
  }
  const noteRowNumber = checkRow.number + 2;
  summarySheet.getCell(`A${noteRowNumber}`).value = 'Формула: прибыль с учётом возвратов + бонусы поставщиков − расходы.';
  summarySheet.mergeCells(`A${noteRowNumber}:C${noteRowNumber}`);
  summarySheet.getCell(`A${noteRowNumber}`).font = { italic: true, size: 9, color: { argb: XLSX_MUTED } };

  return workbook;
}

export async function exportComprehensiveReport(input: ComprehensiveReportInput): Promise<void> {
  const workbook = await buildComprehensiveReportWorkbook(input);
  const buffer = await workbook.xlsx.writeBuffer();
  const date = new Date().toISOString().split('T')[0];
  await downloadXlsx(buffer, `finansovyi_otchet_${safeFilePart(input.summary.storeName)}_${date}.xlsx`);
}

/**
 * Exports security audit log report.
 */
export function exportAuditLogsReport(logs: any[]) {
  const headers = ['ID Записи', 'Дата и время', 'Действие / Событие', 'Сотрудник / Пользователь', 'Роль', 'Детали события'];
  const rows = logs.map(l => [
    escapeCsvField(l.id),
    escapeCsvField(l.timestamp ? new Date(l.timestamp).toLocaleString('ru-RU') : '-'),
    escapeCsvField(l.action),
    escapeCsvField(l.userName),
    escapeCsvField(l.userRole || '-'),
    escapeCsvField(l.details)
  ]);
  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  const fileName = `otchet_audit_log_${new Date().toISOString().split('T')[0]}.csv`;
  downloadCsv(csvContent, fileName);
}
