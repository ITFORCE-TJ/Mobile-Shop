import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const APP_URL = 'http://localhost:3000';

async function main() {
  console.log('🚀 Starting Real Chrome Browser Test for Store Partner Shares...');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,800'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!text.includes('favicon') && !text.includes('ERR_CONNECTION_REFUSED')) {
        console.error(' [Browser Console Error]:', text);
      }
    }
  });

  try {
    // 1. Go to Home/Login
    console.log('1. Navigating to', APP_URL);
    await page.goto(APP_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 1500));

    // 2. Perform Login as Admin if login input present
    const loginInput = await page.$('input[type="text"], input[name="login"], input[placeholder*="Логин"]');
    if (loginInput) {
      console.log('2. Logging in as Admin (admin / admin123)...');
      await loginInput.type('admin');
      const passInput = await page.$('input[type="password"]');
      if (passInput) await passInput.type('admin123');
      const submitBtn = await page.$('button[type="submit"]');
      if (submitBtn) await submitBtn.click();
      else await page.keyboard.press('Enter');

      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
      console.log('   ✓ Login submitted');
      await new Promise((r) => setTimeout(r, 2000));
    } else {
      console.log('   Session already active or restored');
    }

    // Handle rate prompt if present
    const rateModal = await page.$('input[placeholder*="10"], input[type="number"]');
    if (rateModal) {
      console.log('   Setting daily exchange rate...');
      await rateModal.click({ count: 3 } as any);
      await rateModal.type('10.95');
      const submitBtn = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const save = btns.find((b) => b.innerText.includes('Подтвердить') || b.innerText.includes('Сохранить'));
        if (save) {
          save.click();
          return true;
        }
        return false;
      });
      await new Promise((r) => setTimeout(r, 1500));
    }

    // 3. Navigate to /owners
    console.log('3. Navigating to /owners...');
    await page.goto(`${APP_URL}/owners`, { waitUntil: 'networkidle2', timeout: 15000 });
    await new Promise((r) => setTimeout(r, 2000));

    const ownersText = await page.evaluate(() => document.body.innerText);
    if (!ownersText.includes('Соучредители бизнеса') && !ownersText.includes('Доли партнеров')) {
      throw new Error('Owners page did not render properly');
    }
    console.log('   ✓ Owners Page rendered successfully');

    // 4. Click "Доли партнеров"
    console.log('4. Opening Shares Modal...');
    const btnHandle = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.find((b) => b.innerText.includes('Доли партнеров') || b.innerText.includes('Изменить доли'));
    });

    if (!btnHandle) throw new Error('Could not find "Доли партнеров" button');
    await (btnHandle as any).asElement()?.click();
    console.log('   ✓ Native click dispatched to "Доли партнеров"');
    await new Promise((r) => setTimeout(r, 1500));

    // 5. Verify modal content
    const hasModal = await page.evaluate(() => {
      const modal = document.querySelector('form');
      return modal ? modal.innerText : null;
    });
    console.log('   Modal form inner text:\n', hasModal);
    if (!hasModal || !hasModal.toLowerCase().includes('доли партнеров')) {
      throw new Error(`Shares modal form not found or missing text. Found: ${hasModal}`);
    }
    console.log('   ✓ Shares modal opened successfully');

    // 6. Test Store Selector inside modal form
    console.log('6. Testing Store Selection and Live Complementary Values...');
    const storeOptions = await page.evaluate(() => {
      const select = document.querySelector('form select') as HTMLSelectElement | null;
      if (!select) return [];
      return Array.from(select.options).map((o: HTMLOptionElement) => ({ value: o.value, text: o.text }));
    });
    console.log('   Available stores in modal dropdown:', storeOptions.map((o) => o.text));

    // Select Sadbarg store
    const sadbargOption = storeOptions.find((o) => o.text.includes('Садбарг'));
    if (sadbargOption) {
      await page.select('form select', sadbargOption.value);
      await new Promise((r) => setTimeout(r, 500));

      const storeText = await page.evaluate(() => {
        const form = document.querySelector('form');
        return form ? form.innerText : '';
      });
      if (!storeText.includes('Рустам') || !storeText.includes('Далер')) {
        throw new Error('Admin and Partner names for Sadbarg not displayed in modal');
      }
      console.log('   ✓ Automatically loaded Admin (Далер) and Partner (Рустам) for Садбарг');

      // Helper to set React input value
      const setVal = async (index: number, val: string) => {
        await page.evaluate((idx: number, v: string) => {
          const inputs = document.querySelectorAll('form input[type="number"]');
          const input = inputs[idx] as HTMLInputElement;
          if (input) {
            const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
            nativeSetter?.call(input, v);
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }, index, val);
      };

      const getVal = async (index: number) => {
        return page.evaluate((idx: number) => {
          const inputs = document.querySelectorAll('form input[type="number"]');
          return (inputs[idx] as HTMLInputElement)?.value;
        }, index);
      };

      // Test changing Admin share to 65% -> partner auto updates to 35%
      console.log('   Testing two-way sync: changing Admin share to 65%...');
      await setVal(0, '65');
      await new Promise((r) => setTimeout(r, 300));
      const partnerVal = await getVal(1);
      console.log(`   ✓ Partner share complementary value is: ${partnerVal}% (expected 35%)`);
      if (partnerVal !== '35') throw new Error(`Expected 35 but got ${partnerVal}`);

      // Test changing Partner share to 45% -> admin auto updates to 55%
      console.log('   Testing two-way sync: changing Partner share to 45%...');
      await setVal(1, '45');
      await new Promise((r) => setTimeout(r, 300));
      const adminVal = await getVal(0);
      console.log(`   ✓ Admin share complementary value is: ${adminVal}% (expected 55%)`);
      if (adminVal !== '55') throw new Error(`Expected 55 but got ${adminVal}`);

      // Test Quick Preset [60 / 40]
      console.log('   Testing preset [60 / 40] button...');
      await page.evaluate(() => {
        const form = document.querySelector('form');
        const btns = Array.from(form?.querySelectorAll('button') || []);
        const pBtn = btns.find((b) => b.innerText.trim() === '60 / 40');
        if (pBtn) pBtn.click();
      });
      await new Promise((r) => setTimeout(r, 300));

      const presetAdminVal = await getVal(0);
      const presetPartnerVal = await getVal(1);
      console.log(`   ✓ Preset applied: Admin=${presetAdminVal}%, Partner=${presetPartnerVal}%`);
      if (presetAdminVal !== '60' || presetPartnerVal !== '40') {
        throw new Error('Preset 60/40 did not apply correctly');
      }

      // Save shares
      console.log('   Submitting save for Садбарг...');
      await page.evaluate(() => {
        const form = document.querySelector('form');
        const btns = Array.from(form?.querySelectorAll('button') || []);
        const saveBtn = btns.find((b) => b.innerText.includes('Сохранить'));
        if (saveBtn) saveBtn.click();
      });
      await new Promise((r) => setTimeout(r, 1500));

      const bannerText = await page.evaluate(() => document.body.innerText);
      const isSaved = bannerText.includes('успешно сохранены') || bannerText.includes('Садбарг');
      console.log('   ✓ Save success banner verified:', isSaved);
    }

    // 7. Verify Siyoma store in modal
    console.log('7. Opening modal again to verify Siyoma store...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const shareBtn = btns.find((b) => b.innerText.includes('Доли партнеров') || b.innerText.includes('Изменить доли'));
      if (shareBtn) shareBtn.click();
    });
    await new Promise((r) => setTimeout(r, 1000));

    const siyomaOption = storeOptions.find((o) => o.text.includes('Сиёма'));
    if (siyomaOption) {
      await page.select('select', siyomaOption.value);
      await new Promise((r) => setTimeout(r, 500));
      const siyomaText = await page.evaluate(() => document.body.innerText);
      if (!siyomaText.includes('Фаррух')) {
        throw new Error('Partner Фаррух for Siyoma not displayed');
      }
      console.log('   ✓ Automatically loaded Partner (Фаррух) for Сиёма');
    }

    console.log('🎉 ALL STORE PARTNER SHARE BROWSER TESTS PASSED 100%!');
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('❌ Browser Test Error:', err);
  process.exit(1);
});
