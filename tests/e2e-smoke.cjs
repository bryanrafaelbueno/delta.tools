const { chromium } = require('playwright');
const { execFileSync } = require('node:child_process');
const { join } = require('node:path');

const WEB = 'http://localhost:5173';
const API = 'http://localhost:3001';

async function postJson(path, body, token) {
  const res = await fetch(API + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${JSON.stringify(data)}`);
  return data;
}

// The marketplace is moderation-gated and no longer ships seeded plugins, so
// the test publishes + approves its own plugin through the real API first.
// This works on any database state (fresh, local, CI).
const suffix = Date.now() % 1000000;
const SEED_USER = 'smoketest' + suffix;
const SEED_PASS = 'secret123';
const SEED_PLUGIN = {
  id: 'com.e2e.smoke' + suffix,
  name: 'Smoke Uppercase Text',
  version: '1.0.0',
  description: 'E2E smoke test plugin: uppercases txt',
  inputs: ['txt'],
  outputs: ['txt'],
  entry: `return { convert: async (input) => {
  const text = new TextDecoder().decode(input.data).toUpperCase();
  return { name: input.name.replace(/\\.[^.]+$/, '') + '.txt', type: 'text/plain', data: new TextEncoder().encode(text).buffer };
} };`,
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGE ERROR: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('CONSOLE: ' + m.text());
  });

  // ---- 0. Seed an approved plugin via the real API (register -> publish -> promote -> review) ----
  const { token } = await postJson('/api/auth/register', { username: SEED_USER, password: SEED_PASS });
  await postJson('/api/plugins', SEED_PLUGIN, token);
  execFileSync('node', ['scripts/make-admin.mjs', SEED_USER], {
    cwd: join(__dirname, '..', 'server'),
    stdio: 'pipe',
  });
  await postJson(`/api/admin/plugins/${SEED_PLUGIN.id}/review`, { action: 'approve' }, token);
  console.log('PASS seeded an approved plugin via API + moderation');

  // 1. Dashboard loads with logo + search hero
  await page.goto(WEB + '/', { waitUntil: 'networkidle' });
  await page.waitForSelector('#hero-search-input', { timeout: 15000 });
  console.log('PASS dashboard hero (logo + search)');

  // sidebar labels
  const sidebarText = await page.locator('.sidebar').innerText();
  for (const label of ['Dashboard', 'Marketplace', 'Favorite Tools', 'Theme', 'Settings']) {
    if (!sidebarText.includes(label)) throw new Error('missing sidebar label: ' + label);
  }
  console.log('PASS sidebar labels');

  // 2. Search navigates to the matching tool
  await page.fill('#hero-search-input', 'png to jpeg');
  await page.press('#hero-search-input', 'Enter');
  await page.waitForSelector('#dropzone', { timeout: 15000 });
  console.log('PASS search navigated to PNG to JPEG');

  // 3. Convert an image
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

  // 4. Marketplace lists the seeded plugin
  await page.goto(WEB + '/#/marketplace', { waitUntil: 'networkidle' });
  await page.waitForSelector(`[data-install="${SEED_PLUGIN.id}"]`, { timeout: 15000 });
  const pluginCount = await page.locator('.plugin-card').count();
  console.log('PASS marketplace plugins:', pluginCount);

  // 5. Install a plugin
  await page.click(`[data-install="${SEED_PLUGIN.id}"]`);
  await page.waitForTimeout(500);
  const btnState = await page.locator(`[data-install="${SEED_PLUGIN.id}"]`).innerText();
  console.log('PASS install plugin, button now:', btnState);

  // 6. Your tools shows it (manage tab lists installed plugins)
  await page.goto(WEB + '/#/tools/manage', { waitUntil: 'networkidle' });
  await page.waitForSelector('.plugin-card');
  const toolsText = await page.locator('.plugin-grid').innerText();
  if (!toolsText.includes('Smoke Uppercase Text')) throw new Error('installed plugin missing in tools');
  console.log('PASS your tools lists installed plugin');

  // 7. Run the installed plugin converter on a txt file
  await page.goto(WEB + `/#/tool/plugin-${SEED_PLUGIN.id}-txt-txt`, { waitUntil: 'networkidle' });
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
  const outputText = await page.locator('.result-text-panel textarea').inputValue();
  if (outputText.trim() !== 'HELLO WORLD') throw new Error('plugin output wrong: ' + outputText);
  console.log('PASS plugin conversion ran and output uppercase ("HELLO WORLD")');

  // 8. Auth
  await page.goto(WEB + '/#/auth', { waitUntil: 'networkidle' });
  await page.click('[data-mode="register"]');
  await page.fill('#auth-username', 'e2euser' + suffix);
  await page.fill('#auth-password', 'secret123');
  await page.click('#auth-submit');
  await page.waitForTimeout(1200);
  const hash = await page.evaluate(() => window.location.hash);
  const profileName = await page.locator('#profile-name').innerText();
  console.log('PASS register, hash:', hash, 'profile:', profileName);

  // 9. Publish a plugin (goes to moderation, so it must NOT appear in the
  //    public marketplace yet — the grid keeps only the approved seed plugin)
  await page.goto(WEB + '/#/marketplace', { waitUntil: 'networkidle' });
  await page.click('#btn-publish');
  await page.waitForSelector('#p-submit');
  await page.fill('#p-name', 'E2E Test Plugin');
  await page.fill('#p-id', 'com.e2e.testplugin' + suffix);
  await page.fill('#p-desc', 'published by test');
  await page.fill('#p-inputs', 'txt');
  await page.fill('#p-outputs', 'txt');
  await page.fill('#p-entry', 'return { convert: async (i) => i.data };');
  await page.click('#p-submit');
  const publishToast = page.locator('.toast.success').filter({ hasText: 'submitted to moderation' });
  await publishToast.waitFor({ timeout: 10000 });
  const toastText = await publishToast.innerText();
  if (!/submitted to moderation/i.test(toastText)) throw new Error('publish toast missing: ' + toastText);
  await page.waitForFunction(() => window.location.hash === '#/marketplace', null, { timeout: 10000 });
  const marketText = await page.locator('.plugin-grid').innerText();
  if (marketText.includes('E2E Test Plugin')) throw new Error('pending plugin leaked into the public marketplace');
  console.log('PASS publish plugin to moderation (hidden until approved)');

  // 10. Theme toggle
  await page.click('[data-action="theme"]');
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
