import { describe, expect, it } from 'vitest';
import { buildComprehensiveReportWorkbook, buildSalesReportTable, type ComprehensiveReportInput } from './exportReports';

const fixture: ComprehensiveReportInput = {
  generatedBy: 'Администратор',
  sales: [
    {
      id: 'sale-1',
      receiptNumber: 101,
      date: '2026-09-09T10:00:00.000Z',
      storeId: 'store-1',
      storeName: 'Сиёма',
      sellerId: 'user-1',
      sellerName: 'Фарход',
      customerName: 'Покупатель',
      items: [
        {
          deviceId: 'device-1',
          imei: '123456789012345',
          brand: 'Apple',
          model: 'iPhone 15',
          storage: '128 GB',
          color: 'Black',
          salePriceTjs: 1200,
          salePriceUsd: 120,
          purchaseCostUsd: 70,
          costBasisUsd: 70,
        },
      ],
      totalTjs: 1200,
      totalUsd: 120,
      recognizedProfitUsd: 50,
      exchangeRate: 10,
      paymentMethod: 'CASH',
      cashAmountTjs: 1200,
      cardAmountTjs: 0,
      status: 'COMPLETED',
    },
  ],
  expenses: [
    {
      id: 'expense-1',
      date: '2026-09-09T11:00:00.000Z',
      category: 'RENT',
      amountTjs: 200,
      amountUsd: 20,
      exchangeRate: 10,
      targetType: 'STORE',
      storeId: 'store-1',
      storeName: 'Сиёма',
      sourceAccount: 'Касса',
      comment: 'Аренда',
      createdByName: 'Администратор',
      status: 'PAID',
    },
  ],
  summary: {
    periodLabel: 'сентябрь 2026',
    storeName: 'Сиёма',
    exchangeRate: 10,
    unitsSold: 1,
    revenueTjs: 1200,
    revenueUsd: 120,
    cogsTjs: 700,
    cogsUsd: 70,
    grossProfitTjs: 500,
    grossProfitUsd: 50,
    refundPenaltiesTjs: 100,
    refundPenaltiesUsd: 10,
    // Bonuses are nobody's income: bonus-phone profit leaves profit, cash bonuses never enter it.
    bonusDeviceProfitTjs: 150,
    bonusDeviceProfitUsd: 15,
    profitTjs: 450,
    profitUsd: 45,
    cashBonusesTjs: 50,
    cashBonusesUsd: 5,
    expensesTjs: 200,
    expensesUsd: 20,
    netProfitTjs: 250,
    netProfitUsd: 25,
  },
};

describe('comprehensive Excel report', () => {
  it('creates three reconciled sheets with a formula-driven net profit', async () => {
    const workbook = await buildComprehensiveReportWorkbook(fixture);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Продажи', 'Расходы', 'Итого']);
    expect(workbook.getWorksheet('Продажи')?.getCell('A5').value).toBe(101);
    expect(workbook.getWorksheet('Расходы')?.getCell('I5').value).toBe(200);

    const summarySheet = workbook.getWorksheet('Итого');
    const netTjs = summarySheet?.getCell('B15').value;
    const netUsd = summarySheet?.getCell('C15').value;
    expect(netTjs).toMatchObject({ formula: 'B11-B13', result: 250 });
    expect(netUsd).toMatchObject({ formula: 'C11-C13', result: 25 });
    expect(String(summarySheet?.getCell('A12').value)).toMatch(/справочно/);
    expect(String(summarySheet?.getCell('A14').value)).toMatch(/бонусных телефонов.*справочно/);
    expect(summarySheet?.getCell('C14').value).toMatchObject({ result: 15 });

    const serialized = await workbook.xlsx.writeBuffer();
    expect(serialized.byteLength).toBeGreaterThan(5_000);

    const ExcelJS = (await import('exceljs')).default;
    const reopened = new ExcelJS.Workbook();
    await reopened.xlsx.load(serialized);
    expect(reopened.getWorksheet('Итого')?.getCell('B15').value).toMatchObject({ result: 250 });
  }, 60_000);
});

describe('sales report preview', () => {
  it('shows supplier cash bonuses for reference without adding them to profit', () => {
    const withBonus = buildSalesReportTable(fixture.sales, 10, 5);
    const withoutBonus = buildSalesReportTable(fixture.sales, 10, 0);
    expect(withBonus.totalsRow[10]).toBe(withoutBonus.totalsRow[10]);
    expect(withBonus.rows.some((row) => String(row[4]).includes('справочно'))).toBe(true);
  });
});
