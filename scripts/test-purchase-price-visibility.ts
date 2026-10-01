import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const APP_URL = 'http://localhost:3000';

async function handleRatePromptIfPresent(page: any) {
  try {
    const rateModal = await page.$('input[placeholder*="10"], input[type="number"]');
    if (rateModal) {
      await rateModal.click({ count: 3 });
      await rateModal.type('10.95');
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const save = btns.find((b) => b.innerText.includes('Подтвердить') || b.innerText.includes('Сохранить'));
        if (save) save.click();
      });
      await new Promise((r) => setTimeout(r, 1000));
    }
  } catch {}
}

async function loginAs(page: any, user: string, pass: string) {
  await page.goto(`${APP_URL}/login`, { waitUntil: 'networkidle2' });
  await page.evaluate(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {}
  });
  await page.goto(`${APP_URL}/login`, { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 1000));

  const loginInput = await page.$('input[type="text"], input[name="login"], input[placeholder*="Логин"]');
  if (loginInput) {
    await loginInput.focus();
    await page.keyboard.down('Control');
    await page.keyboard.press('A');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    await loginInput.type(user);

    const passInput = await page.$('input[type="password"]');
    if (passInput) {
      await passInput.focus();
      await page.keyboard.down('Control');
      await page.keyboard.press('A');
      await page.keyboard.up('Control');
      await page.keyboard.press('Backspace');
      await passInput.type(pass);
    }
    const submitBtn = await page.$('button[type="submit"]');
    if (submitBtn) await submitBtn.click();
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 1500));
  }
  await handleRatePromptIfPresent(page);
}

