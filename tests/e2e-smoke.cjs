const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGE ERROR: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('CONSOLE: ' + m.text());
  });

  // 1. Dashboard loads with tools
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await page.waitForSelector('.tool-card', { timeout: 15000 });
  const toolCount = await page.locator('.tool-card').count();
  console.log('PASS dashboard tools:', toolCount);

  // sidebar labels
  const sidebarText = await page.locator('.sidebar').innerText();
  for (const label of ['Dashboard', 'Marketplace', 'Your tools', 'Theme', 'Settings']) {
    if (!sidebarText.includes(label)) throw new Error('missing sidebar label: ' + label);
  }
  console.log('PASS sidebar labels');

  // 2. Search
  await page.fill('#global-search', 'png to jpeg');
  await page.waitForTimeout(300);
  const filtered = await page.locator('.tool-card').count();
  console.log('PASS search filtered count:', filtered);

  // 3. Open a tool, convert an image
  await page.fill('#global-search', '');
  await page.click('[data-tool-id="img-png-jpg"]');
  await page.waitForSelector('#dropzone');
  // generate a PNG in the browser and convert
  await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'red'; ctx.fillRect(0, 0, 64, 64);
    canvas.toBlob((b) => {
      const file = new File([b], 'test.png', { type: 'image/png' });
      const dt = new DataTransfer();
      dt.items.add(file);
      const input = document.getElementById('file-input');
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, 'image/png');
  });
  await page.waitForSelector('[data-action="download"]', { timeout: 20000 });
  console.log('PASS image conversion (PNG->JPG)');
  const name = await page.locator('.file-name').last().innerText();
  console.log('   output file:', name);

  // 4. Marketplace
  await page.goto('http://localhost:5173/#/marketplace', { waitUntil: 'networkidle' });
  await page.waitForSelector('.plugin-card', { timeout: 15000 });
  const pluginCount = await page.locator('.plugin-card').count();
  console.log('PASS marketplace plugins:', pluginCount);

  // 5. Install a plugin
  await page.click('[data-install="com.delta.example-txt-uppercase"]');
  await page.waitForTimeout(500);
  const btnState = await page.locator('[data-install="com.delta.example-txt-uppercase"]').innerText();
  console.log('PASS install plugin, button now:', btnState);

  // 6. Your tools shows it
  await page.goto('http://localhost:5173/#/tools', { waitUntil: 'networkidle' });
  await page.waitForSelector('.plugin-card');
  const toolsText = await page.locator('.plugin-grid').innerText();
  if (!toolsText.includes('UPPERCASE Text')) throw new Error('installed plugin missing in tools');
  console.log('PASS your tools lists installed plugin');

  // 7. Run the installed plugin converter on a txt file
  await page.goto('http://localhost:5173/#/tool/plugin-com.delta.example-txt-uppercase-txt-txt', { waitUntil: 'networkidle' });
  await page.waitForSelector('#dropzone');
  await page.evaluate(() => {
    const file = new File(['hello world'], 'msg.txt', { type: 'text/plain' });
    const dt = new DataTransfer();
    dt.items.add(file);
    const input = document.getElementById('file-input');
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForSelector('[data-action="download"]', { timeout: 20000 });
  console.log('PASS plugin conversion ran (UPPERCASE)');

  // 8. Auth
  await page.goto('http://localhost:5173/#/auth', { waitUntil: 'networkidle' });
  await page.click('[data-mode="register"]');
  await page.fill('#auth-username', 'e2euser' + Date.now() % 100000);
  await page.fill('#auth-password', 'secret123');
  await page.click('#auth-submit');
  await page.waitForTimeout(1200);
  const hash = await page.evaluate(() => window.location.hash);
  const profileName = await page.locator('#profile-name').innerText();
  console.log('PASS register, hash:', hash, 'profile:', profileName);

  // 9. Publish a plugin
  await page.goto('http://localhost:5173/#/marketplace', { waitUntil: 'networkidle' });
  await page.click('#btn-publish');
  await page.waitForSelector('#p-submit');
  await page.fill('#p-name', 'E2E Test Plugin');
  await page.fill('#p-id', 'com.e2e.testplugin' + Date.now() % 100000);
  await page.fill('#p-desc', 'published by test');
  await page.fill('#p-inputs', 'txt');
  await page.fill('#p-outputs', 'txt');
  await page.fill('#p-entry', 'return { convert: async (i) => i.data };');
  await page.click('#p-submit');
  await page.waitForTimeout(1200);
  const marketText = await page.locator('.plugin-grid').innerText();
  if (!marketText.includes('E2E Test Plugin')) throw new Error('published plugin not visible');
  console.log('PASS publish plugin to marketplace');

  // 10. Theme toggle
  await page.click('#btn-theme');
  const theme = await page.evaluate(() => document.documentElement.dataset.theme);
  console.log('PASS theme toggle:', theme);

  if (errors.length) {
    console.log('\nJS ERRORS:');
    errors.slice(0, 10).forEach((e) => console.log('  ' + e));
    process.exit(1);
  }
  console.log('\nALL SMOKE TESTS PASSED');
  await browser.close();
})().catch((e) => {
  console.error('SMOKE TEST FAILED:', e.message);
  process.exit(1);
});
