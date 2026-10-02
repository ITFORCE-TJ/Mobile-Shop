// Destructive suite (cleans up with direct deletes): refuses anything but a temporary schema.
// Run it with `npm run test:e2e`, which creates and drops that schema.
import './lib/require-disposable-db';
import { D } from '../server/src/common/decimal';
import { app } from '../server/src/app';
import { prisma } from '../server/src/prisma/prisma.service';

async function runE2ETests() {
  console.log('🚀 STARTING DATABASE-BACKED E2E AUDIT SUITE...\n');
  const server = await new Promise<import('node:http').Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const address = server.address() as { port: number };
  const TEST_PORT = address.port;
  const API_BASE = `http://127.0.0.1:${TEST_PORT}/api`;

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✓ PASSED: ${testName}`);
      passed++;
    } else {
      console.error(`  ✕ FAILED: ${testName}${detail ? ` -> ${detail}` : ''}`);
      failed++;
    }
  }

  try {
    // 1. AUTH & LOGIN TEST
    console.log('--- 1. AUTHENTICATION & LOGIN ---');
    let adminToken = '';
    let sellerToken = '';

    const adminRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: 'admin', password: 'admin123' })
    });
    const adminData = await adminRes.json();
    assert(adminRes.ok && !!adminData.token, 'Login ADMIN (admin / admin123)');
    adminToken = adminData.token;
    if (!adminRes.ok || !adminToken) {
      throw new Error('E2E setup failed: admin login is required to initialize the exchange rate');
    }

    // Seed intentionally leaves the daily rate unset. Set it through the real API
    // so the server uses the configured business timezone and records the actor.
    const testExchangeRate = D(10.5);
    const setRateRes = await fetch(`${API_BASE}/exchange-rate/today`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ rate: testExchangeRate }),
    });
    const initializedRate = await setRateRes.json();
    const rateInitialized = setRateRes.ok && D(initializedRate?.rate).eq(testExchangeRate);
    assert(rateInitialized, 'Initialize today exchange rate before financial operations');
    if (!rateInitialized) {
      throw new Error(`E2E setup failed: exchange rate initialization returned HTTP ${setRateRes.status}`);
    }

    const partnerRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: 'partner', password: 'partner123' })
    });
    const partnerData = await partnerRes.json();
    assert(partnerRes.ok && !!partnerData.token, 'Login PARTNER (partner / partner123)');

    const sellerRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: 'ahmad', password: 'seller123' })
    });
    const sellerData = await sellerRes.json();
    assert(sellerRes.ok && !!sellerData.token && sellerData.user.role === 'SELLER', 'Login SELLER (ahmad / seller123)');
    sellerToken = sellerData.token;

    const invalidRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: 'admin', password: 'wrongpassword' })
    });
    assert(invalidRes.status === 401, 'Login Reject invalid password');

    // 2. USER MANAGEMENT & SELLER MANDATORY STORE VALIDATION
    console.log('\n--- 2. USERS & MANDATORY SELLER STORE BINDING ---');
    const noStoreSellerRes = await fetch(`${API_BASE}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ name: 'Test Seller No Store', login: `test_nostore_${Date.now()}`, password: 'password123', role: 'SELLER' })
    });
    assert(noStoreSellerRes.status === 400, 'Reject SELLER creation without storeId (400 Bad Request)');

    const validSellerLogin = `seller_audit_${Date.now()}`;
    const validSellerRes = await fetch(`${API_BASE}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ name: 'Audit Test Seller', login: validSellerLogin, password: 'password123', role: 'SELLER', storeId: 'store-siyoma' })
    });
    const validSellerData = await validSellerRes.json();
    assert(validSellerRes.status === 201 && validSellerData.storeId === 'store-siyoma', 'Create SELLER with mandatory storeId');

    const usersRes = await fetch(`${API_BASE}/users`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const users = await usersRes.json();
    assert(usersRes.ok && Array.isArray(users) && users.length >= 4, 'Fetch users list');

    if (validSellerData?.id) {
      await fetch(`${API_BASE}/users/${validSellerData.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` }
      });
    }

    // 3. STORE ISOLATION & STORES API
    console.log('\n--- 3. STORE MANAGEMENT & DATA ISOLATION ---');
    const adminStoresRes = await fetch(`${API_BASE}/stores`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const adminStores = await adminStoresRes.json();
    assert(adminStoresRes.ok && Array.isArray(adminStores) && adminStores.length >= 2, 'ADMIN fetches all stores');

    const sellerStoresRes = await fetch(`${API_BASE}/stores`, {
      headers: { Authorization: `Bearer ${sellerToken}` }
    });
    const sellerStores = await sellerStoresRes.json();
    // A SELLER sees their own store plus the main warehouse (needed to request transfers
    // pulling stock from it into their store) — but no other retail store.
    assert(
      sellerStoresRes.ok && Array.isArray(sellerStores) && sellerStores.length === 2 &&
      sellerStores.some((s: any) => s.id === 'store-siyoma') && sellerStores.some((s: any) => s.isMainWarehouse === true),
      'SELLER fetches only their own store + the main warehouse'
    );

    const newStoreName = `Филиал Аудит ${Date.now()}`;
    const createStoreRes = await fetch(`${API_BASE}/stores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ name: newStoreName, address: 'ул. Рудаки 15' })
    });
    const newStore = await createStoreRes.json();
    assert(createStoreRes.status === 201 && newStore.name === newStoreName, 'ADMIN creates new store');

    if (newStore?.id) {
      const delStoreRes = await fetch(`${API_BASE}/stores/${newStore.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert(delStoreRes.ok, 'Delete created store');
    }

    // 4. SUPPLIERS & INVENTORIES / PURCHASES
    console.log('\n--- 4. SUPPLIERS & INVENTORY PURCHASES ---');
    let createdDeviceId = '';
    const suppliersRes = await fetch(`${API_BASE}/suppliers`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    let suppliers = await suppliersRes.json();
    assert(suppliersRes.ok && Array.isArray(suppliers), 'Fetch suppliers list');

    // Self-contained: don't assume a supplier already exists (e.g. right after a
    // clean database reset) — create one if the list is empty.
    if (suppliers.length === 0) {
      const createSupplierRes = await fetch(`${API_BASE}/suppliers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ name: 'E2E Test Supplier' })
      });
      assert(createSupplierRes.ok, 'Create fallback supplier for e2e run');
      suppliers = [await createSupplierRes.json()];
    }

    const supplierId = suppliers[0].id;
    const testImei = `888${Date.now().toString().slice(-12)}`;
    const purchaseRes = await fetch(`${API_BASE}/purchases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        supplierId,
        invoiceNumber: `INV-AUDIT-${Date.now().toString().slice(-4)}`,
        date: new Date().toISOString(),
        storeId: 'main-warehouse',
        groups: [
          {
            brand: 'Apple',
            model: 'iPhone 15 Pro Audit',
            ram: '8GB',
            storage: '256GB',
            color: 'Natural Titanium',
            purchasePriceUsd: D(900),
            items: [{ imei: testImei }]
          }
        ]
      })
    });
    const purchaseData = await purchaseRes.json();
    assert(purchaseRes.status === 201 && purchaseData.devices?.length === 1, 'Execute purchase intake for new devices');

    if (purchaseData.devices?.[0]?.id) {
      createdDeviceId = purchaseData.devices[0].id;
    }

    // 5. TRANSFERS BETWEEN STORES
    console.log('\n--- 5. TRANSFERS & WAREHOUSE MOVEMENTS ---');
    if (createdDeviceId) {
      // Main warehouse stock is ADMIN-only: a SELLER can no longer pull it with a transfer
      // request. Phones the admin delivers are taken in by scanning them into a store receipt.
      const pullRes = await fetch(`${API_BASE}/transfers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sellerToken}` },
        body: JSON.stringify({ fromStoreId: 'main-warehouse', toStoreId: 'store-siyoma', deviceIds: [createdDeviceId] })
      });
      assert(pullRes.status === 403, 'SELLER cannot pull main warehouse stock with a transfer request');

      const receiptRes = await fetch(`${API_BASE}/store-receipts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sellerToken}`, 'Idempotency-Key': `e2e-receipt-${Date.now()}` },
        body: JSON.stringify({ imeis: [testImei] })
      });
      const receiptData = await receiptRes.json();
      assert(receiptRes.status === 201 && receiptData.itemCount === 1 && receiptData.storeId === 'store-siyoma', 'SELLER receives the delivered phone into the store by IMEI (no approval step)');

      // An ADMIN doing the transfer themselves needs no separate approval — it moves immediately.
      const secondPurchaseRes = await fetch(`${API_BASE}/purchases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          supplierId,
          invoiceNumber: `INV-AUDIT2-${Date.now().toString().slice(-4)}`,
          date: new Date().toISOString(),
          storeId: 'main-warehouse',
          groups: [{
            brand: 'Samsung',
            model: 'Galaxy S24 Audit',
            ram: '8GB',
            storage: '256GB',
            color: 'Black',
            purchasePriceUsd: D(700),
            items: [{ imei: `777${Date.now().toString().slice(-12)}` }]
          }]
        })
      });
      const secondPurchaseData = await secondPurchaseRes.json();
      const secondDeviceId = secondPurchaseData.devices?.[0]?.id;
      if (secondDeviceId) {
        const directTransferRes = await fetch(`${API_BASE}/transfers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
          body: JSON.stringify({ fromStoreId: 'main-warehouse', toStoreId: 'store-siyoma', deviceIds: [secondDeviceId] })
        });
        const directTransferData = await directTransferRes.json();
        assert(directTransferRes.status === 201 && directTransferData.status === 'APPROVED', 'ADMIN transfer executes immediately, no approval needed');
      } else {
        assert(false, 'ADMIN direct transfer (second purchase failed)');
      }
    } else {
      assert(false, 'Transfer request execution (no device created)');
    }

    // 6. POS SALES & REFUNDS
    console.log('\n--- 6. POS SALES & REFUNDS ---');
    let createdSaleId = '';
    if (createdDeviceId) {
      const saleRes = await fetch(`${API_BASE}/sales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          storeId: 'store-siyoma',
          items: [{ deviceId: createdDeviceId, salePriceTjs: D(10500) }],
          paymentMethod: 'CASH',
          cashAmountTjs: D(10500),
          cardAmountTjs: D(0),
          customerName: 'Покупатель Аудит'
        })
      });
      const saleData = await saleRes.json();
      assert(saleRes.status === 201 && D(saleData.totalTjs).eq(10500), 'Execute POS sale at store');
      if (saleData.id) createdSaleId = saleData.id;

      if (createdSaleId) {
        const refundRes = await fetch(`${API_BASE}/sales/${createdSaleId}/refund`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
          body: JSON.stringify({
            reason: 'Тестовый возврат при аудите',
            refundAmountTjs: D(10500),
            paymentMethod: 'CASH'
          })
        });
        const refundData = await refundRes.json();
        assert(refundRes.ok && refundData.status === 'REFUNDED', 'Process sale refund (restocks device back to inventory)');
      }
    }

    // 7. REPAIRS SERVICE
    console.log('\n--- 7. REPAIRS & SERVICE TICKETS ---');
    const repairImei = `357${Date.now().toString().slice(-12)}`;
    const repairRes = await fetch(`${API_BASE}/repairs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        storeId: 'store-siyoma',
        imei: repairImei,
        brand: 'Samsung',
        model: 'Galaxy S24 Repair Audit',
        storage: '256GB',
        color: 'Phantom Black',
        problemDescription: 'Замена дисплейного модуля'
      })
    });
    const repairData = await repairRes.json();
    assert(repairRes.status === 201 && repairData.status === 'ACCEPTED', 'Create repair ticket');

    if (repairData.id) {
      const updateStatusRes = await fetch(`${API_BASE}/repairs/${repairData.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ status: 'IN_PROGRESS', note: 'Диагностика завершена, ремонт начат' })
      });
      const updatedRepair = await updateStatusRes.json();
      assert(updateStatusRes.ok && updatedRepair.status === 'IN_PROGRESS', 'Update repair ticket status to IN_PROGRESS');
    }

    // 8. EXPENSES & FINANCIALS
    console.log('\n--- 8. EXPENSES & FINANCIALS ---');
    const expenseRes = await fetch(`${API_BASE}/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        category: 'UTILITIES',
        amountTjs: D(250),
        storeId: 'store-siyoma',
        paidFromCashRegister: false,
        description: 'Оплата коммунальных услуг за текущий месяц'
      })
    });
    const expenseData = await expenseRes.json();
    assert(expenseRes.status === 201 && D(expenseData.amountTjs).eq(250), 'Create expense entry');

    // 9. AUDIT LOGS & EXCHANGE RATES
    console.log('\n--- 9. AUDIT LOGS & SYSTEM METRICS ---');
    const auditRes = await fetch(`${API_BASE}/audit-logs`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const auditLogs = await auditRes.json();
    assert(auditRes.ok && Array.isArray(auditLogs) && auditLogs.length > 0, 'Fetch audit logs');

    const rateRes = await fetch(`${API_BASE}/exchange-rate/today`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const rateData = await rateRes.json();
    assert(rateRes.ok && D(rateData?.rate).eq(testExchangeRate), 'Fetch today exchange rate');

    // Cleanup created test device & purchase invoice
    if (createdDeviceId) {
      await prisma.transferItem.deleteMany({ where: { deviceId: createdDeviceId } });
      await prisma.transferRequest.deleteMany({ where: { items: { none: {} } } });
      await prisma.saleItem.deleteMany({ where: { deviceId: createdDeviceId } });
      if (createdSaleId) await prisma.sale.deleteMany({ where: { id: createdSaleId } });
    // The receipt that brought the test phone into the store keeps it referenced; remove it first.
    await prisma.storeReceipt.deleteMany({ where: { items: { some: { deviceId: createdDeviceId } } } });
      await prisma.device.deleteMany({ where: { id: createdDeviceId } });
    }
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }).finally(() => prisma.$disconnect());
  }

  console.log(`\n==================================================`);
  console.log(`E2E AUDIT COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log(`==================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runE2ETests().catch((err) => {
  console.error('Fatal E2E test execution error:', err);
  process.exit(1);
});