async function run() {
  console.log('🚀 Running E2E browser test for purchase price visibility...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    // ----------------------------------------------------
    // TEST 1: ADMIN VISIBILITY
    // ----------------------------------------------------
    console.log('\n--- 1. Testing ADMIN role (admin) ---');
    await loginAs(page, 'admin', 'admin123');

    // Click "Склад товаров" in sidebar
    await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('a, button'));
      const link = items.find((el) => el.textContent?.includes('Склад товаров'));
      if (link) (link as HTMLElement).click();
    });
    await new Promise((r) => setTimeout(r, 1500));

    console.log('   Admin URL:', page.url());
    await page.waitForFunction(() => document.body.innerText.trim().length > 50, { timeout: 10000 });
    const mainText = await page.evaluate(() => document.querySelector('main')?.innerText || 'NO_MAIN');
    console.log('   Main text snippet:', mainText.slice(0, 300));
    const adminSeesStockValuation = mainText.toLowerCase().includes('стоимость склада');
    console.log('   Admin sees "Стоимость склада":', adminSeesStockValuation);
    if (!adminSeesStockValuation) throw new Error('Admin should see "Стоимость склада"');

    // Check sidebar links
    const adminHasPurchaseNav = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a, button'));
      return links.some((el) => el.textContent?.includes('Приходы (партии)'));
    });
    console.log('   Admin sees "Приходы (партии)" in navigation:', adminHasPurchaseNav);
    if (!adminHasPurchaseNav) throw new Error('Admin should see "Приходы (партии)" in sidebar');

    const adminHasSuppliersNav = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a, button'));
      return links.some((el) => el.textContent?.includes('Поставщики'));
    });
    console.log('   Admin sees "Поставщики" in navigation:', adminHasSuppliersNav);
    if (!adminHasSuppliersNav) throw new Error('Admin should see "Поставщики" in sidebar');

    // ----------------------------------------------------
    // TEST 2: PARTNER RESTRICTIONS
    // ----------------------------------------------------
    console.log('\n--- 2. Testing PARTNER role (partner_sadbarg) ---');
    await loginAs(page, 'partner_sadbarg', 'partner123');

    // Verify /api/devices API response does not leak purchasePriceUsd
    const apiDevicesResponse = await page.evaluate(async () => {
      const token = localStorage.getItem('ms_jwt_token');
      const res = await fetch('/api/devices', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      return res.json();
    });
    if (!Array.isArray(apiDevicesResponse)) {
      throw new Error(`Expected array from /api/devices, got: ${JSON.stringify(apiDevicesResponse)}`);
    }
    const hasLeakedPrice = apiDevicesResponse.some((d: any) => (d.purchasePriceUsd && d.purchasePriceUsd > 0) || (d.costBasisUsd && d.costBasisUsd > 0));
    console.log('   Partner /api/devices leaked prices > 0:', hasLeakedPrice);
    if (hasLeakedPrice) throw new Error('CRITICAL: /api/devices returned positive purchasePriceUsd or costBasisUsd to PARTNER!');

    // Click "Склад товаров" in sidebar
    await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('a, button'));
      const link = items.find((el) => el.textContent?.includes('Склад товаров'));
      if (link) (link as HTMLElement).click();
    });
    await new Promise((r) => setTimeout(r, 1500));
    await page.waitForFunction(() => document.body.innerText.trim().length > 50, { timeout: 10000 });

    const partnerMainText = await page.evaluate(() => document.querySelector('main')?.innerText || '');
    const partnerSeesStockValuation = partnerMainText.toLowerCase().includes('стоимость склада');
    console.log('   Partner sees "Стоимость склада":', partnerSeesStockValuation);
    if (partnerSeesStockValuation) throw new Error('Partner must NOT see "Стоимость склада"');

    // Check sidebar navigation for Partner
    const partnerHasPurchaseNav = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a, button'));
      return links.some((el) => el.textContent?.includes('Приходы (партии)') || el.textContent?.includes('Поставщики'));
    });
    console.log('   Partner sees "Приходы" / "Поставщики" in navigation:', partnerHasPurchaseNav);
    if (partnerHasPurchaseNav) throw new Error('Partner must NOT see "Приходы" or "Поставщики" in navigation');

    // Direct URL check to /purchase
    await page.goto(`${APP_URL}/purchase`, { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 500));
    const purchasePageText = await page.evaluate(() => document.body.innerText);
    const isPurchaseRestricted = purchasePageText.includes('Доступ ограничен');
    console.log('   Partner navigating to /purchase shows "Доступ ограничен":', isPurchaseRestricted);
    if (!isPurchaseRestricted) throw new Error('Partner navigating to /purchase must show "Доступ ограничен"');

    // Direct URL check to /suppliers
    await page.goto(`${APP_URL}/suppliers`, { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 500));
    const suppliersPageText = await page.evaluate(() => document.body.innerText);
    const isSuppliersRestricted = suppliersPageText.includes('Доступ ограничен');
    console.log('   Partner navigating to /suppliers shows "Доступ ограничен":', isSuppliersRestricted);
    if (!isSuppliersRestricted) throw new Error('Partner navigating to /suppliers must show "Доступ ограничен"');

    // ----------------------------------------------------
    // TEST 3: SELLER RESTRICTIONS
    // ----------------------------------------------------
    console.log('\n--- 3. Testing SELLER role (seller_sadbarg) ---');
    await loginAs(page, 'seller_sadbarg', 'seller123');

    // Navigate to Inventory for Seller
    await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('a, button'));
      const link = items.find((el) => el.textContent?.includes('Склад товаров') || el.textContent?.includes('Склад'));
      if (link) (link as HTMLElement).click();
    });
    await new Promise((r) => setTimeout(r, 1500));
    await page.waitForFunction(() => document.body.innerText.trim().length > 50, { timeout: 10000 });

    const sellerMainText = await page.evaluate(() => document.querySelector('main')?.innerText || '');
    const sellerSeesStockValuation = sellerMainText.toLowerCase().includes('стоимость склада');
    console.log('   Seller sees "Стоимость склада":', sellerSeesStockValuation);
    if (sellerSeesStockValuation) throw new Error('Seller must NOT see "Стоимость склада"');

    console.log('\n🎉 ALL PURCHASE PRICE VISIBILITY AND ROLE TESTS PASSED 100%!');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
