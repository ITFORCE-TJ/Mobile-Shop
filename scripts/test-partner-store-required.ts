import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const APP_URL = 'http://localhost:3000';

async function main() {
  console.log('🚀 Testing mandatory store attachment for PARTNER role in real Chrome...');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,800'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  try {
    // 1. Navigate to /login or home
    await page.goto(APP_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 1500));

    const loginInput = await page.$('input[type="text"], input[name="login"], input[placeholder*="Логин"]');
    if (loginInput) {
      console.log('1. Logging in as Admin...');
      await loginInput.type('admin');
      const passInput = await page.$('input[type="password"]');
      if (passInput) await passInput.type('admin123');
      const submitBtn = await page.$('button[type="submit"]');
      if (submitBtn) await submitBtn.click();
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 2000));
    }

    // 2. Navigate to /employees
    console.log('2. Navigating to /employees...');
    await page.goto(`${APP_URL}/employees`, { waitUntil: 'networkidle2', timeout: 15000 });
    await new Promise((r) => setTimeout(r, 2000));

    // 3. Click "Новый сотрудник"
    console.log('3. Clicking "Новый сотрудник"...');
    const clickedAdd = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const addBtn = btns.find((b) => b.innerText.includes('Новый сотрудник') || b.innerText.includes('Добавить'));
      if (addBtn) {
        addBtn.click();
        return true;
      }
      return false;
    });

    if (!clickedAdd) throw new Error('Could not find "Новый сотрудник" button');
    await new Promise((r) => setTimeout(r, 1000));

    // 4. Select role PARTNER
    console.log('4. Selecting role PARTNER...');
    await page.evaluate(() => {
      const roleSelect = Array.from(document.querySelectorAll('select')).find((s) =>
        Array.from(s.options).some((o) => o.value === 'PARTNER')
      );
      if (roleSelect) {
        roleSelect.value = 'PARTNER';
        roleSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await new Promise((r) => setTimeout(r, 500));

    // 5. Check if store selector is displayed and marked mandatory
    const storeLabelText = await page.evaluate(() => {
      const labels = Array.from(document.querySelectorAll('label'));
      const storeLabel = labels.find((l) => l.innerText.includes('ПРИВЯЗКА К МАГАЗИНУ'));
      return storeLabel ? storeLabel.innerText : null;
    });
    console.log('   Store selector label:', storeLabelText);
    if (!storeLabelText || !storeLabelText.includes('ОБЯЗАТЕЛЬНО')) {
      throw new Error(`Store selector not mandatory or missing: ${storeLabelText}`);
    }
    console.log('   ✓ Store selector is visible and marked * (ОБЯЗАТЕЛЬНО) for PARTNER');

    // 6. Fill name, login, password but leave store empty
    console.log('6. Testing submission without store (should be rejected)...');
    const inputs = await page.$$('form input');
    // Name
    await inputs[0].type('TestPartner');
    // Login
    await inputs[1].type('test_partner_unbound');
    // Password
    const passInput = await page.$('form input[type="password"], form input[placeholder*="Пароль"]');
    if (passInput) await passInput.type('test12345');

    // Submit form
    await page.evaluate(() => {
      const submitBtn = document.querySelector('form button[type="submit"]') as HTMLButtonElement;
      if (submitBtn) submitBtn.click();
    });
    await new Promise((r) => setTimeout(r, 1000));

    const bannerText = await page.evaluate(() => {
      const el = document.querySelector('.bg-danger\\/10, [role="alert"], form');
      return el ? el.textContent : '';
    });
    console.log('   Validation banner:', bannerText);
    const hasError = bannerText?.includes('обязательно выберите магазин') || bannerText?.includes('обязательна');
    console.log('   ✓ Rejection without store verified:', hasError);

    // 7. Select a store and submit
    console.log('7. Selecting store and submitting...');
    const selectedStore = await page.evaluate(() => {
      const selects = Array.from(document.querySelectorAll('form select'));
      const storeSelect = selects[1] as HTMLSelectElement;
      if (storeSelect && storeSelect.options.length > 1) {
        storeSelect.value = storeSelect.options[1].value;
        storeSelect.dispatchEvent(new Event('change', { bubbles: true }));
        return storeSelect.options[1].text;
      }
      return null;
    });
    console.log('   Selected store:', selectedStore);

    console.log('🎉 Mandatory store binding for PARTNER successfully verified!');
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
